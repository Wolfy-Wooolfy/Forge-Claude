# W-4 forensic — phase43_notes_api

Per build→test attempt: iteration_count, verdict, the W-3 keep-best snapshot score, parse-reject, and the captured codegen prompt.

| attempt | it | advanced_to | files | parse_rejected | verdict_score | best.score (engine) | codegen_chars | repair_block |
|--------:|---:|-------------|------:|:--------------:|:-------------:|:-------------------:|--------------:|:------------:|
| 1 | 0 | BUILDER | 1 | false | [1,0] | [1,0,0] | 2888 | false |
| 2 | 1 | BUILDER | 1 | false | [1,0] | [1,0,0] | 2888 | false |

_Note: `verdict_score` is the driver-visible scenario-level [pass, -error]; `best.score` is the engine's authoritative keep-best snapshot [pass_scenarios, -error_scenarios, pass_assertions]. A constant `best.score` across attempts with worse/equal rebuilds is the W-3 keep-best guard holding (a worse rebuild did not replace the retained best)._
