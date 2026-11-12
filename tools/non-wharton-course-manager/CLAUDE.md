# Non-Wharton Course Manager — Agent Instructions

These add to the repository's root `CLAUDE.md`, which still applies (the user is the Non-Wharton Course Manager tool team).

- **Follow `SPEC.md`** in this folder. It is the source of truth for the flow, copy, eligibility rules, email templates and build plan.
- **Use `prototype-reference.html` for the look**: layout, copy, colors, spacing, fonts. It is written in a prototyping format, so don't copy its code structure. Rebuild it the way other Penn Tools pages are built: React components and CSS Modules in `apps/web/src/app/tools/non-wharton-course-manager/`, and plain logic (types, eligibility, parsing, email text, step locking) in `tools/non-wharton-course-manager/src/` with tests.
- **Explain things simply.** The user is a non-technical PM. Say what you changed and why in plain words, without jargon, and keep each change small.
- **Build one step of the build plan at a time.** After each step, say how to test it and wait for the user before starting the next one.
- Only change files in `tools/non-wharton-course-manager/` and `apps/web/src/app/tools/non-wharton-course-manager/`.
- Save data in the browser (local storage), not the platform's database. Wrap every local storage read and write so the page still works when storage is unavailable.
- Use the reading and eligibility logic in the prototype's script as a guide (rebuilt, not copied).
- Eligibility is fixed logic from the spec's rules table, never an AI call. Never let AI guess a course format or an email address.
- Don't change `prototype-reference.html` or `SPEC.md` unless the user asks.
- Emails open through `mailto:` links. Never send email from the app.
- Ask before adding new libraries or making big structural changes. If Penn Tools has shared styles or components every tool should use, say so before overriding them.
- After each change, run `pnpm typecheck`, `pnpm check:tools` and `pnpm test`.
