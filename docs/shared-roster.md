# Shared roster setup

One manager publishes the roster; teachers use the same server URL and their individual access codes. Teachers select students without typing their details.

## Spreadsheet and daily use

Use these six headers in row 1, in any order. Every field is required.

| Teacher | Class | Student | Student ID | Exam Date | Exam Time |
| --- | --- | --- | --- | --- | --- |
| Test Teacher A | Class 1 | Example Student | 001234 | 2027-01-12 | 09:00 |

Accepts XLSX, XLS, and CSV up to 5 MB and 1,000 students. Select the appropriate worksheet. Use consistent teacher names. Store IDs as text in Excel before entering them, especially long IDs. Native Excel dates/times are supported; text dates should use YYYY-MM-DD and times HH:mm. Times use school-local time.

Sign in as Manager, upload, review the preview and session label, then publish. Correct all validation errors first. Missing fields, duplicate IDs, conflicting slots for one teacher, invalid dates/times, formulas, and unsafe numeric IDs prevent publication. Publication replaces the entire active roster; it does not erase browser grades. Keep the source spreadsheet and use a distinct session label each year.

Generate an access code for each teacher and share it privately. Codes appear only when created. Generating another code revokes the previous code and sessions. Removing a teacher from the roster revokes access. Teachers sign in, select class/date/student, check the identity, and start. After saving, the app selects the next untested student in that class/date. Idle rosters refresh automatically; changes are checked before starting an exam.

Confirmed grades and completion labels are shared through Cloudflare. Teachers see their own records; managers see all teachers' records and can export a complete results spreadsheet. An unfinished exam and any pending save stay on the current device. Wait for **Saved to Cloudflare**; if saving fails, retry after the connection returns. Keep one exam tab open. CSV/JSON exports refresh shared results first. Use History beside a result to review changes and who made them.

## Cloudflare hosting

The selected deployment is Cloudflare Workers with D1 on the free plan. The app and API share one Cloudflare address; GitHub remains the source repository. See [deployment and recovery instructions](cloudflare-setup.md).

The roster supports up to 1,000 students per session, with a 1 MB validated roster limit. The expected cohort is about 400 pre-intermediate students, used for a few days each year. D1 holds the entire roster as a versioned snapshot so that publication is atomic; students still have individual IDs and teacher assignments. Teacher code hashes and expiring sign-in sessions also persist in D1.

Cloudflare sessions last 12 hours and survive Worker restarts. Rotating a teacher code, removing a teacher, or changing the manager secret invalidates the affected sessions. Expired session and sign-in-limit entries are cleaned hourly. Sign-in attempts are capped at 120 per network per 10-minute window, allowing several teachers on one school network.

Keep the source spreadsheet and manager code securely. Confirmed grades and edit history are also in D1. Unfinished drafts remain on the teacher’s device. Use the Cloudflare database export procedure in the setup guide for a server backup. Use the Cloudflare local preview (`npm start`) to test shared grades; the old Node preview does not support grade synchronization.

### Spreadsheet column mapping

Headers stay in row 1, but their names may vary. After uploading and choosing a worksheet, match each app field to a source column, then select **Review mapped rows**. Common header names are suggested. Each of the six fields requires a different source column; extra columns are ignored. Column letters distinguish duplicate or blank headers. Changing a mapping clears the preview and disables publication until reviewed again. Existing date, time, student ID, and duplicate checks still apply.

Dates may also use month names, such as Thursday, June 25, 2026 or 25 Jun 2026. Converted text dates appear in the date conversion review. Numeric dates with ambiguous day/month order require correction; weekday/date mismatches are rejected. Missing years and student IDs are never inferred.
