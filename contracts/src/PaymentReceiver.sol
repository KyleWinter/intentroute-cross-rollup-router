// SPDX-License-Identifier: MIT
pragma solidity ^0.7.4;

// Minimal merchant-style receiver used to demonstrate the
// transfer_and_execute intent path. The DestinationVault transfers funds to
// the user and then invokes `acknowledge(intentId, payer, amount, ref)` on
// this contract, which stores the merchant ledger entry.

contract PaymentReceiver {
    struct Receipt {
        address payer;
        uint256 amount;
        bytes32 ref;
        uint64 receivedAt;
    }

    mapping(bytes32 => Receipt) public receipts;
    uint256 public totalReceived;

    event PaymentAcknowledged(bytes32 indexed intentId, address indexed payer, uint256 amount, bytes32 ref);

    function acknowledge(bytes32 intentId, address payer, uint256 amount, bytes32 ref) external {
        require(receipts[intentId].receivedAt == 0, "ALREADY_ACK");
        receipts[intentId] = Receipt({
            payer: payer,
            amount: amount,
            ref: ref,
            receivedAt: uint64(block.timestamp)
        });
        totalReceived += amount;
        emit PaymentAcknowledged(intentId, payer, amount, ref);
    }
}
