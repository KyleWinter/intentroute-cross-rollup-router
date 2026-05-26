// SPDX-License-Identifier: MIT
pragma solidity ^0.7.4;
pragma experimental ABIEncoderV2;

import {MockERC20} from "../src/MockERC20.sol";
import {DestinationVault} from "../src/DestinationVault.sol";
import {PaymentReceiver} from "../src/PaymentReceiver.sol";
import {TestBase} from "./TestBase.sol";

contract DestinationVaultTest is TestBase {
    MockERC20 internal token;
    DestinationVault internal vault;

    address internal recipient = address(0xBEEF);
    bytes32 internal intentId = keccak256("vault-intent");

    function setUp() public {
        token = new MockERC20("Mock USDC", "mUSDC", 6);
        vault = new DestinationVault();
        token.mint(address(vault), 1_000_000e6);
    }

    function testRecordFillTransfersAndPersists() public {
        vault.recordFill(intentId, address(token), recipient, 250e6);

        assertEq(token.balanceOf(recipient), 250e6, "recipient credited");
        assertEq(token.balanceOf(address(vault)), 999_750e6, "vault debited");

        (address tokenAddr, address rec, uint256 amount, uint64 filledAt) = vault.fills(intentId);
        assertEq(tokenAddr, address(token), "fill token mismatch");
        assertEq(rec, recipient, "fill recipient mismatch");
        assertEq(amount, 250e6, "fill amount mismatch");
        assertTrue(filledAt > 0, "filledAt timestamp must be set");
    }

    function testCannotRecordFillTwice() public {
        vault.recordFill(intentId, address(token), recipient, 100e6);

        bool reverted = false;
        try this.externalRecordFill(intentId, address(token), recipient, 100e6) {
            reverted = false;
        } catch {
            reverted = true;
        }
        assertTrue(reverted, "double-fill must revert");
    }

    function testOnlyOwnerCanFill() public {
        address stranger = address(0xC0FFEE);
        VM.prank(stranger);
        bool reverted = false;
        try vault.recordFill(intentId, address(token), recipient, 100e6) {
            reverted = false;
        } catch {
            reverted = true;
        }
        assertTrue(reverted, "non-owner fill must revert");
    }

    function externalRecordFill(bytes32 id, address tokenAddr, address rec, uint256 amount) external {
        vault.recordFill(id, tokenAddr, rec, amount);
    }

    function testRecordFillAndExecuteAcknowledgesMerchant() public {
        PaymentReceiver merchant = new PaymentReceiver();
        bytes32 ref = bytes32("merchant-ref");
        bytes memory payload = abi.encodeWithSignature(
            "acknowledge(bytes32,address,uint256,bytes32)",
            intentId,
            recipient,
            uint256(75e6),
            ref
        );

        vault.recordFillAndExecute(intentId, address(token), recipient, 75e6, address(merchant), payload);

        assertEq(token.balanceOf(recipient), 75e6, "recipient credited");
        (address payer, uint256 amount, bytes32 storedRef, uint64 receivedAt) = merchant.receipts(intentId);
        assertEq(payer, recipient, "payer recorded");
        assertEq(amount, 75e6, "amount recorded");
        assertTrue(storedRef == ref, "ref recorded");
        assertTrue(receivedAt > 0, "timestamp set");
    }

    function testRecordFillAndExecuteBubblesTargetRevert() public {
        // Bytes that don't match acknowledge's selector → target call reverts.
        bytes memory bogus = hex"deadbeef";
        bool reverted = false;
        try this.externalFillAndExecute(intentId, address(token), recipient, 10e6, address(this), bogus) {
            reverted = false;
        } catch {
            reverted = true;
        }
        assertTrue(reverted, "bogus target call must revert");
    }

    function externalFillAndExecute(
        bytes32 id,
        address tokenAddr,
        address rec,
        uint256 amount,
        address target,
        bytes memory payload
    ) external {
        vault.recordFillAndExecute(id, tokenAddr, rec, amount, target, payload);
    }
}
