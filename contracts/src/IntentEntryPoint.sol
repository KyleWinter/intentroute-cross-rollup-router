// SPDX-License-Identifier: MIT
pragma solidity ^0.7.4;
pragma experimental ABIEncoderV2;

import {SmartAccount} from "./SmartAccount.sol";

// Minimal ERC-4337-style EntryPoint tailored to IntentRoute.
// `handleOps` is the production hook name; we keep it for fidelity.
//
// Production omissions (intentional, course scope):
//   - no paymaster validation,
//   - no gas accounting / refund,
//   - bundler can submit a single op at a time (no atomicity guarantees),
//   - simulation-only validateUserOp call without prefund deposit.

contract IntentEntryPoint {
    event UserOperationExecuted(
        address indexed sender,
        uint256 indexed nonce,
        address indexed target,
        bytes32 userOpHash,
        bool success
    );

    event UserOperationRejected(address indexed sender, uint256 indexed nonce, string reason);

    function handleOps(SmartAccount.UserOperation[] calldata ops) external {
        for (uint256 i = 0; i < ops.length; i++) {
            _handleOp(ops[i]);
        }
    }

    function _handleOp(SmartAccount.UserOperation calldata op) internal {
        SmartAccount account = SmartAccount(payable(op.sender));
        bytes32 hash = account.userOpHash(op);

        uint256 validation = account.validateUserOp(op, hash);
        if (validation != 0) {
            emit UserOperationRejected(op.sender, op.nonce, "INVALID_SIG");
            return;
        }

        try account.execute(op) returns (bytes memory) {
            emit UserOperationExecuted(op.sender, op.nonce, op.target, hash, true);
        } catch Error(string memory reason) {
            emit UserOperationRejected(op.sender, op.nonce, reason);
        } catch {
            emit UserOperationRejected(op.sender, op.nonce, "EXEC_REVERT");
        }
    }
}
