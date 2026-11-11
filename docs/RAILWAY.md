# Standing up a Railway instance

How to run your own copy of PennTools on [Railway](https://railway.com), deployed
from your team's branch. It gets its own database, separate from production and
from every other team's instance. Pushes to your branch redeploy it.

Railway's screens change from time to time, so a button or menu may be named
slightly differently from what's written here.

## Do you need this?

Probably not yet. Building and testing a tool works on your own computer: run
`bash scripts/setupAndRun.sh` (see the README) and you get the whole site at
`http://localhost:3000`. That includes its own database, AskPenn, the Platform
Playground, your tool's pages and routes, and the site sidebar.

A Railway instance adds what your computer can't give you:

- **A public URL**, so people outside your team, such as friends or classmates
  beta testing your tool, can use it without running anything.
- **Real Google sign-in, with separate users.** Locally, everyone signs in as
  the same development user, so you can't try two accounts side by side or
  check that one person's data stays hidden from another.
- **The production build**, deployed the way production is. Rarely needed by
  tool teams; it's mostly how the Platform team checks a deploy.

So stand up an instance when you're ready to share your tool with testers, not
to develop it.

## 1. Before you start

- **A GitHub account with access to the repo.** Railway signs you in with
  GitHub, and can only deploy repos that account can see. Check that you can open
  [whartonAIclub/penn-tools](https://github.com/whartonAIclub/penn-tools)
  while signed in.
- **Your team's branch, pushed to GitHub, with the current `main` merged in.**
  This guide relies on scripts and settings that older branches don't have
  (for example `db:deploy`). If your branch is behind, merge `main` into it
  first.
- **An OpenAI API key** for the platform. Deploys use it to embed Career
  Canvas's course catalog, which costs a few cents the first time, and searches
  use it for users who haven't saved their own key. Without it, those features
  are off but the app still runs. **An Anthropic key alone isn't enough**:
  embeddings only work with OpenAI. The platform's keys also pay for each
  user's free AI credit ($0.50, across OpenAI and Anthropic); after that,
  tools use the user's own keys from Settings. Without the platform's
  Anthropic key (optional, step 5), Anthropic calls use only users' own keys.
- **Your team's Penn Google accounts**, to sign in with. Only accounts with a
  upenn.edu email address (including school addresses such as
  wharton.upenn.edu) can sign in. Team instances sign in
  through a shared staging Google OAuth client that the Platform team runs
  (step 6). Without Google sign-in, a deployed instance has no way to sign in
  at all, so anything that needs a user (AskPenn, the Playground, Settings)
  won't work.

## 2. Sign in to Railway

Go to [railway.com](https://railway.com) and sign in with GitHub. Railway's
access to `whartonAIclub/penn-tools` is already set up by the organization's
admins, so the repo shows up when you add the app in step 4. If it doesn't, ask
an admin of the `whartonAIclub` organization.

## 3. Create the project and its database

1. Create a new, empty project.
2. In the project, add a database from the **pgvector** template (Postgres with
   the `vector` extension). A plain Postgres database won't work: the
   platform's schema needs `vector`.
3. Keep the database service's name as **`pgvector`**. Step 5 refers to it by
   that name; if you rename it, use the new name there instead.

## 4. Add the app from your team's branch

1. In the same project, add a new service from a GitHub repo and choose
   `whartonAIclub/penn-tools`.
2. In the service's settings, set the branch it deploys from to **your team's
   branch**, not `main`. Leave the root directory as the repo root: it's a
   monorepo, and the build runs from the top.
3. Under **Settings → Deploy**, set:

   | Setting | Value |
   |---|---|
   | Start command | `pnpm --filter @penntools/web start` |
   | Pre-deploy command | `pnpm --filter @penntools/platform db:deploy` |

   Leave the build command empty: Railway runs the root `build` script. Railway
   picks pnpm and the Node version up from the repo (`packageManager` in
   `package.json` and `.nvmrc`, Node 24); the app needs Node 22 or later.
4. Under **Settings → Networking**, generate a public domain, and note the URL,
   e.g. `https://penntools-team8.up.railway.app`. You need it in the next two
   steps.

The first deploy may start and fail now, before the variables exist. That's
expected; it redeploys once you set them.

## 5. Set the app's variables

On the app service (not the database), add:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{pgvector.DATABASE_URL}}`, a reference to the database service from step 3 |
| `OPENAI_API_KEY` | The platform OpenAI key from step 1 |
| `NEXTAUTH_URL` | The public URL from step 4, e.g. `https://penntools-team8.up.railway.app` |
| `NEXTAUTH_SECRET` | A random secret; generate one with `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | The staging client's ID and secret, which the Platform team gives you privately (step 6) |

Optional:

- `ANTHROPIC_API_KEY`: pays for Anthropic calls within each user's free AI
  credit, and for older tools still on the legacy LLM API (it's preferred over
  OpenAI there when set).
- Variables that some older tools read for themselves: Compass
  (`COMPASS_ICS_FEED_URL`, `TOOL19_ADMIN_KEY`, `NEXT_PUBLIC_TOOL19_ADMIN_KEY`)
  and Penn Planner (`NEXT_PUBLIC_GCAL_CLIENT_ID`). Set these only if you need
  those tools working. `NEXT_PUBLIC_` values are built into the page, so
  redeploy after changing them.

## 6. Get Google sign-in added for your instance

Team instances share one Google OAuth client, "PennTools staging", separate
from production's. The Platform team runs it, so you don't need Google Cloud
access. Google only signs users in on URLs registered on the client in advance,
one exact URL per instance, so each new instance has to be added.

1. Send the Platform team your instance's URL from step 4, e.g.
   `https://penntools-team8.up.railway.app`, and the Google accounts your team
   will sign in with.
2. If you don't have them yet, ask for the staging client's ID and secret, and
   set them as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (step 5). Keep them
   out of the repo and out of public channels.
3. Wait for the Platform team to confirm. Google can take from a few minutes to
   a few hours to start accepting a newly added URL, so sign-in may fail with
   `redirect_uri_mismatch` for a while after they've added it.

If you ever regenerate your instance's domain in Railway, sign-in stops working
until you update `NEXTAUTH_URL` and the Platform team adds the new URL.

## 7. Deploy

Setting the variables redeploys the app; if it doesn't, start a deploy by hand.
Each deploy:

1. **Builds** the monorepo.
2. **Runs the pre-deploy command** (`db:deploy`): creates the platform's tables,
   then each tool's own database role and schema, and runs tool seeds. On a new
   database this takes about a minute longer while Career Canvas embeds its
   course catalog. If this step fails, the previous version keeps serving.
3. **Starts** the app.

## 8. Check that it works

On your public URL:

- [ ] The home page loads, with the tools listed in the sidebar at the left.
- [ ] **Sign in** works with one of the Google accounts you sent in step 6.
- [ ] In **Settings**, you can save an OpenAI or Anthropic API key.
- [ ] As an admin, **/admin** shows AI usage, tool visits and the admins. On a new
      instance, the first admins are the ones in
      `packages/platform/scripts/seed-platform.mjs`; to see the page on your
      own instance, ask one of them to add you, or edit that list before your
      first deploy.
- [ ] **AskPenn** answers a message.
- [ ] The **Platform Playground** runs each demo, including the search.
- [ ] Your team's tool loads at `/tools/<your tool ID>`.

## Afterwards

- **Every push to your branch redeploys**, and every deploy runs `db:deploy`
  again. It's safe to re-run, so your instance's data stays.
- **Your instance's data is its own**: users, saved keys and tools' tables live
  in its database, not production's.
- **Railway bills usage.** Delete the project when you're done with it, and
  tell the Platform team, so they can remove its URL from the staging client.

## If something goes wrong

| Symptom | Likely cause |
|---|---|
| Pre-deploy fails with "Environment variable not found: DATABASE_URL" | `DATABASE_URL` isn't set on the app service, or the reference names the wrong service |
| Pre-deploy fails mentioning the `vector` extension | The database isn't from the pgvector template (step 3) |
| Build or pre-deploy fails with a missing script, such as `db:deploy` | Your branch is behind `main`: merge it in (step 1) |
| The **Sign in** button is greyed out | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` or `NEXTAUTH_SECRET` is missing |
| Google says `redirect_uri_mismatch` | Your URL isn't on the staging client yet, was added in the last few hours, or doesn't match exactly (for example after regenerating the domain). See step 6 |
| Google says access is blocked, or the app isn't verified | Your account isn't one of the staging consent screen's test users: ask the Platform team |
| Signing in ends on **Penn accounts only** | The Google account's email isn't at upenn.edu: sign in again and choose your Penn account |
| Semantic search (Career Canvas, the Playground) is off for users without their own OpenAI key | `OPENAI_API_KEY` isn't set |

## For the Platform team: the staging Google client

Team instances sign in through one shared OAuth client, kept separate from
production's so that production's client secret never goes to teams. Google
doesn't allow wildcard redirect URIs, so each instance is added by hand.

### One-time setup

1. In the club's Google Cloud project, create an OAuth client ID of type **Web
   application**, named e.g. "PennTools staging".
2. Share its client ID and secret with teams privately: never in the repo or a
   public channel.

The consent screen belongs to the Google Cloud project, not the client, so a
staging client in production's project shares production's consent screen:
the same publishing status, authorized domains and test users. If team
instances should have their own (for example a test-user list while
production's consent screen is published), create the staging client in a
separate Google Cloud project instead.

### For each new instance

When a team sends its instance's URL, e.g.
`https://penntools-team8.up.railway.app`:

1. On the staging client, add the authorized redirect URI
   `https://penntools-team8.up.railway.app/api/auth/callback/google`.
2. On the consent screen, add the domain (`penntools-team8.up.railway.app`) to
   **Authorized domains**. `up.railway.app` is a public suffix, so Google treats
   each instance's domain as a separate domain rather than covering them all
   with `railway.app`.
3. If the consent screen is in **Testing**, add the team's Google accounts as
   test users. Only listed test users can sign in, and Google caps the list.
4. Tell the team it's done, and that it can take from a few minutes to a few
   hours to work.

When a team deletes its instance, remove its redirect URI and authorized
domain, so the lists only hold live instances. Google is reported to allow
about 100 redirect URIs per client.

Some people report Google Cloud Console refusing to save `*.up.railway.app`
URLs. If that happens, give team instances subdomains of a domain the club
owns instead (e.g. `team8.staging.<club domain>`, added as a custom domain in
Railway): one authorized domain, verified once, covers all of them.
