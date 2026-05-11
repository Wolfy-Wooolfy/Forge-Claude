# Reference TODO API

Hand-crafted reference fixture for Forge's L5b Built-Project Test Harness (PHASE-8).

This is NOT an owner-facing project. It exists to verify L5b works correctly.

## Run standalone

```
npm install
node server.js
```

Server listens on port 3000.

## L5b test scenarios

Located in `forge_tests/scenarios/`. Execute via:

```
node bin/forge-builtproject-test.js --project _reference_todo_api
```

Expected: 6/6 PASS.
