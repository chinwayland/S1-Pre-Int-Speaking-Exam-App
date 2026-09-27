# Cloudflare free deployment

Target: about 400 pre-intermediate students, a few exam days per year. The app supports 1,000 students per active session and a 1 MB roster snapshot. Use Workers Free and D1 Free. No paid Render service is needed.

## Architecture and limits

Cloudflare serves both the public app files and the authenticated API at one HTTPS address. The repository stays on GitHub; the original GitHub Pages version remains unchanged. Using one origin avoids cross-site session-cookie requirements. The public build contains only nine explicitly selected files, never secrets, database contents, tests, or backend code.

D1 stores the complete validated roster as one versioned JSON snapshot, plus hashed teacher codes and separate expiring session rows. An atomic conditional update prevents conflicting publications and code rotations from overwriting each other. No read replicas are enabled. Grades and drafts still stay in each teacher's browser.

As checked September 27, 2026: Workers Free allows 100,000 requests/day. D1 Free includes 5 million rows read/day, 100,000 rows written/day, and 5 GB total storage. Limits are shared with other apps in the same account. Exceeding free daily limits causes errors, not automatic paid upgrades. See [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

For illustration, 20 teachers leaving the app idle for eight hours with its 30-second refresh would make about 19,200 refresh requests. Each refresh reads the snapshot and session by primary key. This is an estimate, not a measured production load. Sign-in limits and hourly cleanup keep expired session data from accumulating. Test on the school's actual network before exam day.

## Local Cloudflare preview

Use Node 24:

```sh
npm ci
npm run build
npm run db:local
```

Create a gitignored `.dev.vars` file containing `MANAGER_CODE="a-long-random-local-test-secret"`. Use a separate random production secret later. Start `npm run dev:cloudflare` and open http://localhost:8787. Local D1 data stays under `.wrangler/` and is not uploaded automatically.

## First online deployment

1. Run `npx wrangler login --scopes account:read user:read workers:write workers_scripts:write d1:write` and complete authorization in your Cloudflare account. Select the intended account if more than one is available. Keep the Workers Free plan.
2. Run `npx wrangler d1 create s1-pre-int-speaking-exam`. For a new installation, copy the returned database ID into `wrangler.jsonc`, replacing the configured database ID. The repository now contains the ID of the owner’s exam database. A database ID is configuration, not a credential. Keep D1 on the free account plan.
3. Run `npm run db:remote` to apply the schema to the new database.
4. Generate a fresh random manager code, store it in your password manager, then run `npx wrangler secret put MANAGER_CODE` and enter it at the hidden prompt. Do not reuse the local demonstration code.
5. Run `npm run check:deploy`, then `npm run deploy`. Use the HTTPS workers.dev URL printed by Wrangler. No custom domain is necessary.
6. Sign in as Manager, publish a synthetic roster, create two teacher codes, and verify each teacher sees only their assigned students. Check scheduled dates, leading-zero IDs, scoring, and exports on the devices/network used for exams.
7. Publish the real roster and distribute the exam URL and teacher codes privately. Do not commit the roster to GitHub.

Account authorization and online deployment must be completed before claiming the shared app is live. Commands above are setup instructions, not proof they have run.

## Backups and annual reuse

Keep the source roster spreadsheet securely. For a database backup, run:

```sh
npx wrangler d1 export DB --remote --output /absolute/private/path/exam-backup.sql
```

The export contains student details and hashed access/session data. Store it outside the repository in your approved teaching-records location. A new D1 database can be initialized from the export using `wrangler d1 execute DB --remote --file /absolute/private/path/exam-backup.sql`; do not import it over an existing database without a recovery plan. Teachers must separately export their browser grades as CSV/JSON.

Each year, publish a new roster with a distinct exam session label and rotate teacher access codes as appropriate. Manager-code changes invalidate prior manager sessions. Teacher codes are shown only when generated; lost codes can be replaced. Scheduled cleanup removes expired sessions hourly. The app does not automatically delete the annual roster.
