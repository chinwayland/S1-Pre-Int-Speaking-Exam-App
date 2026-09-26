# Shared roster setup

One manager publishes the roster; teachers use the same server URL and their individual access codes. Teachers select students without typing their details.

## Spreadsheet and daily use

Use these six headers in row 1, in any order. Every field is required.

| Teacher | Class | Student | Student ID | Exam Date | Exam Time |
| --- | --- | --- | --- | --- | --- |
| Test Teacher A | Class 1 | Example Student | 001234 | 2027-01-12 | 09:00 |

Accepts XLSX, XLS, and CSV up to 5 MB and 10,000 students. Select the appropriate worksheet. Use consistent teacher names. Store IDs as text in Excel before entering them, especially long IDs. Native Excel dates/times are supported; text dates should use YYYY-MM-DD and times HH:mm. Times use school-local time.

Sign in as Manager, upload, review the preview and session label, then publish. Correct all validation errors first. Missing fields, duplicate IDs, conflicting slots for one teacher, invalid dates/times, formulas, and unsafe numeric IDs prevent publication. Publication replaces the entire active roster; it does not erase browser grades. Keep the source spreadsheet and use a distinct session label each year.

Generate an access code for each teacher and share it privately. Codes appear only when created. Generating another code revokes the previous code and sessions. Removing a teacher from the roster revokes access. Teachers sign in, select class/date/student, check the identity, and start. After saving, the app selects the next untested student in that class/date. Idle rosters refresh automatically; changes are checked before starting an exam.

Grades, drafts, and completion labels remain in the current browser. Switching devices retrieves the roster but not grades. Teachers must download CSV and JSON backups after each class. Use one exam tab. A manager sees all grades in their current browser, not other devices. Protect the computer profile and downloaded backups as teaching records.

## Proposed hosting

No service has been created. The included render.yaml proposes one Node web service in Singapore with 1 GB persistent storage. Checked September 26, 2026: US$7/month compute plus US$0.25/month disk, approximately US$7.25 before taxes and additional usage. See [Render pricing](https://render.com/pricing) and [persistent disk requirements](https://render.com/docs/disks). Free web services cannot provide this persistent disk.

After hosting is chosen and authorized:

1. Connect this GitHub repository to Render and create a Blueprint from the reviewed branch. Review charges before creating resources. Automatic deployment is disabled in the proposal.
2. Keep one server instance and the persistent disk at /var/data. Independent instances cannot share this file storage.
3. Save the generated MANAGER_CODE from service environment settings in a password manager. Never commit it or include it in the roster.
4. The app uses Render's HTTPS RENDER_EXTERNAL_URL. For a custom domain, set PUBLIC_ORIGIN to the exact HTTPS origin teachers use. TRUST_PROXY=1 is appropriate only behind the trusted hosting proxy.
5. Test synthetic students and two teacher accounts on separate devices from the actual school network. Then publish the real roster and share the server URL.
6. Keep the existing Pages app until the server is checked. GitHub Pages cannot run this backend.

The deployment file follows the [Blueprint specification](https://render.com/docs/blueprint-spec) but has not been deployed or validated through a Render account.

## Local setup and recovery

Use Node 24, set MANAGER_CODE to a random secret of at least 24 characters, and run `node server.cjs`. Generate a secret using Node's crypto.randomBytes(32).toString('base64url') and store it securely. Default local address: http://localhost:8766. Default data directory: .data, excluded from Git. Localhost is a preview, not a shared online address.

For another host, configure DATA_DIR as persistent writable storage, NODE_ENV=production, PUBLIC_ORIGIN as the HTTPS site origin, and HOST/PORT for the platform. Serve through HTTPS.

Roster updates use atomic file replacement. Only hashed teacher codes are persisted. Sessions expire after 12 hours; restarting signs users out. Persistent storage retains the roster and teacher codes across restarts. Retain the original spreadsheet and manager code securely. Lost server storage requires reuploading the roster and creating new teacher codes. Browser grade backups are separate.
