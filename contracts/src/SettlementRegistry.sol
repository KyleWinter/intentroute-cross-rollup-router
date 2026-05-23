// SPDX-License-Identifier: MIT
pragma solidity ^0.7.4;
pragma experimental ABIEncoderV2;

contract SettlementRegistry {
    enum Status {
        None,
        Escrowed,
        Submitted,
        Filled,
        Settled,
        Refunded,
        Failed
    }

    struct Record {
        address depositor;
        address token;
        uint256 amount;
        uint256 sourceChainId;
        uint256 destinationChainId;
        Status status;
        uint64 updatedAt;
    }

    address public owner;
    address public escrowContract;
    mapping(bytes32 => Record) private records;

    event EscrowContractUpdated(address indexed escrowContract_);
    event StatusUpdated(bytes32 indexed intentId, Status status);

    modifier onlyOwner() {
        require(msg.sender == owner, "ONLY_OWNER");
        _;
    }

    modifier onlyAuthorized() {
        require(msg.sender == owner || msg.sender == escrowContract, "ONLY_AUTHORIZED");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setEscrowContract(address escrowContract_) external onlyOwner {
        escrowContract = escrowContract_;
        emit EscrowContractUpdated(escrowContract_);
    }

    function registerEscrow(
        bytes32 intentId,
        address depositor,
        address token,
        uint256 amount,
        uint256 sourceChainId,
        uint256 destinationChainId
    ) external onlyAuthorized {
        Record storage record = records[intentId];
        require(record.updatedAt == 0, "INTENT_ALREADY_EXISTS");

        records[intentId] = Record({
            depositor: depositor,
            token: token,
            amount: amount,
            sourceChainId: sourceChainId,
            destinationChainId: destinationChainId,
            status: Status.Escrowed,
            updatedAt: uint64(block.timestamp)
        });

        emit StatusUpdated(intentId, Status.Escrowed);
    }

    function updateStatus(bytes32 intentId, Status status) external onlyAuthorized {
        Record storage record = records[intentId];
        require(record.updatedAt != 0, "UNKNOWN_INTENT");

        record.status = status;
        record.updatedAt = uint64(block.timestamp);

        emit StatusUpdated(intentId, status);
    }

    function getRecord(bytes32 intentId) external view returns (Record memory) {
        return records[intentId];
    }
}
