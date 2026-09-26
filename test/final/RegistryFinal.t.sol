// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {OrderedRegistry} from "../../src/OrderedRegistry.sol";
import {NaiveRegistryModel} from "../support/NaiveRegistryModel.sol";

contract RegistryCaller {
    function insert(OrderedRegistry registry, uint256 value) external {
        registry.insert(value);
    }

    function remove(OrderedRegistry registry, uint256 value) external {
        registry.remove(value);
    }
}

contract RegistryFinal {
    event log_named_uint(string key, uint256 value);

    OrderedRegistry private registry;
    NaiveRegistryModel private model;
    uint256[] private observed;

    function check(bool ok, string memory reason) internal pure {
        require(ok, string.concat("MTQ_ASSERT:", reason));
    }

    function fresh() internal {
        registry = new OrderedRegistry();
        model = new NaiveRegistryModel();
        delete observed;
        observed.push(0);
        observed.push(type(uint256).max);
    }

    function stateMatches() internal view {
        uint256[] memory expected = model.values();
        uint256[] memory actual = registry.values();
        check(registry.CAPACITY() == 4, "capacity getter");
        check(registry.length() == expected.length, "length");
        check(keccak256(abi.encode(actual)) == keccak256(abi.encode(expected)), "complete ordered array");
        for (uint256 i; i < expected.length; ++i) {
            check(registry.at(i) == expected[i], "indexed value");
            check(registry.contains(expected[i]), "live membership");
        }
        for (uint256 i; i < observed.length; ++i) {
            check(registry.contains(observed[i]) == model.contains(observed[i]), "touched or absent membership");
        }
        indexRefusal(expected.length, expected.length);
        indexRefusal(expected.length + 1, expected.length);
        indexRefusal(type(uint256).max, expected.length);
    }

    function indexRefusal(uint256 index, uint256 size) internal view {
        (bool ok, bytes memory data) = address(registry).staticcall(abi.encodeCall(registry.at, (index)));
        bytes memory expected = abi.encodeWithSignature("IndexOutOfBounds(uint256,uint256)", index, size);
        check(!ok && keccak256(data) == keccak256(expected), "exact index refusal");
    }

    function step(bool inserting, uint256 value) internal {
        observed.push(value);
        (bool expectedOK, bytes memory expectedData) = model.transition(inserting, value);
        bytes memory input = inserting
            ? abi.encodeWithSignature("insert(uint256)", value)
            : abi.encodeWithSignature("remove(uint256)", value);
        (bool actualOK, bytes memory actualData) = address(registry).call(input);
        check(actualOK == expectedOK, "operation success or refusal");
        check(keccak256(actualData) == keccak256(expectedData), "exact refusal bytes or empty return");
        stateMatches();
    }

    /// @dev Concrete caller-visible witness preserved for the initial truncation miss.
    function testFullWidthCounterexample() public {
        fresh();
        uint256 value = (uint256(1) << 128) + 7;
        registry.insert(value);
        emit log_named_uint("inserted", value);
        emit log_named_uint("at(0)", registry.at(0));
        check(registry.at(0) == value, "full-width counterexample: at(0) must not equal 7");
        check(registry.values()[0] == value && registry.contains(value), "full-width observable state");
        registry.remove(value);
        check(registry.length() == 0 && !registry.contains(value), "remove full-width value");
    }

    function testEveryBitBoundary() public {
        // Every bit position, with exact power of two and neighbors, not only 128/256.
        for (uint256 bit; bit < 256; ++bit) {
            uint256 value = uint256(1) << bit;
            fresh();
            step(true, value - 1); // Includes the zero refusal at bit 0.
            step(true, value);
            step(true, value + 1);
            step(false, value);
            step(true, value);
        }
        fresh();
        step(true, type(uint256).max);
        step(false, type(uint256).max);
    }

    function testFuzzFullWidth(uint256 value) public {
        fresh();
        step(true, value);
        step(true, value);
        step(false, value);
        step(false, value);
        step(true, value);
    }

    function testRefusalBytesAndPrecedence() public {
        fresh();
        stateMatches();
        step(false, 0);
        step(false, 99);
        step(true, 0);
        for (uint256 i = 1; i <= 4; ++i) {
            step(true, i);
        }
        step(true, 0); // Zero wins over Full.
        step(true, 2); // Duplicate wins over Full.
        step(true, 5);
        step(false, 99);
        step(false, 2);
        step(true, 5);
        step(true, 5);
    }

    function testSequences() public {
        fresh();
        step(true, 10);
        step(true, 20);
        step(true, 30);
        step(true, 40);
        step(false, 20); // middle
        step(true, 20); // reinsert appends
        step(false, 10); // first
        step(false, 20); // last
        step(false, 30);
        step(false, 40); // last remaining
        step(false, 40); // absent
        step(true, 40);
    }

    function testFuzzSequence(uint256 seed) public {
        fresh();
        for (uint256 i; i < 32; ++i) {
            seed = uint256(keccak256(abi.encode(seed, i)));
            uint256 value;
            if (i % 4 == 0) value = seed; // full-width fresh input
            else if (i % 4 == 1) value = seed % 6; // zero, small collisions
            else value = observed[seed % observed.length]; // touched values, repeated removals
            step((seed & 1) == 0, value);
        }
    }

    function testPermissionlessCallers() public {
        OrderedRegistry r = new OrderedRegistry();
        RegistryCaller alice = new RegistryCaller();
        RegistryCaller bob = new RegistryCaller();
        alice.insert(r, 7);
        bob.remove(r, 7);
        check(r.length() == 0 && !r.contains(7), "any caller may remove");
        bob.insert(r, 8);
        alice.remove(r, 8);
        check(r.length() == 0 && !r.contains(8), "no owner role");
    }
}
