// Final exam topic: long-term liabilities (bonds, notes, mortgages, leases and
// contingencies). Historical questions are past ACCT 6130 final exam questions
// adapted to multiple choice, with every number they need stated in the
// question. All are pending review until a team member checks them.

import { PENDING, cr, dr, effectChoices, pendingWithNote, textChoices } from "./build.js";
import type { Topic } from "./types.js";

const S13 = "Session 13: Long-term Debt — Present Value, Notes and Mortgages";
const S14 = "Session 14: Long-term Debt — Bonds";
const S15 = "Session 15: Contingent Liabilities";
const LEASES = "Long-term Liabilities: Leases (on past finals)";
const LEASE_NOTE =
  "Leases appeared on the Fall 2024 and Spring 2025 finals but aren't listed in the Fall 2026 syllabus: confirm they're still covered.";
const INTEREST_NOTE =
  "Confirm in permitted course materials that the course classifies interest paid as an operating cash flow (U.S. GAAP).";

export const longTermLiabilities: Topic = {
  id: "long-term-liabilities",
  title: "Long-term liabilities",
  description: "Bonds, notes, mortgages, leases and contingencies, as tested on the ACCT 6130 final.",
  questions: [
    {
      id: "ltl-01",
      origin: "historical",
      source: "Fall 2025 Final, III.2 (adapted)",
      concept: "Mortgage and bond accounting",
      courseSession: S13,
      difficulty: "medium",
      format: "text",
      prompt:
        "Using the effective-interest method taught in class, which statement is NOT true of BOTH a level-payment mortgage and a bond?",
      choices: textChoices(3, [
        [
          "Interest expense each period is the outstanding balance times the effective (market) rate at issuance.",
          "True for both: interest expense is always the book value of the debt times the true borrowing rate.",
        ],
        [
          "The periodic cash payment stays the same over the life of the debt.",
          "True for both: a mortgage has a level payment and a bond pays the same coupon every period.",
        ],
        [
          "The book value on the balance sheet equals the present value of the remaining payments at the original effective rate.",
          "True for both: book value is the present value of the remaining cash flows, discounted at the rate at issuance.",
        ],
        [
          "Both are amortized to a zero balance by the maturity date.",
          "Not true of a bond: its book value moves toward face value, which is repaid in one lump sum at maturity. Only the mortgage's balance is paid down to zero by its payments.",
        ],
      ]),
      journalEntry: null,
      review: PENDING,
    },
    {
      id: "ltl-02",
      origin: "historical",
      source: "Fall 2024 Final, I.3 (adapted)",
      concept: "Bond interest with discount amortization",
      courseSession: S14,
      difficulty: "hard",
      format: "text",
      prompt:
        "A company issued notes with a face value of $800,000 thousand and a 2.65% coupon paid semiannually. It received $750,000 thousand when the market rate was 3.0% (1.5% per six months). What is the journal entry for the first six months of interest (in $ thousands)?",
      choices: textChoices(1, [
        [
          "Dr. Interest Expense 10,600; Cr. Cash 10,600",
          "This sets interest expense equal to the cash coupon, ignoring the discount. Expense is the book value times the effective rate.",
        ],
        [
          "Dr. Interest Expense 11,250; Cr. Discount on Notes (or Notes Payable) 650; Cr. Cash 10,600",
          "Interest expense = book value × effective rate = $750,000 × 1.5% = $11,250. Cash = face × coupon ÷ 2 = $800,000 × 2.65% ÷ 2 = $10,600. The $650 difference amortizes the discount, raising the notes' book value.",
        ],
        [
          "Dr. Interest Expense 12,000; Cr. Discount on Notes 1,400; Cr. Cash 10,600",
          "This applies the effective rate to the face value ($800,000 × 1.5%). Interest expense uses the amount actually borrowed: the $750,000 book value.",
        ],
        [
          "Dr. Interest Expense 11,250; Dr. Notes Payable 650; Cr. Cash 11,900",
          "The cash paid is fixed by the coupon ($10,600), and a discount is amortized with a credit, not a debit. This treats the notes like a premium.",
        ],
      ]),
      journalEntry: [dr("Interest Expense", 11_250), cr("Discount on Notes Payable", 650), cr("Cash", 10_600)],
      review: PENDING,
    },
    {
      id: "ltl-03",
      origin: "historical",
      source: "Fall 2024 Final, I.4 (adapted)",
      concept: "Book value of a discount bond over time",
      courseSession: S14,
      difficulty: "easy",
      format: "text",
      prompt:
        "A company's senior notes were issued at a discount and are still outstanding. Compared with this year-end, the notes' net book value at next year-end will be:",
      choices: textChoices(2, [
        ["Lower", "The discount is amortized each period, which adds to the book value; it doesn't reduce it."],
        ["The same", "Book value isn't fixed at issuance: amortizing the discount changes it every period."],
        [
          "Higher",
          "Each period, interest expense exceeds the cash coupon and the difference amortizes the discount, so the book value rises toward face value by maturity.",
        ],
        [
          "It depends on how market interest rates change",
          "Book value follows the rate at issuance, not today's market rates. Changes in market rates affect fair value, not book value.",
        ],
      ]),
      journalEntry: null,
      review: PENDING,
    },
    {
      id: "ltl-04",
      origin: "historical",
      source: "Fall 2024 Final, I.5 (adapted)",
      concept: "Zero-coupon notes",
      courseSession: S14,
      difficulty: "hard",
      format: "text",
      prompt:
        "A company issued notes with a coupon below the market rate. Suppose instead it had issued zero-coupon notes with the same face value at the same market rate. Compared with the actual notes, how would these change?",
      choices: textChoices(1, [
        [
          "Proceeds higher; first-year interest expense higher; coupon payment lower",
          "Without coupons, investors receive less cash, so they pay less for the notes, not more.",
        ],
        [
          "Proceeds lower; first-year interest expense lower; coupon payment lower (zero)",
          "With no coupons, the only cash flow is face value at maturity, so the discount is much larger and the proceeds lower. Interest expense = book value × market rate, so a lower book value means lower interest expense. The coupon payment becomes zero.",
        ],
        [
          "Proceeds lower; first-year interest expense higher; coupon payment lower (zero)",
          "Interest expense is the book value times the market rate. With lower proceeds the book value is lower, so interest expense is lower too.",
        ],
        [
          "Proceeds the same; first-year interest expense the same; coupon payment zero",
          "Removing the coupons removes cash flows, so the present value (the proceeds) must fall.",
        ],
      ]),
      journalEntry: null,
      review: PENDING,
    },
    {
      id: "ltl-05",
      origin: "historical",
      source: "Spring 2025 Final, I.2 (adapted)",
      concept: "Gain or loss on early debt retirement",
      courseSession: S14,
      difficulty: "medium",
      format: "text",
      prompt:
        "A company issued $400 million of senior notes at par, so their book value is $400 million. Suppose it redeems them early for $350 million cash. What does it recognize?",
      choices: textChoices(2, [
        ["A $50 million loss", "It paid less than the book value of the debt it extinguished, which produces a gain, not a loss."],
        [
          "No gain or loss: early redemptions never affect income",
          "Retiring debt for an amount different from its book value produces a gain or loss.",
        ],
        [
          "A $50 million gain",
          "It settled a $400 million liability for $350 million cash. Entry: Dr. Senior Notes 400; Cr. Cash 350; Cr. Gain 50.",
        ],
        [
          "A $50 million gain, reported as an operating cash inflow",
          "The gain is correct, but it isn't cash: the $350 million paid is a financing outflow and the gain is subtracted in operating activities.",
        ],
      ]),
      journalEntry: [dr("Senior Notes", 400_000_000), cr("Cash", 350_000_000), cr("Gain on Debt Retirement", 50_000_000)],
      review: PENDING,
    },
    {
      id: "ltl-06",
      origin: "historical",
      source: "Fall 2025 Final, III.4B (adapted)",
      concept: "Gain or loss on early debt retirement",
      courseSession: S14,
      difficulty: "medium",
      format: "text",
      prompt:
        "Notes with a face value of $600 million have a book value of $595 million. If the company repurchases them at their fair value of $700 million, what does it recognize?",
      choices: textChoices(1, [
        [
          "A $105 million gain",
          "It paid more than the book value of the liability removed, which is a loss, not a gain.",
        ],
        [
          "A $105 million loss",
          "It pays $700 million to remove debt carried at $595 million, so it loses the $105 million difference. Only a loss balances the entry: Dr. Notes 595; Dr. Loss 105; Cr. Cash 700.",
        ],
        [
          "A $100 million loss",
          "The gain or loss compares the price paid with the book value ($595 million), not the face value ($600 million).",
        ],
        [
          "No gain or loss; only the cash paid changes",
          "The liability is removed at its book value; any difference from the cash paid is a gain or loss.",
        ],
      ]),
      journalEntry: [dr("Notes Payable", 595), dr("Loss on Debt Retirement", 105), cr("Cash", 700)],
      review: PENDING,
    },
    {
      id: "ltl-07",
      origin: "historical",
      source: "Fall 2024 Final, I.7 (adapted)",
      concept: "Early debt retirement and cash flows",
      courseSession: S14,
      difficulty: "medium",
      format: "text",
      prompt:
        "A company retired debt before maturity and recorded a loss on extinguishment. How did the retirement affect net income and cash flow from operations?",
      choices: textChoices(1, [
        [
          "Net income lower; cash flow from operations lower",
          "The cash paid to retire debt is a financing outflow, so it doesn't reduce operating cash flow.",
        ],
        [
          "Net income lower; cash flow from operations no change",
          "The loss lowers net income. In the indirect method the loss is added back, and all the cash paid is a financing outflow, so operating cash flow is unchanged.",
        ],
        [
          "Net income no change; cash flow from operations lower",
          "A loss on extinguishment is reported on the income statement, so net income falls.",
        ],
        [
          "Net income lower; cash flow from operations higher",
          "Adding back the loss only cancels its effect on net income; it doesn't raise operating cash flow.",
        ],
      ]),
      journalEntry: null,
      review: PENDING,
    },
    {
      id: "ltl-08",
      origin: "historical",
      source: "Fall 2025 Final, III.7 (adapted)",
      concept: "Executory contracts (purchase obligations)",
      courseSession: S15,
      difficulty: "easy",
      format: "text",
      prompt:
        "A company's notes disclose $2,370 million of purchase obligations: signed contracts to buy goods it hasn't received yet. How much of this is a liability on its balance sheet?",
      choices: textChoices(2, [
        ["$2,370 million", "Neither side has performed yet, so there's no liability to record."],
        [
          "Only the part due within the next year",
          "Timing doesn't matter: none of it is recorded until the goods are received.",
        ],
        [
          "$0",
          "Purchase obligations are executory contracts: until the supplier delivers, nothing is owed. They're disclosed in the notes but kept off the balance sheet.",
        ],
        [
          "The present value of the obligations",
          "Present value matters for liabilities that are recorded; an unexecuted contract isn't recorded at all.",
        ],
      ]),
      journalEntry: null,
      review: PENDING,
    },
    {
      id: "ltl-09",
      origin: "historical",
      source: "Spring 2025 Final, I.3 (adapted)",
      concept: "Bond issue price (present value)",
      courseSession: S14,
      difficulty: "hard",
      format: "text",
      prompt:
        "On November 1, 2023, a company issues $400,000 (thousands) of 3.80% senior notes due November 1, 2029, paying interest semiannually, when the market rate is 4.0%. What are the proceeds, in $ thousands?",
      choices: textChoices(1, [
        [
          "$400,000",
          "Notes sell at face value only when the coupon rate equals the market rate. Here the coupon is lower, so they sell at a discount.",
        ],
        [
          "$395,770",
          "Present value with N = 12 half-years, i = 2% per half-year, PMT = $400,000 × 3.8% ÷ 2 = $7,600 and FV = $400,000 gives about $395,770: a discount, since the coupon is below the market rate.",
        ],
        [
          "$395,806",
          "This uses annual periods (N = 6, i = 4%, PMT = $15,200). The notes pay semiannually, so use 12 periods at 2%.",
        ],
        [
          "$404,230",
          "This would be a premium, but a coupon below the market rate means investors pay less than face value, not more.",
        ],
      ]),
      journalEntry: null,
      review: PENDING,
    },
    {
      id: "ltl-10",
      origin: "historical",
      source: "Spring 2025 Final, I.4 (adapted)",
      concept: "Bond interest with discount amortization",
      courseSession: S14,
      difficulty: "medium",
      format: "text",
      prompt:
        "The $400,000 (thousands) of 3.80% semiannual notes were issued for $396,000 when the market rate was 4.0% (2% per half-year). What is the journal entry for the first interest payment six months later (in $ thousands)?",
      choices: textChoices(2, [
        [
          "Dr. Interest Expense 7,600; Cr. Cash 7,600",
          "This ignores the discount: interest expense is the book value times the effective rate, not the coupon.",
        ],
        [
          "Dr. Interest Expense 8,000; Cr. Discount on Notes 400; Cr. Cash 7,600",
          "This applies 2% to the face value. Interest expense uses the book value of $396,000.",
        ],
        [
          "Dr. Interest Expense 7,920; Cr. Discount on Notes (or Notes) 320; Cr. Cash 7,600",
          "Interest expense = $396,000 × 2% = $7,920. Cash = $400,000 × 3.8% ÷ 2 = $7,600. The $320 difference amortizes the discount.",
        ],
        [
          "Dr. Interest Expense 15,840; Cr. Discount on Notes 640; Cr. Cash 15,200",
          "These are a full year's amounts. Interest is paid every six months, so each entry covers half a year.",
        ],
      ]),
      journalEntry: [dr("Interest Expense", 7_920), cr("Discount on Notes Payable", 320), cr("Cash", 7_600)],
      review: PENDING,
    },
    {
      id: "ltl-11",
      origin: "original",
      source: "Variation of Spring 2025 Final, I.3",
      concept: "Issuing bonds at a premium",
      courseSession: S14,
      difficulty: "medium",
      format: "effects",
      prompt:
        "A company issues $1,000,000 face value of 5-year bonds with a 6% coupon paid semiannually, when the market rate is 5%. It receives $1,043,760 cash. What is the effect of the issuance?",
      choices: effectChoices(0, [
        [
          [1_043_760, 1_043_760, 0, 0],
          "Cash rises by the amount received and the bonds are recorded at that amount (face plus premium). Borrowing is a financing cash flow, so operating cash flow is unaffected.",
        ],
        [
          [1_043_760, 1_000_000, 43_760, 0],
          "A premium isn't a gain. It's part of the liability, amortized over the bonds' life as a reduction of interest expense.",
        ],
        [
          [1_043_760, 1_043_760, 0, 1_043_760],
          "Cash from borrowing is a financing inflow, not an operating one.",
        ],
        [
          [1_000_000, 1_000_000, 0, 0],
          "This records only the face value, but the company received $1,043,760 in cash.",
        ],
      ]),
      journalEntry: [dr("Cash", 1_043_760), cr("Bonds Payable", 1_043_760)],
      review: PENDING,
    },
    {
      id: "ltl-12",
      origin: "original",
      source: null,
      concept: "Bond interest with premium amortization",
      courseSession: S14,
      difficulty: "hard",
      format: "effects",
      prompt:
        "The bonds above (book value $1,043,760; market rate 5%, so 2.5% per half-year; coupon $30,000 per half-year) make their first interest payment. Interest expense is rounded to $26,094. What is the effect of the payment?",
      choices: effectChoices(1, [
        [
          [-30_000, 0, -30_000, -30_000],
          "This expenses the full coupon. With a premium, interest expense is less than the cash paid, because part of the payment reduces the liability.",
        ],
        [
          [-30_000, -3_906, -26_094, -30_000],
          "Interest expense = $1,043,760 × 2.5% = $26,094, which lowers equity. Cash paid is $30,000. The $3,906 difference amortizes the premium, reducing the bonds' book value. Interest paid is an operating cash outflow.",
        ],
        [
          [-30_000, 3_906, -33_906, -30_000],
          "This treats the bonds like a discount (expense above the coupon). These were issued at a premium.",
        ],
        [
          [-30_000, -3_906, -26_094, 0],
          "The balance-sheet effects are right, but interest paid is an operating cash outflow under U.S. GAAP, not a financing one.",
        ],
      ]),
      journalEntry: [dr("Interest Expense", 26_094), dr("Bonds Payable", 3_906), cr("Cash", 30_000)],
      review: pendingWithNote(INTEREST_NOTE),
    },
    {
      id: "ltl-13",
      origin: "original",
      source: null,
      concept: "Bond discounts and premiums",
      courseSession: S14,
      difficulty: "easy",
      format: "text",
      prompt: "A bond's coupon rate is 4% and the market rate at issuance is 5%. Which is true over the bond's life?",
      choices: textChoices(1, [
        [
          "It is issued at a premium, and its book value falls toward face value.",
          "A coupon below the market rate makes the bond less attractive, so it sells below face: a discount, not a premium.",
        ],
        [
          "It is issued at a discount; interest expense exceeds the cash coupon each period, and book value rises toward face value.",
          "Investors pay less than face to earn the 5% market rate. Interest expense (book value × 5%) exceeds the 4% coupon, and the difference amortizes the discount until book value reaches face value.",
        ],
        [
          "It is issued at a discount, and interest expense is less than the cash coupon.",
          "With a discount, interest expense is higher than the coupon, not lower; that's how the discount is amortized.",
        ],
        [
          "It is issued at par, and interest expense equals the coupon.",
          "That happens only when the coupon rate equals the market rate.",
        ],
      ]),
      journalEntry: null,
      review: PENDING,
    },
    {
      id: "ltl-14",
      origin: "original",
      source: null,
      concept: "Mortgage amortization",
      courseSession: S13,
      difficulty: "hard",
      format: "text",
      prompt:
        "A company borrows $200,000 on a 6% mortgage repaid in 3 equal annual payments of $74,822. What is the mortgage balance right after the first payment?",
      choices: textChoices(1, [
        [
          "$133,333",
          "This assumes equal principal repayments ($200,000 ÷ 3). With level payments, part of each payment is interest, so less principal is repaid at first.",
        ],
        [
          "$137,178",
          "Interest for year 1 = $200,000 × 6% = $12,000. Principal repaid = $74,822 − $12,000 = $62,822. New balance = $200,000 − $62,822 = $137,178.",
        ],
        [
          "$125,178",
          "This subtracts the whole payment from the balance. The $12,000 of interest is an expense; it doesn't reduce the principal.",
        ],
        [
          "$188,000",
          "This subtracts only the interest. The interest is the part of the payment that does not reduce the balance.",
        ],
      ]),
      journalEntry: [dr("Interest Expense", 12_000), dr("Mortgage Payable", 62_822), cr("Cash", 74_822)],
      review: PENDING,
    },
    {
      id: "ltl-15",
      origin: "original",
      source: null,
      concept: "Mortgage amortization",
      courseSession: S13,
      difficulty: "easy",
      format: "text",
      prompt: "Over the life of a level-payment mortgage, how do the interest and principal parts of each payment change?",
      choices: textChoices(0, [
        [
          "The interest part falls and the principal part rises.",
          "Interest is the outstanding balance times the rate. As the balance is paid down, interest falls, so more of each (unchanged) payment repays principal.",
        ],
        ["Both stay the same every period.", "Only the total payment is constant; its split changes as the balance shrinks."],
        [
          "The interest part rises and the principal part falls.",
          "The balance falls over time, so the interest on it falls, not rises.",
        ],
        [
          "The interest part is constant and the principal part rises.",
          "Interest depends on the balance, which shrinks, so interest can't stay constant.",
        ],
      ]),
      journalEntry: null,
      review: PENDING,
    },
    {
      id: "ltl-16",
      origin: "historical",
      source: "Fall 2025 Final, III.4A (adapted)",
      concept: "Fair value versus book value of debt",
      courseSession: S14,
      difficulty: "medium",
      format: "text",
      prompt:
        "A company's notes have a book value of $595 million. Their fair value today is $700 million. How has the market interest rate changed since the notes were issued?",
      choices: textChoices(1, [
        [
          "It increased",
          "When market rates rise, the present value of the fixed payments falls, so fair value would be below book value.",
        ],
        [
          "It decreased",
          "Fair value is the present value of the remaining payments at today's rate; book value uses the rate at issuance. A fair value above book value means today's rate is lower.",
        ],
        ["It didn't change", "If the rate hadn't changed, fair value would be close to book value."],
        [
          "It can't be told from book and fair value",
          "It can: the gap between them comes from the change in market rates since issuance.",
        ],
      ]),
      journalEntry: null,
      review: PENDING,
    },
    {
      id: "ltl-17",
      origin: "original",
      source: null,
      concept: "Accruing a contingent liability",
      courseSession: S15,
      difficulty: "medium",
      format: "effects",
      prompt:
        "A company is being sued. Its lawyers say a loss is probable and can reasonably be estimated at $2,000,000. Nothing has been paid. What is the effect of recording the contingency?",
      choices: effectChoices(0, [
        [
          [0, 2_000_000, -2_000_000, 0],
          "A probable and estimable loss is accrued: a liability rises and a loss (expense) lowers equity. No cash is paid yet, so operating cash flow is unaffected.",
        ],
        [
          [0, 0, 0, 0],
          "Disclosure alone is for losses that are only reasonably possible, or can't be estimated. This one is probable and estimable.",
        ],
        [
          [-2_000_000, 0, -2_000_000, -2_000_000],
          "This records a cash payment. The lawsuit hasn't been settled, so no cash has left yet.",
        ],
        [
          [0, 2_000_000, -2_000_000, -2_000_000],
          "The liability and loss are right, but no cash moved, so operating cash flow doesn't change (the loss is added back).",
        ],
      ]),
      journalEntry: [dr("Loss from Litigation", 2_000_000), cr("Contingent Liability", 2_000_000)],
      review: PENDING,
    },
    {
      id: "ltl-18",
      origin: "original",
      source: null,
      concept: "Contingent liabilities: when to accrue",
      courseSession: S15,
      difficulty: "easy",
      format: "text",
      prompt:
        "A loss from a lawsuit is reasonably possible, but not probable, and could be about $5 million. How should the company account for it?",
      choices: textChoices(1, [
        ["Accrue a $5 million liability and loss", "Accrual requires the loss to be probable as well as estimable."],
        [
          "Disclose it in the notes, without recording a liability",
          "A reasonably possible loss is disclosed so readers know about it, but it isn't recorded on the balance sheet.",
        ],
        [
          "Ignore it entirely",
          "Only remote losses can be left out. A reasonably possible loss must be disclosed.",
        ],
        ["Accrue half of it, $2.5 million", "There's no partial accrual based on likelihood."],
      ]),
      journalEntry: null,
      review: PENDING,
    },
    {
      id: "ltl-19",
      origin: "historical",
      source: "Fall 2024 Final, I.11 (adapted)",
      concept: "Contingent liabilities: when to accrue",
      courseSession: S15,
      difficulty: "medium",
      format: "text",
      prompt:
        "A company has been sued by a state government over a warehouse incident. Its notes say losses are likely, but that it is \"unable to estimate the amount of additional incremental loss, if any.\" Why does it record no liability for this complaint?",
      choices: textChoices(1, [
        ["The loss is not probable", "The company says losses are likely; what's missing is an estimate."],
        [
          "The loss cannot reasonably be estimated",
          "Accrual needs a loss that is both probable and reasonably estimable. Without an estimate, the company discloses the matter but records no liability.",
        ],
        [
          "The company has filed a motion to dismiss",
          "Filing a motion doesn't change whether a loss is probable and estimable.",
        ],
        [
          "It already accrued enough for the incident",
          "The note says it can't estimate the additional loss, not that earlier accruals cover it.",
        ],
      ]),
      journalEntry: null,
      review: PENDING,
    },
    {
      id: "ltl-20",
      origin: "original",
      source: null,
      concept: "Contingent liabilities: estimating the amount",
      courseSession: S15,
      difficulty: "medium",
      format: "text",
      prompt:
        "A loss is probable, and the company estimates it will be between $3 million and $7 million, with no amount in the range more likely than another. What does it accrue under U.S. GAAP?",
      choices: textChoices(0, [
        [
          "$3 million, the low end of the range, and disclose the possible additional loss",
          "When no amount in the range is a better estimate than the others, U.S. GAAP accrues the minimum and discloses that the loss could be higher.",
        ],
        ["$5 million, the midpoint", "U.S. GAAP uses the minimum when no estimate in the range is better, not the midpoint."],
        ["$7 million, the high end, to be conservative", "U.S. GAAP doesn't call for accruing the maximum."],
        ["Nothing, because the amount is uncertain", "A range is a reasonable estimate, so the loss must be accrued."],
      ]),
      journalEntry: [dr("Loss from Litigation", 3_000_000), cr("Contingent Liability", 3_000_000)],
      review: pendingWithNote("Confirm the course covers the \"accrue the minimum of a range\" rule before approving."),
    },
    {
      id: "ltl-21",
      origin: "historical",
      source: "Fall 2024 Final, I.9 (adapted)",
      concept: "Leases on the balance sheet",
      courseSession: LEASES,
      difficulty: "easy",
      format: "text",
      prompt:
        "A retailer leases most of its stores under operating leases and owns none of them. Do these stores appear as assets on its balance sheet?",
      choices: textChoices(1, [
        ["No: only property a company owns is an asset", "Under current rules, leases also create assets the company controls."],
        [
          "Yes: it records right-of-use assets for its leases",
          "Both operating and finance leases require a right-of-use asset (and a lease liability) on the balance sheet.",
        ],
        [
          "Yes, but only for finance leases",
          "Operating leases also put a right-of-use asset on the balance sheet. The lease type changes how the cost appears on the income statement.",
        ],
        [
          "No: lease payments are expensed and only disclosed",
          "That was the old treatment of operating leases; today they're on the balance sheet.",
        ],
      ]),
      journalEntry: null,
      review: pendingWithNote(LEASE_NOTE),
    },
    {
      id: "ltl-22",
      origin: "original",
      source: null,
      concept: "Recording a lease",
      courseSession: LEASES,
      difficulty: "medium",
      format: "effects",
      prompt:
        "A company signs a 5-year operating lease for a warehouse. The present value of the lease payments is $400,000, and the first payment isn't due until next month. What is the effect of signing the lease?",
      choices: effectChoices(0, [
        [
          [400_000, 400_000, 0, 0],
          "The company records a right-of-use asset and a lease liability, both at the present value of the payments. No expense and no cash yet.",
        ],
        [
          [0, 0, 0, 0],
          "Leases longer than 12 months are recorded on the balance sheet, even operating leases.",
        ],
        [
          [400_000, 0, 400_000, 0],
          "Signing a lease creates an obligation to pay, not equity.",
        ],
        [
          [-400_000, 0, -400_000, -400_000],
          "This expenses the whole lease and records it as paid. Nothing has been paid yet, and the cost is spread over the lease term.",
        ],
      ]),
      journalEntry: [dr("Right-of-Use Asset", 400_000), cr("Lease Liability", 400_000)],
      review: pendingWithNote(LEASE_NOTE),
    },
    {
      id: "ltl-23",
      origin: "original",
      source: null,
      concept: "Current portion of long-term debt",
      courseSession: S13,
      difficulty: "easy",
      format: "text",
      prompt:
        "A company has a 10-year note payable. $50,000 of its principal is due within the next 12 months. How does the balance sheet show the note?",
      choices: textChoices(1, [
        ["All of it as long-term until it's paid", "Any amount due within a year is a current liability."],
        [
          "$50,000 as the current portion of long-term debt; the rest as long-term",
          "The part due within the next year is classified as current, so readers can see what must be repaid soon. The rest stays long-term.",
        ],
        ["All of it as current", "Only the amount due within a year is current."],
        ["Only in the notes", "The note is a recorded liability; it's on the balance sheet."],
      ]),
      journalEntry: null,
      review: PENDING,
    },
    {
      id: "ltl-24",
      origin: "original",
      source: "Variation of Fall 2024 Final, I.5",
      concept: "Zero-coupon notes",
      courseSession: S14,
      difficulty: "hard",
      format: "effects",
      prompt:
        "A company issues a 5-year, $100,000 zero-coupon note when the market rate is 8%, receiving $68,058. What is the effect of recording the first year's interest at year-end (rounded to $5,445)?",
      choices: effectChoices(1, [
        [
          [0, 0, 0, 0],
          "No cash is paid, but interest still accrues: the note's book value grows toward $100,000 through interest expense.",
        ],
        [
          [0, 5_445, -5_445, 0],
          "Interest expense = $68,058 × 8% ≈ $5,445. It's added to the note's book value (no cash paid), so liabilities rise and equity falls. No cash flow.",
        ],
        [
          [-5_445, 0, -5_445, -5_445],
          "A zero-coupon note pays no interest in cash until maturity.",
        ],
        [
          [0, 8_000, -8_000, 0],
          "This applies 8% to the face value. Interest is the book value ($68,058) times the market rate.",
        ],
      ]),
      journalEntry: [dr("Interest Expense", 5_445), cr("Notes Payable", 5_445)],
      review: PENDING,
    },
    {
      id: "ltl-25",
      origin: "original",
      source: "Variation of Fall 2024 Final, I.7",
      concept: "Early debt retirement and cash flows",
      courseSession: S14,
      difficulty: "medium",
      format: "text",
      prompt:
        "A company repurchases its bonds early for $520,000 cash. Their book value was $500,000. How does this appear on the statement of cash flows (indirect method)?",
      choices: textChoices(1, [
        ["A $520,000 operating outflow", "Repaying debt is a financing activity, not operating."],
        [
          "A $520,000 financing outflow, with the $20,000 loss added back in operating activities",
          "All the cash paid to retire debt is financing. The $20,000 loss reduced net income but used no operating cash, so it's added back.",
        ],
        [
          "A $500,000 financing outflow and a $20,000 operating outflow",
          "The course puts all the cash paid to retire debt in financing; the loss isn't an operating cash flow.",
        ],
        ["A $520,000 investing outflow", "Repaying your own debt is financing; investing is for buying or selling assets."],
      ]),
      journalEntry: [dr("Bonds Payable", 500_000), dr("Loss on Debt Retirement", 20_000), cr("Cash", 520_000)],
      review: PENDING,
    },
  ],
};
