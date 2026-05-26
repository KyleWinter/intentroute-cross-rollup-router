// SPDX-License-Identifier: MIT
pragma solidity ^0.7.4;
pragma experimental ABIEncoderV2;

import {SettlementRegistry} from "../src/SettlementRegistry.sol";
import {TestBase} from "./TestBase.sol";

contract SettlementRegistryTest is TestBase {
    SettlementRegistry internal registry;

    address internal depositor = address(0xA11CE);
    address internal token = address(0xBEEF);
    bytes32 internal intentId = keccak256("registry-test");

    function setUp() public {
        registry = new SettlementRegistry();
        registry.setEscrowContract(address(this));
    }

    function testRegisterAndUpdateLifecycle() public {
        registry.registerEscrow(intentId, depositor, token, 100, 9000, 9101);

        SettlementRegistry.Record memory r1 = registry.getRecord(intentId);
        assertEq(r1.depositor, depositor, "depositor stored");
        assertEq(r1.amount, 100, "amount stored");
        assertTrue(uint256(r1.status) == uint256(SettlementRegistry.Status.Escrowed), "initial status");
        assertTrue(r1.updatedAt > 0, "timestamp set");

        registry.updateStatus(intentId, SettlementRegistry.Status.Filled);
        SettlementRegistry.Record memory r2 = registry.getRecord(intentId);
        assertTrue(uint256(r2.status) == uint256(SettlementRegistry.Status.Filled), "status advanced");
        assertTrue(r2.updatedAt >= r1.updatedAt, "timestamp advanced");
    }

    function testDuplicateRegisterReverts() public {
        registry.registerEscrow(intentId, depositor, token, 100, 9000, 9101);
        bool reverted = false;
        try this.externalRegister(intentId) {
            reverted = false;
        } catch {
            reverted = true;
        }
        assertTrue(reverted, "duplicate register must revert");
    }

    function testUpdateUnknownIntentReverts() public {
        bool reverted = false;
        try this.externalUpdate(keccak256("never-registered")) {
            reverted = false;
        } catch {
            reverted = true;
        }
        assertTrue(reverted, "update on missing intent must revert");
    }

    function testOnlyAuthorizedCanWrite() public {
        address stranger = address(0xC0FFEE);
        VM.prank(stranger);
        bool reverted = false;
        try registry.registerEscrow(intentId, depositor, token, 100, 9000, 9101) {
            reverted = false;
        } catch {
            reverted = true;
        }
        assertTrue(reverted, "stranger register must revert");
    }

    function externalRegister(bytes32 id) external {
        registry.registerEscrow(id, depositor, token, 100, 9000, 9101);
    }

    function externalUpdate(bytes32 id) external {
        registry.updateStatus(id, SettlementRegistry.Status.Settled);
    }
}
