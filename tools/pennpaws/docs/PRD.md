# PennPaws product requirements

Draft 2, Oct 31, 2026. Owners: Lu Lu and Esther Li.

## The bet

Thanksgiving break starts nine days after demo day. Hundreds of Penn pet owners leave campus at once, and none of them want a stranger from an app holding their keys. We launch into that week with one promise: every sitter is a verified Penn student.

## Users

**Owners.** A grad student with a dog or cat, away for one to seven days, who wants someone nearby they can vouch for.

**Sitters.** A student who misses the dog back home and wants easy, flexible cash between classes.

We start with dog walks and cat visits near campus. Overnight stays and boarding wait until trust is proven.

## Why PennPaws and not Rover

* **Verified by default.** penntools.org only lets in verified upenn.edu accounts, so trust comes from the community, not star ratings.
* **AI does the typing, people make the decisions.** We found no sign that Rover offers an AI assistant for this today.
* **Posting is a conversation.** A few tappable questions, like Lemonade does for insurance, or one typed sentence.

## Product principles

1. **Trust first.** Every screen shows who is verified. Contact details stay hidden until both people approve.
2. **A human approves every commitment.** AI drafts the request and the agreement. People post and book.
3. **Works without AI.** Each user pays for AI with their own API key. Without a key, the survey still works as a plain form. AI makes it faster, never required.
4. **Few, small AI calls.** About three to five structured calls per booking. No open chat.
5. **Every question has a way out.** Each survey question offers "something else" with a text box, so no owner gets stuck.

## Scope

**In the MVP:** pet and sitter profiles, guided survey or one sentence to post a request, browse and filter requests, offer to help, AI care agreement, two approvals, contact reveal.

**Not now:** payments in the app, open chat, maps, reviews, native iPhone app, pet photo and sticker studio.

## Solving the empty room

A marketplace with no sitters is dead on arrival, so we fill the sitter side first. We recruit 15 sitters before owners see the tool, from pet lovers in our programs, Penn pet groups and our own networks. Then we open to owners with the Thanksgiving hook.

## Success

| Metric | Target |
|---|---|
| North star | Bookings approved by both sides |
| Demo day bar | 5 Penn students we don't know use it unaided, 1 real booking |
| Health check | Every request gets an offer within a day |
| Supply | 15 sitters signed up before owner launch |

## Plan

| By | We ship |
|---|---|
| Tue 11/3 | Tool registered on our team branch, problem statement in the README, 3 owner and 3 sitter interviews, screen designs agreed |
| Tue 11/10 | Full loop from request to approved agreement, 5 user tests, 15 sitters signed up, launch PR opened |
| Tue 11/17 | Live on penntools.org, 3 minute demo, owners invited ahead of Thanksgiving |

## Riskiest assumption

That Penn students will sign up to sit. We test it this week by asking 3 animal lovers whether they would, and at what price, before writing much code.

## Open questions

* Suggested price range for walks and visits
* Who leads the owner side and who leads the sitter side
* Whether to allow overnight stays at launch
