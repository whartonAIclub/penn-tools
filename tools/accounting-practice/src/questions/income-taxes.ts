// Final exam topic: accounting for income taxes (current and deferred taxes,
// temporary and permanent differences, NOLs and valuation allowances).
// Historical questions are past ACCT 6130 final exam questions adapted to
// multiple choice, with every number they need stated in the question. Approved by
// the team on 2026-11-11.

import { APPROVED, cr, dr, effectChoices, textChoices } from "./build.js";
import type { Topic } from "./types.js";

const TAX = "Sessions 15–16: Accounting for Income Taxes";

export const incomeTaxes: Topic = {
  id: "income-taxes",
  title: "Income taxes",
  description: "Deferred tax assets and liabilities, NOLs, valuation allowances and effective tax rates.",
  questions: [
    {
      id: "tax-01",
      origin: "historical",
      source: "Fall 2025 Final, IV.3 (adapted)",
      concept: "Permanent differences and the effective tax rate",
      courseSession: TAX,
      difficulty: "medium",
      format: "text",
      prompt:
        "A company's effective tax rate rose this year, partly because of a large impairment charge that is not tax-deductible. Which description of the impairment is consistent with that?",
      choices: textChoices(1, [
        [
          "It's deducted from taxable income but not from book income; it's a temporary difference.",
          "It's the reverse: the charge reduces book income but is never deducted for tax.",
        ],
        [
          "It's deducted from book income but not from taxable income; it's a permanent difference.",
          "Book income falls but taxes don't, so tax expense is high relative to book income: the effective rate rises. Because it will never be deducted, it's a permanent difference.",
        ],
        [
          "It's deducted from book income but not from taxable income; it's a temporary difference.",
          "A temporary difference reverses later and creates a deferred tax. A charge that's never deductible doesn't reverse, so it's permanent.",
        ],
        [
          "It's deducted from both book and taxable income; it's a permanent difference.",
          "If it were deducted from both, it wouldn't create a difference at all, and wouldn't change the effective rate.",
        ],
      ]),
      journalEntry: null,
      review: APPROVED,
    },
    {
      id: "tax-02",
      origin: "historical",
      source: "Fall 2025 Final, IV.4 (adapted)",
      concept: "Net operating loss carryforwards",
      courseSession: TAX,
      difficulty: "medium",
      format: "text",
      prompt:
        "A company's deferred tax asset for net operating loss (NOL) carryforwards is $405 million, measured at the 21% federal rate. About how much future taxable income can these NOLs offset?",
      choices: textChoices(2, [
        ["$85 million", "This multiplies the DTA by 21%. The DTA is already the NOL times 21%, so divide instead."],
        ["$405 million", "$405 million is the tax saving (the DTA), not the income it can offset."],
        [
          "$1,929 million",
          "DTA = NOL carryforwards × tax rate, so NOL = $405 ÷ 21% ≈ $1,929 million of future taxable income.",
        ],
        ["$513 million", "This divides by (1 − 21%). The DTA equals the NOL times the rate, so divide by 21%."],
      ]),
      journalEntry: null,
      review: APPROVED,
    },
    {
      id: "tax-03",
      origin: "historical",
      source: "Fall 2025 Final, IV.6 (adapted)",
      concept: "Deferred tax liabilities from depreciation",
      courseSession: TAX,
      difficulty: "hard",
      format: "text",
      prompt:
        "A company's deferred tax liability for fixed and intangible assets rose from $264 million to $614 million this year, measured at 21%. Assume depreciation and amortization timing is the only difference. What was this year's difference between book and tax depreciation and amortization, and which was higher?",
      choices: textChoices(1, [
        [
          "$350 million; book depreciation was higher",
          "$350 million is the change in the DTL, not the difference in depreciation, and a rising DTL means tax depreciation was higher.",
        ],
        [
          "$1,667 million; tax-deductible depreciation was higher",
          "Change in DTL = this year's temporary difference × rate, so $350 ÷ 21% ≈ $1,667 million. A rising DTL means taxes payable < tax expense, so taxable income < book income: tax depreciation exceeded book depreciation.",
        ],
        [
          "$1,667 million; book depreciation was higher",
          "The amount is right, but the direction is reversed: a DTL grows when tax deductions run ahead of book expense.",
        ],
        [
          "$2,924 million; tax-deductible depreciation was higher",
          "$614 ÷ 21% is the cumulative difference to date. This year's difference comes from the change in the DTL.",
        ],
      ]),
      journalEntry: null,
      review: APPROVED,
    },
    {
      id: "tax-04",
      origin: "historical",
      source: "Fall 2025 Final, IV.7 (adapted)",
      concept: "Deferred tax assets from stock compensation",
      courseSession: TAX,
      difficulty: "medium",
      format: "text",
      prompt: "Why would stock-based compensation create a deferred tax asset?",
      choices: textChoices(2, [
        [
          "It's expensed at exercise for book purposes, but over the vesting period for tax.",
          "The timing is the other way round: the book expense comes first, over the vesting period.",
        ],
        [
          "It's never deductible for tax purposes.",
          "Something never deductible is a permanent difference, which creates no deferred tax at all.",
        ],
        [
          "It's expensed over the vesting period for book purposes, but deducted for tax only when the options are exercised.",
          "Book expense comes first, so book income < taxable income now and taxes payable > tax expense. The future tax deduction is a deferred tax asset.",
        ],
        [
          "It's capitalized as an asset for book purposes.",
          "Stock compensation is expensed for book purposes, not capitalized.",
        ],
      ]),
      journalEntry: null,
      review: APPROVED,
    },
    {
      id: "tax-05",
      origin: "historical",
      source: "Fall 2025 Final, IV.5 (adapted; balances stated)",
      concept: "Valuation allowance",
      courseSession: TAX,
      difficulty: "medium",
      format: "text",
      prompt:
        "A company's valuation allowance against its deferred tax assets rose from $200 million to $238 million this year. What effect did this change have on net income?",
      choices: textChoices(3, [
        ["Increase of $238 million", "Only the change in the allowance affects this year, and an increase raises tax expense."],
        ["Decrease of $238 million", "Only this year's change ($38 million) flows through income, not the whole balance."],
        ["Increase of $38 million", "A higher allowance reduces the expected benefit of the DTAs, raising tax expense and lowering net income."],
        [
          "Decrease of $38 million",
          "Raising the allowance by $38 million is recorded as Dr. Tax Expense, Cr. Valuation Allowance, so net income falls by $38 million.",
        ],
      ]),
      journalEntry: [dr("Tax Expense", 38), cr("Valuation Allowance", 38)],
      review: APPROVED,
    },
    {
      id: "tax-06",
      origin: "historical",
      source: "Fall 2024 Final, II.5 (adapted)",
      concept: "Valuation allowance",
      courseSession: TAX,
      difficulty: "medium",
      format: "text",
      prompt:
        "A company has a $17.3 million valuation allowance against its deferred tax asset for NOL carryforwards, measured at 21%. How much in NOLs does it believe will more likely than not expire unused?",
      choices: textChoices(2, [
        ["$3.6 million", "This multiplies by 21%. The allowance is already in tax dollars, so divide by the rate."],
        ["$17.3 million", "That's the tax value of the unused NOLs, not the NOLs themselves."],
        [
          "$82.4 million",
          "Valuation allowance = NOLs not expected to be used × 21%, so NOLs = $17.3 ÷ 21% ≈ $82.4 million.",
        ],
        ["$21.9 million", "This divides by (1 − 21%). The allowance equals the NOLs times the rate."],
      ]),
      journalEntry: null,
      review: APPROVED,
    },
    {
      id: "tax-07",
      origin: "historical",
      source: "Fall 2024 Final, II.7 (adapted)",
      concept: "Deferred tax liabilities from prepaid expenses",
      courseSession: TAX,
      difficulty: "hard",
      format: "text",
      prompt: "A company reports a deferred tax liability related to prepaid expenses (such as prepaid rent). What explains it?",
      choices: textChoices(1, [
        [
          "Prepaids are deducted for tax after they're expensed for book purposes.",
          "That would make taxable income higher than book income now, which creates a deferred tax asset, not a liability.",
        ],
        [
          "Prepaids are deducted for tax when paid, before they're expensed for book purposes.",
          "A DTL means taxes payable < tax expense, so tax deductions run ahead of book expense. Tax deducts the payment immediately; book records an asset and expenses it over time.",
        ],
        [
          "Prepaids are never deductible for tax purposes.",
          "A never-deductible item is a permanent difference and creates no deferred tax.",
        ],
        [
          "Prepaids are capitalized for tax and expensed immediately for book.",
          "That's backwards: book capitalizes the prepaid as an asset; tax deducts it when paid.",
        ],
      ]),
      journalEntry: null,
      review: APPROVED,
    },
    {
      id: "tax-08",
      origin: "historical",
      source: "Spring 2025 Final, II.3 (adapted)",
      concept: "Deferred taxes in the statement of cash flows",
      courseSession: TAX,
      difficulty: "hard",
      format: "text",
      prompt:
        "A company's tax expense includes an $80 million deferred tax benefit (a negative deferred provision). In the indirect cash flow statement, it subtracts this $80 million from net income. Why?",
      choices: textChoices(0, [
        [
          "Because it owed (and paid) more in taxes than it expensed this year.",
          "Tax expense = current taxes − $80 million, so the expense in net income understates the taxes owed. Subtracting the $80 million brings operating cash flow down to the taxes actually owed and paid.",
        ],
        [
          "Because it expensed more in taxes than it owed.",
          "That situation (a deferred tax expense) is added back, not subtracted.",
        ],
        ["Because deferred taxes are financing cash flows.", "Income taxes are operating cash flows."],
        [
          "Because the deferred benefit was a cash refund.",
          "A deferred benefit isn't cash. It's an accounting difference between expense and taxes owed.",
        ],
      ]),
      journalEntry: null,
      review: APPROVED,
    },
    {
      id: "tax-09",
      origin: "historical",
      source: "Spring 2025 Final, II.5 (adapted)",
      concept: "Accumulated temporary differences",
      courseSession: TAX,
      difficulty: "medium",
      format: "text",
      prompt:
        "A company's deferred tax liability for depreciation is $13,681 thousand, measured at 21%. How much more depreciation has it deducted for tax than for book purposes, cumulatively over its life (in $ thousands)?",
      choices: textChoices(2, [
        ["$2,873", "This multiplies the DTL by 21%. The DTL is already the difference times the rate, so divide."],
        ["$13,681", "That's the tax effect of the difference (the DTL), not the difference itself."],
        [
          "$65,148",
          "DTL = accumulated temporary difference × rate, so the difference = $13,681 ÷ 21% ≈ $65,148 thousand.",
        ],
        ["$17,318", "This divides by (1 − 21%). Divide the DTL by the rate itself."],
      ]),
      journalEntry: null,
      review: APPROVED,
    },
    {
      id: "tax-10",
      origin: "historical",
      source: "Spring 2025 Final, II.6 (adapted)",
      concept: "Deferred taxes on capitalized interest",
      courseSession: TAX,
      difficulty: "hard",
      format: "text",
      prompt:
        "Assume tax rules require interest to be deducted as incurred, while for book purposes a company capitalizes some interest into its assets. Its deferred tax liability for capitalized interest rose from $18,909 thousand to $20,634 thousand (21% rate). About how much interest did it capitalize this year (in $ thousands)?",
      choices: textChoices(1, [
        ["$1,725", "That's the change in the DTL, which is the tax effect of the interest capitalized."],
        [
          "$8,214",
          "Change in DTL = this year's temporary difference × rate, so ($20,634 − $18,909) ÷ 21% = $1,725 ÷ 21% ≈ $8,214 thousand.",
        ],
        ["$98,257", "$20,634 ÷ 21% is the cumulative capitalized interest, not this year's."],
        ["$362", "This multiplies the change by 21% instead of dividing."],
      ]),
      journalEntry: null,
      review: APPROVED,
    },
    {
      id: "tax-11",
      origin: "historical",
      source: "Spring 2025 Final, II.7 (adapted)",
      concept: "Permanent differences and the effective tax rate",
      courseSession: TAX,
      difficulty: "medium",
      format: "text",
      prompt:
        "In a company's reconciliation from the statutory to the effective tax rate, \"other permanent differences\" increased the effective rate. What do they most likely represent?",
      choices: textChoices(1, [
        ["Tax-exempt income", "Tax-exempt income lowers taxes relative to book income, so it lowers the effective rate."],
        [
          "Non-tax-deductible expenses",
          "Expenses that are never deductible lower book income without lowering taxes, so tax expense is high relative to book income and the effective rate rises.",
        ],
        [
          "Temporary differences that will reverse",
          "Temporary differences create deferred taxes; they don't explain the gap between the statutory and effective rates.",
        ],
        ["A change in the statutory tax rate", "That's listed separately, not as a permanent difference."],
      ]),
      journalEntry: null,
      review: APPROVED,
    },
    {
      id: "tax-12",
      origin: "historical",
      source: "Spring 2025 Final, II.4 (adapted)",
      concept: "Valuation allowance",
      courseSession: TAX,
      difficulty: "medium",
      format: "text",
      prompt:
        "A company has a $4,285 deferred tax asset for state NOL carryforwards. It now believes it's more likely than not that this asset won't be realized. What entry does it record?",
      choices: textChoices(1, [
        [
          "Dr. Valuation Allowance 4,285; Cr. Tax Expense 4,285",
          "That reduces tax expense, which would be releasing an allowance, not creating one.",
        ],
        [
          "Dr. Tax Expense 4,285; Cr. Valuation Allowance 4,285",
          "A valuation allowance (a contra-asset) reduces the DTA to what's expected to be realized, and the charge raises tax expense.",
        ],
        [
          "Dr. Tax Expense 4,285; Cr. Taxes Payable 4,285",
          "Nothing more is owed to the government; the company just expects not to use the asset.",
        ],
        [
          "No entry; disclose it in the notes",
          "When realization is no longer more likely than not, a valuation allowance must be recorded.",
        ],
      ]),
      journalEntry: [dr("Tax Expense", 4_285), cr("Valuation Allowance", 4_285)],
      review: APPROVED,
    },
    {
      id: "tax-13",
      origin: "original",
      source: null,
      concept: "Recording tax expense with a deferred tax liability",
      courseSession: TAX,
      difficulty: "hard",
      format: "effects",
      prompt:
        "A company's pretax book income is $1,000,000. Tax depreciation exceeds book depreciation by $200,000, and the tax rate is 21%. It records this year's taxes, none of which are paid yet. What is the effect of the entry?",
      choices: effectChoices(0, [
        [
          [0, 210_000, -210_000, 0],
          "Taxes payable = ($1,000,000 − $200,000) × 21% = $168,000. The DTL rises by $200,000 × 21% = $42,000. Tax expense = $210,000. Both are liabilities, and nothing is paid, so operating cash flow is unchanged.",
        ],
        [
          [0, 168_000, -168_000, 0],
          "This records only the taxes payable. Tax expense also includes the $42,000 deferred tax on the depreciation difference.",
        ],
        [
          [-210_000, 0, -210_000, -210_000],
          "This records the taxes as paid. They are only accrued so far.",
        ],
        [
          [0, 210_000, -210_000, -210_000],
          "No cash has been paid, so operating cash flow isn't reduced: the increases in taxes payable and the DTL are added back.",
        ],
      ]),
      journalEntry: [dr("Tax Expense", 210_000), cr("Taxes Payable", 168_000), cr("Deferred Tax Liability", 42_000)],
      review: APPROVED,
    },
    {
      id: "tax-14",
      origin: "original",
      source: null,
      concept: "Deferred tax assets",
      courseSession: TAX,
      difficulty: "medium",
      format: "text",
      prompt:
        "A company accrues $50,000 of warranty expense for book purposes this year. For tax, warranty costs are deductible only when paid, and none have been paid yet. The tax rate is 25%. What deferred tax does this create?",
      choices: textChoices(1, [
        ["A $12,500 deferred tax liability", "Book expense comes first here, so the future deduction is an asset, not a liability."],
        [
          "A $12,500 deferred tax asset",
          "Book income is $50,000 lower than taxable income now, so taxes payable exceed tax expense. The future deduction is worth $50,000 × 25% = $12,500: a deferred tax asset.",
        ],
        ["A $50,000 deferred tax asset", "The DTA is the tax effect of the difference: $50,000 × 25%."],
        ["None: it's a permanent difference", "Warranty costs become deductible when paid, so the difference reverses; it's temporary."],
      ]),
      journalEntry: null,
      review: APPROVED,
    },
    {
      id: "tax-15",
      origin: "original",
      source: null,
      concept: "Effective tax rate",
      courseSession: TAX,
      difficulty: "medium",
      format: "text",
      prompt:
        "A company's pretax income is $2,000,000, after deducting $200,000 of fines that are not tax-deductible. The statutory rate is 21%, and there are no other differences. What is its effective tax rate?",
      choices: textChoices(1, [
        ["21.0%", "The non-deductible fines make taxes higher relative to book income, so the effective rate exceeds 21%."],
        [
          "23.1%",
          "Taxable income = $2,000,000 + $200,000 = $2,200,000, so tax expense = $462,000. Effective rate = tax expense ÷ pretax book income = $462,000 ÷ $2,000,000 = 23.1%.",
        ],
        [
          "18.9%",
          "This subtracts the fines from taxable income. Non-deductible fines are added back to get taxable income.",
        ],
        [
          "It can't be computed without the cash taxes paid",
          "The effective rate uses tax expense, not cash paid, and tax expense can be computed here.",
        ],
      ]),
      journalEntry: null,
      review: APPROVED,
    },
    {
      id: "tax-16",
      origin: "original",
      source: null,
      concept: "Permanent differences and the effective tax rate",
      courseSession: TAX,
      difficulty: "easy",
      format: "text",
      prompt: "A company earns interest on municipal bonds, which is tax-exempt. How does this affect its taxes?",
      choices: textChoices(3, [
        [
          "It creates a deferred tax liability",
          "The interest will never be taxed, so no future tax arises: it's a permanent difference, not a temporary one.",
        ],
        [
          "It creates a deferred tax asset",
          "There's no future deduction either; permanent differences create no deferred taxes.",
        ],
        ["It raises the effective tax rate", "Income that's never taxed lowers taxes relative to book income, lowering the rate."],
        [
          "It's a permanent difference that lowers the effective tax rate",
          "The interest is in book income but never in taxable income, so tax expense is lower relative to book income: the effective rate falls below the statutory rate.",
        ],
      ]),
      journalEntry: null,
      review: APPROVED,
    },
    {
      id: "tax-17",
      origin: "original",
      source: null,
      concept: "Reversal of temporary differences",
      courseSession: TAX,
      difficulty: "medium",
      format: "text",
      prompt:
        "A company uses accelerated depreciation for tax and straight-line for book. Late in an asset's life, book depreciation now exceeds tax depreciation. What happens?",
      choices: textChoices(2, [
        [
          "The deferred tax liability keeps growing",
          "It grows only while tax depreciation exceeds book depreciation; now the difference is reversing.",
        ],
        [
          "A deferred tax asset is created",
          "The earlier difference is unwinding: the existing DTL shrinks rather than a new asset appearing.",
        ],
        [
          "The deferred tax liability decreases, and taxes payable exceed tax expense",
          "With less tax depreciation, taxable income exceeds book income, so the company now pays the taxes it deferred earlier: the DTL falls.",
        ],
        ["Nothing: deferred taxes never reverse", "Temporary differences reverse by definition; that's what makes them temporary."],
      ]),
      journalEntry: null,
      review: APPROVED,
    },
    {
      id: "tax-18",
      origin: "original",
      source: null,
      concept: "Deferred taxes in the statement of cash flows",
      courseSession: TAX,
      difficulty: "medium",
      format: "text",
      prompt:
        "A company's tax expense of $300 is made up of $240 current and $60 deferred (an increase in its DTL). It paid all its current taxes. How does the $60 appear in operating cash flow (indirect method)?",
      choices: textChoices(0, [
        [
          "It's added back to net income",
          "Net income was reduced by the full $300 of tax expense, but only $240 was paid. Adding back the $60 non-cash deferred portion leaves operating cash flow reduced by just the cash paid.",
        ],
        ["It's subtracted from net income", "Subtracting it would treat the deferred portion as an extra cash payment."],
        [
          "It's a financing cash flow",
          "Taxes are operating items, and the deferred portion isn't a cash flow at all.",
        ],
        ["It doesn't appear", "It must be added back, because net income includes it but no cash was paid."],
      ]),
      journalEntry: null,
      review: APPROVED,
    },
    {
      id: "tax-19",
      origin: "original",
      source: null,
      concept: "Valuation allowance",
      courseSession: TAX,
      difficulty: "easy",
      format: "text",
      prompt: "When does a company record a valuation allowance against its deferred tax assets?",
      choices: textChoices(1, [
        [
          "Whenever it has deferred tax liabilities",
          "A valuation allowance depends on whether the assets will be used, not on whether liabilities exist.",
        ],
        [
          "When it's more likely than not that some of the deferred tax assets won't be realized",
          "The allowance reduces the DTAs to the amount expected to be used, for example when the company may not earn enough future taxable income.",
        ],
        ["When tax rates are expected to fall", "Rate changes remeasure deferred taxes; they don't call for an allowance."],
        ["Every year, equal to a fixed share of DTAs", "It's a judgment about realization, not a fixed percentage."],
      ]),
      journalEntry: null,
      review: APPROVED,
    },
    {
      id: "tax-20",
      origin: "original",
      source: null,
      concept: "Net operating loss carryforwards",
      courseSession: TAX,
      difficulty: "hard",
      format: "effects",
      prompt:
        "A company has a $1,000,000 pretax loss this year, which it can carry forward against future taxable income. The tax rate is 21%, and it expects to use the loss, so no valuation allowance is needed. What is the effect of recording the tax benefit?",
      choices: effectChoices(0, [
        [
          [210_000, 0, 210_000, 0],
          "The carryforward is a future tax saving of $1,000,000 × 21% = $210,000: a deferred tax asset. The tax benefit reduces the net loss, raising equity. No cash changes hands.",
        ],
        [[0, 0, 0, 0], "A usable NOL carryforward is recognized as a deferred tax asset, with a tax benefit."],
        [
          [210_000, 0, 210_000, 210_000],
          "A carryforward isn't a cash refund; it reduces future taxes, so there's no cash flow now.",
        ],
        [
          [0, -210_000, 210_000, 0],
          "The benefit is a future saving: an asset, not a reduction of an existing liability.",
        ],
      ]),
      journalEntry: [dr("Deferred Tax Asset", 210_000), cr("Tax Benefit (Tax Expense)", 210_000)],
      review: APPROVED,
    },
    {
      id: "tax-21",
      origin: "original",
      source: null,
      concept: "Temporary versus permanent differences",
      courseSession: TAX,
      difficulty: "easy",
      format: "text",
      prompt: "Which of these is a temporary difference between book and taxable income?",
      choices: textChoices(2, [
        ["Interest on municipal bonds", "It's never taxed, so it's a permanent difference."],
        ["Fines and penalties", "They're never deductible, so they're a permanent difference."],
        [
          "Accelerated depreciation for tax, straight-line for book",
          "Total depreciation is the same over the asset's life; only the timing differs. That timing difference reverses, so it's temporary.",
        ],
        [
          "A goodwill impairment that is not tax-deductible",
          "If it's never deductible, it's a permanent difference.",
        ],
      ]),
      journalEntry: null,
      review: APPROVED,
    },
    {
      id: "tax-22",
      origin: "original",
      source: null,
      concept: "Deferred tax liabilities",
      courseSession: TAX,
      difficulty: "medium",
      format: "text",
      prompt: "A deferred tax liability arises when:",
      choices: textChoices(1, [
        [
          "Taxable income exceeds book income today",
          "That means paying more tax now than the expense recorded, which creates a deferred tax asset.",
        ],
        [
          "Book income exceeds taxable income today, so taxes will be higher in the future",
          "Paying less tax now than the expense recorded means the difference will be paid later. That future payment is a liability.",
        ],
        [
          "The company owes back taxes from an audit",
          "That's a current tax liability, not a deferred one from timing differences.",
        ],
        ["A permanent difference occurs", "Permanent differences never reverse, so they create no deferred taxes."],
      ]),
      journalEntry: null,
      review: APPROVED,
    },
    {
      id: "tax-23",
      origin: "original",
      source: null,
      concept: "Computing tax expense",
      courseSession: TAX,
      difficulty: "hard",
      format: "text",
      prompt:
        "This year a company's taxes payable are $300,000. Its deferred tax assets increased by $20,000 and its deferred tax liabilities increased by $50,000. No valuation allowance. What is its tax expense?",
      choices: textChoices(1, [
        ["$300,000", "Tax expense also includes the deferred part: the changes in DTAs and DTLs."],
        [
          "$330,000",
          "Tax expense = taxes payable + increase in DTLs − increase in DTAs = $300,000 + $50,000 − $20,000 = $330,000.",
        ],
        [
          "$270,000",
          "This reverses the signs. A rising DTL adds future taxes to expense; a rising DTA reduces expense.",
        ],
        ["$370,000", "A rising DTA is a future benefit, so it reduces tax expense rather than adding to it."],
      ]),
      journalEntry: [
        dr("Tax Expense", 330_000),
        dr("Deferred Tax Asset", 20_000),
        cr("Deferred Tax Liability", 50_000),
        cr("Taxes Payable", 300_000),
      ],
      review: APPROVED,
    },
    {
      id: "tax-24",
      origin: "original",
      source: "Variation of Fall 2024 Final, II.1",
      concept: "Recording tax expense with deferred taxes",
      courseSession: TAX,
      difficulty: "hard",
      format: "text",
      prompt:
        "This year a company's taxes payable are $500,000, its deferred tax assets decreased by $30,000, and its deferred tax liabilities increased by $20,000. What is the summary journal entry for tax expense?",
      choices: textChoices(3, [
        [
          "Dr. Tax Expense 500,000; Cr. Taxes Payable 500,000",
          "This ignores the deferred taxes. The changes in DTAs and DTLs are part of tax expense.",
        ],
        [
          "Dr. Tax Expense 490,000; Dr. Deferred Tax Asset 30,000; Cr. Deferred Tax Liability 20,000; Cr. Taxes Payable 500,000",
          "This debits the DTA, as if it increased. It decreased, so it's credited, which adds to tax expense.",
        ],
        [
          "Dr. Tax Expense 450,000; Dr. Deferred Tax Liability 20,000; Dr. Deferred Tax Asset 30,000; Cr. Taxes Payable 500,000",
          "Both deferred accounts are on the wrong side: a falling DTA is a credit, and a rising DTL is a credit.",
        ],
        [
          "Dr. Tax Expense 550,000; Cr. Deferred Tax Asset 30,000; Cr. Deferred Tax Liability 20,000; Cr. Taxes Payable 500,000",
          "Using up a DTA (credit) and adding to a DTL (credit) both add to tax expense: $500,000 + $30,000 + $20,000 = $550,000.",
        ],
      ]),
      journalEntry: [
        dr("Tax Expense", 550_000),
        cr("Deferred Tax Asset", 30_000),
        cr("Deferred Tax Liability", 20_000),
        cr("Taxes Payable", 500_000),
      ],
      review: APPROVED,
    },
    {
      id: "tax-25",
      origin: "historical",
      source: "Fall 2024 Final, II.3 (adapted)",
      concept: "Effective tax rate",
      courseSession: TAX,
      difficulty: "easy",
      format: "text",
      prompt:
        "A company reports income tax expense of $495.2 million on pretax income of $2,110.6 million. What is its effective tax rate?",
      choices: textChoices(0, [
        ["23.5%", "Effective tax rate = income tax expense ÷ pretax income = $495.2 ÷ $2,110.6 = 23.5%."],
        ["21.0%", "21% is the federal statutory rate; the effective rate is computed from the company's own numbers."],
        ["30.7%", "This divides by net income ($2,110.6 − $495.2). The rate uses pretax income."],
        ["19.0%", "This divides by pretax income plus taxes. The denominator is pretax income alone."],
      ]),
      journalEntry: null,
      review: APPROVED,
    },
  ],
};
