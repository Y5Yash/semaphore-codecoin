import cors from 'cors';
import express from 'express';
import { reclaimprotocol } from "@reclaimprotocol/reclaim-sdk";
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

import semaphoreABI from './semaphore-abi.json';
import codecoinABI from './codecoin-abi.json';
import { ethers } from "ethers";
import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { generateProof } from "@semaphore-protocol/proof";
import { SemaphoreEthers } from "@semaphore-protocol/data";

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

const reclaim = new reclaimprotocol.Reclaim();

dotenv.config();
const privateKey = process.env.PRIVATE_KEY || '0x0';
const publicAddress = process.env.PUBLIC_ADDRESS;
const dbUsername = process.env.DB_USER;
const dbPassword = process.env.DB_PWD;
const callbackBase = process.env.CALLBACK_BASE;
const groupCreated = process.env.IS_GROUP_CREATED;

const optGoerliProvider = 'https://goerli.optimism.io';
const provider = new ethers.JsonRpcProvider(optGoerliProvider);
const ownerAccount = new ethers.Wallet(privateKey, provider);
const semaphoreAddress = "0x3889927F0B5Eb1a02C6E2C20b39a1Bd4EAd76131";
const semaphoreContract = new ethers.Contract(semaphoreAddress, semaphoreABI, ownerAccount);
const groupNo = 100;
const signal = 0;
const codecoinAddress = "0x059CF844d6b8E00590C3c28Cf37f6fe0123BFb97";
const codecoinContract = new ethers.Contract(codecoinAddress, codecoinABI, ownerAccount);

// Connect to MongoDB Atlas. Use other DB if needed.
const mongoUri = `mongodb+srv://${dbUsername}:${dbPassword}@cluster0.elv9kur.mongodb.net/`;
const client = new MongoClient(mongoUri, { monitorCommands: true });

// const callbackBase = `http://192.168.0.0:${port}`; // Modify this to get from environment
const callbackUrl = `${callbackBase}/callback`

app.use((req, res, next) => {
    console.log('[Backend] -- Endpoint called: ', req.url);
    next();
});


// endpoint for the frontend to fetch the reclaim template using sdk.
app.get("/request-proofs", async (req, res) => {
    try {
        // const {addr: userAddr} = req.query;
        const db = client.db();
        const callbackCollection = db.collection('codecoin-reclaim');
        const request = reclaim.requestProofs({
            title: "CodeCoin",
            baseCallbackUrl: callbackUrl,
            requestedProofs: [
                new reclaim.CustomProvider({
                    provider: 'google-login',
                    payload: {}
                }),
            ],
        });
        const reclaimUrl = await request.getReclaimUrl({shortened: true});
        const {callbackId, template, id} = request;
        console.log("[B-Request-P -- TEMP] -- CallbackId: ", callbackId);
        console.log("[B-Request-P -- TEMP] -- Template: ", template);
        console.log("[B-Request-P -- TEMP] -- Id: ", id);
        console.log("[B-Request-P -- TEMP] -- ReclaimUrl: ", reclaimUrl);
        await callbackCollection.insertOne({callbackId: callbackId, proofs: []});
        res.status(200).json({reclaimUrl, callbackId, template, id});
    }
    catch (error) {
        console.error("[B-Request-P -- Catch] -- Error requesting proofs:\n", error);
        res.status(500).json({error: "Failed to request proofs"});
    }
    return;
});
// ------------------------------------


// endpoint where Reclaim Wallet sends the proof to the backend
app.use(express.text({ type: "*/*" }));
app.post("/callback", async (req, res) => {
    try {
        const {callbackId: callbackId} = req.query;
        console.log("[Callback -- TEMP] -- CallbackId from RW: ", callbackId);
        console.log("[Callback -- TEMP] -- Body from RW: ", req.body);
        const { proofs } = JSON.parse(decodeURIComponent(req.body));
        console.log("[Callback -- TEMP] -- Proofs: ", proofs);

        const onChainClaimIds = reclaim.getClaimIdsFromProofs(proofs); // Remove these later
        console.log("[Callback -- TEMP] -- Claim Ids: ", onChainClaimIds);
        const isProofCorrect = await reclaim.verifyCorrectnessOfProofs(callbackId as string, proofs);
        console.log("[Callback -- TEMP] -- is Proof Correct? ", isProofCorrect);

        res.json({msg: "Callback received at backend. Check your application."});

        const db = client.db();
        const callbackCollection = db.collection('codecoin-reclaim');

        const entry = await callbackCollection.findOne({callbackId: callbackId});
        if (!entry) {
            console.log(callbackId, " not found in the database");
            throw new Error(`${callbackId} not found in the database.`);
            // return false;
        }

        const result = await callbackCollection.updateOne({callbackId: callbackId}, {$set: {callbackId: callbackId, proofs: proofs}});
        if (result.matchedCount === 0) {
            console.log(callbackId, " not found in the database");
            throw new Error(`${callbackId} not found in the database.`);
        }
        console.log(result);
    }
    catch (error) {
        console.log("[Callback -- TEMP] -- Error: ", error);
    }
    return;
});
// ------------------------------------


// endpoint where the frontend queries for the proof received from reclaim
app.get("/get-proofs/", async (req, res) => {
    try {
        const {id: callbackId} = req.query;
        const db = client.db();
        const callbackCollection = db.collection('codecoin-reclaim');
        const entry = await callbackCollection.findOne({callbackId: callbackId});
        if (!entry ) {
            console.log(callbackId, " not found in the database");
            throw new Error(`${callbackId} not found in the database.`);
        }
        console.log(entry.proofs);
        if (entry.proofs == undefined || entry.proofs?.length == 0 ) {
            console.log(callbackId, " proof not received");
            throw new Error(`Proof from ${callbackId} not received from Reclaim Wallet.`);
        }
        console.log(entry.proofs);
        res.status(200).json(entry.proofs);
    }
    catch (error) {
        console.error("[Get-Proofs -- TEMP] -- Error: ", error);
        res.status(500).json({msg: "DB not Connected/web3 error"});
    }
    return;
});
// ------------------------------------


// endpoint to allow users to generate as many identities as they want and settle for one.
app.get("/generate-identity/", async (req, res) => {
    try {
        const identity = new Identity();
        console.log(identity.toString());
        res.status(200).json({
            trapdoor: identity.trapdoor.toString(),
            commitment: identity.commitment.toString(),
            nullifier: identity.nullifier.toString(),
            identityString: identity.toString()
        });
    }
    catch (error) {
        console.log("[Generate - Identity] -- Error: ", error);
        res.status(500).json({msg: "Couldn't generate semaphore identity, raise an issue."});
    }
});
// ------------------------------------


// endpoint to commit identity commitment to the group
app.get("/commit/", async (req, res) => {

    // check identity.toString was correct - appropriate trapdoor and nullifier.
    try {
        const {identityString: identityString} = req.query;
        const identity = new Identity(identityString as string);
    }
    catch (error) {
        console.log("[Commit -- Incorrect Identity String] -- Error: ", error);
        res.status(500).json({msg: "Incorrect identity string received"});
        return;
    }

    // check if the proof for the callback Id is verified.
    let parameters = '';
    try {
        const {id: callbackId, nonce} = req.query;
        const db = client.db();
        const callbackCollection = db.collection('codecoin-reclaim');
        const entry = await callbackCollection.findOne({callbackId: callbackId});
        if (!entry ) {
            console.log(callbackId, " not found in the database");
            throw new Error(`${callbackId} not found in the database.`);
        }
        console.log(entry.proofs);
        if (entry.proofs == undefined || entry.proofs?.length == 0 ) {
            console.log(callbackId, " proof not received");
            throw new Error(`Proof from ${callbackId} not received from Reclaim Wallet.`);
        }
        parameters = entry.proofs[0].parameters + nonce;
        console.log(entry.proofs);
        // res.status(200).json(entry.proofs);
    }
    catch (error) {
        console.log("[Commit - Proof not submitted yet] -- Error: ", error);
        res.status(500).json({msg: "Proof not found for the callbackId given."});
        return;
    }

    // check if the parameter is already used to commit.
    try {
        const db = client.db();
        const semaphoreCollection = db.collection('codecoin-semaphore');
        const entry = await semaphoreCollection.findOne({params: parameters});
        if (entry) {
            throw new Error(`Parameter "${parameters}" already used to commit an identity.`);
        };
    }
    catch (error) {
        console.log("[Commit -- Parameter already used.] -- Error: ", error);
        res.status(500).json({msg: "The parameter is already used to commit to the group once."});
        return;
    };

    // Submit transaction and update database.
    const {identityString: identityString} = req.query;
    const identity = new Identity(identityString as string);
    try {
        const tx = await semaphoreContract.addMember(groupNo, identity.commitment);
        console.log("-- the Tx is: ", tx);
        const receipt = await tx.wait();
        console.log("-- the receipt is: ", receipt);
        const db = client.db();
        const semaphoreCollection = db.collection('codecoin-semaphore');
        await semaphoreCollection.insertOne({params: parameters});
        res.status(200).json({msg: "Successfully committed to the group"})
    }
    catch (error) {
        console.log("[Commit -- Transaction addMember Fail] -- Error: ", error);
        res.status(500).json({msg: "Transaction to add member to the group failed."});
    }
    return;
});
// ------------------------------------


// endpoint to receive airdrop of CodeCoin
app.get("/airdrop/", async (req, res) => {
    try {
        const {identityString, externalNullifier, userAddr} = req.query;
        const identity = new Identity(identityString as string);
        const semaphoreEthers = new SemaphoreEthers("optimism-goerli", {address: semaphoreAddress});
        const members = await semaphoreEthers.getGroupMembers(groupNo.toString());
        const group = new Group(groupNo, 16, members);
        const fullProof = await generateProof(identity, group, externalNullifier as string, signal, { zkeyFilePath: "./semaphore.zkey", wasmFilePath: "./semaphore.wasm" });
        const tx1 = await semaphoreContract.verifyProof(group.id, fullProof.merkleTreeRoot, fullProof.signal, fullProof.nullifierHash, fullProof.externalNullifier, fullProof.proof);
        console.log("-- tx verifyProof: ", tx1);
        const receipt1 = await tx1.wait();
        console.log("-- receipt verifyProof: ", receipt1);
        const tx2 = await codecoinContract.airDropTo(userAddr);
        console.log("-- tx Airdrop: ", tx2);
        const receipt2 = await tx2.wait();
        console.log("-- receipt Airdrop: ", receipt2);
        res.status(200).json(receipt2);
    }
    catch (error) {
        console.log("[Airdrop -- airdrop failed. Retry later] -- Error: ", error);
        res.status(500).json({msg: "Interaction (retrieve members/submit proof) with semaphore failed."});
    }
    return;
});


// Start the Express.js App
app.listen(port, async () => {
    try {
        await client.connect();
        console.log('Connected to mongoDB.');
        if (groupCreated.includes("false")) {
            const tx = await semaphoreContract.createGroup(groupNo, 16, publicAddress);
            const receipt = await tx.wait();
            console.log(receipt);
        }
    } catch (error) {
        console.error('Exiting. Failed to connect to mongoDB with error:', error, );
        process.exit(1);
    }
    console.log(`Express server is listening on port ${port}`)
});