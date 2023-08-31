import React, { ChangeEvent, FormEvent, useState } from 'react';
// import logo from './logo.svg';
import './App.css';
import QRCode from 'react-qr-code';

// const reclaim_logo = require('./reclaim.avif');

const App: React.FC = () => {
  const [callbackId, setCallbackId] = useState('');
  const [template, setTemplate] = useState('');
  const [isTemplateOk, setIsTemplateOk] = useState(true);
  const [isProofReceived, setIsProofReceived] = useState(false);
  const [receiver, setReceiver] = useState('');
  const [isAirDropped, setIsAirDropped] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [txAddr, setTxAddr] = useState('');
  const [isFetchedMsgClicked, setIsFetchMsgClicked] = useState(false);
  const [walletAddr, setWalletAddr] = useState('Wallet Address: Unknown');
  const [gotErrorTxn, setGotErrorTxn] = useState(false);
  // const [isFetchingProof, setIsFetchingProof] = useState(false);
  const [identity, setIdentity] = useState({trapdoor: undefined, nullifier: undefined, commitment: undefined, identityString: undefined});
  const [isIdentityCommitted, setIsIdentityCommitted] = useState(false);
  const [nonce, setNonce] = useState(0);

  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);
  const [isLoadingProof, setIsLoadingProof] = useState(false);
  const [isLoadingIdentity, setIsLoadingIdentity] = useState(false);
  const [isLoadingCommit, setIsLoadingCommit] = useState(false);
  const [isLoadingAirdrop, setIsLoadingAirdrop] = useState(false);
  // Update the backendBase according to where it is hosted.
  const backendBase = 'https://codecoin-backend.reclaimprotocol.org';
  const backendTemplateUrl = `${backendBase}/request-proofs`;
  const backendProofUrl = `${backendBase}/get-proofs`;
  const backendIdentity = `${backendBase}/generate-identity`;
  const backendCommit = `${backendBase}/commit`;
  const backendAirdrop = `${backendBase}/airdrop`
  const [proofObj, setProofObj] = useState();

  const handleGetTemplate = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoadingTemplate(true);
    try {
      console.log(`Requesting ${backendTemplateUrl}`);
      const response = await fetch(backendTemplateUrl);
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
        setTemplate('Error: Unable to receive a valid template from the backend. Check if it is up and running');
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

  const handleGetProof = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoadingProof(true);
    try {
      console.log(`Requesting ${backendProofUrl}?id=${callbackId}`);
      const response = await fetch(`${backendProofUrl}?id=${callbackId}`);
      if (response.status === 200) {
        const proofData = await response.json();
        setIsProofReceived(true);
        setProofObj(proofData[0]);
        // console.log(proofData[0]);
      }
    }
    catch (error) {
      setIsProofReceived(false);
      console.log(error);
    }
    setIsFetchMsgClicked(true);
    setIsLoadingProof(false)
    return;
  };

  const initiateAirDrop = async (e: FormEvent) => {
    setIsLoadingAirdrop(true);
    e.preventDefault();
    try {
      setGotErrorTxn(false);
      const reqUri = `${backendAirdrop}?identityString=${identity.identityString}&userAddr=${receiver}&externalNullifier=${1}`
      console.log(`Requesting ${reqUri}`)
      const response = await fetch(reqUri);
      const data = await response.json();
      console.log("The data is :", data);
      if (response.status===200) {
        setTxHash(data?.hash);
        setTxAddr(data?.to);
        setIsAirDropped(true);
        console.log('The receipt is:')
        console.log(data.receipt);
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

  const handleWalletChange = (e: ChangeEvent<HTMLInputElement>) => {
    setReceiver(e.target.value);
    setWalletAddr(e.target.value);
  };

  const handleGenerateIdentity = async () => {
    setIsLoadingIdentity(true);
    try {
      const response = await fetch(backendIdentity);
      const data = await response.json();
      console.log(data);
      if (response.status===200) {
        setIdentity(data);
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

  const handleIdentityCommit = async (e: FormEvent) => {
    setIsLoadingCommit(true);
    e.preventDefault();
    try {
      const reqUri = `${backendCommit}?identityString=${identity.identityString}&id=${callbackId}&nonce=${nonce}`;
      const response = await fetch(reqUri);
      if (response.status===200) {
        setIsIdentityCommitted(true);
      }
    }
    catch (error) {
      console.log("[Error in handleIdentityCommit]: ", error);
      setIsIdentityCommitted(false);
    }
    setIsLoadingCommit(false);
    return;
  };

  const handleNonceChange = (e: ChangeEvent<HTMLInputElement>) => {
    setNonce(e.target.valueAsNumber);
  };

  return (
    <div className='App'>
      {/* <Navbar walletAddr={walletAddr}/> */}
      <div className='center-body'>
      <div className='leftside-container'>
      <div className='leftside'>
      <h1>CodeCoin</h1>
      <h2>Get Codecoin tokens and brag today!</h2>
      <br/>
      { !template && !isProofReceived &&
        <div className='button-container'>
          <button onClick={handleGetTemplate} >Get the proof link/QR</button>
          {isLoadingTemplate && <div className='loading-spinner'/>}
        </div>
      }

      {template && isTemplateOk && !isProofReceived && <div>
        <div>Scan the QR code or click on it to be redirected.</div>
        <form onSubmit={handleGetProof} className='button-container'>
          <button type='submit'>Fetch proof</button>
          {isLoadingProof && <div className='loading-spinner'/>}
        </form>
        {isFetchedMsgClicked && <div className='error-txn'>Proof not yet received at the backend. <br/>Wait for the success message on the Reclaim Wallet and retry again. </div>}
      </div>
      }
      {template && !isTemplateOk && !isProofReceived && <div>{template}</div>}
      {isProofReceived && !isAirDropped && !isIdentityCommitted && 
        <div>
          <div className='button-container'>
          <button onClick={handleGenerateIdentity}>Generate a new Identity</button>
          {isLoadingIdentity && <div className='loading-spinner'/>}
          </div>
          { identity.commitment && 
            <div>
              <ul>
                <li>Trapdoor: {identity?.trapdoor}</li>
                <li>Nullifier: {identity?.nullifier}</li>
                <li>Commitment: {identity?.commitment}</li>
              </ul>
              {/* <button onClick={handleIdentityCommit}>Commit this identity</button> */}
              <form onSubmit={handleIdentityCommit} className='button-container'>
                <label>Commit this identity
                  <input
                    type='number'
                    onChange={handleNonceChange}
                    defaultValue={0}
                  />
                </label>
                <button type='submit'>Commit</button>
                {isLoadingCommit && <div className='loading-spinner'/>}
              </form>
            </div>
          }
        </div>
      }
      {isProofReceived && !isAirDropped && isIdentityCommitted && <form onSubmit={initiateAirDrop} >
        <label>
          Your Wallet Address:
          <input
            type='text'
            onChange={handleWalletChange}
            required
          />
        </label><br/>
        <div className='button-container'>
        <button type='submit'>Airdrop at this Wallet Address</button>
        {isLoadingAirdrop && <div className='loading-spinner'/>}
        </div>
        {gotErrorTxn && <div className='error-txn'>Error in Opt-Goerli RPC. Update backend.</div>}
      </form>
      }
      {isAirDropped && <div>
        <h3>Congrats, your account<br/>{receiver}<br/>has been airdropped 100 CodeCoin.</h3>
        <div>Your Callback Id was {callbackId}</div>
        <div className='large-text'>The Transaction Hash is: {txHash}</div>
        <div>The token contract address is 0x059CF844d6b8E00590C3c28Cf37f6fe0123BFb97</div>
      </div>
      }
      </div>
      </div>
      {!(template && isTemplateOk && !isProofReceived) && <div className='rightside'></div>}
      {template && isTemplateOk && !isProofReceived && <div className='rightside2'>
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
  );
}

export default App;
