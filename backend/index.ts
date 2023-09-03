import cors from 'cors';
import express from 'express';
import { reclaimprotocol } from "@reclaimprotocol/reclaim-sdk";
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

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
const codecoinAddress = process.env.CODECOIN_ADDRESS;

const optGoerliProvider = 'https://goerli.optimism.io';
const provider = new ethers.JsonRpcProvider(optGoerliProvider);
const ownerAccount = new ethers.Wallet(privateKey, provider);
const semaphoreAddress = "0x3889927F0B5Eb1a02C6E2C20b39a1Bd4EAd76131"; // Opt goerli
const merkleTreeDepth = 16;
const groupNo = 102;
const signal = 0;
const codecoinContract = new ethers.Contract(codecoinAddress, codecoinABI, ownerAccount);

// Connect to MongoDB Atlas. Use other DB if needed.
const mongoUri = `mongodb+srv://${dbUsername}:${dbPassword}@cluster0.elv9kur.mongodb.net/`;
const client = new MongoClient(mongoUri, { monitorCommands: true });

const callbackUrl = `${callbackBase}/callback`

app.use((req, res, next) => {
    console.log('[Backend] -- Endpoint called: ', req.url);
    next();
});


// endpoint for the frontend to fetch the reclaim template using sdk.
app.get("/request-proofs", async (req, res) => {
    try {
        const {userAddr: userAddr} = req.query;
        const db = client.db();
        const callbackCollection = db.collection('codecoin-reclaim');
        const request = reclaim.requestProofs({
            title: "G-Coin",
            baseCallbackUrl: callbackUrl,
            contextAddress: userAddr as string,
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
        // console.log("[Callback -- TEMP] -- CallbackId from RW: ", callbackId);
        // console.log("[Callback -- TEMP] -- Body from RW: ", req.body);
        const { proofs } = JSON.parse(decodeURIComponent(req.body));
        console.log("[Callback -- TEMP] -- Proofs: ", proofs);

        // const onChainClaimIds = reclaim.getClaimIdsFromProofs(proofs); // Remove these later
        // console.log("[Callback -- TEMP] -- Claim Ids: ", onChainClaimIds);

        res.json({msg: "Callback received at backend. The backend will verify the proof now.            You can now close this window and go back to the G-coin dApp."});

        const isProofCorrect = await reclaim.verifyCorrectnessOfProofs(callbackId as string, proofs);
        console.log("[Callback -- TEMP] -- is Proof Correct? ", isProofCorrect);

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

    // Submit transaction and update database. Doesn't succeed if the parameter is already registered
    const {identityString: identityString} = req.query;
    const identity = new Identity(identityString as string);
    const paramHash = ethers.keccak256(ethers.id(parameters));
    try {
        const tx = await codecoinContract.registerMember(paramHash, identity.commitment);
        console.log("-- the Tx is: ", tx);
        const receipt = await tx.wait();
        console.log("-- the receipt is: ", receipt);
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

    let userAddr = '';

    // get the contextAddress from the callbackId
    try {
        const callbackId = req.query.id;
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
        const contextStr = entry.proofs[0].context;
        const context = JSON.parse(contextStr);
        userAddr = context.contextAddress;
    }
    catch (error) {
        console.log("[Airdrop -- Incorrect CallbackId] -- Error: ", error);
        res.status(500).json({msg: "Incorrect callbackId received/Unable to process"});
    }

    // Airdrop
    try {
        const {identityString, externalNullifier} = req.query;
        const identity = new Identity(identityString as string);
        const semaphoreEthers = new SemaphoreEthers("optimism-goerli", {address: semaphoreAddress});
        const members = await semaphoreEthers.getGroupMembers(groupNo.toString());
        const group = new Group(groupNo, merkleTreeDepth, members);
        const fullProof = await generateProof(identity, group, externalNullifier as string, signal, { zkeyFilePath: "./semaphore.zkey", wasmFilePath: "./semaphore.wasm" });

        const tx2 = await codecoinContract.airDropTo(userAddr, fullProof.merkleTreeRoot, fullProof.signal, fullProof.nullifierHash, fullProof.externalNullifier, fullProof.proof);
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
    } catch (error) {
        console.error('Exiting. Failed to connect to mongoDB with error:', error, );
        process.exit(1);
    }
    console.log(`Express server is listening on port ${port}`)
});