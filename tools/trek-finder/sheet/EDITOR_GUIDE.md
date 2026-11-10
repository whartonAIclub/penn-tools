# Trek Finder: guide for Sheet editors

Trek Finder's trips come from one Google Sheet, with **one tab and one row per trip**. You don't need any technical
knowledge to edit it, but the Sheet has to be filled in exactly as described here, or a trip will be skipped.

## Setting up the Sheet

You only do this once.

1. In Google Sheets, go to **File > Import > Upload** and choose `trek-finder-template.csv`.
2. Select the whole Sheet and choose **Format > Number > Plain text**. This stops Google changing how dates and times are
   written, which would make the import skip those trips.
3. Go to **File > Share > Publish to web**, pick the tab and **Comma-separated values (.csv)**, and publish.
4. Send the link it gives you to the Trek Finder developers.

> **Publishing makes the Sheet's contents public.** Anyone with that link can read every cell, so use club or program email
> addresses, not personal ones, and keep private notes somewhere else.

## How your edits reach the site

- Changes appear **the next time PennTools is deployed**, not the moment you type them.
- After a deploy, open `/tools/trek-finder/status` on the PennTools site. It shows what loaded and lists any rows that were
  skipped, with the reason. Fix those rows, and they'll load at the next deploy.
- If a row has a problem, only that trip is skipped. The others still load.
- If the Sheet looks empty, or has fewer than half the trips currently listed, the import stops and the site stays as it
  was. The status page will say so.

## Rules that matter most

1. **Never change a trip's ID once it's on the site.** Students' saved trips are attached to it.
2. **Each year's trip is a new row with a new ID**, such as `japan-trek-2028`. Keep last year's row until the new one is up.
3. **Removing a row hides the trip from the catalog.** Students who saved it will see it marked "No longer listed".
4. **Don't rename the column headers** or leave the first row out.
5. **Write dates as `YYYY-MM-DD`**, such as `2027-03-06`.
6. **Capital letters don't matter** in columns with a fixed list of choices, such as Trip type, Region, Timing, Academic
   credit or Availability. `club/other trek` works the same as `Club/Other Trek`, but the spelling must match.

## The columns

**Bold** columns are required on every row. Anything else can be left blank.

### About the trip

| Column | What to enter | Example |
|---|---|---|
| **ID** | Lowercase words joined by hyphens, ending in the year. Unique to this trip. | `japan-trek-2027` |
| **Name** | The trip's name | `Japan Trek` |
| **Trip type** | One of: `GIP`, `GMC`, `Leadership Venture`, `Club/Other Trek` | `Club/Other Trek` |
| **Location** | Country or countries, as students should see them | `Italy & France` |
| Cities | Separated by semicolons | `Tokyo; Kyoto; Osaka` |
| **Region** | One of: `Africa`, `Asia`, `Europe`, `Middle East`, `North America`, `Oceania`, `South America` | `Asia` |
| **Start date** | First day of the trip | `2027-03-06` |
| **End date** | Last day of the trip | `2027-03-14` |
| **Timing** | One of: `break`, `opportunity_week`, `other`. Students can't see or filter by it, but a trip with this blank or misspelled won't import. | `break` |
| Period label | The break or term, in words. Only shown on the trip card; the season filter uses the start date. | `Spring Break 2027` |
| Academic credit | `Yes` or `No`. Blank counts as `No`. | `Yes` |
| Credit note | Details of the credit | `1.0 CU, MGMT 893` |
| Description | 1–2 sentences on what the trip is about. Shown on the trip card and searched by the catalog. | `Bullet train across three cities with temples, food tours and a night in a ryokan.` |
| Price includes | Shown when students select the ⓘ next to the price | `Hotels + ground transport; excludes flights` |
| Destination blurb | Shown on the back of the card, **300 characters at most**. Blank means the card doesn't flip. | |
| Itinerary | Day-by-day plan, as text | |
| Availability | One of: `open`, `limited`, `waitlist`, `full`. Blank means unknown. | `limited` |

### Who runs it and where to apply

| Column | What to enter | Example |
|---|---|---|
| **Organizer name** | The club or department running it | `Wharton Asia Club` |
| Organizer contact | A person's name | `Alex Example` |
| Organizer email | Use a club address, since the Sheet is public | `treks@example.edu` |
| Application URL | Full link, starting with `https://` | |
| Image URL | Full link to the card's photo | |
| Image credit | The credit its license requires: author and license name | `Photo by A. Example, CC BY 2.0` |

### Prices: up to 3 per trip

Each price uses six columns, from `Price 1 label` through `Price 1 note`, then `Price 2 label`, and so on. Use them in order
and leave the unused ones blank.

| Column | What to enter | Example |
|---|---|---|
| Price *n* label | Required if you fill in anything else for this price | `Early bird` |
| Price *n* amount | Whole US dollars, with no `$` or commas. Blank shows as "TBD". | `4500` |
| Price *n* certainty | `estimate` or `confirmed`. Blank counts as `estimate`. | `confirmed` |
| Price *n* from | First date this price applies. Blank means no start date. | `2026-11-01` |
| Price *n* until | Last date this price applies. Blank means no end date. | `2026-12-15` |
| Price *n* note | Anything extra | |

There are two ways to use prices. **Pick one per trip, because mixing them can leave a trip with no price showing.**

- **Prices that change by date** (early bird, then regular): fill in *from* and *until* on each, with no gaps between
  them. If today falls in a gap, no current price is shown.

  | | Label | Amount | Certainty | From | Until |
  |---|---|---|---|---|---|
  | Price 1 | Early bird | 4500 | confirmed | | 2026-12-15 |
  | Price 2 | Regular | 5000 | confirmed | 2026-12-16 | |

- **An estimate that gets confirmed later:** leave *from* and *until* blank on all of them. The site shows the
  highest-numbered price, so add the confirmed price as the next one.

  | | Label | Amount | Certainty | From | Until |
  |---|---|---|---|---|---|
  | Price 1 | Preliminary estimate | 4000 | estimate | | |
  | Price 2 | Confirmed | 4300 | confirmed | | |

### Deadlines: up to 4 per trip

Each deadline uses four columns, from `Deadline 1 kind` through `Deadline 1 time`. Use them in order.

| Column | What to enter | Example |
|---|---|---|
| Deadline *n* kind | One of: `preliminary`, `application`, `deposit`, `payment`, `other` | `deposit` |
| Deadline *n* label | Shown to students exactly as written | `Deposit due` |
| Deadline *n* date | The date it's due | `2027-01-15` |
| Deadline *n* time | Optional, Eastern time, 24-hour clock. Blank means end of day. | `17:00` |

If you use a deadline, its kind, label and date are all required.

**A trip can have only one `preliminary` deadline.** Once that date has passed, the trip is greyed out and students are told
to contact the organizer, so make sure the organizer contact details are filled in.

### Other links: up to 3 per trip

| Column | What to enter | Example |
|---|---|---|
| Link *n* label | Text of the link. Required if there's a URL. | `Info session recording` |
| Link *n* url | Full link. Required if there's a label. | |

### For later: optional for now

These are at the far right of the Sheet and can stay blank. They're for features that aren't built yet.

| Column | What to enter | Example |
|---|---|---|
| Destination airport | Three-letter airport code, in capitals | `NRT` |
| Spots total | Whole number | `40` |
| Spots remaining | Whole number, no more than Spots total | `12` |

## If you run out of columns

If a trip needs more than 3 prices, 4 deadlines or 3 links, ask the Trek Finder developers to add columns. It's a quick change.
