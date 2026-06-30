# W-4 forensic — phase45_url_shortener

Per build→test attempt: iteration_count, verdict, the W-3 keep-best snapshot score, parse-reject, and the captured codegen prompt.

| attempt | it | advanced_to | files | parse_rejected | verdict_score | best.score (engine) | codegen_chars | repair_block |
|--------:|---:|-------------|------:|:--------------:|:-------------:|:-------------------:|--------------:|:------------:|
| 1 | 0 | BUILDER | 5 | false | [7,0] | [7,0,15] | 4047 | false |
| 2 | 1 | REVIEWER_CODE_AND_SECURITY | 5 | false | [8,0] | [7,0,15] | 4342 | true |

_Note: `verdict_score` is the driver-visible scenario-level [pass, -error]; `best.score` is the engine's authoritative keep-best snapshot [pass_scenarios, -error_scenarios, pass_assertions]. A constant `best.score` across attempts with worse/equal rebuilds is the W-3 keep-best guard holding (a worse rebuild did not replace the retained best)._
