# PennPaws

**A Penn student you can trust looks after your pet while you're away.**

PennPaws is a tool on [penntools.org](https://penntools.org) that connects Penn pet owners with Penn students who walk dogs and visit cats. Everyone signs in with a verified Penn account: Penn is our pilot school, and other schools come later. New members pick a role (owner, sitter or Pet Pals) and answer a short profile survey once. A short guided survey writes the request, AI drafts the care agreement, and nothing is booked until both people approve.

| | |
|---|---|
| **Team** | Lu Lu, Esther Li |
| **Program** | Wharton AI Club, AI Product Manager Training, Cohort 3 |
| **Status** | Full booking tested in the browser on Nov 3, as an owner and as a sitter: setup, posting, offers, picking, changes, approving with phone and address, booking, cancelling and backing out. Next: user tests, then launch on penntools.org (waiting on the Platform team's database line) |
| **Demo day** | Tue 11/17, live on penntools.org |
| **Tool ID** | `pennpaws`, so the URL is `/tools/pennpaws` |

## Problem statement

Penn students with dogs and cats get stuck every time they travel for recruiting, breaks or a weekend away. Today they post in class group chats, lean on roommates, or skip the trip. Rover and Wag exist, but they match you with strangers and ask you to trust star ratings with your keys and your pet. The person we build for is a grad student near campus, going away for one to seven days, who would gladly pay a fellow student they can vouch for.

## How it works

```
Owner answers a few quick questions ──► AI turns them into a request card ──► owner posts it (approves)
                                                                                  │
Sitter sees open requests ranked by fit ◄─────────────────────────────────────────┘
(rules compare profiles; AI reads the owner's own words, in any language, and explains each pick)
        │
        ▼
Sitter accepts the job ──► owner picks one sitter (approves)
        │
        ▼
AI drafts a care agreement: dates, visits, keys, food, vet, pay
        │
        ▼
Owner approves + sitter approves ──► booked, both see each other's Penn email
```

AI never posts, picks or books on its own: every step marked "approves" is a person's call.

## What's in the MVP

| In | Later |
|---|---|
| Penn sign in (platform), Penn only for the pilot | Payments inside the app (Venmo for now), other schools |
| Pet profile and sitter profile | Open chat between users |
| Guided survey to post a request, or one sentence | Reviews and repeat sitters |
| Browse open requests, ranked by fit with AI reasons | Native iPhone app (the site works in a phone browser) |
| Offer to help, care agreement, two approvals | Pet photo and sticker studio |
| One account, two sides, switched from the header | Being on both sides at once |
| A pay band while browsing, the rate once you're picked | Paying through PennPaws |

## Documents

| Doc | What's in it |
|---|---|
| [Product requirements](docs/PRD.md) | The bet, users, principles, success metrics, plan |
| [Requirements tracker](docs/REQUIREMENTS.md) | Every feature with acceptance criteria, owner and due date |
| [Architecture](docs/ARCHITECTURE.md) | Sign in, data model, booking states, AI layer, privacy, how it scales |
| [Design](docs/DESIGN.md) | Screens, survey questions, visual direction |

## Run it locally

You need Docker Desktop running, Node.js 20.12 or newer and pnpm 9. From the repo root:

```bash
pnpm install
```

```bash
pnpm dev
```

Then open http://localhost:3000, sign in (locally you are a test user), save an OpenAI key in Settings, and pick PennPaws from the sidebar.

### After a schema change

`pnpm db:deploy` only builds schemas for the tools listed in `TOOLS` in `packages/platform/scripts/setup-tools.mjs`, and `pennpaws` isn't there yet (R19, the platform team's). So whenever `schema.sql` changes, each of us applies it by hand, as the `pennpaws` role, so the app's role owns the tables:

```bash
cd tools/pennpaws && { echo 'SET ROLE pennpaws; SET search_path TO pennpaws;'; cat schema.sql; } | docker exec -i penntools-db psql -U penntools -d penntools -v ON_ERROR_STOP=1
```

Everything in `schema.sql` is `IF NOT EXISTS`, so running it again is safe. Pull a schema change and you need this before the new feature works. PennPaws won't break while you haven't: the member code falls back to what the database actually has, so the page keeps working without the switch between your two sides, and picks it up the moment you run the command — no restart.

## Test with fake people

Locally the platform signs everyone in as the same test user, so there's no second person to play the other side. The seed script adds fake Penn students instead: 4 sitters and 6 owners with open requests, with preferences tucked into the notes rather than the structured fields, so AI matching has something real to read. The seed data is all in English for the demo; AI matching still reads an owner's own words in any language.

```bash
pnpm --filter @penntools/tool-pennpaws seed
```

Under `pnpm dev` the local test user also gets a small **Test** button in the bottom corner of PennPaws. **Fake people's turn** does what `seed play` does, and **Start over as a new member** wipes your profile, requests, offers and messages, brings back fresh fake people and opens first-time setup, so you can pick owner or sitter again. Real Penn accounts never see it, and it never shows on the live site.

Set your role in My profile. As a sitter, Find jobs ranks their requests; tap Rank with AI to see the AI's picks. As an owner, post a request. Then, after each step you take, let the fake people take theirs: sitters offer on your requests, owners pick you, and both approve agreements.

```bash
pnpm --filter @penntools/tool-pennpaws seed play
```

```bash
pnpm --filter @penntools/tool-pennpaws seed reset
```

Fake members have ids starting with `seed-` and never mix with real ones. On penntools.org this isn't needed: any two Penn accounts can test together.

## Working together

* Our team branch is `team/pennpaws`. Commit there whenever something works. We open one pull request to `main` at launch.
* We only change two folders: `tools/pennpaws/` (logic, schema, docs) and `apps/web/src/app/tools/pennpaws/` (pages and routes). The platform rules are in the repo's `CLAUDE.md`.
* Pick work from the [requirements tracker](docs/REQUIREMENTS.md): put your name on it, build it, tick it when it meets the acceptance criteria.
