# Handoff email: activating real delivery
Prepared November 17, 2026. Status: the code is in place and tested locally with the capture sender only. Real delivery is NOT activated: no provider key, sender domain, hosted instance or scheduler is set up, and no email has been sent to anyone.

## What exists
- The queue, consent, templates, Resend adapter and authenticated dispatch route (see **Email updates** in README.md).
- scripts/email-dispatch-hosted.mjs: the scheduler's call to that route, for a host. It needs no provider key, no database access and no added dependency.
- scripts/email-dispatch-hosted.test.mjs: its tests. They run with Handoff's own tests:
  pnpm --filter @penntools/tool-handoff test
- deploy/email.env.example: the settings, as a template with blanks. There are no credentials in the repository.
- scripts/email-dispatch.mjs and scripts/email-captures.mjs stay the local, capture-only runners.

## Remaining blockers
1. Access to a hosted PennTools instance running a production build of this branch (docs/RAILWAY.md).
2. Handoff deployed there with its own schema and real Penn Google sign-in.
3. A Resend sending API key and verified sender domain. No HANDOFF_EMAIL_* variables are set anywhere yet.
4. Platform must register Handoff's schema if not already registered on the target branch: in packages/platform/scripts/setup-tools.mjs:
   { name: "handoff", dir: "tools/handoff", connectionLimit: 30 },
   Then the normal db:deploy applies tools/handoff/schema.sql. This is a Platform-owned edit.
5. A once-per-minute scheduler (below).
6. Actual inbox receipt and sign-in/deep-link verification on the hosted app.

Existing PennTools staging is the preferred first request. Do not create a paid hosting service or buy a domain solely because the credentials are missing.

## Hosted app configuration
In the host's private environment settings:
- HANDOFF_EMAIL_PROVIDER=resend
- HANDOFF_EMAIL_API_KEY: a Resend sending key for the approved sender/domain.
- HANDOFF_EMAIL_FROM: Handoff <the-address-on-the-verified-domain>
- HANDOFF_EMAIL_DISPATCH_SECRET: a newly generated random secret of at least 32 printable non-space ASCII characters. Generate it in the deployment setup and put it directly into both host secret stores; never commit it.
- NEXTAUTH_URL: the hosted HTTPS origin.
- HANDOFF_EMAIL_ALLOWLIST: the one Penn address the initial delivery check goes to. Set it on the host; don't commit an address.
Use PennTools' existing DATABASE_URL and Google OAuth configuration. Do not add a second login system.

The template intentionally contains blanks. There are no credentials in the repository.
The production app must run a production build. next dev always captures only test-world emails regardless of credentials.
Do not use a personal Penn/Gmail address as the From address unless the provider/domain owner has explicitly configured it. Owning an inbox does not grant control of upenn.edu's DNS.
Resend's onboarding domain is limited to testing with the account owner's address; it is not a classmates launch sender.

## Scheduler
The app requires a regular authenticated POST to:
  https://HOST/tools/handoff/email/dispatch

Preferred: Platform's existing once-per-minute scheduler. It needs only the public HTTPS origin and the dispatch secret.
If Platform can host a small supervised worker, use:
  node tools/handoff/scripts/email-dispatch-hosted.mjs --watch
Worker environment: NEXTAUTH_URL, the same HANDOFF_EMAIL_DISPATCH_SECRET, optional HANDOFF_EMAIL_BATCH_LIMIT (default 5).
Do not give the worker a Resend key or database credentials. It calls the app, which performs the checks.
Use one worker, auto-restart on process failure, and host logs for error/count monitoring. It stays in the foreground and exits on shutdown signals.
Check configuration offline:
  node tools/handoff/scripts/email-dispatch-hosted.mjs --check
Run one actual dispatch only after the host and sender are ready:
  node tools/handoff/scripts/email-dispatch-hosted.mjs
A single run exits 1 when the app counted a failed or dead email, as well as when the call itself failed; a failed email is retried by the app on a later run.

Railway's native cron minimum is five minutes, so a one-minute cron expression there is unsupported. Use an existing one-minute scheduler or the worker; do not create a service without reviewing its hosting cost.
Why every minute: Handoff offers email, and queues it, only while a dispatcher run succeeded in the last 10 minutes. At a five-minute interval a single skipped run takes email off: the page stops offering it, and changes made meanwhile queue no email at all (they are not sent late).
Runs are sequential. The default batch is deliberately small for the pilot; adjust after observing queue volume and provider limits.
A successful HTTP response with zero queued jobs proves route reachability/configuration, NOT inbox delivery. Counts use the server's terminology: sent means provider acceptance, not proven inbox placement.
The current dispatcher intentionally waits about two minutes before sending and suppresses notifications already read in the app. Do not promise instant email.

## End-to-end acceptance
1. Deploy the reviewed branch with Handoff's registered schema and Penn Google auth.
2. Configure verified Resend sender and allowlist only the initial recipient.
3. Start the scheduler; confirm an authenticated run succeeds. This provides the initial heartbeat that exposes email preferences.
4. Sign in with the real Penn account and enable exchange and/or match notifications. Defaults remain off; do not silently opt in everyone.
5. With two real Penn accounts on a separate staging market, trigger a request/invitation. For the first check, have the allowlisted user be the recipient.
6. Leave that notification unread. Allow the two-minute grace period plus the next scheduler tick.
7. Confirm actual inbox receipt, correct sender, usable link, and that sign-in returns to the correct exchange. An API accepted response alone is insufficient.
8. Run the scheduler again: no duplicate message. Read or close/expire another action before dispatch and confirm its stale email is suppressed.
9. Turn the email preference off, trigger another eligible action, and confirm it is not sent.
10. Add only agreed pilot recipients after the first delivery works. Enable broad delivery only as an explicit launch decision.

None of these hosted checks has been run. No inbox has been tested.

## Source references
- Local code: apps/web/src/app/tools/handoff/email-config.ts, email-provider.ts, email/dispatch/route.ts.
- Local project instructions: CLAUDE.md; docs/RAILWAY.md; tools/handoff/README.md.
- Resend domains: https://resend.com/docs/dashboard/domains/introduction
- Resend API keys: https://resend.com/docs/dashboard/api-keys/introduction
- Railway cron limits: https://docs.railway.com/cron-jobs
