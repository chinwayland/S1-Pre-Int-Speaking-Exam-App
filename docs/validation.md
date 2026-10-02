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

At this earlier stage, hosting and shared grade storage were not yet deployed. The later sections below record their completion. Only synthetic records were used in testing.

## Cloudflare migration (September 27, 2026)

All 34 tests passed. Five additional tests execute the Worker's SQL through SQLite: a 400-student roster across eight teachers; concurrent publication conflicts and invalid uploads; teacher-code rotation/removal and manager-secret changes; origin checks, secure cookies, logout and private-file denial; session expiry, hashed credentials, rate limits and scheduled cleanup.

Wrangler's actual local workerd/D1 runtime also accepted 400 synthetic students, returned exactly 50 assigned students to a teacher, and denied that teacher the manager API. The schema migration and deployment dry run succeeded. Browser checks confirmed manager sign-in, all 400 students available through teacher/class selectors, and the updated teacher-facing rubric. No browser console errors were reported. Production Cloudflare deployment and school-network access still require verification.

## Cloudflare deployment status

Cloudflare reported successful deployment on September 27, 2026, version b93f2d2e-720b-450c-ac67-e19640477c39, at https://s1-pre-int-speaking-exam-app.chinwayland-exams.workers.dev. D1 schema and a fresh manager secret are configured; the production roster is empty. The first browser check returned ERR_SSL_VERSION_OR_CIPHER_MISMATCH after initial subdomain registration. Live sign-in verification was blocked by automatic approval review because workspace credits were exhausted. Recheck HTTPS and live authentication before sharing with teachers.

## Shared grades (September 27, 2026)

All 38 automated tests passed. New grade checks cover teacher access boundaries for read/write/delete/history, server-calculated totals, shared reads, roster/identity validation, duplicate-request recovery, concurrent edit conflicts, absence, and transactional audit snapshots. The SQLite test adapter counts trigger writes like D1.

Browser testing against local workerd/D1 completed all four exam parts and entered 93.3. Stopping the local server caused an explicit unsaved status with the draft retained. A fresh page recovered all four marks and the pending request; retry saved one result with one audit entry. Editing to 100.0 created revision 2 and preserved revision 1 in History. Only synthetic student data was used. The existing live HTTPS URL now responds successfully.

## Shared grades production deployment (October 3, 2026)

All 38 tests passed again. Backed up the existing remote database before applying additive migration 0002_grades.sql. Published Worker version d12f0d54-ccb1-4830-a3a8-a7f743078755. Live HTTPS returns 200 with the shared-grade frontend, unauthenticated grade requests return 401, private source paths return 404, and remote schema inspection confirms both grades and grade_history tables. The earlier TLS issue is resolved. No production roster or grade records were modified during verification.

Authenticated grade saving and recovery were verified in the local Cloudflare runtime as described above. Production manager sign-in was not repeated because the temporary manager-code file from the earlier session is no longer present; the configured production secret was preserved. School-network access remains untested.

## Column mapping (October 3, 2026)

All 42 automated tests passed. Added coverage for arbitrary/reordered headers, ignored extra columns, missing/duplicate/out-of-range mappings, conservative suggestions, duplicate labels, and preservation of Excel date/time and leading-zero ID handling with formula rejection.

## Flexible timetable dates (October 3, 2026)

All 43 tests passed. Read-only parsing of the supplied S2 timetable with the user’s mapped columns now converts all 11 named-month text dates; only row 43’s missing Student ID remains. Tests cover named months, unambiguous day/month numeric dates, invalid calendar dates, weekday mismatches, ambiguous numeric dates, and conversion notices. Source workbook and production roster were not modified.
