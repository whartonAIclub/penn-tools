// The industry list, exactly as CareerPath's industry filter names them, so the
// downloaded data matches without mapping. "Group: Name" industries are shown
// under their group on the page.
export const INDUSTRIES = [
  "Consulting",
  "Consumer Products: Cannabis",
  "Consumer Products: Food/Beverage",
  "Consumer Products: Other/Diversified Products",
  "Energy",
  "Energy: Oil & Gas",
  "Energy: Power/Utilities",
  "Energy: Renewable/Alternatives",
  "Financial Services: Hedge Funds/Other Investments",
  "Financial Services: Insurance & Diversified Services",
  "Financial Services: Investment Banking/Brokerage",
  "Financial Services: Investment Management",
  "Financial Services: Private Equity/Buyouts/Other",
  "Financial Services: Venture Capital",
  "FinTech",
  "Future Mobility",
  "Health Care: Digital Health",
  "Health Care: Medical Device & Products",
  "Health Care: Pharmaceuticals/Biotechnology",
  "Health Care: Providers/Insurers",
  "Health Care: Services",
  "Legal & Professional Services",
  "Manufacturing: Aerospace & Defense",
  "Manufacturing: Agribusiness",
  "Manufacturing: Automotive & Transp. Equip.",
  "Manufacturing: Chemicals",
  "Manufacturing: Diversified Manufacturing",
  "Manufacturing: International Trade",
  "Manufacturing: Mining/Materials/Construction",
  "Manufacturing: Transportation",
  "Media, Entertainment & Sports: Media & Entertainment",
  "Media, Entertainment & Sports: Sports",
  "Other",
  "Real Estate",
  "Retail",
  "Search Firm",
  "Social Impact: Development Finance/Impact Investing",
  "Social Impact: Education",
  "Social Impact: Environmental Services",
  "Social Impact: Non-Profit/Social Enterprise",
  "Social Impact: Public Sector/Government/Military",
  "Technology",
  "Travel & Hospitality",
] as const;

export type Industry = (typeof INDUSTRIES)[number];

export function isIndustry(value: string): value is Industry {
  return (INDUSTRIES as readonly string[]).includes(value);
}
