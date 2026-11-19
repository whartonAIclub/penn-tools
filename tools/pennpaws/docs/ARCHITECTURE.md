# Architecture

The goal is a small tool that won't need rewriting as it grows. Every choice below uses what the PennTools platform already provides and follows the repo's `CLAUDE.md`.

## Where the code lives

| Folder | What goes there |
|---|---|
| `tools/pennpaws/src/` | All logic: request parsing, agreement drafting, booking rules, types. Pure functions that take the database, AI and current user as parameters. |
| `tools/pennpaws/schema.sql` | Our tables, in our own Postgres schema `pennpaws`. Safe to re-run on every deploy. |
| `tools/pennpaws/src/__tests__/` | Tests with fake AI and a test database. No keys, no network. |
| `apps/web/src/app/tools/pennpaws/` | Pages, server actions and routes. Thin: read the user, call a function from the tool package, render. |

## Sign in

We build no login. The platform only admits verified upenn.edu Google accounts. Pages call `getCurrentUser()` from `@/lib/auth` and show the platform's `SignInPrompt` when it returns null. Server actions return `signInRequired()` for signed out calls. Every row we store carries the platform `user_id`, never an ID we invent.

Our schema can't read platform tables, so when someone posts or offers we copy their display name, school and email from `getCurrentUser()` into our own row. Emails are only returned to the other person once a booking is approved.

## Data model

```sql
requests    (id, owner_id, owner_name, owner_email, pet_name, pet_kind, pet_details,
             photo, weekly, starts_on, ends_on,
             frequency, frequency_other, tasks[], tasks_other, access, access_other,
             pay, area, notes, status, created_at, updated_at)
offers      (id, request_id, sitter_id, sitter_name, sitter_email, message, status, created_at)
              UNIQUE (request_id, sitter_id)
agreements  (request_id PK, offer_id, terms JSONB, version,
             owner_approved_at, sitter_approved_at, updated_at)
notifications (id, user_id, request_id, message, read_at, created_at)
```

* Every "something else" answer is stored next to its fixed option (`kind` plus `kind_other`), so we can filter on the fixed options and still keep what people typed. Repeated "something else" answers tell us which options to add next.
* `terms` is JSONB checked by the same Zod schema the AI fills, so an agreement drafted by AI and one filled from the template look the same to the rest of the code.
* Indexes: `requests (status, starts_on)` for browsing, `offers (request_id)`, `requests (owner_id)` and `offers (sitter_id)` for "my" pages.

## Booking states

All status changes go through one function, `transition(request, action, user)`, which checks who may do what. Pages never write a status directly.

```
request:  open ──► matched ──► agreed ──► completed
            │          │
            └──────────┴──► cancelled

agreement: drafted ──► owner approved ─┐
              │                        ├──► both approved  (request becomes agreed)
              └──► sitter approved ────┘
           any change request ──► drafted again, version + 1, approvals cleared
```

Updates use a check on the current status (`UPDATE ... WHERE status = 'open'`), so two sitters accepted at once can't both win.

## AI layer

| Call | Input | Output | Tier |
|---|---|---|---|
| Parse one sentence | The owner's sentence | Request fields, plus a list of missing ones | `fast` |
| Draft agreement | Request and offer | Agreement terms | `fast` |
| Rewrite a change request | Current terms and the asked change | New terms | `fast` |

* All calls use `generateObject` with Zod schemas from `@penntools/core/ai`. We never parse free text.
* Calls run only in server code through `getAI()`, on the signed in user's own key. The owner's key pays for parsing, and whoever asks for the draft or change pays for that.
* Every AI step has a non-AI path: the survey is a form, and the agreement has a template. A missing, invalid or empty key shows the platform's pointer to Settings and falls back to the form.
* Errors come back as data (`error.toJSON()`) so the page can show a clear message.

## Matching

`match.ts` scores each open request for a sitter from 0 to 100 with plain rules, so ranking works for everyone and is easy to test. It compares the sitter's profile with the owner's pet profile and the request on the same scales: pet kind, distance (rounded GPS, or a neighborhood named in the area) against the sitter's travel range, services, size, energy, anxious pets, injections and medication, bite history, the owner's sitter preference and weekdays. Each rule adds or takes points and leaves a short reason or concern.

Rank with AI (`rankMatches` in `ai.ts`) sends the rules' best 10, with their reasons, to the fast tier. The AI reads what rules can't, mostly the owner's notes in any language, and returns a score, one reason and one concern per request. Ids it doesn't recognize are dropped, and any AI error leaves the rules ranking in place.

## Notifications

Every event that needs someone (a new offer, being picked or not, an approval, a booking, a change request, a cancellation) goes through one function, `notify()` in `src/notifications.ts`. It stores the notification in our `notifications` table, which drives the bell and its unread count, then hands it to any extra channels.

The platform has no email or phone push today, and push needs a service worker at the site root, which is outside our folders. When the Platform team adds either, we pass a `NotificationChannel` to `notify()` and no other code changes. A failing channel never blocks the action.

## Privacy and safety

* Exact address, key codes and emails are hidden until both approvals.
* AI output is always shown to a person before it is saved as a request or agreement.
* No payments touch our code. The agreement records the amount; people pay on Venmo.
* Photos: the platform has no file storage yet. MVP shows a placeholder or a small resized image saved in our table. If photos matter in testing, we ask the Platform team for storage instead of building our own.

## How it scales

* The tool is stateless. Pages and actions read from Postgres, so more users means more rows, not new servers.
* Browsing is plain SQL with indexes and no AI, so it costs nothing per view.
* AI cost grows with bookings, not visits, and each user pays for their own.
* Survey questions and options live in one config file, so adding a pet kind or a task is a one line change shared by the survey, the filters and the AI schema.
* The schema is additive: new fields use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, as `CLAUDE.md` requires.

## Before the launch PR

* Ask the Platform team to add `pennpaws` to `TOOLS` in `packages/platform/scripts/setup-tools.mjs`, which we can't edit.
* Run `pnpm install` so `pnpm-lock.yaml` includes the new package, and commit it with the registration.
* `pnpm check:tools` and our tests pass.
