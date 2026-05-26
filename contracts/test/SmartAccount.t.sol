// SPDX-License-Identifier: MIT
pragma solidity ^0.7.4;
pragma experimental ABIEncoderV2;

import {MockERC20} from "../src/MockERC20.sol";
import {SettlementRegistry} from "../src/SettlementRegistry.sol";
import {IntentEscrow} from "../src/IntentEscrow.sol";
import {SmartAccount} from "../src/SmartAccount.sol";
import {IntentEntryPoint} from "../src/IntentEntryPoint.sol";
import {TestBase} from "./TestBase.sol";

contract SmartAccountTest is TestBase {
    MockERC20 internal token;
    SettlementRegistry internal registry;
    IntentEscrow internal escrow;
    IntentEntryPoint internal entryPoint;
    SmartAccount internal account;

    uint256 internal ownerKey = 0xA11CE;
    address internal ownerAddr;

    function setUp() public {
        ownerAddr = VM.addr(ownerKey);

        token = new MockERC20("Mock USDC", "mUSDC", 6);
        registry = new SettlementRegistry();
        escrow = new IntentEscrow(address(registry));
        registry.setEscrowContract(address(escrow));

        entryPoint = new IntentEntryPoint();
        account = new SmartAccount(ownerAddr, address(entryPoint));

        // Smart account receives funds.
        token.mint(address(account), 1_000_000e6);
    }

    function testEntryPointExecutesSignedDepositIntent() public {
        // Account needs to approve the escrow itself, since the escrow pulls
        // tokens via transferFrom. Build a signed approve op first.
        SmartAccount.UserOperation memory approveOp = _buildOp(
            address(token),
            0,
            abi.encodeWithSignature("approve(address,uint256)", address(escrow), uint256(-1)),
            500_000
        );
        _submit(approveOp);

        // Now the depositIntent op.
        bytes32 intentId = keccak256("user-op-intent");
        SmartAccount.UserOperation memory depositOp = _buildOp(
            address(escrow),
            0,
            abi.encodeWithSignature(
                "depositIntent(bytes32,address,uint256,uint256,uint256)",
                intentId,
                address(token),
                uint256(100e6),
                uint256(9000),
                uint256(9101)
            ),
            500_000
        );
        _submit(depositOp);

        assertEq(token.balanceOf(address(escrow)), 100e6, "escrow received funds");
        assertEq(token.balanceOf(address(account)), 999_900e6, "smart account debited");
        assertEq(account.nonce(), 2, "nonce advanced twice");

        SettlementRegistry.Record memory record = registry.getRecord(intentId);
        assertEq(record.depositor, address(account), "depositor is the smart account");
        assertTrue(uint256(record.status) == uint256(SettlementRegistry.Status.Escrowed), "status escrowed");
    }

    function testRejectsBadSignatureWithoutAdvancingNonce() public {
        SmartAccount.UserOperation memory op = _buildOp(
            address(token),
            0,
            abi.encodeWithSignature("approve(address,uint256)", address(escrow), uint256(1)),
            120_000
        );
        // Tamper with the signature.
        op.signature[0] = bytes1(uint8(op.signature[0]) ^ 0xff);

        SmartAccount.UserOperation[] memory ops = new SmartAccount.UserOperation[](1);
        ops[0] = op;
        entryPoint.handleOps(ops);

        assertEq(account.nonce(), 0, "bad signature must not advance nonce");
        assertEq(token.allowance(address(account), address(escrow)), 0, "no approval applied");
    }

    function _buildOp(
        address target,
        uint256 value,
        bytes memory callData,
        uint256 gasLimit
    ) internal view returns (SmartAccount.UserOperation memory op) {
        op.sender = address(account);
        op.nonce = account.nonce();
        op.target = target;
        op.value = value;
        op.callData = callData;
        op.callGasLimit = gasLimit;
        op.signature = _sign(op);
    }

    function _sign(SmartAccount.UserOperation memory op) internal view returns (bytes memory) {
        bytes32 hash = keccak256(
            abi.encode(
                address(account),
                op.nonce,
                op.target,
                op.value,
                keccak256(op.callData),
                op.callGasLimit,
                _chainId()
            )
        );
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
        (uint8 v, bytes32 r, bytes32 s) = VM.sign(ownerKey, ethHash);
        return abi.encodePacked(r, s, v);
    }

    function _submit(SmartAccount.UserOperation memory op) internal {
        SmartAccount.UserOperation[] memory ops = new SmartAccount.UserOperation[](1);
        ops[0] = op;
        entryPoint.handleOps(ops);
    }
}
