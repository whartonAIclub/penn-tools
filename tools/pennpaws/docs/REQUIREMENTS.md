# Requirements tracker

How to use this page: pick an unowned row, put your name in Owner, build it on `team/pennpaws`, and update Status. Add new rows at the bottom of their section with the next number.

**Priority:** P0 must ship for demo day, P1 ship if time allows, P2 after launch.
**Status:** To do, In progress, Built (code and automated tests pass, not yet tried in the browser), Done (tried on the local dev server and meets every acceptance criterion).

## Week 1, due Tue 11/3

| ID | Requirement | Owner | Status |
|---|---|---|---|
| W1.1 | Register the tool and push the registration commit | Lu | Done |
| W1.2 | Problem statement in `README.md` | Lu | Done |
| W1.3 | Interview 3 owners, one line each on what we heard | | To do |
| W1.4 | Interview 3 possible sitters, ask about price and willingness | | To do |
| W1.5 | Agree on the screen designs | Lu, Esther | To do |
| W1.6 | Book one office hours slot each | Lu, Esther | To do |
| W1.7 | Install Docker Desktop and run the site locally | Lu, Esther | Done |

## Product requirements

### Sign in and profiles

| ID | P | Requirement | Acceptance criteria | Owner | Due | Status |
|---|---|---|---|---|---|---|
| R1 | P0 | Signed out visitors see what PennPaws is and a sign in button | Uses the platform `SignInPrompt`. No custom login code. | Lu | 11/6 | Done |
| R2 | P0 | Pet details on every request | Name, kind (dog, cat, more than one, something else with text), breed or notes, optional photo. | Lu | 11/6 | Done |
| R3 | P1 | Saved sitter profile (My profile page) | Short bio, pets they're comfortable with, area. Today a sitter writes a note with each offer instead. | Esther | 11/9 | Done |
| R3b | P1 | Saved pet profiles, one page per pet | An owner keeps several pets, not one. Each has its own saved profile (name, kind, breed, size, age, personality, special care, bite history) and its own photo, shown as that pet's icon everywhere it appears — the list, the request card and the sitter's job page — so a sitter sees who they'd be meeting. Today's single pet becomes the owner's first saved pet; nothing is re-asked. For an owner, **My Pets** is the corner button, where My profile sits for a sitter: their pets are what an owner keeps up to date. **My profile** stays as it is, reached by a link at the foot of My Pets, and keeps who you are (name, role, location, languages, gender, bio, and a sitter's services and experience), since both roles need that page and a sitter has no pets on it. Replaces the pet questions in setup. | | 11/12 | To do |
| R24 | P0 | First-time setup | Non-Penn sign-ins see one clear screen first. Members say what to call them (pre-filled from Google) and pick owner or sitter (Pet Pals hidden until built), then answer a few grouped screens: owners 4 in all (name and role, pet, personality and care, location), sitters 4 (5 with boarding). Neutral defaults (no sitter preference, English, 1 mile, any energy, cat size small) need no question. Location finishes setup; My profile edits each part on its own. | Esther, Lu | 11/6 | Done |
| R30 | P1 | My profile shows saved answers | My profile opens on every answer from setup, with an Edit link on each line that opens that question and returns to the summary. Start over re-runs the whole setup. | Esther | 11/9 | Done |
| R25 | P1 | Request survey starts from the owner's profile | Pet name, kind, size, age, energy, neighborhood and care notes from the profile are filled in; the survey opens at the next question and the owner can still change anything. | Esther | 11/8 | Built (not yet tried in the browser: needs posting a request as an owner) |

### Posting a request (owner)

| ID | P | Requirement | Acceptance criteria | Owner | Due | Status |
|---|---|---|---|---|---|---|
| R4 | P0 | Guided survey posts a request | Seven steps: pet, about them, dates, visits and care, keys, pay, notes. Every step has a "something else" text option. Progress shown. | Lu | 11/8 | Done |
| R5 | P0 | Review before posting | Summary card of every answer. Owner can edit or post. Nothing is visible to sitters until Post. | Lu | 11/8 | Done |
| R6 | P1 | One sentence to request | AI fills the survey from a sentence, asks for missing fields, owner reviews. Hidden when the user has no API key. | Lu | 11/9 | Done |
| R35 | P1 | Paste a post, any language | Owners paste a group-chat post or describe what they need (up to 1,500 characters, any language). AI fills the request in English; the original post is attached for sitters when it was in another language. "Here's what I understood" lists what AI found and what it will still ask, before the remaining questions. | Esther | 11/12 | Built (AI step tested with a fake AI only; needs a live run with a key) |
| R36 | P1 | Type of care and sitter must-haves | Requests say visits, sitter stays at my place, or boarding at the sitter's home (boarding asks about drop-off and pick-up; stays and boarding are paid per night). Owners can ask for cat or dog experience, home most of the day, daily photo updates (added to the agreement), a sitter gender and languages; the gender and languages start from their profile. | Esther | 11/12 | Built (seeded requests show these correctly; the owner-side survey questions not yet tried in the browser) |
| R37 | P1 | Languages, and must-haves in matching | The site stays in English. Sitters list languages they speak, owners the languages they'd like. The R31 rules also score the type of care, the request's must-haves, its gender preference and languages. Each job page shows the sitter "How you match" with the same reasons and concerns as the card. Owners see, on each offer, which of their asks the sitter meets (a first step toward R34). | Esther | 11/12 | Done |
| R7 | P1 | Owner can cancel an open request | Owner confirms first. Status changes to cancelled and the page says so. Sitters with offers are notified. | Lu | 11/9 | Done |
| R7b | P2 | Owner can edit an open request | | | | To do |
| R43 | P1 | Post a request from your saved pets | The survey opens with "Who are we looking after while you're away?" over the owner's pets (photo, name, kind) to pick from: one, or several for one request. Picking skips the basic questions entirely and goes straight to dates, care and pay. Everything on those profiles is carried in, so the owner answers only what changes per booking — dates, type of care, and the pay they want — and AI writes the request from the pet profiles plus those answers. The owner reads it and posts; nothing is visible to sitters until they do (R5). A request for several pets says so on the card, and matching reads every pet on it. Replaces most of R4's seven steps for an owner who has saved a pet. | | 11/12 | To do |
| R44 | P0 | A name you choose on a request, a real name underneath | Members verify with their real name and student address, and that is what the team and any report sees. On a request and in messages they choose what to show — first name or a nickname. Email, phone, address and anything about payment stay hidden until the sitter's offer is accepted and both approve (R14); the display name never unlocks them. Sitters choose a display name on their profile the same way. | | 11/12 | To do |

### Finding a sitter

| ID | P | Requirement | Acceptance criteria | Owner | Due | Status |
|---|---|---|---|---|---|---|
| R8 | P0 | Sitters browse open requests | Soonest first. Filter by dogs and cats. No owner email or address shown. | Lu | 11/8 | Done |
| R8b | P1 | Filter by dates | | | 11/10 | To do |
| R9 | P0 | Request detail page | Pet, dates, care, area, pay, owner first name, verified badge. | Lu | 11/8 | Done |
| R10 | P0 | Sitter offers to help | One offer per sitter per request, with a short note. Owner is notified. | Lu | 11/9 | Done |
| R11 | P0 | Owner picks one sitter | Other offers are declined automatically and told so. | Lu | 11/9 | Done |
| R29 | P1 | Messages about a job | One thread per sitter per request with the owner. Any sitter may write while the request is open; after the owner picks, only the picked sitter's thread stays open until done. Sitters never see each other's threads. The other person is notified. "Help me write" drafts with AI from the request (and the sitter's profile); the person edits and sends. Hidden without an API key. Sitter's button reads "Offer to help"; the owner still picks. | Esther | 11/10 | Done |
| R26 | P1 | Sitter tabs | Sitters see Find jobs, My tasks (agreements to approve, upcoming, offers waiting), Completed and Earnings. Owners get Post and Mine only: open requests are never sent to them, they can't open other people's requests or offer, and the server checks the role. | Esther, Lu | 11/10 | Done |
| R31 | P0 | Find jobs ranked by fit | Sitters see the best fit first, with a Great or Good match label, the top reasons and one thing to check. Rules compare the sitter's profile with the owner's pet profile and request: pet kind, distance against their travel range, services, size, energy, anxious pets, injections and medication, bite history, the owner's sitter preference and weekdays. Works without an API key. | Lu | 11/10 | Done |
| R32 | P0 | Rank with AI | With a key, Rank with AI re-ranks the rules' best 10. The AI reads the owner's own words in any language (for example "女生优先" or "8 a.m. insulin") and writes one reason and one concern per job. Errors show on the page and leave the rules ranking in place. | Lu | 11/10 | Done |
| R33 | P1 | Test with fake people | `seed` adds 4 fake sitters and 6 fake owners (ids start with `seed-`); `seed play` has them offer, pick and approve; `seed reset` removes them. Lets one local account walk both sides. | Lu | 11/3 | Done |
| R34 | P2 | Owners see offers ranked by fit | The same match reasons on each offer an owner gets. | | 11/12 | To do |
| R38 | P1 | Team view | A Team button for emails in `TEAM_EMAILS` (team.ts), plus the local test user under `pnpm dev`. Shows members by role, requests by status, offers and the share on Great or Good matches, open reports, and the member list (first names, role, area, join date, activity), with fake test people hidden by default. Every action checks the email again on the server. | Lu | 11/10 | Built |
| R39 | P1 | Report and moderate | Members report a request (its owner) or an offer (its sitter) with a reason. The team can hide a request from Find, pause a member (no posting, offering or messaging) and mark reports resolved. Setup tells members the team can see profiles, requests and reports. | Lu | 11/10 | Built |
| R40 | P1 | Draft mode: AI writes, you send | AI's reply arrives as a suggestion above the message box, marked as AI's words, with Use this and Dismiss. Nothing reaches the other person until the member taps Send, so they read every word first. AI writes only from the request, the profiles and the agreement, and says it doesn't know instead of inventing. It never agrees to meet in person or on video and never settles the final payment: it says it is asking the member. Hidden without an API key. Ships for demo day; the rungs above it are R42. | | 11/14 | To do |
| R42 | P2 | Letting AI send on its own | After launch, a member who has sent AI drafts themselves may raise a thread to **Hold** (AI sends after a few minutes, behind an edit-or-stop banner) or **Auto** (AI replies at once; Take over ends it). Per thread, never per account. The two gates in R40 still hold at every rung. Needs R41. | | | To do |
| R41 | P2 | Say when a reply wasn't written by a person | Once R42 lets a reply go out that no member has read, the other person sees on that message that AI wrote it. Not needed while Draft is the only mode, since a person reads and sends every word. | | | To do |

### Agreement and booking

| ID | P | Requirement | Acceptance criteria | Owner | Due | Status |
|---|---|---|---|---|---|---|
| R12 | P0 | Care agreement drafted | Template fills dates, visits, care, keys, pay, urgent plan. AI polishes it when the owner has a key; any AI problem falls back to the template. | Lu | 11/10 | Done |
| R13 | P0 | Both people approve | Owner and sitter each tap Approve. Either can ask for a change, which resets both approvals. Approving an old version is refused. | Lu | 11/10 | Done |
| R14 | P0 | Contact reveal | Only after both approvals, each sees the other's Penn email. | Lu | 11/10 | Done |
| R15 | P1 | My requests page | Requests you posted and offered on, with status. | Lu | 11/12 | Done |
| R27 | P1 | Mark a booking done | Either person taps Mark as done on a booked request; the other is notified. | Esther | 11/10 | Done |
| R28 | P1 | Sitter payment tracking | Sitter records amount, method (Venmo, PayPal, Zelle, cash, other) and date per booking, can edit or remove it, and sees this month, all time and done-but-unpaid. Money moves outside PennPaws. | Esther | 11/10 | Done |
| R46 | P1 | A Completed tab for owners, and what it takes to get there | Owners get Completed beside Post, My requests and My Pets. A booking leaves My requests only when all three are true: marked done, the payment recorded, and the owner's rating left (R20, R27, R28). Until then it stays in My requests with what's outstanding on it, so nothing finished-but-unpaid or finished-but-unrated quietly disappears. The owner can see that a payment was recorded without seeing the sitter's earnings. | Esther | 11/13 | Done |
| R47 | P1 | Private details on a pet | Breed, food and dietary needs, and health conditions are saved per pet and stay off the public request. The booked sitter reads them once both approve. The owner can tick any one to show it sooner, for the common case where a diet or a condition decides whether a sitter can take the job. Stored and enforced (pets.ts, `visiblePrivateDetails`); still to be read by the request and job pages. | Esther | 11/13 | Built (My Pets edits and stores them; the request pages don't show them yet) |
| R45 | P1 | Showing up, and what happens when you don't | Money moves on Venmo, so PennPaws cannot hold or refund it the way Rover does: every consequence here is reputation and access. Each booking records who cancelled and when, against a window the agreement states. A member's profile carries a plain reliability line (bookings completed, late cancellations, no-shows) that the other side sees before choosing. Either person reports a no-show from the booking; the team can pause a member (R39) for repeat late cancellations or any no-show. Setup says in one line that PennPaws does not insure vet bills or guarantee payment, because Rover's guarantee and reservation protection do not exist here. | | | To do |

### Notifications

| ID | P | Requirement | Acceptance criteria | Owner | Due | Status |
|---|---|---|---|---|---|---|
| R22 | P0 | In-app notifications | Bell with unread count. Notified on: new offer, picked, not picked, approval, booked, change asked, cancelled. Tapping one opens the request. | Lu | 11/10 | Done |
| R23 | P1 | Email or phone push | Same events, delivered outside the site. Needs the Platform team to add an email service or a site-wide service worker; our `notify()` already takes extra channels. | | 11/12 | To do |

### Launch

| ID | P | Requirement | Acceptance criteria | Owner | Due | Status |
|---|---|---|---|---|---|---|
| R16 | P0 | Works on a phone browser | Every screen usable at 390px wide. Touch targets 44px or more. | Lu | 11/10 | Done |
| R17 | P0 | Tests with fake AI | Survey checks, booking rules, agreement and AI calls tested with no key or network. Full booking flow tested against Postgres. | Lu | 11/12 | Done |
| R18 | P0 | 5 user tests | Five Penn students we don't know complete a flow unaided. Notes added to this repo. | | 11/10 | To do |
| R19 | P0 | Launch PR merged | Only our two folders plus registration lines. `pnpm check:tools` passes. Platform team adds `pennpaws` to `TOOLS`. | | 11/14 | To do |
| R20 | P2 | Reviews after a booking | Owner rates a done booking once (1 to 5 stars, optional feedback). The sitter sees ratings in Completed with no owner name, pet, booking or exact date, only the month; the notification doesn't link to the booking. Public ratings for other members come later. | Esther | 11/12 | Done |
| R21 | P2 | Pet photo and sticker studio | | | | To do |
