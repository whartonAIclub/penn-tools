// A made-up student and made-up pastes, so first-time users (and demos) can
// try the tool before typing in their own profile.

import type { RecruitingProfile } from "./scoring.js";

export const SAMPLE_PROFILE: RecruitingProfile = {
  background: `Wharton MBA candidate (WG'27). Five years before business school:
- Business development manager at a mid-size logistics company: built and managed 12 channel partnerships, grew partner revenue 40%.
- Strategy analyst at a regional bank: market sizing and pricing analysis.
Skills: partnership deal structuring, financial modeling, SQL basics. No coding background.
Languages: English, Spanish (professional).
Undergraduate: University of Michigan, economics.`,
  targetRoles: "Strategic partnerships, business development, alliances, platform / ecosystem partnerships",
  companies: [
    { name: "Google", tier: "target" },
    { name: "Microsoft", tier: "target" },
    { name: "Amazon / AWS", tier: "secondary" },
    { name: "Salesforce", tier: "secondary" },
    { name: "Stripe", tier: "practice" },
  ],
  bonusSignals: ["Wharton", "University of Michigan", "Speaks Spanish", "Worked in logistics"],
};

export const SAMPLE_POSTING = `Partner Development Manager, Cloud Marketplace — Microsoft
Redmond, WA (hybrid)

We're looking for a Partner Development Manager to grow our marketplace ecosystem. You'll recruit and onboard ISV partners, build joint go-to-market plans, and own partner revenue targets.

Required: 5+ years in partnerships, business development or alliances; experience negotiating commercial agreements; strong analytical skills.
Preferred: MBA; experience with cloud or SaaS products.

Applications close December 1, 2026.`;

export const SAMPLE_LINKEDIN = `Jordan Rivera
Head of Strategic Partnerships at Google
San Francisco Bay Area

About
I build partnerships that bring Google Cloud to new industries. Previously led business development at a supply chain startup.

Experience
Head of Strategic Partnerships, Google Cloud — 2022–present
Director, Business Development, ShipLogic (logistics software) — 2017–2022

Education
The Wharton School, MBA
Universidad de los Andes, BA Economics

Languages
Spanish (native), English`;
