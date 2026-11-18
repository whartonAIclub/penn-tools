// A made-up end-of-program survey, so anyone can try the tool before they
// have responses of their own. 25 responses with mistakes planted on purpose:
// a double submission, contradictory checkboxes, keyboard mash, a name in an
// answer, an "n/a", and straight-line ratings. Two responses are left untagged
// to show the warning. None of it is real feedback.

import { parseCsv } from "./csv.js";
import { detectSetup } from "./detect.js";
import type { Decision, Tag, Workspace } from "./types.js";

export const SAMPLE_NAME = "Sample: end-of-program survey";

export const SAMPLE_RESPONSES_CSV = "Timestamp,Which of these did your tool reach by demo day?,\"On average, how many hours a week did you spend on the program?\",How useful was each part of the program? [Setup and onboarding],How useful was each part of the program? [Learning to build with Claude Code],How useful was each part of the program? [Scoping and pivoting],How useful was each part of the program? [Testing and prioritization],How useful was each part of the program? [Launch],How useful was each part of the program? [The PennTools platform],How useful was each part of the program? [Session format],How useful was each part of the program? [Office hours and support],How was the pace of the program?,How likely are you to recommend AI PMT to a friend?,\"Which session, tip or prompt most changed how you built your tool?\",Where did you lose the most time or get stuck?,\"What did you not find useful, and what would you get rid of?\",What other PM concepts would you want added to the program?,Do you plan to keep maintaining or updating your tool?,Why or why not? (optional),\"If you could change one thing for the next cohort, what would it be?\",Anything else you'd like to share?\n11/17/2026 19:41:50,\"Merged and live on PennTools, Works for a stranger with no help, Tried by 5+ real users\",4-6,3,5 - Very useful,5 - Very useful,4,4,4,3,4,5,6,,Deploy on Railway failed with an error none of us understood,Reading through the setup slides when most of us had already installed things,,Yes,Users already asked for two new features,\"More build time in sessions, less lecture\",\n11/17/2026 23:20:10,None of these,Over 8,4,3,3,3,5 - Very useful,3,4,3,3,8,Testing with a friend who had never seen the tool. Found 3 bugs in 5 minutes.,,,,Maybe,Depends on whether I have time next semester,Send a setup checklist a week before session 1 so day one is spent building,\n11/18/2026 00:16:27,None of these,4-6,4,4,2,3,2,3,2,3,5,10,,Getting Claude Code and GitHub set up on my laptop. Took most of the first week.,,Roadmapping and saying no to stakeholders,Maybe,Depends on whether I have time next semester,\"More build time in sessions, less lecture\",\n11/18/2026 01:01:38,None of these,4-6,3,4,4,4,3,3,3,5 - Very useful,4,9,,Didn't know who to ask between sessions when we were stuck,,Pricing and go-to-market,No,It was a learning project and the semester is busy,Add a fourth week or a buffer week before demo day,\n11/18/2026 02:51:32,Merged and live on PennTools,6-8,1 - Not useful,5 - Very useful,4,3,4,5 - Very useful,2,4,4,10,\"The definition of done (merged, live, works for a stranger, 5 users). Made the goal concrete.\",Worked locally but broke once it was live on PennTools,Honestly everything was useful,,Yes,People in my club actually use it every week,Assign one mentor to each team,\n11/18/2026 08:11:23,Merged and live on PennTools,4-6,3,3,3,3,3,3,3,3,3,7,,Deploy on Railway failed with an error none of us understood,\"The prioritization framework slide, we never used it\",,Yes,Users already asked for two new features,Do a scope review with a mentor in week 1,\n11/18/2026 09:51:11,\"Merged and live on PennTools, Works for a stranger with no help, Tried by 5+ real users\",2-4,2,5 - Very useful,5 - Very useful,4,1 - Not useful,2,4,4,4,7,Breaking prompts into small steps instead of asking for the whole app at once,Getting Claude Code and GitHub set up on my laptop. Took most of the first week.,The launch checklist felt like busywork for a 3-week project,,No,It was a learning project and the semester is busy,A starter template for a new PennTools tool,\n11/18/2026 19:35:56,\"Almost complete, not launched\",4-6,4,4,4,2,4,3,4,3,3,9,Pasting the error message back to Claude and asking it to explain before fixing,Never used a terminal before so everything took twice as long,,,Maybe,Only if someone besides my team starts using it,Help teams line up their 5 users earlier,\n11/18/2026 22:51:22,\"Merged and live on PennTools, Works for a stranger with no help\",4-6,2,5 - Very useful,5 - Very useful,3,4,3,4,3,4,7,Asking Claude to write a plan before touching any code. It stopped it from rewriting half my files.,Never used a terminal before so everything took twice as long,\"The long lecture part of session 2, would rather have more build time\",,Yes,,Publish the real hours per week up front,Best thing I've done this semester. I shipped something real.\n11/18/2026 23:16:06,\"Merged and live on PennTools, Works for a stranger with no help, Tried by 5+ real users\",4-6,3,4,4,5 - Very useful,4,3,5 - Very useful,3,4,10,Breaking prompts into small steps instead of asking for the whole app at once,,,Pricing and go-to-market,Maybe,,\"Faster PR reviews on PennTools during the program, maybe a dedicated reviewer\",\n11/18/2026 23:19:18,\"Merged and live on PennTools, Works for a stranger with no help, Tried by 5+ real users\",4-6,3,4,4,5 - Very useful,4,3,5 - Very useful,3,4,10,Breaking prompts into small steps instead of asking for the whole app at once,,,Pricing and go-to-market,Maybe,,\"Faster PR reviews on PennTools during the program, maybe a dedicated reviewer\",\n11/19/2026 01:18:36,\"Merged and live on PennTools, None of these\",4-6,3,3,3,4,5 - Very useful,4,5 - Very useful,4,4,8,\"Prioritizing with impact vs effort, we dropped login entirely\",Finding 5 real users the week of demo day,\"The long lecture part of session 2, would rather have more build time\",Dealing with leadership and getting buy-in for an idea,Maybe,Depends on whether I have time next semester,Add a fourth week or a buffer week before demo day,\n11/19/2026 02:03:09,\"Merged and live on PennTools, Works for a stranger with no help\",4-6,3,4,4,3,2,3,5 - Very useful,3,3,6,Keeping a CLAUDE.md with our project rules,We scoped too big and spent week 2 cutting features,,,Maybe,,Add a fourth week or a buffer week before demo day,\n11/19/2026 03:56:28,\"Merged and live on PennTools, Works for a stranger with no help, Tried by 5+ real users\",6-8,3,3,4,3,4,2,3,3,4,9,,Figuring out how our tool fits PennTools' folder structure,,,Maybe,,Send a setup checklist a week before session 1 so day one is spent building,\n11/19/2026 04:25:07,Merged and live on PennTools,Over 8,3,5 - Very useful,4,3,4,1 - Not useful,5 - Very useful,4,3,7,\"Prioritizing with impact vs effort, we dropped login entirely\",Worked locally but broke once it was live on PennTools,Office hours times didn't work for me so I never went,,Yes,People in my club actually use it every week,\"Faster PR reviews on PennTools during the program, maybe a dedicated reviewer\",\n11/19/2026 07:17:09,\"Merged and live on PennTools, Works for a stranger with no help, Tried by 5+ real users\",4-6,4,4,4,2,4,4,3,3,3,10,Live demo of fixing a bug with Claude Code in session 1,Getting Claude Code and GitHub set up on my laptop. Took most of the first week.,,,Yes,I want to keep adding features for my portfolio,Help teams line up their 5 users earlier,\n11/19/2026 07:43:16,\"Merged and live on PennTools, Works for a stranger with no help\",4-6,3,4,5 - Very useful,4,5 - Very useful,4,4,4,4,7,Pasting the error message back to Claude and asking it to explain before fixing,Our PR sat waiting for review on PennTools for 4 days,,How to communicate with engineers when you're not one,Yes,Users already asked for two new features,Send a setup checklist a week before session 1 so day one is spent building,I feel way more confident building prototypes with AI now\n11/19/2026 07:58:41,Merged and live on PennTools,4-6,3,4,3,4,2,2,5 - Very useful,3,5,5,,Figuring out how our tool fits PennTools' folder structure,Honestly everything was useful,Roadmapping and saying no to stakeholders,Maybe,Only if someone besides my team starts using it,\"Faster PR reviews on PennTools during the program, maybe a dedicated reviewer\",\n11/19/2026 16:07:48,\"Merged and live on PennTools, Works for a stranger with no help\",4-6,2,3,3,2,3,1 - Not useful,5 - Very useful,4,5,7,,Claude went in circles on one bug for over an hour,,,Maybe,,A starter template for a new PennTools tool,\n11/19/2026 16:52:21,\"Merged and live on PennTools, Works for a stranger with no help\",6-8,3,4,4,4,5 - Very useful,3,5 - Very useful,4,2,6,Session 2 when we talked to users before building. We pivoted after the second interview.,Didn't know who to ask between sessions when we were stuck,,,Yes,,\"Faster PR reviews on PennTools during the program, maybe a dedicated reviewer\",asdf\n11/19/2026 19:19:16,\"Merged and live on PennTools, Works for a stranger with no help\",4-6,4,5 - Very useful,4,4,4,3,3,5 - Very useful,3,7,,,Reading through the setup slides when most of us had already installed things,Pricing and go-to-market,Yes,,Send a setup checklist a week before session 1 so day one is spent building,\n11/19/2026 20:40:02,\"Merged and live on PennTools, Works for a stranger with no help\",4-6,4,5 - Very useful,5 - Very useful,4,4,3,4,4,5,9,,Getting Claude Code and GitHub set up on my laptop. Took most of the first week.,Honestly everything was useful,,Maybe,n/a,Send a setup checklist a week before session 1 so day one is spent building,\n11/19/2026 22:18:55,\"Merged and live on PennTools, Works for a stranger with no help\",6-8,2,4,4,4,4,3,3,3,4,9,Breaking prompts into small steps instead of asking for the whole app at once,,,Working across teams and handing off to engineers,Yes,,Send a setup checklist a week before session 1 so day one is spent building,\n11/19/2026 23:36:06,Merged and live on PennTools,4-6,4,5 - Very useful,5 - Very useful,3,3,2,4,3,3,9,,Our PR sat waiting for review on PennTools for 4 days,Honestly everything was useful,,No,Nobody outside our team ended up using it,A starter template for a new PennTools tool,Demo day was a great finish\n11/20/2026 00:04:21,\"Merged and live on PennTools, Works for a stranger with no help\",2-4,1 - Not useful,4,4,5 - Very useful,5 - Very useful,2,3,3,3,7,Testing with a friend who had never seen the tool. Found 3 bugs in 5 minutes.,Didn't know who to ask between sessions when we were stuck,Honestly everything was useful,Working across teams and handing off to engineers,Maybe,Not sure who owns it after the cohort ends,Send a setup checklist a week before session 1 so day one is spent building,Mentor Jamie Lee was the reason we shipped\n";

const SAMPLE_TAGS: Tag[] = [
  {
    "id": "C001",
    "responseId": "11/17/2026 19:41:50",
    "source": "Survey",
    "question": "Where did you lose the most time or get stuck?",
    "text": "Deploy on Railway failed with an error none of us understood",
    "theme": "The PennTools platform",
    "topic": "Deploy errors",
    "type": "Pain point"
  },
  {
    "id": "C002",
    "responseId": "11/17/2026 19:41:50",
    "source": "Survey",
    "question": "What did you not find useful, and what would you get rid of?",
    "text": "Reading through the setup slides when most of us had already installed things",
    "theme": "Setup and onboarding",
    "topic": "Redundant setup content",
    "type": "Pain point"
  },
  {
    "id": "C003",
    "responseId": "11/17/2026 19:41:50",
    "source": "Survey",
    "question": "Why or why not? (optional)",
    "text": "Users already asked for two new features",
    "theme": "Outcomes and value",
    "topic": "User feature requests",
    "type": "Working"
  },
  {
    "id": "C004",
    "responseId": "11/17/2026 19:41:50",
    "source": "Survey",
    "question": "If you could change one thing for the next cohort, what would it be?",
    "text": "More build time in sessions, less lecture",
    "theme": "Session format",
    "topic": "More build time",
    "type": "Idea"
  },
  {
    "id": "C005",
    "responseId": "11/17/2026 23:20:10",
    "source": "Survey",
    "question": "Which session, tip or prompt most changed how you built your tool?",
    "text": "Testing with a friend who had never seen the tool. Found 3 bugs in 5 minutes.",
    "theme": "Testing and prioritization",
    "topic": "Stranger test",
    "type": "Working"
  },
  {
    "id": "C006",
    "responseId": "11/17/2026 23:20:10",
    "source": "Survey",
    "question": "Why or why not? (optional)",
    "text": "Depends on whether I have time next semester",
    "theme": "Pace and workload",
    "topic": "Time after program",
    "type": "Pain point"
  },
  {
    "id": "C007",
    "responseId": "11/17/2026 23:20:10",
    "source": "Survey",
    "question": "If you could change one thing for the next cohort, what would it be?",
    "text": "Send a setup checklist a week before session 1 so day one is spent building",
    "theme": "Setup and onboarding",
    "topic": "Pre-work setup checklist",
    "type": "Idea"
  },
  {
    "id": "C008",
    "responseId": "11/18/2026 00:16:27",
    "source": "Survey",
    "question": "Where did you lose the most time or get stuck?",
    "text": "Getting Claude Code and GitHub set up on my laptop. Took most of the first week.",
    "theme": "Setup and onboarding",
    "topic": "Install and Git setup",
    "type": "Pain point"
  },
  {
    "id": "C009",
    "responseId": "11/18/2026 00:16:27",
    "source": "Survey",
    "question": "What other PM concepts would you want added to the program?",
    "text": "Roadmapping and saying no to stakeholders",
    "theme": "PM topics to add",
    "topic": "Roadmapping",
    "type": "Idea"
  },
  {
    "id": "C010",
    "responseId": "11/18/2026 00:16:27",
    "source": "Survey",
    "question": "Why or why not? (optional)",
    "text": "Depends on whether I have time next semester",
    "theme": "Pace and workload",
    "topic": "Time after program",
    "type": "Pain point"
  },
  {
    "id": "C011",
    "responseId": "11/18/2026 00:16:27",
    "source": "Survey",
    "question": "If you could change one thing for the next cohort, what would it be?",
    "text": "More build time in sessions, less lecture",
    "theme": "Session format",
    "topic": "More build time",
    "type": "Idea"
  },
  {
    "id": "C012",
    "responseId": "11/18/2026 01:01:38",
    "source": "Survey",
    "question": "Where did you lose the most time or get stuck?",
    "text": "Didn't know who to ask between sessions when we were stuck",
    "theme": "Office hours and support",
    "topic": "Unclear who to ask",
    "type": "Pain point"
  },
  {
    "id": "C013",
    "responseId": "11/18/2026 01:01:38",
    "source": "Survey",
    "question": "What other PM concepts would you want added to the program?",
    "text": "Pricing and go-to-market",
    "theme": "PM topics to add",
    "topic": "Go-to-market",
    "type": "Idea"
  },
  {
    "id": "C014",
    "responseId": "11/18/2026 01:01:38",
    "source": "Survey",
    "question": "Why or why not? (optional)",
    "text": "It was a learning project and the semester is busy",
    "theme": "Pace and workload",
    "topic": "Time after program",
    "type": "Pain point"
  },
  {
    "id": "C015",
    "responseId": "11/18/2026 01:01:38",
    "source": "Survey",
    "question": "If you could change one thing for the next cohort, what would it be?",
    "text": "Add a fourth week or a buffer week before demo day",
    "theme": "Pace and workload",
    "topic": "Add a buffer week",
    "type": "Idea"
  },
  {
    "id": "C016",
    "responseId": "11/18/2026 02:51:32",
    "source": "Survey",
    "question": "Which session, tip or prompt most changed how you built your tool?",
    "text": "The definition of done (merged, live, works for a stranger, 5 users). Made the goal concrete.",
    "theme": "Launch",
    "topic": "Definition of done",
    "type": "Working"
  },
  {
    "id": "C017",
    "responseId": "11/18/2026 02:51:32",
    "source": "Survey",
    "question": "Where did you lose the most time or get stuck?",
    "text": "Worked locally but broke once it was live on PennTools",
    "theme": "The PennTools platform",
    "topic": "Local vs live differences",
    "type": "Pain point"
  },
  {
    "id": "C018",
    "responseId": "11/18/2026 02:51:32",
    "source": "Survey",
    "question": "What did you not find useful, and what would you get rid of?",
    "text": "Honestly everything was useful",
    "theme": "Outcomes and value",
    "topic": "All useful",
    "type": "Working"
  },
  {
    "id": "C019",
    "responseId": "11/18/2026 02:51:32",
    "source": "Survey",
    "question": "Why or why not? (optional)",
    "text": "People in my club actually use it every week",
    "theme": "Outcomes and value",
    "topic": "Real users keep using it",
    "type": "Working"
  },
  {
    "id": "C020",
    "responseId": "11/18/2026 02:51:32",
    "source": "Survey",
    "question": "If you could change one thing for the next cohort, what would it be?",
    "text": "Assign one mentor to each team",
    "theme": "Office hours and support",
    "topic": "Mentor per team",
    "type": "Idea"
  },
  {
    "id": "C021",
    "responseId": "11/18/2026 08:11:23",
    "source": "Survey",
    "question": "Where did you lose the most time or get stuck?",
    "text": "Deploy on Railway failed with an error none of us understood",
    "theme": "The PennTools platform",
    "topic": "Deploy errors",
    "type": "Pain point"
  },
  {
    "id": "C022",
    "responseId": "11/18/2026 08:11:23",
    "source": "Survey",
    "question": "What did you not find useful, and what would you get rid of?",
    "text": "The prioritization framework slide, we never used it",
    "theme": "Testing and prioritization",
    "topic": "Unused framework",
    "type": "Pain point"
  },
  {
    "id": "C023",
    "responseId": "11/18/2026 08:11:23",
    "source": "Survey",
    "question": "Why or why not? (optional)",
    "text": "Users already asked for two new features",
    "theme": "Outcomes and value",
    "topic": "User feature requests",
    "type": "Working"
  },
  {
    "id": "C024",
    "responseId": "11/18/2026 08:11:23",
    "source": "Survey",
    "question": "If you could change one thing for the next cohort, what would it be?",
    "text": "Do a scope review with a mentor in week 1",
    "theme": "Scoping and pivoting",
    "topic": "Week 1 scope review",
    "type": "Idea"
  },
  {
    "id": "C025",
    "responseId": "11/18/2026 09:51:11",
    "source": "Survey",
    "question": "Which session, tip or prompt most changed how you built your tool?",
    "text": "Breaking prompts into small steps instead of asking for the whole app at once",
    "theme": "Learning to build with Claude Code",
    "topic": "Small prompts",
    "type": "Working"
  },
  {
    "id": "C026",
    "responseId": "11/18/2026 09:51:11",
    "source": "Survey",
    "question": "Where did you lose the most time or get stuck?",
    "text": "Getting Claude Code and GitHub set up on my laptop. Took most of the first week.",
    "theme": "Setup and onboarding",
    "topic": "Install and Git setup",
    "type": "Pain point"
  },
  {
    "id": "C027",
    "responseId": "11/18/2026 09:51:11",
    "source": "Survey",
    "question": "What did you not find useful, and what would you get rid of?",
    "text": "The launch checklist felt like busywork for a 3-week project",
    "theme": "Launch",
    "topic": "Launch checklist busywork",
    "type": "Pain point"
  },
  {
    "id": "C028",
    "responseId": "11/18/2026 09:51:11",
    "source": "Survey",
    "question": "Why or why not? (optional)",
    "text": "It was a learning project and the semester is busy",
    "theme": "Pace and workload",
    "topic": "Time after program",
    "type": "Pain point"
  },
  {
    "id": "C029",
    "responseId": "11/18/2026 09:51:11",
    "source": "Survey",
    "question": "If you could change one thing for the next cohort, what would it be?",
    "text": "A starter template for a new PennTools tool",
    "theme": "The PennTools platform",
    "topic": "Starter template",
    "type": "Idea"
  },
  {
    "id": "C030",
    "responseId": "11/18/2026 19:35:56",
    "source": "Survey",
    "question": "Which session, tip or prompt most changed how you built your tool?",
    "text": "Pasting the error message back to Claude and asking it to explain before fixing",
    "theme": "Learning to build with Claude Code",
    "topic": "Debug with Claude",
    "type": "Working"
  },
  {
    "id": "C031",
    "responseId": "11/18/2026 19:35:56",
    "source": "Survey",
    "question": "Where did you lose the most time or get stuck?",
    "text": "Never used a terminal before so everything took twice as long",
    "theme": "Setup and onboarding",
    "topic": "No terminal experience",
    "type": "Pain point"
  },
  {
    "id": "C032",
    "responseId": "11/18/2026 19:35:56",
    "source": "Survey",
    "question": "Why or why not? (optional)",
    "text": "Only if someone besides my team starts using it",
    "theme": "Launch",
    "topic": "Needs more users",
    "type": "Pain point"
  },
  {
    "id": "C033",
    "responseId": "11/18/2026 19:35:56",
    "source": "Survey",
    "question": "If you could change one thing for the next cohort, what would it be?",
    "text": "Help teams line up their 5 users earlier",
    "theme": "Launch",
    "topic": "Line up users early",
    "type": "Idea"
  },
  {
    "id": "C034",
    "responseId": "11/18/2026 22:51:22",
    "source": "Survey",
    "question": "Which session, tip or prompt most changed how you built your tool?",
    "text": "Asking Claude to write a plan before touching any code. It stopped it from rewriting half my files.",
    "theme": "Learning to build with Claude Code",
    "topic": "Plan before coding",
    "type": "Working"
  },
  {
    "id": "C035",
    "responseId": "11/18/2026 22:51:22",
    "source": "Survey",
    "question": "Where did you lose the most time or get stuck?",
    "text": "Never used a terminal before so everything took twice as long",
    "theme": "Setup and onboarding",
    "topic": "No terminal experience",
    "type": "Pain point"
  },
  {
    "id": "C036",
    "responseId": "11/18/2026 22:51:22",
    "source": "Survey",
    "question": "What did you not find useful, and what would you get rid of?",
    "text": "The long lecture part of session 2, would rather have more build time",
    "theme": "Session format",
    "topic": "Too much lecture",
    "type": "Pain point"
  },
  {
    "id": "C037",
    "responseId": "11/18/2026 22:51:22",
    "source": "Survey",
    "question": "If you could change one thing for the next cohort, what would it be?",
    "text": "Publish the real hours per week up front",
    "theme": "Pace and workload",
    "topic": "Set time expectations",
    "type": "Idea"
  },
  {
    "id": "C038",
    "responseId": "11/18/2026 22:51:22",
    "source": "Survey",
    "question": "Anything else you'd like to share?",
    "text": "Best thing I've done this semester. I shipped something real.",
    "theme": "Outcomes and value",
    "topic": "Shipped something real",
    "type": "Working"
  },
  {
    "id": "C039",
    "responseId": "11/18/2026 23:16:06",
    "source": "Survey",
    "question": "Which session, tip or prompt most changed how you built your tool?",
    "text": "Breaking prompts into small steps instead of asking for the whole app at once",
    "theme": "Learning to build with Claude Code",
    "topic": "Small prompts",
    "type": "Working"
  },
  {
    "id": "C040",
    "responseId": "11/18/2026 23:16:06",
    "source": "Survey",
    "question": "What other PM concepts would you want added to the program?",
    "text": "Pricing and go-to-market",
    "theme": "PM topics to add",
    "topic": "Go-to-market",
    "type": "Idea"
  },
  {
    "id": "C041",
    "responseId": "11/18/2026 23:16:06",
    "source": "Survey",
    "question": "If you could change one thing for the next cohort, what would it be?",
    "text": "Faster PR reviews on PennTools during the program, maybe a dedicated reviewer",
    "theme": "The PennTools platform",
    "topic": "Dedicated PR reviewer",
    "type": "Idea"
  },
  {
    "id": "C042",
    "responseId": "11/19/2026 01:18:36",
    "source": "Survey",
    "question": "Which session, tip or prompt most changed how you built your tool?",
    "text": "Prioritizing with impact vs effort, we dropped login entirely",
    "theme": "Testing and prioritization",
    "topic": "Impact vs effort",
    "type": "Working"
  },
  {
    "id": "C043",
    "responseId": "11/19/2026 01:18:36",
    "source": "Survey",
    "question": "Where did you lose the most time or get stuck?",
    "text": "Finding 5 real users the week of demo day",
    "theme": "Launch",
    "topic": "Finding 5 users",
    "type": "Pain point"
  },
  {
    "id": "C044",
    "responseId": "11/19/2026 01:18:36",
    "source": "Survey",
    "question": "What did you not find useful, and what would you get rid of?",
    "text": "The long lecture part of session 2, would rather have more build time",
    "theme": "Session format",
    "topic": "Too much lecture",
    "type": "Pain point"
  },
  {
    "id": "C045",
    "responseId": "11/19/2026 01:18:36",
    "source": "Survey",
    "question": "What other PM concepts would you want added to the program?",
    "text": "Dealing with leadership and getting buy-in for an idea",
    "theme": "PM topics to add",
    "topic": "Leadership and buy-in",
    "type": "Idea"
  },
  {
    "id": "C046",
    "responseId": "11/19/2026 01:18:36",
    "source": "Survey",
    "question": "Why or why not? (optional)",
    "text": "Depends on whether I have time next semester",
    "theme": "Pace and workload",
    "topic": "Time after program",
    "type": "Pain point"
  },
  {
    "id": "C047",
    "responseId": "11/19/2026 01:18:36",
    "source": "Survey",
    "question": "If you could change one thing for the next cohort, what would it be?",
    "text": "Add a fourth week or a buffer week before demo day",
    "theme": "Pace and workload",
    "topic": "Add a buffer week",
    "type": "Idea"
  },
  {
    "id": "C048",
    "responseId": "11/19/2026 02:03:09",
    "source": "Survey",
    "question": "Which session, tip or prompt most changed how you built your tool?",
    "text": "Keeping a CLAUDE.md with our project rules",
    "theme": "Learning to build with Claude Code",
    "topic": "Project rules file",
    "type": "Working"
  },
  {
    "id": "C049",
    "responseId": "11/19/2026 02:03:09",
    "source": "Survey",
    "question": "Where did you lose the most time or get stuck?",
    "text": "We scoped too big and spent week 2 cutting features",
    "theme": "Scoping and pivoting",
    "topic": "Scoped too big",
    "type": "Pain point"
  },
  {
    "id": "C050",
    "responseId": "11/19/2026 02:03:09",
    "source": "Survey",
    "question": "If you could change one thing for the next cohort, what would it be?",
    "text": "Add a fourth week or a buffer week before demo day",
    "theme": "Pace and workload",
    "topic": "Add a buffer week",
    "type": "Idea"
  },
  {
    "id": "C051",
    "responseId": "11/19/2026 03:56:28",
    "source": "Survey",
    "question": "Where did you lose the most time or get stuck?",
    "text": "Figuring out how our tool fits PennTools' folder structure",
    "theme": "The PennTools platform",
    "topic": "Unclear platform structure",
    "type": "Pain point"
  },
  {
    "id": "C052",
    "responseId": "11/19/2026 03:56:28",
    "source": "Survey",
    "question": "If you could change one thing for the next cohort, what would it be?",
    "text": "Send a setup checklist a week before session 1 so day one is spent building",
    "theme": "Setup and onboarding",
    "topic": "Pre-work setup checklist",
    "type": "Idea"
  },
  {
    "id": "C053",
    "responseId": "11/19/2026 04:25:07",
    "source": "Survey",
    "question": "Which session, tip or prompt most changed how you built your tool?",
    "text": "Prioritizing with impact vs effort, we dropped login entirely",
    "theme": "Testing and prioritization",
    "topic": "Impact vs effort",
    "type": "Working"
  },
  {
    "id": "C054",
    "responseId": "11/19/2026 04:25:07",
    "source": "Survey",
    "question": "Where did you lose the most time or get stuck?",
    "text": "Worked locally but broke once it was live on PennTools",
    "theme": "The PennTools platform",
    "topic": "Local vs live differences",
    "type": "Pain point"
  },
  {
    "id": "C055",
    "responseId": "11/19/2026 04:25:07",
    "source": "Survey",
    "question": "What did you not find useful, and what would you get rid of?",
    "text": "Office hours times didn't work for me so I never went",
    "theme": "Office hours and support",
    "topic": "Office hour timing",
    "type": "Pain point"
  },
  {
    "id": "C056",
    "responseId": "11/19/2026 04:25:07",
    "source": "Survey",
    "question": "Why or why not? (optional)",
    "text": "People in my club actually use it every week",
    "theme": "Outcomes and value",
    "topic": "Real users keep using it",
    "type": "Working"
  },
  {
    "id": "C057",
    "responseId": "11/19/2026 04:25:07",
    "source": "Survey",
    "question": "If you could change one thing for the next cohort, what would it be?",
    "text": "Faster PR reviews on PennTools during the program, maybe a dedicated reviewer",
    "theme": "The PennTools platform",
    "topic": "Dedicated PR reviewer",
    "type": "Idea"
  },
  {
    "id": "C058",
    "responseId": "11/19/2026 07:17:09",
    "source": "Survey",
    "question": "Which session, tip or prompt most changed how you built your tool?",
    "text": "Live demo of fixing a bug with Claude Code in session 1",
    "theme": "Session format",
    "topic": "Live demos",
    "type": "Working"
  },
  {
    "id": "C059",
    "responseId": "11/19/2026 07:17:09",
    "source": "Survey",
    "question": "Where did you lose the most time or get stuck?",
    "text": "Getting Claude Code and GitHub set up on my laptop. Took most of the first week.",
    "theme": "Setup and onboarding",
    "topic": "Install and Git setup",
    "type": "Pain point"
  },
  {
    "id": "C060",
    "responseId": "11/19/2026 07:17:09",
    "source": "Survey",
    "question": "Why or why not? (optional)",
    "text": "I want to keep adding features for my portfolio",
    "theme": "Outcomes and value",
    "topic": "Portfolio piece",
    "type": "Working"
  },
  {
    "id": "C061",
    "responseId": "11/19/2026 07:17:09",
    "source": "Survey",
    "question": "If you could change one thing for the next cohort, what would it be?",
    "text": "Help teams line up their 5 users earlier",
    "theme": "Launch",
    "topic": "Line up users early",
    "type": "Idea"
  },
  {
    "id": "C062",
    "responseId": "11/19/2026 07:43:16",
    "source": "Survey",
    "question": "Which session, tip or prompt most changed how you built your tool?",
    "text": "Pasting the error message back to Claude and asking it to explain before fixing",
    "theme": "Learning to build with Claude Code",
    "topic": "Debug with Claude",
    "type": "Working"
  },
  {
    "id": "C063",
    "responseId": "11/19/2026 07:43:16",
    "source": "Survey",
    "question": "Where did you lose the most time or get stuck?",
    "text": "Our PR sat waiting for review on PennTools for 4 days",
    "theme": "The PennTools platform",
    "topic": "Slow PR review",
    "type": "Pain point"
  },
  {
    "id": "C064",
    "responseId": "11/19/2026 07:43:16",
    "source": "Survey",
    "question": "What other PM concepts would you want added to the program?",
    "text": "How to communicate with engineers when you're not one",
    "theme": "PM topics to add",
    "topic": "Communicating with engineers",
    "type": "Idea"
  },
  {
    "id": "C065",
    "responseId": "11/19/2026 07:43:16",
    "source": "Survey",
    "question": "Why or why not? (optional)",
    "text": "Users already asked for two new features",
    "theme": "Outcomes and value",
    "topic": "User feature requests",
    "type": "Working"
  },
  {
    "id": "C066",
    "responseId": "11/19/2026 07:43:16",
    "source": "Survey",
    "question": "If you could change one thing for the next cohort, what would it be?",
    "text": "Send a setup checklist a week before session 1 so day one is spent building",
    "theme": "Setup and onboarding",
    "topic": "Pre-work setup checklist",
    "type": "Idea"
  },
  {
    "id": "C067",
    "responseId": "11/19/2026 07:43:16",
    "source": "Survey",
    "question": "Anything else you'd like to share?",
    "text": "I feel way more confident building prototypes with AI now",
    "theme": "Outcomes and value",
    "topic": "Confidence building with AI",
    "type": "Working"
  },
  {
    "id": "C068",
    "responseId": "11/19/2026 07:58:41",
    "source": "Survey",
    "question": "Where did you lose the most time or get stuck?",
    "text": "Figuring out how our tool fits PennTools' folder structure",
    "theme": "The PennTools platform",
    "topic": "Unclear platform structure",
    "type": "Pain point"
  },
  {
    "id": "C069",
    "responseId": "11/19/2026 07:58:41",
    "source": "Survey",
    "question": "What did you not find useful, and what would you get rid of?",
    "text": "Honestly everything was useful",
    "theme": "Outcomes and value",
    "topic": "All useful",
    "type": "Working"
  },
  {
    "id": "C070",
    "responseId": "11/19/2026 07:58:41",
    "source": "Survey",
    "question": "What other PM concepts would you want added to the program?",
    "text": "Roadmapping and saying no to stakeholders",
    "theme": "PM topics to add",
    "topic": "Roadmapping",
    "type": "Idea"
  },
  {
    "id": "C071",
    "responseId": "11/19/2026 07:58:41",
    "source": "Survey",
    "question": "Why or why not? (optional)",
    "text": "Only if someone besides my team starts using it",
    "theme": "Launch",
    "topic": "Needs more users",
    "type": "Pain point"
  },
  {
    "id": "C072",
    "responseId": "11/19/2026 07:58:41",
    "source": "Survey",
    "question": "If you could change one thing for the next cohort, what would it be?",
    "text": "Faster PR reviews on PennTools during the program, maybe a dedicated reviewer",
    "theme": "The PennTools platform",
    "topic": "Dedicated PR reviewer",
    "type": "Idea"
  },
  {
    "id": "C073",
    "responseId": "11/19/2026 16:07:48",
    "source": "Survey",
    "question": "Where did you lose the most time or get stuck?",
    "text": "Claude went in circles on one bug for over an hour",
    "theme": "Learning to build with Claude Code",
    "topic": "Claude loops on bugs",
    "type": "Pain point"
  },
  {
    "id": "C074",
    "responseId": "11/19/2026 16:07:48",
    "source": "Survey",
    "question": "If you could change one thing for the next cohort, what would it be?",
    "text": "A starter template for a new PennTools tool",
    "theme": "The PennTools platform",
    "topic": "Starter template",
    "type": "Idea"
  },
  {
    "id": "C075",
    "responseId": "11/19/2026 16:52:21",
    "source": "Survey",
    "question": "Which session, tip or prompt most changed how you built your tool?",
    "text": "Session 2 when we talked to users before building. We pivoted after the second interview.",
    "theme": "Scoping and pivoting",
    "topic": "Talk to users first",
    "type": "Working"
  },
  {
    "id": "C076",
    "responseId": "11/19/2026 16:52:21",
    "source": "Survey",
    "question": "Where did you lose the most time or get stuck?",
    "text": "Didn't know who to ask between sessions when we were stuck",
    "theme": "Office hours and support",
    "topic": "Unclear who to ask",
    "type": "Pain point"
  },
  {
    "id": "C077",
    "responseId": "11/19/2026 16:52:21",
    "source": "Survey",
    "question": "If you could change one thing for the next cohort, what would it be?",
    "text": "Faster PR reviews on PennTools during the program, maybe a dedicated reviewer",
    "theme": "The PennTools platform",
    "topic": "Dedicated PR reviewer",
    "type": "Idea"
  },
  {
    "id": "C078",
    "responseId": "11/19/2026 19:19:16",
    "source": "Survey",
    "question": "What did you not find useful, and what would you get rid of?",
    "text": "Reading through the setup slides when most of us had already installed things",
    "theme": "Setup and onboarding",
    "topic": "Redundant setup content",
    "type": "Pain point"
  },
  {
    "id": "C079",
    "responseId": "11/19/2026 19:19:16",
    "source": "Survey",
    "question": "What other PM concepts would you want added to the program?",
    "text": "Pricing and go-to-market",
    "theme": "PM topics to add",
    "topic": "Go-to-market",
    "type": "Idea"
  },
  {
    "id": "C080",
    "responseId": "11/19/2026 19:19:16",
    "source": "Survey",
    "question": "If you could change one thing for the next cohort, what would it be?",
    "text": "Send a setup checklist a week before session 1 so day one is spent building",
    "theme": "Setup and onboarding",
    "topic": "Pre-work setup checklist",
    "type": "Idea"
  },
  {
    "id": "C081",
    "responseId": "11/19/2026 20:40:02",
    "source": "Survey",
    "question": "Where did you lose the most time or get stuck?",
    "text": "Getting Claude Code and GitHub set up on my laptop. Took most of the first week.",
    "theme": "Setup and onboarding",
    "topic": "Install and Git setup",
    "type": "Pain point"
  },
  {
    "id": "C082",
    "responseId": "11/19/2026 20:40:02",
    "source": "Survey",
    "question": "What did you not find useful, and what would you get rid of?",
    "text": "Honestly everything was useful",
    "theme": "Outcomes and value",
    "topic": "All useful",
    "type": "Working"
  },
  {
    "id": "C083",
    "responseId": "11/19/2026 20:40:02",
    "source": "Survey",
    "question": "If you could change one thing for the next cohort, what would it be?",
    "text": "Send a setup checklist a week before session 1 so day one is spent building",
    "theme": "Setup and onboarding",
    "topic": "Pre-work setup checklist",
    "type": "Idea"
  },
  {
    "id": "C084",
    "responseId": "11/19/2026 22:18:55",
    "source": "Survey",
    "question": "Which session, tip or prompt most changed how you built your tool?",
    "text": "Breaking prompts into small steps instead of asking for the whole app at once",
    "theme": "Learning to build with Claude Code",
    "topic": "Small prompts",
    "type": "Working"
  },
  {
    "id": "C085",
    "responseId": "11/19/2026 22:18:55",
    "source": "Survey",
    "question": "What other PM concepts would you want added to the program?",
    "text": "Working across teams and handing off to engineers",
    "theme": "PM topics to add",
    "topic": "Working across teams",
    "type": "Idea"
  },
  {
    "id": "C086",
    "responseId": "11/19/2026 22:18:55",
    "source": "Survey",
    "question": "If you could change one thing for the next cohort, what would it be?",
    "text": "Send a setup checklist a week before session 1 so day one is spent building",
    "theme": "Setup and onboarding",
    "topic": "Pre-work setup checklist",
    "type": "Idea"
  }
];

const SAMPLE_DECISIONS: Decision[] = [
  {
    "responseId": "11/18/2026 23:19:18",
    "decision": "Exclude",
    "reason": "Same answers as the response 3 minutes earlier, submitted twice",
    "reviewer": "Sample reviewer"
  },
  {
    "responseId": "11/19/2026 01:18:36",
    "decision": "Keep",
    "reason": "Ticked Merged and None; other answers look genuine",
    "reviewer": "Sample reviewer"
  }
];

/** A fresh copy of the sample workspace. */
export function sampleWorkspace(): Workspace {
  const table = parseCsv(SAMPLE_RESPONSES_CSV);
  const setup = detectSetup(table);
  const themes = [...new Set([...setup.themes.filter((t) => t !== "Other"), ...SAMPLE_TAGS.map((t) => t.theme), "Other"])];
  return {
    name: SAMPLE_NAME,
    table,
    setup: { ...setup, themes, cohortSize: 40 },
    tags: SAMPLE_TAGS.map((t) => ({ ...t })),
    decisions: SAMPLE_DECISIONS.map((d) => ({ ...d })),
    skipped: [],
  };
}
