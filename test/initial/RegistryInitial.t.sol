// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {OrderedRegistry} from "../../src/OrderedRegistry.sol";

/// @dev Frozen public author-written initial suite. Deliberately uses only small values.
contract RegistryInitial {
    function check(bool ok, string memory message) internal pure {
        require(ok, string.concat("MTQ_ASSERT:", message));
    }

    function testCapacity() public {
        OrderedRegistry r = new OrderedRegistry();
        for (uint256 i = 1; i <= 4; ++i) {
            r.insert(i);
        }
        (bool ok, bytes memory data) = address(r).call(abi.encodeCall(r.insert, (5)));
        check(!ok, "full registry accepted insertion");
        check(keccak256(data) == keccak256(abi.encodeWithSelector(OrderedRegistry.Full.selector, 4)), "full error");
    }

    function testStableOrder() public {
        OrderedRegistry r = new OrderedRegistry();
        r.insert(10);
        r.insert(20);
        r.insert(30);
        r.insert(40);
        r.remove(20);
        check(r.length() == 3, "length");
        check(r.at(0) == 10 && r.at(1) == 30 && r.at(2) == 40, "stable order");
    }

    function testRefusals() public {
        OrderedRegistry r = new OrderedRegistry();
        (bool ok, bytes memory data) = address(r).call(abi.encodeCall(r.insert, (0)));
        check(
            !ok && keccak256(data) == keccak256(abi.encodeWithSelector(OrderedRegistry.ZeroValue.selector)),
            "zero error"
        );
    }

    function testRemoveMembership() public {
        OrderedRegistry r = new OrderedRegistry();
        r.insert(11);
        r.remove(11);
        check(!r.contains(11), "stale membership");
        r.insert(11);
        check(r.at(0) == 11, "reinsertion");
    }

    function testSmallValues() public {
        OrderedRegistry r = new OrderedRegistry();
        r.insert(255);
        check(r.at(0) == 255 && r.contains(255), "round trip");
    }
}
