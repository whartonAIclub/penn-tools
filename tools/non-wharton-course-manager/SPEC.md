# Non-Wharton Course Manager — Spec

**Tagline:** Interested in taking electives outside of Wharton but not sure how to go about it? This tool walks you through it in three steps.

## Overview

The Non-Wharton Course Manager guides MBA students through taking a Penn course outside Wharton. It is a three-step flow: (1) find courses on Path@Penn and check which ones count toward the MBA, (2) email each department for permission and track replies, (3) send approved courses to the MBA Program Office to register.

**Policy the tool is built on** (MBA Program Office, Non-Wharton Courses):

- Courses are found on Path@Penn (https://srfs.upenn.edu/path-at-penn).
- To count toward the MBA degree a course must be graduate level (numbered 5000 or above).
- Online courses must be synchronous (meet at a set time). Asynchronous courses do not count.
- To enroll the student emails the course and section number (for example EDUC 5050-001) to mbaprogram@wharton.upenn.edu.

**Principles:** show one thing at a time, explain why we ask for anything, never guess facts (formats, emails), nothing stored on a server, the MBA Program Office has the final word.

## Screens and flow

### Overview (first screen)

- Eyebrow pill "NEW ON PENN TOOLS · BETA", title "Non-Wharton Course Manager" ("Non-Wharton" in Penn Red), the tagline.
- A dotted-pattern panel holding three floating step cards (1 Find courses and check eligibility, 2 Request permission, 3 Register with the MBA Program). Each card has a number circle, title, one line of description and a progress bar that fills in one after another. Bars line up at the bottom of the cards.
- "Get started" button. Note under it: "Takes about 5 minutes. The MBA Program Office has the final word on what counts."

### Layout after "Get started"

- **Left:** a vertical stepper in a rounded tinted panel (`#EEEDEA`, 28px corners, dot pattern along the bottom). Each step has a circle (number, or ✓ when done) joined to the next by a dotted vertical line, a title and a small status pill (e.g. "2 OF 4 COUNT", "LOCKED", "1 OF 2 APPROVED"). The current step's circle is Penn Red with a soft glow. A "← Overview" link sits at the top.
- **Steps unlock in order:** Step 2 is locked until Step 1 is finished with at least one course picked. Step 3 is locked until at least one course is marked Approved. Locked steps are greyed out and can't be clicked.
- **Right:** the current step. Each step starts with a rounded Penn Blue header card (dot pattern, decorative circles, "STEP X OF 3" gold pill, serif title in white, one line of description), then its content as floating white cards.
- On a phone the stepper stacks above the content.

### Step 1: Find courses and check eligibility

Each part appears only after the one before it.

**A. Find courses on Path@Penn.** Three numbered tiles:
1. Open Path@Penn and click Search & Register for Classes.
2. Pick the term, search, then click a course to open its details panel on the right.
3. Copy that panel from the course code down to Seats Avail, or take a screenshot of it.

Button: "Got it, add a course".

**B. Add a course.** Courses are added one at a time; students can add as many as they like.
- **"What we check" button:** a small light blue pill button with an ⓘ icon, right next to the heading. It opens and closes a panel: outside Wharton; numbered 5000 or above; in class or online at a set time. Note: online classes with recorded lectures and no set meeting time (asynchronous) don't count; if an undergrad course is also offered at the 5000 level we point you to that version; the MBA Program Office has the final word. Last line: "Even if a course counts, you still need the department's permission to enroll."
- **Two tabs:**
  - **Paste details** (default): text box "Paste the course details panel. Messy is fine." and an "Add course" button. Shows "Reading the course details…" with a spinner, adds the course to the list below and clears the box.
  - **Upload screenshot** (P1): a drop area "Drop a screenshot of the details panel, or click to choose". Only build this if the platform's AI can read images.

**What to read from the pasted text** (example of the real Path@Penn panel):

```
CLST 3324  Ceramics and Society
Section 401, CRN 39068
Section Status: Active
Schedule Type: Seminar
Instruction Method: In Class
Campus: Philadelphia
Credit: 1
Scheduled With CLST 5324, section 401
Maximum Enrollment: 10 / Seats Avail: 10
```

| Field | Where it comes from |
| --- | --- |
| Department and course number | First course code in the text (CLST 3324) |
| Title | Text after the code on the same line, or the next line |
| Section | "Section 401" |
| Format | The value after "Instruction Method:". "In Class" or "in person" or "hybrid" → In class. Anything with "online", "synchronous" or "remote" → Online, live. Anything with "asynchronous" or "recorded" → Online, recorded. Missing or unknown → ask the student. |
| Cross-listed version | "Scheduled With CLST 5324, section 401" |
| Instructor | "Instructor:" or "Instructors:" line if present |
| Email | Any email address in the text |

Start with simple text matching. Upgrade to the platform's AI building block if the matching misses real pastes (P1). Never let AI fill in a field it can't see in the text.

**C. Your courses.** Appears after the first course is added.
- Big "X of Y" (Penn Red) "courses count toward your MBA".
- Under it, a gold note: "Counting toward your MBA doesn't mean you're enrolled. Every non-Wharton course still needs permission from its department. That's Step 2."
- One row per course: checkbox, course code with section and format (e.g. "CLST 5324-401 · IN CLASS"), title, one-line reason, result pill and an × to remove it.
- Courses that count are checked by default. Courses that don't count can't be checked.
- **If the format is missing:** the row asks "How does it meet?" with three buttons: In class / Online, live / Online, recorded. Picking one updates the result right away.
- **If the course is cross-listed at the graduate level:** the row shows a "Switch to CLST 5324-401" button and the note "Same class, same time and instructor." Clicking it swaps the course to the graduate version, which then counts.
- Button: "Continue to permission" (disabled if nothing is checked).

### Step 2: Request permission

- **Name, year and term card** (gold, with dot pattern): "This goes into your emails. We use your name, year and term so departments know who's asking and when. It's saved only in this browser." Name input, a rounded Year dropdown (placeholder "Pick your year"; First-year / Second-year) and a rounded Term dropdown (placeholder "Pick a term"; the next three Spring / Summer / Fall terms that haven't started). Year and term start empty so students choose on purpose. The details panel doesn't show the term, so we ask once here; it's used in all emails.
- **One card per picked course** that opens and closes (only one open at a time; the first opens automatically). Closed: number circle, code with section, title, status pill, chevron. Open:
  - **"Who to email"**, filled in automatically and always editable, with a label showing where it came from:
    - FOUND IN COURSE DETAILS: an email was in the pasted text
    - AUTO-FILLED: from the department contact list, with "Check it's right before you send."
    - NOT FOUND: left empty, with "Add the instructor's or department's email from the Penn Directory or the department website."
    - EDITED BY YOU: as soon as the student types
    - If an instructor name was found, show "Instructor: [name]" under the box.
    - **Find an email** (when the email wasn't in the course details): a light blue button. With an instructor: "Find [instructor]'s email", searching `"[instructor]" email upenn`. Without: "Find the department email", searching `[department full name] department email upenn`, using the department's full name (e.g. "Classical Studies") when the tool knows it, otherwise the code. Under it: "Copy the email from the results and paste it above." The tool never fills in an email from the search.
    - The button opens a **"Find an email" side panel** that slides in from the right inside the tool (full screen on a phone): title, close button (Escape also closes it), Google Programmable Search's search box pre-filled with the search above, and its results. Programmable Search is limited to upenn.edu; search engine ID `b5cecbaca2c394506`.
    - **If Programmable Search can't load** (for example, blocked by the site's security settings), the button opens the same search on google.com in a pop-up window about half the screen wide, to the right of the current window; if pop-ups are blocked, in a new tab.
  - Email preview (subject and body, filled with name, year, course and section, title, term). Until they're filled in, the preview shows [Your name], [first/second] and [Term].
  - "Open in email" button (mailto link). Clicking it moves the status from Not sent to Waiting. It's a disabled button until name, year and term are all filled in, with "Add your name, year and term above to unlock." beside it. "Find an email" and the status toggle work either way.
  - Status toggle: Not sent / Waiting / Approved / Declined
- Buttons: "Back" and "Continue to registration" (disabled until at least one course is Approved, with the hint "Mark at least one course Approved to continue").

### Step 3: Register with the MBA Program

- List of approved courses as green pills (code with section and title).
- One combined email to mbaprogram@wharton.upenn.edu listing every approved course with its section number, for the chosen term.
- "Open in email" (mailto) and "I sent it". "Open in email" is locked the same way as in Step 2, with "Add your name, year and term in Step 2 to unlock." (Step 2 is a link back.)
- After "I sent it": a "You're all set" card on the dot pattern.

## Eligibility rules

Checked in this order. Eligibility is fixed logic, never an AI judgment.

| # | Situation | Result pill | Reason shown |
| --- | --- | --- | --- |
| 1 | Department is a Wharton department | WHARTON COURSE | This is a Wharton course. Sign up through regular MBA course selection instead. |
| 2 | Below 5000, but cross-listed with a non-Wharton course 5000+ | TAKE AS [CODE] | This undergrad course is also offered as [CODE], which counts. |
| 3 | Below 5000 | DOESN'T COUNT | Only graduate-level courses (5000 and above) count. |
| 4 | Format is Online, recorded | DOESN'T COUNT | Online courses with no set meeting time (asynchronous) don't count. |
| 5 | Format missing | ADD FORMAT | We couldn't find how this class meets. (Shows the three format buttons.) |
| 6 | Otherwise | ✓ COUNTS | Graduate level, meets in class. / Graduate level, online at a set time. |

**Wharton departments** (to verify against the MBA course list before launch): ACCT, BEPP, FNCE, HCMG, LGST, MGMT, MKTG, OIDD, REAL, STAT, WH, MGEC, BDS, WHCP.

## Department contact list

- A small table in the tool's own folder: department code → contact email, department name, source link.
- Only add contacts you've checked on the department's website. **Never let AI guess an email.**
- Launch with 5–10 checked departments (the ones MBAs take most). Every other department shows NOT FOUND.
- The prototype uses fake `@example.com` addresses for CLST, HSSC, PHIL and TEST. Don't ship those.

## Email templates

**Permission request** (to the department contact)

> Subject: Permission to enroll in [COURSE-SECTION]
>
> Hi,
>
> My name is [NAME] and I'm a [first/second]-year MBA student at Wharton. I came across [COURSE-SECTION] [TITLE] and I'm interested in taking it for [TERM]. I wanted to check if I'm eligible to enroll and if there's anything I need to do to get permission. If there's someone else I should contact please let me know.
>
> Thank you,
> [NAME]

**Registration** (to mbaprogram@wharton.upenn.edu, all approved courses in one email)

> Subject: Non-Wharton course registration – [COURSE-SECTION, …]
>
> Hi,
>
> My name is [NAME] and I'm a [first/second]-year MBA student. I'd like to take the following non-Wharton course(s) for [TERM] and I've received permission from the department(s):
>
> - [COURSE-SECTION], [TITLE]
>
> Please let me know if there's anything else I need to do to register.
>
> Thank you,
> [NAME]

## Visual style: Penn Modern

- **Fonts** (Google Fonts): Newsreader weight 400 for headings and big numbers (never bold), Inter 400/500 for body text, DM Mono 500 in uppercase with 0.05em letter spacing for labels, course codes and status pills.
- **Colors:** page `#FBFAF6`, tinted panels `#EEEDEA`, soft fills `#F4F3EE`, cards `#FFFFFF`, text and primary buttons Penn Blue `#011F5B`, secondary text `#4A5468`, links `#0E5696`, Penn Red `#990000` for accents (current step, key numbers, numbered tiles), gold `#F6E7B4` for step pills, letter markers, "Waiting", "ADD FORMAT" and "TAKE AS", light gold `#FBF3D9` for info callouts and rows that need attention, light blue `#D4E4F2` for secondary buttons and "WHARTON COURSE". Status: good `#267434` on `#E2EFE4`, bad `#990000` on `#F5E1E1`.
- **Shapes:** every button, input, toggle and pill is fully rounded. Cards have 20–28px corners and no border, with a soft shadow (`0 1px 2px #011F5B0F, 0 8px 24px #011F5B14`). Header cards and the overview panel use 28–32px corners.
- **Dot pattern:** small dots on a 14px grid (blue dots on tinted panels, light blue dots on Penn Blue cards, gold dots in gold callouts). Used on the top bar, the overview panel, the stepper panel, step header cards, info callouts, the screenshot drop area and the final card. Soft decorative circles in blue, gold and red sit in the corners of the overview and step headers.
- **Motion:** cards fade up gently as they appear; overview progress bars fill in one after another. Turn animations off for people who prefer reduced motion.
- **Spacing:** generous. When in doubt add space, not lines.

## Must have (P0)

- Overview screen and three-step flow with a locking stepper
- Step 1: how-to tiles, paste-details tab, eligibility rules 1–6 (including Wharton and cross-listing), format question, switch to graduate version, remove course
- Step 2: name, year and term, one email per course with Open in email, contact box with source label (NOT FOUND fallback), status per course
- Step 3: one combined registration email with Open in email, done state
- Everything saved in the browser (local storage), so a refresh doesn't lose progress
- Penn Modern styling

## Nice to have (P1)

- Department contact list with 5–10 checked departments (without it every contact shows NOT FOUND, which still works)
- Screenshot upload, if the platform's AI can read images
- AI reading of pasted text, if simple matching misses real pastes
- Copy email button for people without a desktop email app
- Overview animations

## Backlog

Running list of changes found while testing. Build these when the current step is done.

- [x] **Step 1, duplicate courses:** if a student adds a course that's already in the list (same course number and section, or the same course after switching to its graduate version), don't add it again. Show a short message under the paste box: "[COURSE-SECTION] is already in your list." Clear the paste box either way.
- [x] **Step 1, how-to tile 03:** change to "Copy that panel from the **course code down through Registration Restrictions**." (The prototype adds "or take a screenshot of it"; leave that out until screenshot upload is built.)
- [ ] **Step 2, who gives permission:** read from the pasted panel whether permission comes from the instructor or the department, and show "Path@Penn says permission comes from the [instructor/department]." as a gold pill under the "Who to email" note. Show nothing if the panel doesn't say. Needs a real panel copied down through Registration Restrictions, to match Path@Penn's exact wording.
- [x] **Step 2, find an email:** when the email wasn't found in the course details, show a light blue "Find [INSTRUCTOR]'s email" button (or "Find the department contact" when no instructor was found) beside that pill. It opens a Google search in a new tab: `"[INSTRUCTOR]" [DEPT] site:upenn.edu`, or `[DEPT] department graduate coordinator site:upenn.edu`. The student reads the results and types the email themselves; the tool never fills it in from the search.
- [ ] **Step 2, better contact finding (to scope):** the "Find their email" Google search works but isn't good enough yet. Ideas to explore, in rough order of value: (1) a checked department contact list so most courses show AUTO-FILLED; (2) the "who gives permission" line, so students know whether to look for the instructor or the department; (3) a sharper search, e.g. the department's own website or the Penn Directory instead of Google; (4) after approval, ask "Who did you email?" and save it for the next student (needs shared storage). Decide which to build after user testing shows where students get stuck.
- [ ] **Step 2, embedded contact search:** search for the contact inside the tool using Google Programmable Search, limited to upenn.edu. Needs a free search engine ID.

## Out of scope

- Searching courses inside the tool, sign-in, sending email from the app, reading replies, looking up instructor emails, deadlines and reminders

## Build plan

Each step ends with something working and committed.

| Step | Build | Done when |
| --- | --- | --- |
| 1 ✓ | Page shell: overview screen, stepper sidebar with locking, empty step screens, Penn Modern fonts and colors | Done 11/12 |
| 2 | Step 1: how-to tiles, term picker, paste box, reading the pasted text, eligibility rules 1–6, results with checkboxes, format question, switch button, remove | All test cases below give the expected result |
| 3 | Step 2: name/year, course cards that open and close, contact box with source label, emails, Open in email, statuses | Open in email opens a filled email with the section number; marking Approved unlocks Step 3 |
| 4 | Step 3: combined email and done state; save everything in the browser | Refreshing the page keeps my courses and statuses |
| 5 | P1 items in order: department contact list, screenshot upload, polish (patterns, circles, animations, phone layout) | It matches the prototype closely |
| 6 | Test with classmates, fix the top issues | Testers finish the flow without help |

If time runs short, cut in this order: screenshot upload → AI reading → animations and decorative circles → department contact list → phone layout polish. The eligibility rules, the emails and the stepper always stay.

## Test cases for Step 1

Paste each one separately and click Add course.

| Paste | Expected |
| --- | --- |
| The CLST 3324 panel above | TAKE AS CLST 5324 with a Switch button; after switching: CLST 5324-401 · IN CLASS, ✓ COUNTS |
| `PHIL 5651 Philosophy of Artificial Intelligence` | ADD FORMAT with three buttons; In class → ✓ COUNTS; Online, recorded → DOESN'T COUNT |
| `OIDD 5110 Fabrication Studio I` | WHARTON COURSE |
| `PHIL 1800 Philosophy of Science` | DOESN'T COUNT (below 5000) |
| `TEST 5999 Async Example` plus a line `Instruction Method: Online Asynchronous` | DOESN'T COUNT (asynchronous) |
| Text with no course code | Nothing is added, and a short message asks for the course code |
| The same course added twice (e.g. CLST 5324-401, then again) | Not added a second time; a message says "CLST 5324-401 is already in your list." |
| The real CHIN 0233 panel below (title under the section line) | CHIN 0233-680 · IN CLASS, title "Beginning Taiwanese II", TAKE AS CHIN 5233; after switching: CHIN 5233-680, ✓ COUNTS |
| `CHIN 0233 Beginning Taiwanese II` | CHIN 0233 (keeps all 4 digits), title "Beginning Taiwanese II", DOESN'T COUNT (below 5000) |
| `CLST 3324 Ceramics and Society` (no "Scheduled With" line) | Title "Ceramics and Society", DOESN'T COUNT (below 5000) |
| Both lines above pasted together | Adds only CHIN 0233, and a note says "We added CHIN 0233. Add CLST 3324 on its own." |

The real CHIN 0233 panel as copied from Path@Penn:

```
CHIN 0233
Section 680, CRN 23190
Beginning Taiwanese II
11/12/2026, 12:42:52 PM
Section Status: Active
Schedule Type: Lecture
Instruction Method: In Class
Campus: Philadelphia
Credit: 1
Scheduled With CHIN 5233, section 680
Maximum Enrollment: 15 / Seats Avail: 15
```

## Notes for Claude Code

- I'm a non-technical PM. Explain what you're doing in simple terms and keep each change small.
- Only change files in `tools/non-wharton-course-manager/` and `apps/web/src/app/tools/non-wharton-course-manager/`.
- `prototype-reference.html` in this folder is the clickable design prototype. Use it for layout, copy, colors, spacing and the reading and eligibility logic in its script. It uses a prototyping format, so don't copy its code structure; rebuild it the way other Penn Tools pages are built.
- If Penn Tools has shared styles or components every tool should use, tell me before overriding them.
- Save data in the browser (local storage). Don't use the platform's database storage.
- Eligibility is fixed logic from the rules table, not an AI call. Never let AI guess a course format or an email address.
- Emails open with a mailto link that fills in To, Subject and Body. Don't send email from the app.
- Ask before adding new libraries or making big structural changes.
- Build one step of the plan at a time and wait for me to test before moving on.
