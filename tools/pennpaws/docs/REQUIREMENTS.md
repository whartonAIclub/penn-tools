# Requirements tracker

How to use this page: pick an unowned row, put your name in Owner, build it on `team/pennpaws`, and tick Done once every acceptance criterion passes on the local dev server. Add new rows at the bottom of their section with the next number.

Priority: **P0** must ship for demo day, **P1** ship if time allows, **P2** after launch.

## Week 1, due Tue 11/3

| ID | Requirement | Owner | Done |
|---|---|---|---|
| W1.1 | Register the tool and push the registration commit | Lu | ☑ |
| W1.2 | Problem statement in `README.md` | Lu | ☑ |
| W1.3 | Interview 3 owners, one line each on what we heard | | ☐ |
| W1.4 | Interview 3 possible sitters, ask about price and willingness | | ☐ |
| W1.5 | Agree on the screen designs | Lu, Esther | ☐ |
| W1.6 | Book one office hours slot each | Lu, Esther | ☐ |

## Product requirements

### Sign in and profiles

| ID | P | Requirement | Acceptance criteria | Owner | Due | Done |
|---|---|---|---|---|---|---|
| R1 | P0 | Signed out visitors see what PennPaws is and a sign in button | Uses the platform `SignInPrompt`. No custom login code. | | 11/6 | ☐ |
| R2 | P0 | A signed in user can create a pet profile | Name, kind (dog, cat, more than one, something else with text), breed or notes, optional photo. Saved per user. | | 11/6 | ☐ |
| R3 | P0 | A signed in user can create a sitter profile | Short bio, pets they're comfortable with, area, availability. Shown on every offer. | | 11/6 | ☐ |

### Posting a request (owner)

| ID | P | Requirement | Acceptance criteria | Owner | Due | Done |
|---|---|---|---|---|---|---|
| R4 | P0 | Guided survey posts a request | Seven steps: pet, about them, dates, visits and care, keys, pay, notes. Every step has a "something else" text option. Progress shown. | | 11/8 | ☐ |
| R5 | P0 | Review before posting | Summary card of every answer. Owner can edit or post. Nothing is visible to sitters until Post. | | 11/8 | ☐ |
| R6 | P1 | One sentence to request | AI fills the survey from a sentence with `generateObject`, asks for missing fields, owner reviews. Hidden when the user has no API key. | | 11/9 | ☐ |
| R7 | P1 | Owner can cancel or edit an open request | Status changes to cancelled. Sitters with offers see it. | | 11/9 | ☐ |

### Finding a sitter

| ID | P | Requirement | Acceptance criteria | Owner | Due | Done |
|---|---|---|---|---|---|---|
| R8 | P0 | Sitters browse open requests | Newest first. Filter by dogs, cats, dates. No owner email or address shown. | | 11/8 | ☐ |
| R9 | P0 | Request detail page | Pet, dates, care, area, pay, owner first name and school. | | 11/8 | ☐ |
| R10 | P0 | Sitter offers to help | One offer per sitter per request. Owner sees the sitter's profile. | | 11/9 | ☐ |
| R11 | P0 | Owner picks one sitter | Other offers are declined automatically and told so. | | 11/9 | ☐ |

### Agreement and booking

| ID | P | Requirement | Acceptance criteria | Owner | Due | Done |
|---|---|---|---|---|---|---|
| R12 | P0 | Care agreement drafted | AI drafts dates, visits, keys, food, vet, emergency plan, pay from the request and offer. Without a key, a template fills the same fields. | | 11/10 | ☐ |
| R13 | P0 | Both people approve | Owner and sitter each tap Approve. Either can ask for a change, which resets both approvals. | | 11/10 | ☐ |
| R14 | P0 | Contact reveal | Only after both approvals, each sees the other's Penn email. | | 11/10 | ☐ |
| R15 | P1 | My bookings page | Upcoming and past bookings for owners and sitters. | | 11/12 | ☐ |

### Launch

| ID | P | Requirement | Acceptance criteria | Owner | Due | Done |
|---|---|---|---|---|---|---|
| R16 | P0 | Works on a phone browser | Every screen usable at 390px wide. Touch targets 44px or more. | | 11/10 | ☐ |
| R17 | P0 | Tests with fake AI | Request parsing, agreement drafting and booking state changes covered by tests that use no key and no network. | | 11/12 | ☐ |
| R18 | P0 | 5 user tests | Five Penn students we don't know complete a flow unaided. Notes added to this repo. | | 11/10 | ☐ |
| R19 | P0 | Launch PR merged | Only our two folders plus registration lines. `pnpm check:tools` passes. | | 11/14 | ☐ |
| R20 | P2 | Reviews after a booking | | | | ☐ |
| R21 | P2 | Pet photo and sticker studio | | | | ☐ |
