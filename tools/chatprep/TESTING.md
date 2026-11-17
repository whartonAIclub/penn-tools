# Testing ChatPrep

How ChatPrep is tested, from automated checks on every change to rounds with
real students before real coffee chats. Most of what makes a brief good can't
be checked by code, so the plan has four layers:

| Layer | What it catches | When |
|---|---|---|
| 1. Automated tests | Broken code, input checks, lost prompt rules | Every change |
| 2. Manual page checks | What only a real browser and a real AI show | Changes to the page or uploads |
| 3. Brief quality review | Generic, wrong or awkward briefs | Changes to the questions or prompt |
| 4. Tester rounds | Whether students use it and whether it helps | Before review, then as needed |

## 1. Automated tests

Run these before every commit, from the repo root:

```bash
pnpm --filter @penntools/tool-chatprep test           # ChatPrep's logic
pnpm --filter @penntools/web test -- chatprep         # ChatPrep's route and file reading
pnpm typecheck
pnpm check:tools
```

None of them call a real AI, need an API key or cost anything: the AI,
sign-in and the database are replaced by fakes.

### What they cover

**`tools/chatprep/src/__tests__/`**, the tool's logic:

- `framework.test.ts`: the core questions have unique ids, the choice question
  exists and has brackets to fill, at least six questions remain without it,
  and the no-referral rule is still there.
- `brief.test.ts`:
  - The brief is requested in the right shape, with the student's and the
    person's details.
  - The choice question is left out when no choice was entered.
  - **Prompt guards**: every rule added after a real brief got something wrong
    is still in the prompt (no invented news, overlaps need experience on both
    sides, no "you" in overlaps, each fact said once, no repeated openers, no
    placeholders, no guessing from blurry screenshots). These check the rule
    is there, not that the AI follows it; that's layer 3.
- `files.test.ts`: uploads are checked by their real type, not their name;
  limits on count, size and PDF pages; text or files are required for the
  resume and the profile; files reach the AI tagged as resume, profile or news.
- `format.test.ts`: the copied text has every section, with each overlap's
  line to say marked `Say:`.

**`apps/web/src/app/tools/chatprep/__tests__/`**, the page's server and browser code:

- `route.test.ts`, the brief route: signed-out visitors get a sign-in message;
  bad or oversized requests are refused with a reason; PDFs over the page
  limit or that don't open are refused; only checked fields reach the AI; an
  API key problem comes back with its kind (so the page links to Settings);
  unexpected errors don't leak details.
- `readFile.test.ts`: empty files, long names, fake PDFs, Word files and
  unreadable images each get a clear message; pasted screenshots get unique
  names.

### What they don't cover

- **The page itself** (`ChatPrep.tsx`): the repo has no browser test setup.
  Layer 2 covers it.
- **Shrinking images and counting PDF pages in the browser**: these need a
  real browser. Layer 2 covers them.
- **Whether briefs are any good.** Layers 3 and 4.

A note for the Platform team, not ChatPrep: `pnpm test` at the repo root ends
by running `node --test "scripts/*.test.mjs"`, and Node 20 doesn't expand
that `*`, so it fails with "Could not find" even when every test passes. On
Node 20, run `node --test scripts/check-tool-imports.test.mjs scripts/new-tool.test.mjs`
instead.

## 2. Manual page checks

Do these at `http://localhost:3000/tools/chatprep` after changing the page,
the route or the uploads. About 10 minutes.

**Sign-in and keys**
- [ ] Signed out: the page asks you to sign in.
- [ ] Signed in with no API key saved: the page points to Settings.

**Entering details**
- [ ] Paste a resume, target roles, company and profile text: **Make my brief** turns on.
- [ ] Leave the company empty: the button stays off.
- [ ] Reload the page: the "You" section is still filled in, including an uploaded resume.

**Uploads** (try each in the resume, profile and news fields)
- [ ] Drop a PDF onto the box: its name appears with **Remove**.
- [ ] Use **Choose files** instead of dropping.
- [ ] Take a screenshot to the clipboard (Cmd+Ctrl+Shift+4) and paste it into the profile or news text box: it's added as a file.
- [ ] Add a second resume file: it replaces the first.
- [ ] Add more files than the limit (6 profile files, 4 news files): a message says the limit.
- [ ] Upload a Word file, and a PDF over 8 pages: each gets a clear message.
- [ ] A large phone photo (several MB) uploads without an error (it's shrunk first).

**Making a brief**
- [ ] With files only (no pasted resume or profile), a brief is made.
- [ ] The button says "Writing your brief…" while it works.
- [ ] **Copy as text** copies the whole brief; paste it somewhere to check.

## 3. Brief quality review

Do this after any change to `framework.ts` or the prompt in `brief.ts`, before
committing it. The AI's output varies, so a change can fix one brief and break
another.

**Keep a fixed test set** of 3–5 real people: their profile (pasted and as
screenshots), the company and an article or two. Include at least one founder,
investor or rotational-program person, since the rules treat them differently.
Keep these files outside the repo: they're real people's details.

**For each person, make a brief and check:**

| Check | Came from |
|---|---|
| Nothing stated as fact that isn't in their profile or the news you gave | Invented dates and numbers |
| No line opens with a claim the listener has no context for | "Adoption has grown mostly by word of mouth" |
| Lead-ins name where you saw something, at most 2–3 times, worded differently | Too many "I've read that" |
| Each fact about them is said aloud once, not in the intro *and* a question | "Bain into operating roles" said three times |
| Overlaps name both people, with the line to say shown as `Say:` | "You" meaning two people in one bullet |
| Every overlap is real experience on both sides | Club membership vs. a VC job |
| No `[option A]` or other placeholders | Empty "choice you're weighing" |
| From screenshots: names, titles, employers and dates match their profile | Screenshot misreads |
| **You'd ask at least 2 of the 6 questions as written** | The goal |

**Pass:** every check holds for every person, and the last one holds for at
least 4 of 5. When a check fails, note which person and what the brief said;
that's what to bring back when changing the prompt. If a fix is worth keeping,
add a prompt guard for it in `brief.test.ts`.

## 4. Tester rounds

### Round 1: briefs made for testers (no setup for them)

Testers don't need an API key or the site. You make each brief on your
computer and send it to them. This tests the most important question, whether
the briefs help in real chats, without asking testers to set anything up.

- **Who:** about 5 first-year career switchers, ideally in one industry, each
  with a coffee chat in the next week or two.
- **Before each chat:** they send you their resume (once) and the person's
  LinkedIn as screenshots or a PDF, plus the company. You make the brief, run
  the layer 3 checks on it, and send it to them.
- **After each chat, ask:**
  1. Did you read the brief before the chat?
  2. Which questions did you ask, as written or changed?
  3. What did you skip or change, and why?
  4. Would you want this before your next chat?
- **Record** each answer in one place (a sheet with one row per chat), with
  the date, the person's type (founder, investor, other) and which questions
  were asked.
- **Handle their data with care:** resumes and LinkedIn profiles are personal.
  Keep them out of the repo, don't share them, and delete them when the round
  ends.
- **Done when:** you have about 10 chats' answers and know whether students
  read it before every chat. Fix what comes up (unit 7), using layer 3 to
  check each fix.

### Round 2: testers use the site themselves

Once round 1 shows the briefs help, and the page is clear enough to use alone
(unit 5), testers use the Railway instance directly. This tests what round 1
can't: whether someone can go from a profile to a copied brief without help.

- **Needs:** Google sign-in on the instance (from the Platform team), testers'
  Penn emails on the sign-in list if it's in testing mode, and an API key for
  each tester (their own, or a capped key you give them).
- **Before inviting anyone,** do the deployed-site check below.
- **Ask the same questions as round 1, plus:** where did you get stuck, and
  what did you have to ask someone about?
- **Done when:** a tester who has never seen it can make and copy a brief
  without asking you anything.

### Deployed-site check (Railway)

After each deploy that testers will use, on
`https://penn-tools-production-29cde2c7.up.railway.app`:

- [ ] The home page loads and ChatPrep is in the sidebar.
- [ ] **Sign in** works with a Penn Google account.
- [ ] An API key saves in **Settings**.
- [ ] A brief is made from pasted text, and one from a screenshot and a PDF.
