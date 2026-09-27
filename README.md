# S1 Pre-Intermediate Speaking Exam App

A reusable teacher workspace for a four-part speaking exam: personality, past, present, and future. The revised workflow brings questions, timing, grading, and results into one browser page.

Repository: https://github.com/chinwayland/S1-Pre-Int-Speaking-Exam-App

GitHub Pages: https://chinwayland.github.io/S1-Pre-Int-Speaking-Exam-App/

The `codex/teacher-workflow` branch contains the proposed revision. GitHub Pages serves `main`; the shared revision needs separate server hosting. Merging it will not make the backend work on GitHub Pages.

## Run the app

Production uses Cloudflare Workers and D1 on the free plan. See [Cloudflare setup](docs/cloudflare-setup.md). For the existing local Node preview, use Node.js 24 and a running server. Set MANAGER_CODE to a private random secret of at least 24 characters, then run `node server.cjs` and open http://localhost:8766. Local roster data is stored in `.data/`, excluded from Git.

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

## Records and backups

The roster is uploaded to the shared server. Teachers retrieve only their assigned students. Grades, notes, drafts, and completion labels remain in the current browser and are not synchronized between devices. The static source and question bank can be viewed by anyone with access to the website; do not treat a public Pages site as a secure question bank.

Storage is specific to the browser and site address. A downloaded copy has separate storage from the website. Private browsing, browser cleanup, or moving to another computer can remove or hide records. Download a backup after each class and keep it in your normal secure teaching records location.

CSV includes the currently selected session and opens in Excel. A JSON backup includes every saved session visible to the signed-in user and can be restored. Teachers see their own records; managers see all records in the current browser. Restore adds new record IDs and keeps matching IDs already in the browser; it does not replace existing records. Totals are recalculated from the four marks. User-entered formula-like CSV values are escaped. Entirely numeric student IDs are prefixed with an apostrophe to keep leading zeros and long numbers as text; other CSV readers may show that apostrophe.

Use one tab for administering exams. Unfinished exams recover after refresh with the timer paused. Saved results remain separate from unfinished drafts. If browser storage fails, the app warns you and retains work in memory so you can download it before closing the page.

The old URL was `https://chinwayland.github.io/2025-s1-speaking-exam-app/`. Replace old bookmarks and shared document links with the address above; do not rely on an old Pages link redirecting after a repository rename.

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

Cloudflare deployment uses Wrangler as a development dependency and an explicit public-asset build. SheetJS CE is bundled under its Apache 2.0 license. The Worker and D1 handle shared roster storage and authentication; the Node server remains available for local previews. GitHub Pages continues to serve the original app.
