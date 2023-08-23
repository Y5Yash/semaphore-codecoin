// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract CodeCoin is ERC20 {
    address public owner;

    constructor() ERC20("CodeCoin", "COCO") {
        owner = msg.sender;
    }

    function airDropTo(address receiver) external {
        require(msg.sender == owner, "Only the owner can authorize an airdrop.");
        _mint(receiver, 100 * (10 ** decimals()));
    }
}