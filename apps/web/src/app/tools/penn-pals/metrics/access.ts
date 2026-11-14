// Who may see the Penn Pals metrics page in production: the team's emails.
// Empty means nobody, so the numbers stay private until it's filled in. While
// developing locally anyone signed in can see the page (see canViewMetrics).
export const METRICS_VIEWERS: readonly string[] = ["lmarcond@wharton.upenn.edu", "lujua@wharton.upenn.edu"];
