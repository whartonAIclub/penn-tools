# PennPaws

**A Penn student you can trust looks after your pet while you're away.**

PennPaws is a tool on [penntools.org](https://penntools.org) that connects Penn pet owners with Penn students who walk dogs and visit cats. Everyone signs in with a verified Penn account. A short guided survey writes the request, AI drafts the care agreement, and nothing is booked until both people approve.

| | |
|---|---|
| **Team** | Lu Lu, Esther Li |
| **Program** | Wharton AI Club, AI Product Manager Training, Cohort 3 |
| **Status** | Registered, designing. Core loop due Tue 11/10 |
| **Demo day** | Tue 11/17, live on penntools.org |
| **Tool ID** | `pennpaws`, so the URL is `/tools/pennpaws` |

## Problem statement

Penn students with dogs and cats get stuck every time they travel for recruiting, breaks or a weekend away. Today they post in class group chats, lean on roommates, or skip the trip. Rover and Wag exist, but they match you with strangers and ask you to trust star ratings with your keys and your pet. The person we build for is a grad student near campus, going away for one to seven days, who would gladly pay a fellow student they can vouch for.

## How it works

```
Owner answers a few quick questions ──► AI turns them into a request card ──► owner posts it ✋
                                                                                  │
Sitter browses open requests and taps "I can help" ◄──────────────────────────────┘
        │
        ▼
AI drafts a care agreement: dates, visits, keys, food, vet, pay
        │
        ▼
Owner approves ✋ + sitter approves ✋ ──► booked, both see each other's Penn email
```

✋ marks a step a person must approve. AI never posts or books on its own.

## What's in the MVP

| In | Later |
|---|---|
| Penn sign in (platform) | Payments inside the app (Venmo for now) |
| Pet profile and sitter profile | Open chat between users |
| Guided survey to post a request, or one sentence | Reviews and repeat sitters |
| Browse and filter open requests | Native iPhone app (the site works in a phone browser) |
| Offer to help, care agreement, two approvals | Pet photo and sticker studio |

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

## Working together

* Our team branch is `team/pennpaws`. Commit there whenever something works. We open one pull request to `main` at launch.
* We only change two folders: `tools/pennpaws/` (logic, schema, docs) and `apps/web/src/app/tools/pennpaws/` (pages and routes). The platform rules are in the repo's `CLAUDE.md`.
* Pick work from the [requirements tracker](docs/REQUIREMENTS.md): put your name on it, build it, tick it when it meets the acceptance criteria.
