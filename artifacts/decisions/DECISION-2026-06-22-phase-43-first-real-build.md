# DECISION-2026-06-22 — PHASE-43: First Real End-to-End Build (Demonstrable) — PROPOSAL

> Status: PROPOSED (scope + cost ceiling DEFERRED to §0 probe -> STEP-A amendment -> owner ratification)
> Date: 2026-06-22
> Author: CTO advisor
> Owner trigger: Khaled — "جاهز" (2026-06-22), following PHASE-42 TRULY CLOSED (tag phase-42-complete -> d3ed119).
> Chain: appends to the PHASE-42 closure chain. Supersedes nothing.

## 1. Context
PHASE-42 is TRULY CLOSED: the owner-facing built-project test-report surface is live (endpoint + viewer + S333/S334 + authority doc). The full conversation pipeline is COMPLETE (PHASE-34: OWNER_INTENT -> ... -> QUALITY_JUDGE -> DEPLOYMENT_OR_END -> LIVE_DELIVERABLE -> COMPLETE), and one real idea->COMPLETE build was already proven with a real gpt-4o Gate #10 call. What does NOT yet exist: a FULL, real, polished end-to-end build of a meaningful project that an outside reviewer could inspect and conclude only world-class engineers could have built it.

## 2. Objective
Drive one real idea -> ... -> COMPLETE build end-to-end with a real provider, producing: a working generated project + the owner-readable test report (the PHASE-42 surface) showing it passes + concrete evidence. First "demonstrable capability" milestone (Track B), now that the owner-evidence layer exists.

## 3. Decision (this proposal)
Open PHASE-43 to perform the above. EXACT SCOPE IS NOT LOCKED HERE; deferred to:
- §0: a READ-ONLY ($0) inventory of the real-build capability (pipeline states, provider selection, the prior Gate #10 cost profile, the build/test/report flow, candidate demo projects + cost estimates, gaps/risks).
- STEP-A amendment (A-1), authored after the probe and owner-ratified, fixing: the demo project, the "real" bar (built+tested? deployed?), the COST CEILING, and the deterministic closure gate.

## 4. Cost discipline (BINDING)
- §0 is mock/read-only: ZERO real LLM calls, $0.
- Real-provider runs are DEFERRED to a later STEP and require a SEPARATE, EXPLICIT owner cost-approval in chat at that point, with an estimated $ shown FIRST. Kill-bar $3 for the phase. No real key/call before that explicit approval.

## 5. Track A / §ARC
Expected: test-infra + minor wiring. A real provider call already routes through the sanctioned openAiAdapter (§ARC). Any NEW side-effect home or §ARC entry -> STOP -> amendment -> owner approval. §ARC frozen at 10 unless explicitly amended.

## 6. Closure gate (placeholder — finalized in A-1)
Deterministic, post-probe. Will include: a real idea->COMPLETE build producing a working project whose owner-readable test report PASSES, within the approved cost ceiling; Track A clean; status.json updated; checkpoint written; the run's real cost recorded.

## Amendment log
- (pending) A-1 — scope + cost ceiling + closure gate, authored after the §0 probe, owner-ratified.
