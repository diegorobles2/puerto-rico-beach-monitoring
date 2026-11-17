# O4 six-task usability tooling — issue #44

This prepares a human acceptance study; it contains **no completed evaluator
sessions or measured human success rates**. The task list follows proposal
section 3.3. Accessibility verification remains #43. A successful fixture test
or a browser session ending normally does not satisfy O4.

## Files

- [`tasks.json`](tasks.json): six prompts, completion criteria, fixture beach IDs,
  ten default evaluators, and the proposal's 90% overall target.
- [`results.mjs`](results.mjs): dependency-free CSV/JSON validator and scorer.
- [`results.test.mjs`](results.test.mjs): synthetic scorer/CLI regression cases.
- [`../../frontend/e2e/usability-fixtures.ts`](../../frontend/e2e/usability-fixtures.ts):
  opt-in overrides of the existing Playwright fixtures.
- [`../../frontend/e2e/usability.e2e.ts`](../../frontend/e2e/usability.e2e.ts):
  automated checks that each task's scenario is actually available in the UI.

## Start a local practice/evaluation session

Prerequisites: supported Node 22, installed frontend dependencies, and Playwright's
matching Chromium. From `frontend/`:

```sh
npm ci
npx playwright install chromium
npm run usability:session
```

This explicitly starts the manual Playwright configuration in a **headed desktop
Chromium browser**, builds the actual frontend with `/api`, and serves preview
on `127.0.0.1:4173`. It does not reuse a running server. Stop any other session on
that port first. A visible banner identifies synthetic conditions. Keep the
terminal open; close the **main application tab** to end the session. Reload the
page between evaluators to reset search and selection, or start a fresh session.

The browser clock is frozen at **November 13, 2026, 12:00 UTC**. These dates are
scenario inputs, not current agency observations. Locale/timezone are en-US/UTC.
API responses, map tiles, and source-link navigation are intercepted locally;
unexpected browser requests are blocked. No backend, database, DRNA, NWS, or map
tile network connection is needed after dependencies/browser are installed.

The map retains real Leaflet controls and synthetic markers, but **tiles are
blank offline placeholders**. These fixtures support discovery through search,
filtering, and selection; they cannot establish usability of real map imagery.
Source links open a clearly identified synthetic reference page, not an agency
document. Do not use this mode to validate live geography, source fidelity, or
external-document usability.

This mode is outside `src/`, is not imported into the production build, has no
production URL/query toggle, and refuses to run in CI. Normal production startup
does not enable fixtures. Screenshots, traces, and video are disabled in the
manual configuration; the command saves no participant results. Playwright may
still print its runner status and write ordinary test-run metadata. That status
is **not** a human task score. Do not grant real geolocation for these tasks.

### Facilitator answer key

Participants should receive the **prompts**, not this answer key or the scoring
criteria. Use one scored attempt per evaluator/task. Define how assistance is
handled before starting and score consistently; record success only when the
task's stated criteria are met. No task time limit is specified by this tooling.

| Task | Synthetic scenario and expected identification |
| --- | --- |
| T1 — Find a beach | Search for Fixture Beach 02 and filter municipality San Juan; one matching list option and marker, correct selected details. |
| T2 — Water quality | Beach 01: current DRNA advisory, Enterococcus 231 colonies/100 mL. |
| T3 — Ocean risk | Beach 02: high NWS rip-current risk plus the synthetic active coastal warning. |
| T4 — Distinguish hazards | Beach 02: suitable water-quality sample (12 colonies/100 mL) coexists with high ocean risk; this does not establish overall swimming safety. |
| T5 — Provenance | Beach 01: DRNA observed 2026-11-13, retrieved 11:00 UTC; NWS issued/observed 10:00 UTC, retrieved 11:00 UTC. Find each independent source link. |
| T6 — Missing/old/advisory | Beach 01 current advisory; Beach 03 historical suitable sample from Nov. 10 with current status unknown; Beach 04 missing water quality with separate moderate ocean risk; Beach 05 has no forecast mapping and unknown ocean risk/alerts. None of the unknown states establishes clearance. |

The app currently renders missing/unmonitored water quality as **unavailable**;
it has no separate “not monitored” water-quality label. Beach 05 demonstrates an
explicit unmapped NWS fixture. Do not claim this tooling adds a production
not-monitored state or proves evaluators understand states that are not displayed.

## Record results

Run the following from the repository root. Create a blank **unscored** CSV:

```sh
node tests/usability/results.mjs --template > tests/usability/results/round-1.csv
```

On Windows PowerShell 5, use UTF-8 instead of its default UTF-16 redirection:

```powershell
node tests/usability/results.mjs --template | Set-Content -Encoding utf8 tests/usability/results/round-1.csv
```

The template contains all 60 planned rows, initially `not-attempted`. Use only
the roster IDs **E01–E10**; do not store names, emails, account IDs, demographic
data, or real location histories in these files. Result files under `results/`
are ignored by Git. Do not commit actual participant records inadvertently.

CSV header (exact order, exactly these three fields):

```csv
evaluatorId,taskId,outcome
E01,T1,not-attempted
```

Equivalent JSON input is an array of objects with exactly the same fields:

```json
[{ "evaluatorId": "E01", "taskId": "T1", "outcome": "not-attempted" }]
```

Allowed outcomes are `success`, `failure`, and `not-attempted`. The one-row
examples above are intentionally incomplete, not measured study results.
Unknown evaluator/task IDs, duplicate pairs, extra fields, malformed quoting,
and unsupported outcomes are rejected. JSON must contain an array.

## Summarize and interpret

```sh
node tests/usability/results.mjs tests/usability/results/round-1.csv
node tests/usability/results.mjs tests/usability/results/round-1.csv --format csv
```

JSON output includes overall, per-task, and per-evaluator counts/rates, explicit
missing pairs, plan version, group declaration, and the scope limitation. CSV
output provides overall/per-task/per-evaluator metrics. Save generated output
under `tests/usability/results/` if retaining it as evidence.

- The denominator is always **planned evaluators × six tasks**, including
  missing and unattempted slots. It never shrinks to the submitted rows.
- With ten evaluators, **54 successes and six failures out of 60** meets the
  90% overall target; **53/60 fails**. The comparison uses integer counts before
  display rounding. Per-task/evaluator breakdowns are diagnostic, not extra
  proposal acceptance requirements.
- `meetsRateTarget` reports the numeric threshold. `complete` requires every
  planned task to be scored success/failure. `passed` requires **both**. Thus
  54 successes with six missing attempts reports 90% but remains incomplete and
  does not pass the study-completeness gate.
- Default roster: E01–E10. `--evaluators 12` plans E01–E12 and 72 tasks. A smaller
  roster requires `--evaluators N --advisor-approved-group`; this records the
  facilitator's declaration, **not verification of advisor approval**. Keep any
  applicable advisor/UPRM/IRB documentation separately.
- Exit **0**: complete result set meets the overall task target; exit **1**:
  valid data below target or incomplete; exit **2**: invalid data/options or file
  errors. Template generation and `--help` exit 0 without scoring a study.

No CLI can establish that input records came from actual human sessions. Report
synthetic regression checks separately from human observations. Even genuine
passing task results do not establish the accessibility half of O4.

## Automated verification

From `frontend/`:

```sh
npm run test:usability
npm run test:e2e
```

The first command runs the Node scorer/CLI tests, including 54/60 versus 53/60,
missing evaluators/tasks, unattempted slots, duplicates, CSV/JSON parsing,
approved-group declarations, and exit codes. The second runs the existing
regression suite plus six automated O4 fixture scenarios. These have no real
participants. Frontend CI runs both; changes under `tests/usability/` trigger it.

Local verification on November 16, 2026 (Windows, Node 22.23.5): lint and the
production build passed; 81 frontend unit/component tests, 11 results-tool tests,
and 27 Chromium browser checks passed. The browser checks include all six O4
scenarios and the manual-mode banner, offline source popup, and page-close path.
The manual configuration discovers exactly one session and rejects CI execution.
Fixture marker strings are absent from the built production JavaScript. An
interactive headed session with a real evaluator was not performed; these are
automated synthetic checks only. The updated GitHub workflow has not yet run.
