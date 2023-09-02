// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface SemaphoreInterface {
    function createGroup(
        uint256 groupId,
        uint256 merkleTreeDepth,
        address admin
    ) external;

    function addMember(uint256 groupId, uint256 identityCommitment) external;

    function verifyProof(
        uint256 groupId,
        uint256 merkleTreeRoot,
        uint256 signal,
        uint256 nullifierHash,
        uint256 externalNullifier,
        uint256[8] calldata proof
    ) external;
}

contract CodeCoin is ERC20 {
    address public owner;
    address public semaphoreAddress;
    uint256 public groupId;
    uint256 public merkleTreeDepth;
    mapping (bytes32 => bool) public registeredList;

    constructor(address _semaphoreAddress, uint256 _groupId, uint256 _merkleTreeDepth) ERC20("CodeCoin", "COCO") {
        owner = msg.sender;
        groupId = _groupId;
        semaphoreAddress = _semaphoreAddress;
        merkleTreeDepth = _merkleTreeDepth;
        SemaphoreInterface(semaphoreAddress).createGroup(groupId, merkleTreeDepth, address(this));
    }

    function registerMember(bytes32 hash, uint256 _identityCommitment) external {
        require(registeredList[hash]==false, "Candidate already registered");
        SemaphoreInterface(semaphoreAddress).addMember(groupId, _identityCommitment);
        registeredList[hash] = true;
    }

    function airDropTo(
        address receiver,
        uint256 _merkleTreeRoot,
        uint256 _signal,
        uint256 _nullifierHash,
        uint256 _externalNullifier,
        uint256[8] calldata _proof
        ) external {
        require(msg.sender == owner, "Only the owner can authorize an airdrop.");
        SemaphoreInterface(semaphoreAddress).verifyProof(groupId, _merkleTreeRoot, _signal, _nullifierHash, _externalNullifier, _proof);
        _mint(receiver, 100 * (10 ** decimals()));
    }
}