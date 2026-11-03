# Handoff

## Problem statement

Handoff is for Wharton students who need to buy, sell, or find a transferable club-event ticket when plans change or an event sells out. Today, they post offers and "in search of" (ISO) requests in WhatsApp or GroupMe, search chat history, and contact classmates individually to check availability and arrange a permitted transfer. Early requests can disappear before tickets become available, sold offers can remain visible, and students must separately check the event's eligibility and handoff requirements. The initial pilot will focus on one or two Wharton club events with confirmed transfer rules, bringing available tickets and outstanding requests into a shared, current view.

## Customer conversations

Three informal conversations with Wharton classmates who had recently tried to buy or sell a ticket are documented in the founder's November 1, 2026 PWIF research attachment, in the section "Three informal interviews." Participants are anonymized. The founder confirmed on November 2 that the following three experiences came from three different classmates.

- Classmate 1, seller: an offer received little interest when many classmates were selling, and the ticket eventually sold at a substantial loss.
- Classmate 2, buyer: requests for a sold-out party went unanswered, and a ticket was not found in time.
- Classmate 3, channel choice: posting in a large chat felt too public or spammy; asking classmates directly worked but required considerable effort.

Other reported context: scheduling clashes, recruiting, and late changes of mind created resale needs, while some events imposed transfer cutoffs. These are discovery conversations about existing behavior, not usability tests of Handoff or evidence of product adoption. The private PWIF application and raw chat exports are kept outside this repository.

## Current implementation

Handoff is registered on the `team/handoff` branch with a local page at `/tools/handoff`. The page is a starter containing the tool's name and description. A separate interactive concept prototype uses simulated activity; the shared PennTools marketplace workflow is the next implementation milestone.

## Proposed scope for session two

Start with one or two club events where transfers are permitted. The smallest useful loop is: a student posts an available ticket, another student finds the correct event and contacts the seller, and the listing is marked unavailable after the handoff. Add a persistent ISO request if it fits the scope agreed with the mentor. Students coordinate payment and the event's permitted transfer directly.

The first pilot is limited to event tickets. Integrated payments, automatic ticket transfers, AI matching, goods, and treks are later possibilities rather than part of this first loop.

## Office-hours decisions

- Agree the smallest useful end-to-end flow to finish this week and its acceptance criteria.
- Confirm the event(s), transfer rules, and the right first test users.
- Ask the Platform team how to register Handoff's database role/schema when shared listings are implemented; platform registration is outside this tool team's scope.
- Confirm the review and launch process, then plan five user tests ahead of the November 10 launch-PR milestone.

## Local development

From the repository root, ensure Docker and the existing `penntools-db` container are running, then run `pnpm dev`. Open `http://localhost:3000/tools/handoff` and check that Handoff is listed in the sidebar. Build and test locally until launch; a separate deployment is not required for the pre-session homework.

Keep work on `team/handoff`. Repository checks are `pnpm typecheck`, `pnpm check:tools`, and `pnpm test`.
