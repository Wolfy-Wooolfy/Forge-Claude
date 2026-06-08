# Spike Result: Builder Real Code Generation

**Spike:** DECISION-2026-06-08-spike-builder-real-codegen
**Date:** 2026-06-08
**Verdict:** PASS
**Evidence dir (Part 2):** `artifacts/spikes/builder_real_codegen/run_2026-06-08T09-16-27`
**Evidence dir (Part 1):** `artifacts/spikes/builder_real_codegen/run_2026-06-08T09-06-46`
**total_usd (Part 1 + Part 2):** $0.01126

## Part 2 Assertions

- ✓ **A2.1** parseable JSON { files: [{path,content}] }
- ✓ **A2.2** add.js exists
- ✓ **A2.3** run.js exists
- ✓ **A2.4** shellResult.status === SUCCESS
- ✓ **A2.5** exit_code === 0 → `0`
- ✓ **A2.6** stdout.trim() === '5' → `5`
- ✓ **A2.7** total_cost ≤ $1.00 → `0.01126`

## Generated Files

### `add.js`
```js
function add(a, b) { return a + b; } module.exports = { add };
```

### `run.js`
```js
const { add } = require('./add'); console.log(add(2, 3));
```

## Execution

- exit_code: 0
- stdout.trim(): `5`

## Cost

- total_usd (Part 1 + Part 2): **$0.01126**
- Cap $1.00 — ✓ within cap

## Conclusion

**Spike PASS** — gpt-4o generated real code, Forge materialized it, node run.js executed and printed '5'. Generate → materialize → run is viable.

---
*Gate #10 analogue: owner must review on-disk add.js / run.js and actual stdout before closure.*