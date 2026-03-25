# Resume Customizer — Team Guide

This guide covers everything your team needs to work on this project. No prior Git experience needed.

---

## First time setup

**1. Install the tools you need** (do this once):
* [Node.js](https://nodejs.org) — download the "LTS" version
* Open a terminal and run: `npm install -g pnpm`

**2. Clone the repo** (do this once):
```
git clone https://github.com/whartonAIclub/penn-tools
cd penn-tools
```

**3. Switch to your branch:**
```
git checkout Goonbranch_1
```

**4. Install dependencies and run the app:**
```
pnpm install
pnpm build
pnpm dev
```

The app will be running at **http://localhost:3000**. Keep this terminal open while you work.

---

## Every time you sit down to work

Before you touch any code, get the latest changes from your teammates:

```
git pull
```

That's it. This downloads whatever your teammates pushed since you last worked.

---

## Saving your work (committing + pushing)

Think of this as a two-step save:
1. **Commit** = save a snapshot locally with a message describing what you did
2. **Push** = upload that snapshot so your teammates can see it

```
git add .
git commit -m "describe what you changed here"
git push
```

Example commit messages:
* `"add file upload button to left panel"`
* `"fix typo in cover letter preview"`
* `"update resume template styling"`

**Commit often.** Small, frequent commits are much easier to undo if something breaks.

**Do this yourself** — don't use Claude or an AI tool to commit for you. Committing is how you stay aware of exactly what's going into the repo. If you don't know what you're committing, you risk pushing broken code or files that shouldn't be there.

### Before every commit: check what you're about to save

Run this first:
```
git status
```

This shows every file you've changed. Read it carefully. You should only see files inside:
- `tools/7/`
- `apps/web/src/app/tools/7/`

**If you see anything outside those two folders — stop.** Do not commit until you understand why that file changed. You may have accidentally edited something that belongs to another team or the platform. Committing it could break the whole app for everyone.

Common files to watch out for:
- `apps/web/package.json` — only changes when a new tool is registered; don't touch otherwise
- `apps/web/src/lib/container.ts` — same
- Anything in `tools/` that isn't `tools/7/`
- Anything in `packages/`

If you're unsure, ask before pushing.

---

## Your files

You work in exactly two places:

| What | Where |
|---|---|
| Tool logic (backend) | `tools/7/src/` |
| UI (what users see) | `apps/web/src/app/tools/7/` |

Don't edit anything outside these two folders.

---

## When something goes wrong

**Merge conflict** — this happens when two people edited the same file. You'll see something like:

```
<<<<<<< your changes
...
=======
...
>>>>>>> their changes
```

Pick which version to keep (or combine them), delete the `<<<<`, `====`, `>>>>` lines, save the file, then commit.

**App won't start** — try:
```
pnpm install
pnpm build
pnpm dev
```

**You accidentally edited the wrong file** — before committing, run `git checkout -- path/to/file` to undo changes to that specific file.

---

## API keys

The app needs API keys to call the AI model. These are secret — never commit them to Git.

**Setup (do this once):**

1. Check if `apps/web/.env.local` exists. If not, copy the example file:
   ```
   cp .env.example apps/web/.env.local
   ```

2. Open `apps/web/.env.local` and fill in at least one of:
   ```
   OPENAI_API_KEY="sk-..."
   ANTHROPIC_API_KEY="sk-ant-..."
   ```
   You only need one. The team may have a shared key — if not, you can get your own from [platform.openai.com](https://platform.openai.com) or [console.anthropic.com](https://console.anthropic.com) (Google it if unsure).

3. Save the file. The app will pick it up automatically next time you run `pnpm dev`.

**Important:**
* `.env.local` is already in `.gitignore` — it will never accidentally get committed
* Never paste an API key into a code file or share it in a message
* If the app starts but AI features don't work, a missing or incorrect key is usually why

---

## Things that can seriously mess up the repo

These commands look harmless but can delete or overwrite your teammates' work permanently. Don't run them unless you fully understand what they do:

| Command | Why it's dangerous |
|---|---|
| `git push --force` | Overwrites what's on the server with your local copy — can erase teammates' commits |
| `git reset --hard` | Permanently deletes your uncommitted changes with no undo |
| `git rebase` | Rewrites commit history — causes major conflicts for everyone else |
| `git checkout .` or `git restore .` | Wipes all your unsaved changes instantly |

**Rule of thumb:** if a command has `--force`, `--hard`, or you're not sure what it does — stop and Google it first, or ask before running.

---

## Do I ever need a new branch?

No — your whole team works on `Goonbranch_1`. You don't need to create new branches.

If you ever end up on the wrong branch by accident, switch back with:
```
git checkout Goonbranch_1
```

---

## Quick reference

| What you want to do | Command |
|---|---|
| Get latest code from teammates | `git pull` |
| See what files you've changed | `git status` |
| Save your work locally | `git add .` then `git commit -m "your message"` |
| Upload your work | `git push` |
| See recent saves | `git log --oneline` |
| Switch back to your branch | `git checkout Goonbranch_1` |
| Start the app | `pnpm dev` |
| Stop the app | Ctrl + C in the terminal |