// SPDX-License-Identifier: MIT
pragma solidity ^0.7.4;

interface Vm {
    function prank(address) external;
    function expectRevert(bytes calldata) external;
    function sign(uint256 privateKey, bytes32 digest) external pure returns (uint8 v, bytes32 r, bytes32 s);
    function addr(uint256 privateKey) external pure returns (address);
    function deal(address to, uint256 give) external;
}

contract TestBase {
    Vm internal constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function assertEq(uint256 left, uint256 right, string memory message) internal pure {
        require(left == right, message);
    }

    function assertEq(address left, address right, string memory message) internal pure {
        require(left == right, message);
    }

    function assertTrue(bool condition, string memory message) internal pure {
        require(condition, message);
    }

    function _chainId() internal pure returns (uint256 id) {
        assembly {
            id := chainid()
        }
    }
}
