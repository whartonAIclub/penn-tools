# Imported Handoff prototype

On November 4, 2026, the founder exported **Handoff Student Exchange.html** from [the original Claude artifact](https://claude.ai/artifact/2CPBgmNxEPavNYZeFyQGDZ) and authorized bringing its code into PennTools.

- Export SHA-256: `1dca71945826048118b74dee2acdb6c9e3e1dd6f0266dc721eaadec06d2f0dbd`
- Export size: 634,800 bytes.
- Original export remains outside the repository; the editable application source is now in `apps/web/src/app/tools/handoff/`: `HandoffPrototype.jsx` and the modules beside it.

## What works in this import

The original multi-event browsing, event pages, sell/ISO forms, simulated buyer/seller switching, reservations, payment/transfer progress, goods, organizer preview, review controls and 96 built-in rule checks are retained in the development preview at `/tools/handoff/preview`. The preview exists only in development builds (a production build answers 404) and isn't linked from the app. Open `/tools/handoff/preview#selftest` to run the original checks against a fresh demo seed. Those checks verify prototype rules, not server permissions or concurrent real accounts.

In the preview, all marketplace identities, listings and transaction activity are illustrative. New activity is saved in this browser under `penntools-handoff-prototype-*` keys. It is not shared with another computer or a different browser. Payments, delivery, notifications and organizer actions remain simulated.

## Adaptations for PennTools

- Uses the installed React package instead of export-only CDN scripts and in-browser Babel.
- Browser-only mounting prevents saved demo state from being read on the server.
- Handoff's CSS Module scopes styles to the tool and responds to the space beside the PennTools sidebar. Its own scroll area keeps focus, dialogs and navigation within that space.
- Share previews use the current PennTools URL and retain the warning that a viewer cannot see posts created in someone else's browser. Nothing is sent automatically.
- The original remote font is not loaded; the original font stack's system fallbacks are used.
- Claude's artifact-only shared feedback store is not connected. The existing feedback form falls back to explicitly copyable answers, with no automatic submission or shared results.

## From prototype to the live page

The normal route, `/tools/handoff`, is now the live product (see the [README](README.md)). It uses real PennTools sessions and shared data in Handoff's own database schema. The server enforces ownership, validation, reservations (one successful claim per unit), cancellation and expiry.

- **The rules:** the prototype's rules were extracted into `tools/handoff/engine/`. The preview runs them in the browser and the server runs them for the live market. The 96 rule checks still pass, in three time zones.
- **No demo chrome on the live page:** it has no sample data, personas, demo clock, tours or reviewer controls. Those stay in the preview, for reviewing screens and for the browser checks.

Still true from the import:
- **Transfer rules:** confirm the pilot events' transfer rules rather than treating the demo's illustrative rules as verified policies.
- **Database role:** the Platform team registers Handoff's database role, with one line in `TOOLS`, with or after `schema.sql`. That shared registration remains outside this tool team's edit scope.
- **Testing identities:** test two-account flows with distinct identities, and the deployed flow with two Penn accounts. The default local login is one shared Local Developer account.
- **The UI:** it's still the imported JSX, now split along its feature sections, and one app still serves both the preview and the live page. `HandoffPrototype.jsx` keeps the app shell and the remaining pages. `_components/` holds the feature modules (exchanges, goods, requests, My activity and shared pieces), and `_lib/` the route table, kept forms and the link to the server (`live-link.ts`, typed against the server's own types). `_preview/` holds the preview's own pages, which the live page doesn't download. Type the rest incrementally, preserving the rule checks.
