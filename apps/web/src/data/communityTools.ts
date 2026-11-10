// Community tools shown in the site sidebar and on the dashboard.
//
// These are apps built by Penn students that live outside this repo, so they
// link out. Tools in the monorepo (tools/*) come from the tool registry, each
// in the category its manifest names.

import type { ToolCategory } from "@penntools/core/tools";

export interface CommunityTool {
  id: string;
  title: string;
  description: string;
  category: ToolCategory;
  builder: string;
  url: string;
}

export const communityTools: CommunityTool[] = [
  {
    id: "quakercal",
    title: "QuakerCal",
    description:
      "Turn your Wharton MBA Current Enrollment screenshots into a calendar file, with quarter dates, breaks and schedule-switch days handled for you.",
    category: "Academics",
    builder: "Jiaqi Song",
    url: "https://quakercal.vercel.app/",
  },
  {
    id: "roic-tree-generator",
    title: "ROIC Tree Generator",
    description: "Break down a company's return on invested capital (ROIC) into its component drivers.",
    category: "Academics",
    builder: "Itay Zitvar",
    url: "https://roic-tree-generator.vercel.app/",
  },
  {
    id: "mbakit",
    title: "The MBA Toolkit",
    description:
      "Free AI tools for cold emails, thank-you notes, resume bullets, STAR stories and coffee chat prep. No sign-up required.",
    category: "Recruiting",
    builder: "Vatsal Khemani",
    url: "https://mbakit.vercel.app/",
  },
  {
    id: "mba-tech-internships",
    title: "MBA Tech Internships",
    description:
      "A curated list of Summer 2027 MBA internships in tech across product management, strategy, product marketing and finance.",
    category: "Recruiting",
    builder: "Trevor Dohm",
    url: "https://github.com/TrevorDohm/MBA-Tech-Internships-2027",
  },
  {
    id: "pm-zero-to-one",
    title: "PM Zero to One",
    description:
      "Learn the craft of product management, from problem framing and discovery to metrics and GTM, with interview frameworks and worked examples.",
    category: "Recruiting",
    builder: "Vatsal Khemani",
    url: "https://pmzerotoone.netlify.app/",
  },
  {
    id: "defluffer",
    title: "Defluffer",
    description: "A browser extension that condenses verbose LinkedIn posts into a single line.",
    category: "Productivity",
    builder: "Itay Zitvar",
    url: "https://itayzit.github.io/defluffer/",
  },
  {
    id: "thankyougpt",
    title: "ThankYouGPT",
    description: "Thank-you emails, reach-outs and everything else you need for MBA networking.",
    category: "Productivity",
    builder: "Itay Zitvar, Jonathan Schwartz",
    url: "https://thank-you-gpt.com",
  },
  {
    id: "stactab",
    title: "StacTab",
    description:
      "A Chrome extension that groups tabs by domain, sleeps inactive tabs, removes duplicates and archives sessions to a searchable vault.",
    category: "Productivity",
    builder: "Manan Sharma",
    url: "https://chromewebstore.google.com/detail/stactab/hdfcdcoogjkdogmnhhopkekanpldoefh",
  },
  {
    id: "ai-compass",
    title: "AI Compass",
    description:
      "Describe your AI use case, get ranked model recommendations with cost estimates and tradeoffs across 62 models from 29 providers.",
    category: "Productivity",
    builder: "Akshit Kalra",
    url: "https://akshitkalra.com/aicompass",
  },
];
