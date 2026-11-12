# Non-Wharton Course Manager — Spec

**Tagline:** Interested in taking electives outside of Wharton but not sure how to go about it? This tool walks you through it in three steps.

## Overview

The Non-Wharton Course Manager guides MBA students through taking a Penn course outside Wharton. It is a three-step flow: (1) find courses on Path@Penn and check which ones count toward the MBA, (2) email each department for permission and track replies, (3) send approved courses to the MBA Program Office to register.

**Policy the tool is built on** (MBA Program Office, Non-Wharton Courses):

- Courses are found on Path@Penn (https://srfs.upenn.edu/path-at-penn).
- To count toward the MBA degree a course must be graduate level (numbered 5000 or above).
- Online courses must be synchronous. Asynchronous courses do not count.
- To enroll the student emails the course and section number (for example EDUC 5050-001) to mbaprogram@wharton.upenn.edu.

**Principles:** show one thing at a time, explain why we ask for anything, nothing stored on a server, the MBA Program Office has the final word.

## Screens and flow

### Overview (first screen)

- Eyebrow pill "NEW ON PENN TOOLS · BETA", title "Non-Wharton Course Manager" ("Non-Wharton" in Penn Red), the tagline.
- A dotted-pattern panel holding three floating step cards (1 Find courses and check eligibility, 2 Request permission, 3 Register with the MBA Program). Each card has a number circle, title, one line of description and a progress bar that fills in one after another. Bars line up at the bottom of the cards.
- "Get started" button. Note under it: "Takes about 5 minutes. The MBA Program Office has the final word on what counts."

### Layout after "Get started"

- **Left:** a vertical stepper in a rounded tinted panel. Each step has a circle (number, or ✓ when done) joined to the next by a dotted vertical line, a title and a small status pill (e.g. "2 OF 4 COUNT", "LOCKED", "1 OF 2 APPROVED"). The current step's circle is Penn Red with a soft glow. A "← Overview" link sits at the top.
- **Steps unlock in order:** Step 2 is locked until Step 1 is finished with at least one course picked. Step 3 is locked until at least one course is marked Approved. Locked steps are greyed out and can't be clicked.
- **Right:** the current step. Each step starts with a rounded Penn Blue header card (dot pattern, "STEP X OF 3" gold pill, serif title, one line of description), then its content as floating white cards.
- On a phone the stepper stacks above the content.

### Step 1: Find courses and check eligibility

Each part appears only after the one before it.

- **A. Find courses on Path@Penn.** Three numbered tiles: (01) Open Path@Penn and click Search & Register for Classes. (02) Pick the term, add search criteria and click Search; Advanced Search narrows by school. (03) Click a course in the results panel for details, then copy the ones you like. Button: "I've copied my courses".
- **B. Paste your courses.** Appears after A's button. A text box that takes one or many courses, with a note: "Paste as many as you want. Leave a blank line between courses." An ⓘ button next to the heading opens a "What we check" panel listing the rules (numbered 5000 or above; in person or online at a set time; async doesn't count; MBA Program Office has the final word). Button: "Check eligibility", which shows a short "Checking your courses…" spinner.
- **C. Your results.** Appears after the check. A big "X of Y" (Penn Red) "courses count toward your MBA". One row per course: checkbox, course code, title, one-line reason and a result pill (✓ COUNTS / DOESN'T COUNT / CHECK THIS). Courses that count are checked by default; courses that don't count can't be checked. Button: "Continue to permission" (disabled if nothing is checked).

### Step 2: Request permission

- **Name and year card** (gold, with dot pattern): "This goes into your emails. We use your name and year so departments know who's asking. It's saved only in this browser." Name input and a First-year / Second-year toggle.
- **One card per picked course** that opens and closes (only one open at a time; the first opens automatically). Closed: number circle, code, title, status pill, chevron. Open:
  - "Who to email" input (from the course details on Path@Penn)
  - Email preview (subject and body, filled with name, year, course, semester)
  - "Open in email" button (mailto link). Clicking it moves the status from Not sent to Waiting.
  - Status toggle: Not sent / Waiting / Approved / Declined
- Buttons: "Back" and "Continue to registration" (disabled until at least one course is Approved, with the hint "Mark at least one course Approved to continue").

### Step 3: Register with the MBA Program

- List of approved courses as green pills.
- One combined email to mbaprogram@wharton.upenn.edu listing every approved course with its section number and semester.
- "Open in email" (mailto) and "I sent it".
- After "I sent it": a "You're all set" card on the dot pattern.

## Eligibility rules

| Situation | Result | Reason shown |
| --- | --- | --- |
| Course number 5000 or above, in person | ✓ COUNTS | Graduate level, in person. |
| Course number 5000 or above, online synchronous | ✓ COUNTS | Graduate level, online at a set time. |
| Course number 5000 or above, online asynchronous | DOESN'T COUNT | Asynchronous online courses don't count. |
| Course number below 5000 | DOESN'T COUNT | Only graduate-level courses (5000 and above) count. |
| Number or format missing or unclear | CHECK THIS | Confirm the course number and format on Path@Penn. |

Eligibility is fixed logic, never an AI judgment. Reading the pasted text (finding the code, title, format, semester and contact for each course) can start as simple text matching and be upgraded to the platform's AI building block if time allows.

## Email templates

**Permission request** (to the department contact)

> Subject: Permission to enroll in [COURSE AND SECTION]
>
> Hi,
>
> My name is [NAME] and I'm a [first/second]-year MBA student at Wharton. I came across [COURSE AND SECTION] [TITLE] and I'm interested in taking it for [SEMESTER]. I wanted to check if I'm eligible to enroll and if there's anything I need to do to get permission. If there's someone else I should contact please let me know.
>
> Thank you,
> [NAME]

**Registration** (to mbaprogram@wharton.upenn.edu, all approved courses in one email)

> Subject: Non-Wharton course registration – [COURSE AND SECTION, …]
>
> Hi,
>
> My name is [NAME] and I'm a [first/second]-year MBA student. I'd like to take the following non-Wharton course(s) and I've received permission from the department(s):
>
> - [COURSE AND SECTION], [TITLE] ([SEMESTER])
>
> Please let me know if there's anything else I need to do to register.
>
> Thank you,
> [NAME]

## Visual style: Penn Modern

- **Fonts** (Google Fonts): Newsreader weight 400 for headings and big numbers (never bold), Inter 400/500 for body text, DM Mono 500 in uppercase with 0.05em letter spacing for labels, course codes and status pills.
- **Colors:** page `#FBFAF6` (paper), tinted panels `#EEEDEA`, soft fills `#F4F3EE`, cards `#FFFFFF`, text and primary buttons Penn Blue `#011F5B`, secondary text `#4A5468`, links `#0E5696`, Penn Red `#990000` for accents (current step, key numbers, numbered tiles), gold `#F6E7B4` for step pills, letter markers and the "Waiting" status, light gold `#FBF3D9` for info callouts, light blue `#D4E4F2` for secondary buttons. Status: good `#267434` on `#E2EFE4`, bad `#990000` on `#F5E1E1`.
- **Shapes:** every button, input, toggle and pill is fully rounded. Cards have 20–28px corners and no border, with a soft shadow (`0 1px 2px #011F5B0F, 0 8px 24px #011F5B14`). Header cards and the overview panel use 28–32px corners.
- **Dot pattern:** small dots on a 14px grid (blue dots on tinted panels, light blue dots on Penn Blue cards, gold dots in gold callouts). Used on the top bar, the overview panel, the stepper panel, step header cards, info callouts and the final card. Soft decorative circles in blue, gold and red sit in the corners of the overview and step headers.
- **Motion:** cards fade up gently as they appear; overview progress bars fill in one after another. Turn animations off for people who prefer reduced motion.
- **Spacing:** generous. When in doubt add space, not lines.

## Must have (P0)

- Overview screen and three-step flow with a locking stepper
- Step 1: how-to, paste box for multiple courses, eligibility check with reasons, pick courses
- Step 2: name and year, one email per course with Open in email, status per course
- Step 3: one combined registration email with Open in email, done state
- Everything saved in the browser (local storage), so a refresh doesn't lose progress
- Penn Modern styling

## Nice to have (P1)

- AI reading of messy pasted text (instead of simple text matching)
- Copy email button for people without a desktop email app
- Overview animations

## Out of scope

- Searching courses inside the tool, sign-in, sending email from the app, reading replies, deadlines and reminders

## Build plan

Each step ends with something working and committed.

| Step | Build | Done when |
| --- | --- | --- |
| 1 | Page shell: overview screen, stepper sidebar with locking, empty step screens, Penn Modern fonts and colors | I can click Get started and see the stepper with Steps 2 and 3 locked |
| 2 | Step 1: how-to, paste box, info panel, eligibility check and results with checkboxes | Pasting the 4 sample courses gives 2 COUNTS and 2 DOESN'T COUNT with the right reasons |
| 3 | Step 2: name/year, course cards that open and close, emails, Open in email, statuses | Open in email opens a filled email; marking Approved unlocks Step 3 |
| 4 | Step 3: combined email and done state; save everything in the browser | Refreshing the page keeps my courses and statuses |
| 5 | Polish: dot patterns, decorative circles, animations, phone layout | It matches the prototype closely |
| 6 | Test with classmates, fix the top issues | Testers finish the flow without help |

If time runs short, cut in this order: P1 items → animations and decorative circles → phone layout polish. The eligibility check, the emails and the stepper always stay.

Sample text for testing Step 1:

```
DSGN 5100-001  Product Design Studio
Spring 2027 · In person · Weitzman School of Design

LAW 6120-001  Technology Law and Policy
Spring 2027 · In person · Penn Carey Law

ENGR 5900-401  Intro to Machine Learning
Spring 2027 · Online asynchronous · Penn Engineering

PSYC 4300-001  Behavioral Science Lab
Spring 2027 · In person · Arts and Sciences
```

## Notes for Claude Code

- I'm a non-technical PM. Explain what you're doing in simple terms and keep each change small.
- Only change files in `tools/non-wharton-course-manager/` and `apps/web/src/app/tools/non-wharton-course-manager/`.
- `prototype-reference.html` in this folder is the clickable design prototype. Use it for layout, copy, colors and spacing. It uses a prototyping format, so don't copy its code structure; rebuild it the way other Penn Tools pages are built.
- If Penn Tools has shared styles or components every tool should use, tell me before overriding them.
- Save data in the browser (local storage). Don't use the platform's database storage.
- Eligibility is fixed logic from the rules table, not an AI call.
- Emails open with a mailto link that fills in To, Subject and Body. Don't send email from the app.
- Ask before adding new libraries or making big structural changes.
- Build one step of the plan at a time and wait for me to test before moving on.
