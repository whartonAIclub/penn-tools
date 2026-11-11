// Topic 1: how transactions affect the financial statements.
//
// Original questions written for this tool. They test concepts taught in
// ACCT 6130 but are not copied from any exam or course document. All are
// pending review until a team member checks them against the course materials.

import type { Review, Topic } from "./types.js";

const PENDING: Review = { status: "pending", reviewer: null, reviewedOn: null, note: null };

export const transactionEffects: Topic = {
  id: "transaction-effects",
  title: "How transactions affect the financial statements",
  description:
    "Work out what a transaction does to assets, liabilities, equity and cash from operations.",
  questions: [
    {
      id: "te-01",
      origin: "original",
      source: null,
      concept: "Unearned revenue",
      courseSession: "Session 4: Revenue Recognition",
      difficulty: "medium",
      format: "effects",
      prompt:
        "On November 15, Brightline Software received $24,000 cash for a 12-month subscription starting December 1, and recorded it correctly. On December 31 (its year-end), Brightline records the revenue earned in December. What is the effect of the December 31 entry?",
      choices: [
        {
          label: "A",
          text: null,
          effects: { assets: 2_000, liabilities: 0, equity: 2_000, operatingCashFlow: 2_000 },
          correct: false,
          explanation:
            "This treats the revenue as cash received today. The cash arrived in November, when Brightline recorded unearned revenue.",
        },
        {
          label: "B",
          text: null,
          effects: { assets: 0, liabilities: -2_000, equity: 2_000, operatingCashFlow: 0 },
          correct: true,
          explanation:
            "One of the 12 months has been delivered ($24,000 ÷ 12 = $2,000). The obligation to deliver (unearned revenue, a liability) falls, and the revenue raises equity. The cash came in back in November, so cash isn't affected now.",
        },
        {
          label: "C",
          text: null,
          effects: { assets: 0, liabilities: -24_000, equity: 24_000, operatingCashFlow: 0 },
          correct: false,
          explanation: "Only one month of the 12-month subscription has been delivered, not the whole year.",
        },
        {
          label: "D",
          text: null,
          effects: { assets: 0, liabilities: 0, equity: 0, operatingCashFlow: 0 },
          correct: false,
          explanation:
            "This is cash-basis thinking. Revenue isn't earned when cash is received; it's recognized as the service is delivered.",
        },
      ],
      journalEntry: [
        { side: "debit", account: "Unearned Revenue", amount: 2_000 },
        { side: "credit", account: "Revenue", amount: 2_000 },
      ],
      review: PENDING,
    },
    {
      id: "te-02",
      origin: "original",
      source: null,
      concept: "Allowance method: write-offs",
      courseSession: "Session 8: Accounts Receivable",
      difficulty: "medium",
      format: "effects",
      prompt:
        "Harbor Supply uses the allowance method. On March 15, it learns that a customer who owes $8,000 has gone bankrupt and writes off the account. The allowance had a $20,000 balance before the write-off. What is the effect of the write-off?",
      choices: [
        {
          label: "A",
          text: null,
          effects: { assets: -8_000, liabilities: 0, equity: -8_000, operatingCashFlow: 0 },
          correct: false,
          explanation:
            "That's the effect of recording bad debt expense (the estimate), not of the write-off. The expense was recorded earlier, when the allowance was set up.",
        },
        {
          label: "B",
          text: null,
          effects: { assets: -8_000, liabilities: -8_000, equity: 0, operatingCashFlow: 0 },
          correct: false,
          explanation:
            "The allowance for doubtful accounts is a contra-asset (it reduces receivables), not a liability.",
        },
        {
          label: "C",
          text: null,
          effects: { assets: 0, liabilities: 0, equity: 0, operatingCashFlow: 0 },
          correct: true,
          explanation:
            "Gross receivables and the allowance both fall by $8,000, so net receivables don't change. There's no new expense (it was recorded when bad debts were estimated) and no cash moves.",
        },
        {
          label: "D",
          text: null,
          effects: { assets: -8_000, liabilities: 0, equity: -8_000, operatingCashFlow: -8_000 },
          correct: false,
          explanation: "No cash moves in a write-off, and the write-off itself creates no expense.",
        },
      ],
      journalEntry: [
        { side: "debit", account: "Allowance for Doubtful Accounts", amount: 8_000 },
        { side: "credit", account: "Accounts Receivable", amount: 8_000 },
      ],
      review: PENDING,
    },
    {
      id: "te-03",
      origin: "original",
      source: null,
      concept: "Selling equipment: gains, losses and cash flow classification",
      courseSession: "Session 10: Long-lived Assets (PP&E); Sessions 5–6: Statement of Cash Flows",
      difficulty: "hard",
      format: "effects",
      prompt:
        "Delmar Manufacturing sells a machine for $12,000 cash. The machine originally cost $50,000 and had $35,000 of accumulated depreciation at the date of sale. What is the effect of the sale?",
      choices: [
        {
          label: "A",
          text: null,
          effects: { assets: -3_000, liabilities: 0, equity: -3_000, operatingCashFlow: 0 },
          correct: true,
          explanation:
            "Book value is $50,000 − $35,000 = $15,000. Cash rises $12,000 and the machine's $15,000 book value is removed, so assets fall $3,000. The $3,000 loss lowers net income, so equity falls. The $12,000 is an investing inflow, and the loss is added back in operating activities, so cash from operations doesn't change.",
        },
        {
          label: "B",
          text: null,
          effects: { assets: 12_000, liabilities: 0, equity: 12_000, operatingCashFlow: 12_000 },
          correct: false,
          explanation:
            "This treats the sale proceeds as revenue. Selling equipment isn't the company's normal business, so only the gain or loss affects income, and the proceeds are an investing cash flow.",
        },
        {
          label: "C",
          text: null,
          effects: { assets: -3_000, liabilities: 0, equity: -3_000, operatingCashFlow: -3_000 },
          correct: false,
          explanation:
            "The loss uses no cash. It's added back to net income when calculating cash from operations.",
        },
        {
          label: "D",
          text: null,
          effects: { assets: -15_000, liabilities: 0, equity: -15_000, operatingCashFlow: 12_000 },
          correct: false,
          explanation:
            "This ignores the $12,000 of cash received, and puts the proceeds in operating activities instead of investing.",
        },
      ],
      journalEntry: [
        { side: "debit", account: "Cash", amount: 12_000 },
        { side: "debit", account: "Accumulated Depreciation", amount: 35_000 },
        { side: "debit", account: "Loss on Sale of Equipment", amount: 3_000 },
        { side: "credit", account: "Equipment", amount: 50_000 },
      ],
      review: PENDING,
    },
    {
      id: "te-04",
      origin: "original",
      source: null,
      concept: "Accrued interest",
      courseSession: "Session 13: Long-term Debt (Notes)",
      difficulty: "medium",
      format: "effects",
      prompt:
        "On October 1, Ridgeway Co. borrows $200,000 on a 2-year note at 6% annual interest. Interest is paid every April 1 and October 1. Ridgeway's fiscal year ends December 31. What is the effect of the December 31 adjusting entry?",
      choices: [
        {
          label: "A",
          text: null,
          effects: { assets: 0, liabilities: 0, equity: 0, operatingCashFlow: 0 },
          correct: false,
          explanation:
            "Under accrual accounting, an expense is recorded when it's incurred, not when it's paid. Three months of interest have built up.",
        },
        {
          label: "B",
          text: null,
          effects: { assets: -3_000, liabilities: 0, equity: -3_000, operatingCashFlow: -3_000 },
          correct: false,
          explanation: "No cash has been paid yet. The first interest payment is on April 1.",
        },
        {
          label: "C",
          text: null,
          effects: { assets: 0, liabilities: 12_000, equity: -12_000, operatingCashFlow: 0 },
          correct: false,
          explanation: "$12,000 is a full year's interest, but only 3 months have passed.",
        },
        {
          label: "D",
          text: null,
          effects: { assets: 0, liabilities: 3_000, equity: -3_000, operatingCashFlow: 0 },
          correct: true,
          explanation:
            "Three months of interest have built up: $200,000 × 6% × 3/12 = $3,000. Ridgeway owes it (a liability rises) and has used the borrowed money, so it records interest expense (equity falls). No cash is paid until April.",
        },
      ],
      journalEntry: [
        { side: "debit", account: "Interest Expense", amount: 3_000 },
        { side: "credit", account: "Interest Payable", amount: 3_000 },
      ],
      review: PENDING,
    },
    {
      id: "te-05",
      origin: "original",
      source: null,
      concept: "Paying interest: operating or financing cash flow",
      courseSession: "Session 13: Long-term Debt (Notes); Sessions 5–6: Statement of Cash Flows",
      difficulty: "hard",
      format: "effects",
      prompt:
        "Ridgeway Co. has a $200,000, 6% note with interest paid every April 1 and October 1. At December 31 it recorded $3,000 of interest payable, and it made no other interest entries before April 1, when it pays the $6,000 of interest due. What is the effect of the April 1 entry?",
      choices: [
        {
          label: "A",
          text: null,
          effects: { assets: -6_000, liabilities: 0, equity: -6_000, operatingCashFlow: -6_000 },
          correct: false,
          explanation:
            "This ignores the $3,000 already recorded as a liability on December 31, so the October–December interest would be counted twice.",
        },
        {
          label: "B",
          text: null,
          effects: { assets: -6_000, liabilities: -6_000, equity: 0, operatingCashFlow: -6_000 },
          correct: false,
          explanation:
            "Only $3,000 was owed at year-end. The January–March interest is a new expense, recorded now.",
        },
        {
          label: "C",
          text: null,
          effects: { assets: -6_000, liabilities: -3_000, equity: -3_000, operatingCashFlow: -6_000 },
          correct: true,
          explanation:
            "Half the payment settles the $3,000 already owed for October–December. The other half is new interest expense for January–March. Under U.S. GAAP, interest paid is an operating cash flow.",
        },
        {
          label: "D",
          text: null,
          effects: { assets: -6_000, liabilities: -3_000, equity: -3_000, operatingCashFlow: 0 },
          correct: false,
          explanation:
            "This treats interest paid as a financing cash flow. Under U.S. GAAP, repaying the loan's principal (and paying dividends) is financing, but interest paid is operating.",
        },
      ],
      journalEntry: [
        { side: "debit", account: "Interest Payable", amount: 3_000 },
        { side: "debit", account: "Interest Expense", amount: 3_000 },
        { side: "credit", account: "Cash", amount: 6_000 },
      ],
      review: {
        ...PENDING,
        note: "Confirm in permitted course materials (textbook chapter 4 or the Statement of Cash Flows notes) that the course classifies interest paid as an operating cash flow.",
      },
    },
  ],
};
