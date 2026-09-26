// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Permissionless, bounded, insertion-ordered registry. No funds or privileged roles.
/// @dev Refusal precedence: ZeroValue, AlreadyPresent, Full for insert; Missing for remove.
contract OrderedRegistry {
    error ZeroValue();
    error AlreadyPresent(uint256 value);
    error Full(uint256 capacity);
    error Missing(uint256 value);
    error IndexOutOfBounds(uint256 index, uint256 length);

    uint256 public constant CAPACITY = 4;
    uint256[] private entries;
    mapping(uint256 => bool) private present;

    function insert(uint256 value) external {
        if (value == 0) revert ZeroValue();
        if (present[value]) revert AlreadyPresent(value);
        if (entries.length >= CAPACITY) revert Full(CAPACITY);
        entries.push(value);
        present[value] = true;
    }

    function remove(uint256 value) external {
        if (!present[value]) revert Missing(value);
        uint256 index;
        while (entries[index] != value) ++index;
        for (uint256 j = index; j + 1 < entries.length; ++j) {
            entries[j] = entries[j + 1];
        }
        entries.pop();
        delete present[value];
    }

    function contains(uint256 value) external view returns (bool) {
        return present[value];
    }

    function length() external view returns (uint256) {
        return entries.length;
    }

    function at(uint256 index) external view returns (uint256) {
        if (index >= entries.length) revert IndexOutOfBounds(index, entries.length);
        return entries[index];
    }

    function values() external view returns (uint256[] memory) {
        return entries;
    }
}
