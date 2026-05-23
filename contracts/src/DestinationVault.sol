// SPDX-License-Identifier: MIT
pragma solidity ^0.7.4;
pragma experimental ABIEncoderV2;

import {MockERC20} from "./MockERC20.sol";

contract DestinationVault {
    address public owner;

    struct FillRecord {
        address token;
        address recipient;
        uint256 amount;
        uint64 filledAt;
    }

    mapping(bytes32 => FillRecord) public fills;

    event IntentFilled(bytes32 indexed intentId, address indexed recipient, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "ONLY_OWNER");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function recordFill(bytes32 intentId, address token, address recipient, uint256 amount) external onlyOwner {
        require(fills[intentId].filledAt == 0, "ALREADY_FILLED");
        require(amount > 0, "INVALID_AMOUNT");

        fills[intentId] = FillRecord({
            token: token,
            recipient: recipient,
            amount: amount,
            filledAt: uint64(block.timestamp)
        });

        require(MockERC20(token).transfer(recipient, amount), "TRANSFER_FAILED");
        emit IntentFilled(intentId, recipient, amount);
    }
}
