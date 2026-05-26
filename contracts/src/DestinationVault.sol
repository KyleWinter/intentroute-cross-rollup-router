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
        _doFill(intentId, token, recipient, amount);
    }

    // transfer_and_execute path: hand the funds over and then invoke `target`
    // with the supplied payload. Reverts in `target` propagate as fill failure.
    function recordFillAndExecute(
        bytes32 intentId,
        address token,
        address recipient,
        uint256 amount,
        address target,
        bytes calldata payload
    ) external onlyOwner {
        _doFill(intentId, token, recipient, amount);
        if (target != address(0)) {
            (bool ok, bytes memory data) = target.call(payload);
            require(ok, _revertReason(data));
        }
    }

    function _doFill(bytes32 intentId, address token, address recipient, uint256 amount) internal {
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

    function _revertReason(bytes memory data) internal pure returns (string memory) {
        if (data.length < 68) {
            return "TARGET_CALL_REVERTED";
        }
        assembly {
            data := add(data, 0x04)
        }
        return abi.decode(data, (string));
    }
}
