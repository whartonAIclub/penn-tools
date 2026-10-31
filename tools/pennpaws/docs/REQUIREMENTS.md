# Requirements tracker

How to use this page: pick an unowned row, put your name in Owner, build it on `team/pennpaws`, and update Status. Add new rows at the bottom of their section with the next number.

**Priority:** P0 must ship for demo day, P1 ship if time allows, P2 after launch.
**Status:** To do, Built (code and automated tests pass, not yet tried in the browser), Done (tried on the local dev server and meets every acceptance criterion).

## Week 1, due Tue 11/3

| ID | Requirement | Owner | Status |
|---|---|---|---|
| W1.1 | Register the tool and push the registration commit | Lu | Done |
| W1.2 | Problem statement in `README.md` | Lu | Done |
| W1.3 | Interview 3 owners, one line each on what we heard | | To do |
| W1.4 | Interview 3 possible sitters, ask about price and willingness | | To do |
| W1.5 | Agree on the screen designs | Lu, Esther | To do |
| W1.6 | Book one office hours slot each | Lu, Esther | To do |
| W1.7 | Install Docker Desktop and run the site locally | Lu, Esther | To do |

## Product requirements

### Sign in and profiles

| ID | P | Requirement | Acceptance criteria | Owner | Due | Status |
|---|---|---|---|---|---|---|
| R1 | P0 | Signed out visitors see what PennPaws is and a sign in button | Uses the platform `SignInPrompt`. No custom login code. | Lu | 11/6 | Built |
| R2 | P0 | Pet details on every request | Name, kind (dog, cat, more than one, something else with text), breed or notes, optional photo. | Lu | 11/6 | Built |
| R3 | P1 | Saved sitter profile | Short bio, pets they're comfortable with, area. Today a sitter writes a note with each offer instead. | | 11/9 | To do |
| R3b | P1 | Saved pet profiles | Reuse a pet across requests instead of answering again. | | 11/12 | To do |

### Posting a request (owner)

| ID | P | Requirement | Acceptance criteria | Owner | Due | Status |
|---|---|---|---|---|---|---|
| R4 | P0 | Guided survey posts a request | Seven steps: pet, about them, dates, visits and care, keys, pay, notes. Every step has a "something else" text option. Progress shown. | Lu | 11/8 | Built |
| R5 | P0 | Review before posting | Summary card of every answer. Owner can edit or post. Nothing is visible to sitters until Post. | Lu | 11/8 | Built |
| R6 | P1 | One sentence to request | AI fills the survey from a sentence, asks for missing fields, owner reviews. Hidden when the user has no API key. | Lu | 11/9 | Built |
| R7 | P1 | Owner can cancel an open request | Status changes to cancelled. Sitters with offers are notified. | Lu | 11/9 | Built |
| R7b | P2 | Owner can edit an open request | | | | To do |

### Finding a sitter

| ID | P | Requirement | Acceptance criteria | Owner | Due | Status |
|---|---|---|---|---|---|---|
| R8 | P0 | Sitters browse open requests | Soonest first. Filter by dogs and cats. No owner email or address shown. | Lu | 11/8 | Built |
| R8b | P1 | Filter by dates | | | 11/10 | To do |
| R9 | P0 | Request detail page | Pet, dates, care, area, pay, owner first name, verified badge. | Lu | 11/8 | Built |
| R10 | P0 | Sitter offers to help | One offer per sitter per request, with a short note. Owner is notified. | Lu | 11/9 | Built |
| R11 | P0 | Owner picks one sitter | Other offers are declined automatically and told so. | Lu | 11/9 | Built |

### Agreement and booking

| ID | P | Requirement | Acceptance criteria | Owner | Due | Status |
|---|---|---|---|---|---|---|
| R12 | P0 | Care agreement drafted | Template fills dates, visits, care, keys, pay, urgent plan. AI polishes it when the owner has a key; any AI problem falls back to the template. | Lu | 11/10 | Built |
| R13 | P0 | Both people approve | Owner and sitter each tap Approve. Either can ask for a change, which resets both approvals. Approving an old version is refused. | Lu | 11/10 | Built |
| R14 | P0 | Contact reveal | Only after both approvals, each sees the other's Penn email. | Lu | 11/10 | Built |
| R15 | P1 | My requests page | Requests you posted and offered on, with status. | Lu | 11/12 | Built |

### Notifications

| ID | P | Requirement | Acceptance criteria | Owner | Due | Status |
|---|---|---|---|---|---|---|
| R22 | P0 | In-app notifications | Bell with unread count. Notified on: new offer, picked, not picked, approval, booked, change asked, cancelled. Tapping one opens the request. | Lu | 11/10 | Built |
| R23 | P1 | Email or phone push | Same events, delivered outside the site. Needs the Platform team to add an email service or a site-wide service worker; our `notify()` already takes extra channels. | | 11/12 | To do |

### Launch

| ID | P | Requirement | Acceptance criteria | Owner | Due | Status |
|---|---|---|---|---|---|---|
| R16 | P0 | Works on a phone browser | Every screen usable at 390px wide. Touch targets 44px or more. | | 11/10 | To do |
| R17 | P0 | Tests with fake AI | Survey checks, booking rules, agreement and AI calls tested with no key or network. Full booking flow tested against Postgres. | Lu | 11/12 | Done |
| R18 | P0 | 5 user tests | Five Penn students we don't know complete a flow unaided. Notes added to this repo. | | 11/10 | To do |
| R19 | P0 | Launch PR merged | Only our two folders plus registration lines. `pnpm check:tools` passes. Platform team adds `pennpaws` to `TOOLS`. | | 11/14 | To do |
| R20 | P2 | Reviews after a booking | | | | To do |
| R21 | P2 | Pet photo and sticker studio | | | | To do |
