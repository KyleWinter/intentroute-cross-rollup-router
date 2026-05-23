// SPDX-License-Identifier: MIT
pragma solidity ^0.7.4;
pragma experimental ABIEncoderV2;

import {MockERC20} from "../src/MockERC20.sol";
import {SettlementRegistry} from "../src/SettlementRegistry.sol";
import {IntentEscrow} from "../src/IntentEscrow.sol";
import {TestBase} from "./TestBase.sol";

contract IntentEscrowTest is TestBase {
    MockERC20 internal token;
    SettlementRegistry internal registry;
    IntentEscrow internal escrow;

    address internal user = address(0xA11CE);
    bytes32 internal intentId = keccak256("intent-1");

    function setUp() public {
        token = new MockERC20("Mock USDC", "mUSDC", 6);
        registry = new SettlementRegistry();
        escrow = new IntentEscrow(address(registry));
        registry.setEscrowContract(address(escrow));

        token.mint(user, 1_000_000e6);

        VM.prank(user);
        token.approve(address(escrow), uint256(-1));
    }

    function testDepositIntentTransfersFundsAndRegistersStatus() public {
        VM.prank(user);
        escrow.depositIntent(intentId, address(token), 100e6, 9000, 9101);

        assertEq(token.balanceOf(address(escrow)), 100e6, "escrow balance mismatch");
        SettlementRegistry.Record memory record = registry.getRecord(intentId);
        assertEq(record.depositor, user, "depositor mismatch");
        assertEq(record.amount, 100e6, "registry amount mismatch");
        assertTrue(uint256(record.status) == uint256(SettlementRegistry.Status.Escrowed), "registry status mismatch");
    }

    function testOwnerCanAdvanceStatus() public {
        VM.prank(user);
        escrow.depositIntent(intentId, address(token), 100e6, 9000, 9101);

        escrow.markSubmitted(intentId);
        escrow.markFilled(intentId);
        escrow.markSettled(intentId);

        SettlementRegistry.Record memory record = registry.getRecord(intentId);
        assertTrue(uint256(record.status) == uint256(SettlementRegistry.Status.Settled), "final registry status mismatch");
    }

    function testRefundReturnsFundsToDepositor() public {
        VM.prank(user);
        escrow.depositIntent(intentId, address(token), 100e6, 9000, 9101);

        escrow.refund(intentId);

        assertEq(token.balanceOf(user), 1_000_000e6, "refund did not restore funds");
        SettlementRegistry.Record memory record = registry.getRecord(intentId);
        assertTrue(uint256(record.status) == uint256(SettlementRegistry.Status.Refunded), "refund status mismatch");
    }
}
