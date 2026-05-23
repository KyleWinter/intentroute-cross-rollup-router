// SPDX-License-Identifier: MIT
pragma solidity ^0.7.4;

import {MockERC20} from "./MockERC20.sol";
import {SettlementRegistry} from "./SettlementRegistry.sol";

contract IntentEscrow {
    enum LocalStatus {
        None,
        Escrowed,
        Submitted,
        Filled,
        Settled,
        Refunded,
        Failed
    }

    struct Deposit {
        address depositor;
        address token;
        uint256 amount;
        uint256 sourceChainId;
        uint256 destinationChainId;
        LocalStatus status;
    }

    address public owner;
    SettlementRegistry public registry;
    mapping(bytes32 => Deposit) public deposits;

    event IntentDeposited(bytes32 indexed intentId, address indexed depositor, address indexed token, uint256 amount);
    event IntentStatusUpdated(bytes32 indexed intentId, LocalStatus status);

    modifier onlyOwner() {
        require(msg.sender == owner, "ONLY_OWNER");
        _;
    }

    constructor(address registry_) {
        owner = msg.sender;
        registry = SettlementRegistry(registry_);
    }

    function depositIntent(
        bytes32 intentId,
        address token,
        uint256 amount,
        uint256 sourceChainId,
        uint256 destinationChainId
    ) external {
        require(deposits[intentId].depositor == address(0), "INTENT_ALREADY_EXISTS");
        require(amount > 0, "INVALID_AMOUNT");

        require(MockERC20(token).transferFrom(msg.sender, address(this), amount), "TRANSFER_FROM_FAILED");

        deposits[intentId] = Deposit({
            depositor: msg.sender,
            token: token,
            amount: amount,
            sourceChainId: sourceChainId,
            destinationChainId: destinationChainId,
            status: LocalStatus.Escrowed
        });

        registry.registerEscrow(intentId, msg.sender, token, amount, sourceChainId, destinationChainId);
        emit IntentDeposited(intentId, msg.sender, token, amount);
        emit IntentStatusUpdated(intentId, LocalStatus.Escrowed);
    }

    function markSubmitted(bytes32 intentId) external onlyOwner {
        _updateStatus(intentId, LocalStatus.Submitted, SettlementRegistry.Status.Submitted);
    }

    function markFilled(bytes32 intentId) external onlyOwner {
        _updateStatus(intentId, LocalStatus.Filled, SettlementRegistry.Status.Filled);
    }

    function markSettled(bytes32 intentId) external onlyOwner {
        _updateStatus(intentId, LocalStatus.Settled, SettlementRegistry.Status.Settled);
    }

    function markFailed(bytes32 intentId) external onlyOwner {
        _updateStatus(intentId, LocalStatus.Failed, SettlementRegistry.Status.Failed);
    }

    function refund(bytes32 intentId) external onlyOwner {
        Deposit storage deposit = deposits[intentId];
        require(deposit.depositor != address(0), "UNKNOWN_INTENT");
        require(deposit.status != LocalStatus.Refunded, "ALREADY_REFUNDED");

        deposit.status = LocalStatus.Refunded;
        require(MockERC20(deposit.token).transfer(deposit.depositor, deposit.amount), "TRANSFER_FAILED");
        registry.updateStatus(intentId, SettlementRegistry.Status.Refunded);

        emit IntentStatusUpdated(intentId, LocalStatus.Refunded);
    }

    function _updateStatus(bytes32 intentId, LocalStatus localStatus, SettlementRegistry.Status registryStatus) internal {
        Deposit storage deposit = deposits[intentId];
        require(deposit.depositor != address(0), "UNKNOWN_INTENT");

        deposit.status = localStatus;
        registry.updateStatus(intentId, registryStatus);

        emit IntentStatusUpdated(intentId, localStatus);
    }
}
