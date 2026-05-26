// SPDX-License-Identifier: MIT
pragma solidity ^0.7.4;
pragma experimental ABIEncoderV2;

// Course-scope ERC-4337-style smart account.
// Simplifications vs the production EIP:
//   - no paymaster, no gas refund accounting;
//   - no initCode / factory deployment path;
//   - single ECDSA owner instead of full IAccount validation logic.
// The intent integration angle is documented in docs/erc4337_integration.md.

contract SmartAccount {
    struct UserOperation {
        address sender;
        uint256 nonce;
        address target;
        uint256 value;
        bytes callData;
        uint256 callGasLimit;
        bytes signature;
    }

    address public immutable owner;
    address public immutable entryPoint;
    uint256 public nonce;

    event Executed(address indexed target, uint256 value, bytes callData, bytes result);
    event NonceConsumed(uint256 indexed nonce);

    modifier onlyEntryPoint() {
        require(msg.sender == entryPoint, "ONLY_ENTRYPOINT");
        _;
    }

    constructor(address owner_, address entryPoint_) {
        require(owner_ != address(0), "OWNER_ZERO");
        require(entryPoint_ != address(0), "ENTRY_ZERO");
        owner = owner_;
        entryPoint = entryPoint_;
    }

    // Allow the account to receive ETH (mock-only; mirrors the real spec).
    receive() external payable {}

    function userOpHash(UserOperation calldata op) public view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    address(this),
                    op.nonce,
                    op.target,
                    op.value,
                    keccak256(op.callData),
                    op.callGasLimit,
                    _chainId()
                )
            );
    }

    // EntryPoint calls this before executing the op.
    // Returns 0 for a valid signature, 1 for an invalid signature.
    function validateUserOp(UserOperation calldata op, bytes32 hash) external returns (uint256) {
        require(msg.sender == entryPoint, "ONLY_ENTRYPOINT");
        require(op.sender == address(this), "WRONG_SENDER");
        require(op.nonce == nonce, "BAD_NONCE");
        require(hash == userOpHash(op), "BAD_HASH");

        address recovered = _recover(_toEthSignedMessageHash(hash), op.signature);
        if (recovered != owner) {
            return 1;
        }

        nonce += 1;
        emit NonceConsumed(op.nonce);
        return 0;
    }

    function execute(UserOperation calldata op) external onlyEntryPoint returns (bytes memory) {
        (bool ok, bytes memory result) = op.target.call{value: op.value, gas: op.callGasLimit}(op.callData);
        require(ok, _bytesToRevertReason(result));
        emit Executed(op.target, op.value, op.callData, result);
        return result;
    }

    function _chainId() internal pure returns (uint256 id) {
        assembly {
            id := chainid()
        }
    }

    function _toEthSignedMessageHash(bytes32 hash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
    }

    function _recover(bytes32 hash, bytes memory signature) internal pure returns (address) {
        require(signature.length == 65, "BAD_SIG_LEN");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }
        if (v < 27) {
            v += 27;
        }
        require(v == 27 || v == 28, "BAD_V");
        return ecrecover(hash, v, r, s);
    }

    function _bytesToRevertReason(bytes memory data) internal pure returns (string memory) {
        if (data.length == 0) {
            return "EXEC_REVERT";
        }
        if (data.length < 68) {
            return "EXEC_REVERT_SHORT";
        }
        assembly {
            data := add(data, 0x04)
        }
        return abi.decode(data, (string));
    }
}
