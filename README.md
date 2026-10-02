# S1 Pre-Intermediate Speaking Exam App

A reusable teacher workspace for a four-part speaking exam: personality, past, present, and future. The revised workflow brings questions, timing, grading, and results into one browser page.

Repository: https://github.com/chinwayland/S1-Pre-Int-Speaking-Exam-App

GitHub Pages: https://chinwayland.github.io/S1-Pre-Int-Speaking-Exam-App/

The `codex/teacher-workflow` branch contains the proposed revision. GitHub Pages serves `main`; the shared revision needs separate server hosting. Merging it will not make the backend work on GitHub Pages.

## Run the app

Production uses Cloudflare Workers and D1 on the free plan. See [Cloudflare setup](docs/cloudflare-setup.md). For a local preview use Node.js 24, `npm ci`, `npm run db:local`, and `npm start`; see the setup guide for the private `.dev.vars` manager code. The shared-grade preview runs at http://localhost:8787. The old Node server is retained only for legacy roster tests.

A manager signs in, uploads the six-column spreadsheet, reviews it, publishes the roster, and creates a private access code for each teacher. Teachers sign in and select their class, date, and student. All student details come from the roster.

Ask one question and follow-up in each of four parts, select four marks, and save. Download CSV and JSON grade backups after each class. See [shared roster setup](docs/shared-roster.md).

## Changes from last year

- Retains the four parts, 0–3 score bands, and weights: Fluency 20%, Pronunciation 15%, Contribution 40%, Accuracy 25%.
- Uses simpler labels for the last two criteria: **Answer content** and **Grammar and words**.
- Replaces the uneven 35-question bank with 20 shorter prompts, each with one follow-up and an example answer.
- Shuffles each part's questions once per exam. Replacements cannot repeat in that part of the exam. Questions can recur for later students.
- Adds student identification, pause/resume, a time cue, an explicit grading step, absent status, score editing, CSV export, and backup/restore.
- Corrects the copied band-zero descriptors and allows thinking pauses and small errors at the top band.
- Requires all four marks before showing a total. Absence remains separate from a genuine zero.
- Records every displayed question, including replacements, speaking time, individual marks, content version, and optional teacher note.
- Uses a question-only view that hides teacher controls and student identification. This is a display option, not authentication.

The timing, support rules, shorter question bank, and revised descriptors are **proposals for a classroom trial**, not requirements found in the old files. Review `docs/exam-review.md` before adopting them. No claim of equal difficulty across prompts has been established by a trial.

## Shared results and recovery

Cloudflare D1 is the source of truth for rosters, confirmed grades, absence records, and grade edit history. Teachers can read and change records assigned to their teacher identity; managers can view and export all teachers' records. Each save recalculates the total on the server and rejects stale revisions instead of overwriting another device's changes.

The app shows **Saved to Cloudflare** only after confirmation. If a connection fails, the current exam and pending request remain in local browser storage and a Retry button appears. Reopening the same site in the same browser recovers the draft. A retried confirmed request does not add a duplicate result or audit entry. Keep one exam tab open. An unfinished exam has not yet been shared with other devices.

CSV and JSON downloads refresh the shared results first. Export is stopped if the server cannot be reached, so an old cached list is not silently presented as current. Teachers export their own results; managers export all results, optionally filtered by session. Grade history records the teacher identity or Manager role, timestamp, revision, marks, notes, and deletion status. Manager codes are shared credentials, so the history does not distinguish people using the same code.

Existing browser-only results are preserved. On their original browser/site, use **Download previous browser results**, then **Restore backup** to upload missing record IDs. A result must match the active roster and session to be imported. Backups from the old localhost/GitHub Pages address must be downloaded there first; browsers do not share storage between addresses. Restore preserves existing shared IDs and reports a failure without rolling back earlier confirmed imports.

Deletion hides a result from the current results list but retains its audit history in D1. Back up D1 separately using the procedure in `docs/cloudflare-setup.md`. Do not commit student data or grade exports to GitHub.

## Scoring

The total is `sum(mark × weight) / 3`, displayed to one decimal. Marks are integers from zero through three. For example, marks **2, 3, 3, 3** give **93.3 / 100**, matching the supplied spreadsheet's example.

Criterion headers run horizontally and score levels run from zero downward in the teacher guide's rubric table. The app grades each criterion across the whole performance, not separately for each question.

## Maintenance

- `content.js`: question bank, examples, weights, and rubric descriptors. Increase `version` when assessment content changes.
- `core.js`: pure scoring, shuffle, CSV, and backup validation functions.
- `app.js`: exam flow and browser storage.
- `styles.css`: responsive layout.
- `tests/core.test.cjs`: automated logic checks.

Run the tests with Node.js:

```sh
node --test tests/*.test.cjs
```

Cloudflare deployment uses Wrangler as a development dependency and an explicit public-asset build. SheetJS CE is bundled under its Apache 2.0 license. The Worker and D1 handle shared roster storage and authentication; the old Node server is retained for legacy roster tests. GitHub Pages continues to serve the original app.
