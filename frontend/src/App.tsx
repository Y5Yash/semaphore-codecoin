import React, { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import './App.css';
import QRCode from 'react-qr-code';
// import dotenv from 'dotenv-webpack';

// dotenv.config();
// new dotenv();
// const tokenContractAddress = process.env.TOKEN_CONTRACT_ADDRESS;
// const backendBase = process.env.BACKEND_BASE;
const tokenContractAddress = "0x281A467f8DF148dDdC8d03573d0808b00c5D3190";
const backendBase = "https://codecoin-backend.reclaimprotocol.org";
console.log('The backend base is: ', backendBase);
console.log('The token contract address is: ', tokenContractAddress);
const backendTemplateUrl = `${backendBase}/request-proofs`;
const backendProofUrl = `${backendBase}/get-proofs`;
const backendIdentity = `${backendBase}/generate-identity`;
const backendCommit = `${backendBase}/commit`;
const backendAirdrop = `${backendBase}/airdrop`;

const ethAddressRegex = /^(0x)?[0-9a-fA-F]{40}$/;

const App: React.FC = () => {

  const [started, setStarted] = useState(false);
  const [address, setAddress] = useState('');
  const [template, setTemplate] = useState('');
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);
  const [isTemplateOk, setIsTemplateOk] = useState(true);
  const [callbackId, setCallbackId] = useState('');
  const [validAddress, setValidAddress] = useState(false);
  const [isProofReceived, setIsProofReceived] = useState(false);
  const [isAirDropped, setIsAirDropped] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [identity, setIdentity] = useState({trapdoor: undefined, nullifier: undefined, commitment: undefined, identityString: undefined});
  const [isLoadingIdentity, setIsLoadingIdentity] = useState(false);
  const [isLoadingCommit, setIsLoadingCommit] = useState(false);
  const [txAddr, setTxAddr] = useState('');
  const [isLoadingAirdrop, setIsLoadingAirdrop] = useState(false);
  const [gotErrorTxn, setGotErrorTxn] = useState(false);
  const [isGenerateIdentitySuccessful, setIsGenerateIdentitySuccessful] = useState(false);
  const [isIdentityCommitted, setIsIdentityCommitted] = useState(false);
  const [isAirdropSuccessful, setIsAirdropSuccessful] = useState(false);

  // useEffect(() => {
  //   if (started) {
  //     handleGetTemplate();
  //   }
  // });

  useEffect(() => {
    if (validAddress && !isProofReceived) {
      console.log('Starting to fetch template.');
      const intervalId = setInterval(fetchProof, 2000);
      return () => {
        console.log('Template received/Remounted.');
        clearInterval(intervalId);
      };
    }
  });

  useEffect(() => {
    if (isProofReceived && !isAirDropped) {
      console.log('Airdropping.');
      handleGenerateIdentity();
      return
    }
  }, [isProofReceived]);

  useEffect(() => {
    if (isGenerateIdentitySuccessful && !isIdentityCommitted) {
      console.log('Committing the identity.');
      handleIdentityCommit();
      return;
    }
  }, [isGenerateIdentitySuccessful]);

  useEffect(() => {
    if (isIdentityCommitted && !isAirdropSuccessful) {
      console.log('Initiating the airdrop.');
      initiateAirDrop();
      return;
    }
  }, [isIdentityCommitted]);

  const handleGetTemplate = async () => {
    if (isTemplateOk && template) {
      console.log('The template is already received.');
      return;
    }
    setIsLoadingTemplate(true);
    try {
      console.log(`Requesting ${backendTemplateUrl}?userAddr=${address}`);
      const response = await fetch(`${backendTemplateUrl}?userAddr=${address}`);
      if (response.ok) {
        const data = await response.json();
        if (data?.error) {
          console.log(data.error);
          throw new Error(data.error);
        }
        setCallbackId(data.callbackId);
        setTemplate(data.reclaimUrl);
        setIsTemplateOk(true);
        console.log('The template generated is: ', template);
      }
      else {
        setIsTemplateOk(false);
        setTemplate('Error: Unable to receive a valid template from the backend. Check if it is up and running. Please try again later.');
      }
    }
    catch (error) {
      setIsTemplateOk(false);
      setTemplate('Error: ' + error);
      console.log(error);
    }
    setIsLoadingTemplate(false);
    return;
  };

  const fetchProof = async () => {
    try {
      console.log(`Requesting ${backendProofUrl}?id=${callbackId}`);
      const response = await fetch(`${backendProofUrl}?id=${callbackId}`);
      if (response.status === 200) {
        const proofData = await response.json();
        setIsProofReceived(true);
      }
    }
    catch (error) {
      setIsProofReceived(false);
      console.log(error);
    }
  };

  // generate and get the identity from the backend
  const handleGenerateIdentity = async () => {
    setIsLoadingIdentity(true);
    try {
      const response = await fetch(backendIdentity);
      const data = await response.json();
      console.log(data);
      if (response.status===200) {
        setIdentity(data);
        setIsGenerateIdentitySuccessful(true);
        console.log('The identity generated is: ', identity);
      }
      else {
        throw new Error(`Backend returned with status ${response.status} while calling ${backendIdentity}.`);
      }
    }
    catch (error) {
      console.log('[Error in handleGenerateIdentity]: ', error);
      setIdentity({trapdoor: undefined, nullifier: undefined, commitment: undefined, identityString: undefined});
    }
    setIsLoadingIdentity(false);
    return;
  };

  // helper function to generate a random integer between min and max
  function getRandomInt(min: number, max: number): number {
    // The maximum is exclusive and the minimum is inclusive
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min)) + min;
  }

  // Commit the identity to the smart contract
  const handleIdentityCommit = async () => {
    if (!isGenerateIdentitySuccessful) {
      console.log('The identity is not generated yet.');
      return;
    }
    if (isIdentityCommitted) {
      console.log('The identity is already committed.');
      return;
    }
    setIsLoadingCommit(true);
    try {
      const randomNonce = getRandomInt(0, 1000000000);
      const reqUri = `${backendCommit}?identityString=${identity.identityString}&id=${callbackId}&nonce=${randomNonce}`;
      const response = await fetch(reqUri);
      if (response.status===200) {
        setIsIdentityCommitted(true);
        console.log('The identity is committed.');
      }
    }
    catch (error) {
      console.log("[Error in handleIdentityCommit]: ", error);
      setIsIdentityCommitted(false);
    }
    setIsLoadingCommit(false);
    return;
  };

  const initiateAirDrop = async () => {
    if (!isIdentityCommitted) {
      console.log('The identity is not committed yet.');
      return;
    }
    if (isAirDropped) {
      console.log('The airdrop is already done.');
      return;
    }
    setIsLoadingAirdrop(true);
    try {
      setGotErrorTxn(false);
      const reqUri = `${backendAirdrop}?identityString=${identity.identityString}&id=${callbackId}&externalNullifier=${1}`
      console.log(`Requesting ${reqUri}`)
      const response = await fetch(reqUri);
      const data = await response.json();
      console.log("The data is :", data);
      if (response.status===200) {
        setTxHash(data?.hash);
        setTxAddr(data?.to);
        setIsAirDropped(true);
        console.log('The transaction hash is: ', data?.hash);
      }
      else {
        console.log(data.msg);
        throw new Error(data.msg);
      }
    }
    catch (error) {
      setIsAirDropped(false);
      console.log(error);
      setGotErrorTxn(true);
    }
    setIsLoadingAirdrop(false);
    return;
  };

  // const airdropGCoin = async () => {
  //   try {
  //     await handleGenerateIdentity();
  //     await handleIdentityCommit();
  //     await initiateAirDrop();
  //   }
  //   catch (error) {
  //     console.log('[Error in airdropGCoin]: ', error);
  //   }
  //   return;
  // };

  const handleStart = () => {
    setStarted(true);
  };

  const handleAddressChange = (e: ChangeEvent<HTMLInputElement>) => {
    setAddress(e.target.value);
  };

  const handleAddressSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!ethAddressRegex.test(address)) {
      alert(`Invalid wallet address ${address}`);
      return;
    }
    console.log(address);
    setValidAddress(true);
    handleGetTemplate();
  }


  return (
    <div className='App'>
      <div className='center-body'>
        <div className='leftside-container'>
          <div className='leftside'>
            <h1>G-Coin</h1>
            <h2>Prove that your own a google email ID and get 100 G-Coins.</h2>
            <br/>
            { // Start the G-Coin application
              !started &&
              <div>
                <div>This dApp uses Reclaim Proofs to let you prove that you own a google email ID.</div>
                <div>Follow the steps below once you get started:</div>
                <ol>
                  <li>Enter your wallet address</li>
                  <li>Scan the template QR code on Reclaim Wallet</li>
                  <li>Wait for Semaphore Identity Generation (automatic)</li>
                  <li>Wait for Semaphore Identity Commitment (automatic)</li>
                  <li>Wait to receive the airdrop (automatic)</li>
                </ol> 
                <button onClick={handleStart}>Get Started</button>
              </div>
            }

            { // Enter the wallet address
              started && !template &&
              <form onSubmit={handleAddressSubmit} className='button-container'>
                <label>Enter your Wallet Address:
                  <input
                    type='text'
                    onChange={handleAddressChange}
                    required
                  />
                </label>
                <br/>
                <button type='submit'>Submit</button>
                {isLoadingTemplate && <div className='loading-spinner'/>}
              </form>
            }
            
            { // If template is not ok
              template && !isTemplateOk && !isProofReceived && 
              <div>{template}</div>
            }

            { // Show the QR code
              validAddress && !isProofReceived && template && isTemplateOk &&
              <div>
                <div>Scan/Click the QR code to be redirected to Reclaim Wallet.</div>
              </div>
            }

            { // Show the loader upon receiving proof while generating identity
              isProofReceived && !isGenerateIdentitySuccessful &&
              <div className='button-container'>
                <div> Generating an Identity. </div>
                <div className='loading-spinner'/>
              </div>
            }

            { // Show the loader upon receiving proof while committing identity
              isGenerateIdentitySuccessful && !isIdentityCommitted &&
              <div className='button-container'>
                <div> Committing the Identity. </div>
                <div className='loading-spinner'/>
              </div>
            }

            { // Show the loader upon receiving proof while airdropping 
              isIdentityCommitted && !isAirDropped &&
              <div className='button-container'>
                <div> Airdropping G-Coins. </div>
                <div className='loading-spinner'/>
                </div>
            }

            { // Show the Airdrop success message
              isAirDropped &&
              <div>
                <h3>Congrats on receiving 100 G-Coins to your Wallet Address:</h3>
                <br/>
                <div>{address}</div>
                <div className='small-text'>The Transaction Hash (Optimism Goerli) is: <a href={`https://goerli-optimism.etherscan.io/tx/${txHash}`}>{txHash}</a></div>
                <div>The token contract address is {tokenContractAddress}</div>
              </div>
            }
          </div>
        </div>

        { // Code Logo
          !(template && isTemplateOk && !isProofReceived) && 
          <div className='rightside'></div>
        }

        { // Show the QR code only when it has to be shown
          template && isTemplateOk && !isProofReceived && 
          <div className='rightside2'>
            <div className='QR-black'>
              <div className='QR-white'>
                <a href={template} target="_blank" rel="noopener noreferrer" title={template}>
                  <QRCode
                    size={256}
                    value={template}
                    fgColor="#000"
                    bgColor="#fff"
                    className='QR-resize'
                  />
                </a>
              </div>
            </div>
          </div>
        }

      </div>
    </div>
  )
}

export default App;
