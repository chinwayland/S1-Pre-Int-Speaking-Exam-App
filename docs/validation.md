# Validation

Checked on September 26, 2026 using synthetic records only.

## Automated logic checks

Run `node --test tests/*.test.cjs`.

The original 15 scoring/content tests passed: the original 93.3 scoring example, genuine zero versus missing marks, invalid score rejection, nonrepeating question shuffle, CSV quoting and formula-like values, numeric student identifiers, absence, backup validation, duplicate IDs, malformed data, content versions, and all 20 questions and examples.

The app JavaScript passed Node's syntax check. A separate isolated check of the app's save and restore functions covered valid and malformed drafts, merging unrelated saved records, conflicting edits/deletions, and storage failure retaining work in memory. These checks do not make browser storage a concurrent database. Use one exam tab.

## Browser checks

- Started an exam with a synthetic student ID and completed all four parts.
- Requested every replacement in one part: five distinct questions, then a disabled replacement button.
- Checked question-only view hides teacher navigation and student identification.
- Paused the timer.
- Selected three marks: total remained blank. Added the fourth: 2, 3, 3, 3 produced 93.3.
- Saved the result, refreshed, and confirmed it remained available.
- Recorded an absent student with a blank total.
- Edited the saved result to 3, 3, 3, 3 and confirmed 100.0.
- Visually reviewed desktop setup, question, and grading screens.
- Checked the 390-pixel phone setup view for horizontal overflow; none was present.
- Confirmed the teacher rubric has criteria across columns and 0–3 down the rows.
- Confirmed the renamed GitHub Pages address serves the original app successfully.

Browser console checks reported no app errors during the completed workflow. Backup/CSV content was checked through automated functions; native Excel import behavior was not tested. A classroom trial and teacher moderation are still needed before using the revised content for assessed students.

## Shared roster revision

All 29 automated tests passed: 16 scoring/content/metadata checks, eight spreadsheet checks, and five localhost HTTP server checks. Spreadsheet coverage includes XLSX round-trip, Excel dates/times and the 1904 epoch, leading zeros, CSV IDs, reordered headers, duplicates, missing fields, formulas, and unsafe numeric IDs. Server checks cover authentication, teacher isolation, atomic validation failure, stale publication conflicts, code revocation, private-file denial, and persistence across restart with hashed codes.

Browser verification used a synthetic three-student XLSX: manager upload, preview, publication, code creation, and teacher sign-in. Teacher A saw only their two students and no manager controls. Selecting student 001235 populated the schedule without typing, completed four parts, saved 93.3, and selected the next pending student. The saved student was marked graded in that browser.

Hosting is prepared but not deployed or tested on the school network. Shared grade storage is not implemented. Only synthetic records were used.
