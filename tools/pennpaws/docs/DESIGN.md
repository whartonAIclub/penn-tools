# Design

The clickable prototype lives in Claude Design: [PennPaws screens](https://claude.ai/artifact/WAwaUqNXrMKXGXrPKBLeB4). Ask Lu for access if the link doesn't open. Its source is versioned in [prototype/](prototype/).

## Screens

| # | Screen | Who | What it does |
|---|---|---|---|
| 0 | Signed out | Everyone | Explains PennPaws in one line and three promises, then Sign in with Penn |
| 1 | Post a request | Owner | Guided survey in a chat layout, ends in a review card and Post |
| 2 | Open requests | Sitter | List of requests with filters for dogs, cats and dates |
| 3 | Request detail | Sitter | Pet, dates, care, area, pay, verified owner, I can help |
| 4 | Care agreement | Both | Drafted terms, two approvals, contact reveal once both approve |

## The survey

Posting works like Lemonade's insurance flow: one question at a time, tap an answer, type only when you want to. Every question has an escape hatch.

| Step | Question | Tap options | Type your own |
|---|---|---|---|
| 1 | Who are we looking after? | A dog, A cat | More than one, Something else |
| 2 | Tell me about them | Add a photo | Name, breed, age, size, temperament |
| 3 | When will you be away? | Pick my own dates (date pickers), This weekend, Every week | |
| 4 | How often, and what to do? | Once a day, Twice a day, Every other day, Stay overnight. Walks or litter box, feeding, water, playtime, medication, clean up or brushing | Something else for both |
| 5 | How will your sitter get in? | Meet in person, Front desk, Lockbox or code, Decide with my sitter | Something else |
| 6 | What would you like to pay? | $15, $20, $25 a visit, Suggest a fair rate | Set my own amount |
| 7 | Where, vet, anything else? | Continue | Neighborhood or cross streets, vet, health and habits (three separate boxes) |

Owners can also skip the survey and type one sentence. AI fills the answers, names what it assumed, and the owner reviews the same summary card.

## Visual direction

* Calm and trustworthy, not cute. A deep green for actions and verified badges, a warm marigold for the moments that need a person's approval.
* The prototype uses Bricolage Grotesque and Plus Jakarta Sans; the built tool uses the site's own font so it feels part of penntools.org.
* Sentence case everywhere, plain words, no jargon. Buttons say exactly what happens: Post request, I can help, Approve.
* Phone first at 390px wide. Every tap target is at least 44px.
* Built with CSS Modules to match the rest of penntools.org.
