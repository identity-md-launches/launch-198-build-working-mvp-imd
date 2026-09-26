// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @dev Independent test-only model: fixed array, linear search, rebuild on deletion.
/// No imports, production helpers, membership mapping, or calls to the implementation.
contract NaiveRegistryModel {
    uint256[4] private items;
    uint256 private size;

    function contains(uint256 value) public view returns (bool) {
        for (uint256 i; i < size; ++i) {
            if (items[i] == value) return true;
        }
        return false;
    }

    function transition(bool inserting, uint256 value) external returns (bool ok, bytes memory refusal) {
        if (inserting) {
            if (value == 0) return (false, abi.encodeWithSignature("ZeroValue()"));
            if (contains(value)) return (false, abi.encodeWithSignature("AlreadyPresent(uint256)", value));
            if (size == 4) return (false, abi.encodeWithSignature("Full(uint256)", uint256(4)));
            items[size] = value;
            size++;
        } else {
            if (!contains(value)) return (false, abi.encodeWithSignature("Missing(uint256)", value));
            uint256[4] memory next;
            uint256 n;
            for (uint256 i; i < size; ++i) {
                if (items[i] != value) next[n++] = items[i];
            }
            items = next;
            size = n;
        }
        return (true, bytes(""));
    }

    function values() external view returns (uint256[] memory result) {
        result = new uint256[](size);
        for (uint256 i; i < size; ++i) {
            result[i] = items[i];
        }
    }
}
