# Mutation measurement

Public author-written benchmark and tests. These measurements are self-reported, not independent, hidden, class-1 verified, or proof of security.

| Mutation | Category | Initial | Final |
| --- | --- | --- | --- |
| capacity-overflow | capacity-boundary | killed | killed |
| unstable-delete | ordering | killed | killed |
| wrong-zero-error | wrong-error | killed | killed |
| full-before-duplicate | error-precedence | survived | killed |
| stale-membership | stale-state | killed | killed |
| truncate-128 | truncation | survived | killed |

| Count | Initial | Final |
| --- | ---: | ---: |
| killed | 4 | 6 |
| survived | 2 | 0 |
| compile-error | 0 | 0 |
| timeout | 0 | 0 |
| infrastructure-error | 0 | 0 |
| not-applicable | 0 | 0 |
| equivalence-unresolved | 0 | 0 |
| total | 6 | 6 |
| denominator | 6 | 6 |
| excluded | 0 | 0 |
| score | 0.6666666666666666 | 1 |

## Initial evidence

Status: complete; baseline valid: true; executed tests: 5.

Project SHA-256: `2a63295fe55f8d286acd182139b1bef7dfc39b58a1ab01d1642bdf12c2f47c51`

Manifest SHA-256: `324d20ba6ce5755c99cfb56b1eab38f946b4ac02fd515a16e4071e10f477519d`

Toolchain/seed SHA-256: `612f4ae3aa6b22392500d4073c63782f8b4e0b909c4bb11b43a74ff4c889d95b`

Selection: `test/initial/*.t.sol`; seed: `0x5eed`.

| Mutation | Definition SHA-256 | Mutated source SHA-256 | Build/test exit | Tests executed | Assertion evidence |
| --- | --- | --- | --- | ---: | --- |
| capacity-overflow | f3c1be1c60c8fbd6d7b6025b736f559dbe65de9bdd9c1588f1b47f3bfb04a600 | ac2162a530beafb94396d1553888f3bb51a4c6c4fffc2af038e87e878f55228b | 0/1 | 5 | test/initial/RegistryInitial.t.sol:RegistryInitial::testCapacity() |
| unstable-delete | 8c924aad691912705584cb9db17d3537dcaa94d6742a6fb82710541b3a93b23a | b1138d8f72361d75bbdcdfbbcb085562c16b7331749f5f5057e047a79f9b0ff4 | 0/1 | 5 | test/initial/RegistryInitial.t.sol:RegistryInitial::testStableOrder() |
| wrong-zero-error | 38005bb2da4e528058fd2f6ecbd3e8332c321e5485d2b756819198a5403eb4e9 | d8dcc7c9da9f61f10ad32b01d4b4e198d158f1d8318bf31bb76107d1bb64fb09 | 0/1 | 5 | test/initial/RegistryInitial.t.sol:RegistryInitial::testRefusals() |
| full-before-duplicate | b2838f01c14b3284c74699a49cdbd7dc4738b61562827424154dd21fd1fb6945 | a7da722ff6e694a0ec788233c87457449a7afdc5f6b44d8d31a2260a0899bb56 | 0/0 | 5 | all baseline-selected tests passed; equivalence not assessed |
| stale-membership | e203e24958744595b41e0dc0c0639eeadd89de475e767b42f1df551619d57536 | 9d786c514f39669506c08da2812c1963644aafdd3a31798ffb50cb925db0cfe9 | 0/1 | 5 | test/initial/RegistryInitial.t.sol:RegistryInitial::testRemoveMembership() |
| truncate-128 | 20eab15973f620e3ec42021d72041830beb58127b850cb6e486f58a9aff1632c | e332b918770f4d31c00ad95c45a71a8fd8497b26223de1a48ee3ef9936570bde | 0/0 | 5 | all baseline-selected tests passed; equivalence not assessed |

## Final evidence

Status: complete; baseline valid: true; executed tests: 7.

Project SHA-256: `32fca74073fcb5c942f44d963f39d581a29edc0beaeec62a0b363f0a904d685d`

Manifest SHA-256: `324d20ba6ce5755c99cfb56b1eab38f946b4ac02fd515a16e4071e10f477519d`

Toolchain/seed SHA-256: `612f4ae3aa6b22392500d4073c63782f8b4e0b909c4bb11b43a74ff4c889d95b`

Selection: `test/final/*.t.sol`; seed: `0x5eed`.

| Mutation | Definition SHA-256 | Mutated source SHA-256 | Build/test exit | Tests executed | Assertion evidence |
| --- | --- | --- | --- | ---: | --- |
| capacity-overflow | f3c1be1c60c8fbd6d7b6025b736f559dbe65de9bdd9c1588f1b47f3bfb04a600 | ac2162a530beafb94396d1553888f3bb51a4c6c4fffc2af038e87e878f55228b | 0/1 | 7 | test/final/RegistryFinal.t.sol:RegistryFinal::testRefusalBytesAndPrecedence() |
| unstable-delete | 8c924aad691912705584cb9db17d3537dcaa94d6742a6fb82710541b3a93b23a | b1138d8f72361d75bbdcdfbbcb085562c16b7331749f5f5057e047a79f9b0ff4 | 0/1 | 7 | test/final/RegistryFinal.t.sol:RegistryFinal::testFuzzSequence(uint256), test/final/RegistryFinal.t.sol:RegistryFinal::testSequences() |
| wrong-zero-error | 38005bb2da4e528058fd2f6ecbd3e8332c321e5485d2b756819198a5403eb4e9 | d8dcc7c9da9f61f10ad32b01d4b4e198d158f1d8318bf31bb76107d1bb64fb09 | 0/1 | 7 | test/final/RegistryFinal.t.sol:RegistryFinal::testRefusalBytesAndPrecedence() |
| full-before-duplicate | b2838f01c14b3284c74699a49cdbd7dc4738b61562827424154dd21fd1fb6945 | a7da722ff6e694a0ec788233c87457449a7afdc5f6b44d8d31a2260a0899bb56 | 0/1 | 7 | test/final/RegistryFinal.t.sol:RegistryFinal::testRefusalBytesAndPrecedence() |
| stale-membership | e203e24958744595b41e0dc0c0639eeadd89de475e767b42f1df551619d57536 | 9d786c514f39669506c08da2812c1963644aafdd3a31798ffb50cb925db0cfe9 | 0/1 | 7 | test/final/RegistryFinal.t.sol:RegistryFinal::testFuzzSequence(uint256), test/final/RegistryFinal.t.sol:RegistryFinal::testSequences() |
| truncate-128 | 20eab15973f620e3ec42021d72041830beb58127b850cb6e486f58a9aff1632c | e332b918770f4d31c00ad95c45a71a8fd8497b26223de1a48ee3ef9936570bde | 0/1 | 7 | test/final/RegistryFinal.t.sol:RegistryFinal::testEveryBitBoundary(), test/final/RegistryFinal.t.sol:RegistryFinal::testFullWidthCounterexample(), test/final/RegistryFinal.t.sol:RegistryFinal::testFuzzFullWidth(uint256) |

Score = killed / (killed + survived). Compile errors, timeouts, infrastructure errors, not-applicable and equivalence-unresolved results are excluded, with counts above. Survivors have not been proved equivalent. Full commands, output, status, test names and counterexamples are embedded in measurement.json.
