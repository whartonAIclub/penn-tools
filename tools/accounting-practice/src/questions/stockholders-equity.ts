// Final exam topic: stockholders' equity (stock issuance and repurchases,
// dividends, splits, stock compensation and EPS). Historical questions are past
// ACCT 6130 final exam questions adapted to multiple choice, with every number
// they need stated in the question. All are pending review until a team member
// checks them.

import { PENDING, cr, dr, effectChoices, pendingWithNote, textChoices } from "./build.js";
import type { Topic } from "./types.js";

const SE = "Session 17: Stockholders' Equity";

export const stockholdersEquity: Topic = {
  id: "stockholders-equity",
  title: "Stockholders' equity",
  description: "Issuing and repurchasing stock, dividends, splits, stock compensation and EPS.",
  questions: [
    {
      id: "se-01",
      origin: "historical",
      source: "Fall 2025 Final, VI.3 (adapted)",
      concept: "Accounting for stock options",
      courseSession: SE,
      difficulty: "medium",
      format: "text",
      prompt: "Which statement about accounting for employee stock options is NOT true?",
      choices: textChoices(2, [
        ["Compensation expense is recognized over the vesting period.", "True: the expense is spread over the period employees must work to earn the options."],
        [
          "Total compensation expense is based on the options' fair value at the grant date.",
          "True: the grant-date fair value sets the total expense to be recognized.",
        ],
        [
          "The expense is adjusted over time as the company's stock price changes.",
          "Not true: once measured at the grant date, the expense isn't remeasured when the stock price moves.",
        ],
        [
          "When options are exercised, no compensation expense is recognized, and financing cash flows increase.",
          "True: the expense was recognized during vesting; at exercise the cash received from employees is a financing inflow.",
        ],
      ]),
      journalEntry: null,
      review: PENDING,
    },
    {
      id: "se-02",
      origin: "historical",
      source: "Fall 2025 Final, VI.6 (adapted)",
      concept: "Stock dividends",
      courseSession: SE,
      difficulty: "hard",
      format: "text",
      prompt:
        "A company declares a 10% stock dividend. Its CEO earns a bonus for hitting a target ROE (net income ÷ average total book equity). How does the stock dividend affect: the likelihood of the bonus / retained earnings / stock compensation expense?",
      choices: textChoices(2, [
        [
          "Lower / Lower / No change",
          "Total equity doesn't change (one equity account moves to others), and neither does net income, so ROE and the bonus are unaffected.",
        ],
        [
          "No change / No change / No change",
          "Retained earnings does change: the stock dividend moves an amount out of retained earnings into common stock and APIC.",
        ],
        [
          "No change / Lower / No change",
          "Entry: Dr. Retained Earnings; Cr. Common Stock; Cr. APIC. Retained earnings falls, but total equity and net income don't change, so ROE (and the bonus) is unaffected. No compensation is involved.",
        ],
        [
          "Higher / Lower / Higher",
          "A stock dividend isn't compensation and doesn't change net income or total equity.",
        ],
      ]),
      journalEntry: null,
      review: PENDING,
    },
    {
      id: "se-03",
      origin: "historical",
      source: "Fall 2024 Final, III.5 (adapted)",
      concept: "Stock splits",
      courseSession: SE,
      difficulty: "medium",
      format: "text",
      prompt:
        "A company declares a 2-for-1 stock split (each shareholder gets one more share for each share owned). How are these affected: par value per share / total par value of common stock / APIC / retained earnings?",
      choices: textChoices(3, [
        [
          "No change / Higher / Lower / No change",
          "A split doesn't move amounts between equity accounts; it halves the par value per share instead.",
        ],
        [
          "Lower / Lower / Higher / No change",
          "Twice the shares at half the par leaves total par value unchanged, and nothing moves into APIC.",
        ],
        [
          "No change / No change / No change / Lower",
          "That's closer to a stock dividend. A split leaves retained earnings alone and halves par per share.",
        ],
        [
          "Lower / No change / No change / No change",
          "Par value per share halves while the number of shares doubles, so total par value is unchanged. No journal entry moves amounts, so APIC and retained earnings don't change.",
        ],
      ]),
      journalEntry: null,
      review: PENDING,
    },
    {
      id: "se-04",
      origin: "historical",
      source: "Fall 2024 Final, III.2 (adapted)",
      concept: "Stock option expense over the vesting period",
      courseSession: SE,
      difficulty: "easy",
      format: "text",
      prompt:
        "Stock options granted last year had a total grant-date fair value of $4.9 million and vest over 3 years. How much compensation expense do they generate this year (a full year of vesting)?",
      choices: textChoices(1, [
        ["$4.9 million", "The total is spread over the 3-year vesting period, not expensed in one year."],
        [
          "About $1.63 million",
          "Total expense = grant-date fair value = $4.9 million, recognized evenly over 3 years: $4.9 ÷ 3 ≈ $1.63 million per full year.",
        ],
        ["$0 until the options are exercised", "The expense is recognized during vesting, whether or not employees later exercise."],
        [
          "It depends on this year's stock price",
          "The expense is fixed at the grant-date fair value; later stock prices don't change it.",
        ],
      ]),
      journalEntry: null,
      review: PENDING,
    },
    {
      id: "se-05",
      origin: "historical",
      source: "Spring 2025 Final, III.5 (adapted)",
      concept: "Stock compensation expense",
      courseSession: SE,
      difficulty: "medium",
      format: "text",
      prompt:
        "A company recognizes $29,558 of stock compensation expense. What's the effect on: cash / operating cash flow / net income / stockholders' equity?",
      choices: textChoices(0, [
        [
          "No change / No change / Decrease / No change",
          "Entry: Dr. Compensation Expense; Cr. APIC. Net income (and retained earnings) falls, but APIC rises by the same amount, so total equity doesn't change. No cash moves, and the non-cash expense is added back in operating cash flow.",
        ],
        ["Decrease / Decrease / Decrease / Decrease", "Stock compensation is paid in shares, not cash."],
        [
          "No change / Decrease / Decrease / Decrease",
          "The expense is non-cash and added back, so operating cash flow doesn't change; and APIC offsets the drop in retained earnings.",
        ],
        [
          "No change / No change / Decrease / Decrease",
          "The credit to APIC offsets the expense's effect on retained earnings, so total equity doesn't change.",
        ],
      ]),
      journalEntry: [dr("Compensation Expense", 29_558), cr("Additional Paid-in Capital", 29_558)],
      review: PENDING,
    },
    {
      id: "se-06",
      origin: "historical",
      source: "Spring 2025 Final, III.6 (adapted)",
      concept: "Reissuing treasury stock",
      courseSession: SE,
      difficulty: "hard",
      format: "text",
      prompt:
        "A company reissues shares from treasury stock to employees under its stock plans. Its statement of stockholders' equity shows APIC being debited (reduced) on these reissuances. What does that tell you?",
      choices: textChoices(1, [
        [
          "The treasury stock cost less than the amount received from employees",
          "In that case APIC would be credited (increased) for the excess received.",
        ],
        [
          "The treasury stock cost more than the amount received from employees",
          "Entry: Dr. Cash (amount received); Dr. APIC (the shortfall); Cr. Treasury Stock (its cost). APIC is debited only when the cost exceeds what employees paid.",
        ],
        [
          "The market value of the shares was less than the amount received",
          "Treasury stock leaves the books at its cost, not market value; market value doesn't enter the entry.",
        ],
        [
          "The market value of the shares was more than the amount received",
          "Again, the entry compares cost with cash received; market value isn't recorded.",
        ],
      ]),
      journalEntry: null,
      review: PENDING,
    },
    {
      id: "se-07",
      origin: "historical",
      source: "Spring 2025 Final, III.4 (adapted)",
      concept: "Dividends declared versus paid",
      courseSession: SE,
      difficulty: "easy",
      format: "text",
      prompt:
        "The dividends on a company's statement of stockholders' equity don't match the dividends on its statement of cash flows. Why?",
      choices: textChoices(0, [
        [
          "The dividends declared differ from the dividends paid",
          "Retained earnings is reduced when dividends are declared; cash flows show what was paid. Dividends declared but not yet paid sit in dividends payable.",
        ],
        ["There's a tax on dividends", "Dividend taxes are paid by shareholders, not recorded by the company."],
        ["Dividends are a non-cash charge", "Cash dividends are cash payments; the difference is timing."],
        ["There was a stock split", "A split doesn't involve dividends or cash."],
      ]),
      journalEntry: null,
      review: PENDING,
    },
    {
      id: "se-08",
      origin: "historical",
      source: "Spring 2025 Final, III.2 (adapted)",
      concept: "Diluted earnings per share",
      courseSession: SE,
      difficulty: "easy",
      format: "text",
      prompt: "Why is a company's diluted EPS lower than its basic EPS?",
      choices: textChoices(3, [
        [
          "It removes earnings belonging to minority shareholders",
          "That adjustment affects both basic and diluted EPS; it doesn't explain the difference.",
        ],
        ["It subtracts shares held in treasury", "Treasury shares are already excluded from basic EPS."],
        ["It adds shares that are authorized but not issued", "Authorized shares that could never be claimed by anyone aren't counted."],
        [
          "It adds shares that could be issued under stock compensation plans",
          "Diluted EPS includes shares that options, RSUs and similar plans could create, so the same earnings are spread over more shares.",
        ],
      ]),
      journalEntry: null,
      review: PENDING,
    },
    {
      id: "se-09",
      origin: "historical",
      source: "Spring 2025 Final, III.1 (adapted)",
      concept: "Shares issued, outstanding and in treasury",
      courseSession: SE,
      difficulty: "easy",
      format: "text",
      prompt:
        "A company's balance sheet shows 112,937 thousand common shares issued and 13,149 thousand shares held in treasury. How many shares are outstanding (in thousands)?",
      choices: textChoices(1, [
        ["112,937", "That's shares issued. Treasury shares have been bought back, so they aren't outstanding."],
        ["99,788", "Outstanding = issued − treasury = 112,937 − 13,149 = 99,788 thousand."],
        ["126,086", "Treasury shares are subtracted from shares issued, not added."],
        ["13,149", "That's the number held in treasury."],
      ]),
      journalEntry: null,
      review: PENDING,
    },
    {
      id: "se-10",
      origin: "historical",
      source: "Spring 2025 Final, III.8 (adapted)",
      concept: "Restricted stock units (RSUs)",
      courseSession: SE,
      difficulty: "medium",
      format: "text",
      prompt:
        "This year a company granted 240,000 time-based RSUs with an average grant-date fair value of $94.13 per share. They vest over 4 years. How much compensation expense from these RSUs will it recognize next year (a full year)?",
      choices: textChoices(1, [
        ["$22,591,200", "That's the total to be recognized over all 4 years, not one year's share."],
        ["$5,647,800", "Total expense = 240,000 × $94.13 = $22,591,200, spread over 4 years: $5,647,800 per full year."],
        ["$0 until the RSUs vest", "The expense is recognized during the vesting period, not at the end."],
        ["It depends on the share price when they vest", "The expense is fixed at the grant-date fair value."],
      ]),
      journalEntry: null,
      review: PENDING,
    },
    {
      id: "se-11",
      origin: "historical",
      source: "Fall 2025 Final, VI.2 (adapted)",
      concept: "Accounting for stock options",
      courseSession: SE,
      difficulty: "easy",
      format: "text",
      prompt:
        "This year a company granted 1,780.6 thousand stock options with a grant-date fair value of $52.83 per option. How much total compensation expense will it recognize for these options over the vesting period (in $ thousands)?",
      choices: textChoices(0, [
        ["About $94,069", "Total expense = options granted × grant-date fair value = 1,780.6 × $52.83 ≈ $94,069 thousand, recognized over the vesting period."],
        ["$0, because options aren't paid in cash", "Options are compensation; their grant-date fair value is expensed."],
        ["It depends on the stock price when they're exercised", "The total is fixed at the grant-date fair value; exercise-date prices don't matter."],
        ["Their intrinsic value at the grant date", "The course uses fair value at the grant date, not intrinsic value."],
      ]),
      journalEntry: null,
      review: PENDING,
    },
    {
      id: "se-12",
      origin: "original",
      source: null,
      concept: "Issuing common stock",
      courseSession: SE,
      difficulty: "easy",
      format: "effects",
      prompt: "A company issues 10,000 shares of $1 par common stock for $25 per share in cash. What is the effect?",
      choices: effectChoices(2, [
        [[250_000, 0, 250_000, 250_000], "Issuing stock is a financing cash flow, not an operating one."],
        [[10_000, 0, 10_000, 0], "The company received $250,000, not just the par value. The excess goes to APIC."],
        [
          [250_000, 0, 250_000, 0],
          "Cash rises $250,000. Equity rises $250,000: $10,000 to common stock (par) and $240,000 to APIC. It's a financing inflow.",
        ],
        [[250_000, 250_000, 0, 0], "Shareholders' investment is equity, not a liability."],
      ]),
      journalEntry: [dr("Cash", 250_000), cr("Common Stock", 10_000), cr("Additional Paid-in Capital", 240_000)],
      review: PENDING,
    },
    {
      id: "se-13",
      origin: "original",
      source: null,
      concept: "Treasury stock repurchases",
      courseSession: SE,
      difficulty: "easy",
      format: "effects",
      prompt: "A company buys back 5,000 of its own shares for $40 each in cash, holding them as treasury stock. What is the effect?",
      choices: effectChoices(0, [
        [
          [-200_000, 0, -200_000, 0],
          "Cash falls $200,000. Treasury stock is a contra-equity account, so equity falls by the same amount. Buybacks are financing outflows.",
        ],
        [[0, 0, 0, 0], "Treasury stock isn't an asset: a company can't own itself, so equity falls."],
        [[-200_000, 0, -200_000, -200_000], "Buying back stock is a financing outflow, not operating."],
        [[-200_000, -200_000, 0, 0], "The repurchase reduces equity; no liability is involved."],
      ]),
      journalEntry: [dr("Treasury Stock", 200_000), cr("Cash", 200_000)],
      review: PENDING,
    },
    {
      id: "se-14",
      origin: "original",
      source: null,
      concept: "Declaring cash dividends",
      courseSession: SE,
      difficulty: "easy",
      format: "effects",
      prompt: "A company's board declares a $50,000 cash dividend, to be paid next month. What is the effect of the declaration?",
      choices: effectChoices(0, [
        [
          [0, 50_000, -50_000, 0],
          "Declaring creates an obligation (dividends payable) and reduces retained earnings. No cash moves until it's paid.",
        ],
        [[-50_000, 0, -50_000, -50_000], "Nothing is paid at declaration, and dividends paid are financing, not operating."],
        [[0, 0, 0, 0], "The declaration itself is recorded: it creates a liability and reduces retained earnings."],
        [[-50_000, 0, -50_000, 0], "Cash isn't paid until next month; at declaration a liability is recorded instead."],
      ]),
      journalEntry: [dr("Retained Earnings", 50_000), cr("Dividends Payable", 50_000)],
      review: PENDING,
    },
    {
      id: "se-15",
      origin: "original",
      source: null,
      concept: "Paying cash dividends",
      courseSession: SE,
      difficulty: "medium",
      format: "effects",
      prompt: "A company pays the $50,000 cash dividend it declared last month. What is the effect of the payment?",
      choices: effectChoices(2, [
        [[-50_000, -50_000, 0, -50_000], "Dividends paid are a financing outflow, not operating."],
        [[-50_000, 0, -50_000, 0], "Retained earnings was already reduced at declaration; reducing it again would double-count."],
        [
          [-50_000, -50_000, 0, 0],
          "Paying settles the dividends payable: cash and the liability both fall. Equity was reduced at declaration. The payment is a financing outflow.",
        ],
        [[0, 0, 0, 0], "The payment is recorded: cash leaves and the liability is settled."],
      ]),
      journalEntry: [dr("Dividends Payable", 50_000), cr("Cash", 50_000)],
      review: PENDING,
    },
    {
      id: "se-16",
      origin: "original",
      source: null,
      concept: "Exercise of stock options",
      courseSession: SE,
      difficulty: "medium",
      format: "effects",
      prompt:
        "Employees exercise 1,000 stock options with a $30 exercise price, receiving 1,000 shares of $1 par stock. What is the effect of the exercise?",
      choices: effectChoices(0, [
        [
          [30_000, 0, 30_000, 0],
          "The company receives 1,000 × $30 = $30,000. Equity rises: $1,000 to common stock and $29,000 to APIC. It's a financing inflow; the compensation expense was recognized during vesting.",
        ],
        [[30_000, 0, 30_000, 30_000], "Cash from option exercises is a financing inflow."],
        [[1_000, 0, 1_000, 0], "The company received $30,000, not just the par value."],
        [[0, 0, 0, 0], "Cash is received when options are exercised, and new shares are issued."],
      ]),
      journalEntry: [dr("Cash", 30_000), cr("Common Stock", 1_000), cr("Additional Paid-in Capital", 29_000)],
      review: PENDING,
    },
    {
      id: "se-17",
      origin: "original",
      source: "Variation of Spring 2025 Final, III.5",
      concept: "Stock compensation expense",
      courseSession: SE,
      difficulty: "hard",
      format: "effects",
      prompt:
        "A company granted 12,000 stock options with a grant-date fair value of $10 each, vesting over 4 years. What is the effect of recording one year's compensation expense?",
      choices: effectChoices(0, [
        [
          [0, 0, 0, 0],
          "Expense = 12,000 × $10 ÷ 4 = $30,000. Entry: Dr. Compensation Expense; Cr. APIC. Retained earnings falls but APIC rises by the same amount, so total equity doesn't change. No cash, and the expense is added back.",
        ],
        [
          [30_000, 0, 30_000, 0],
          "This treats the APIC credit as if shares were sold for cash. No cash is received; the APIC credit just offsets the expense within equity.",
        ],
        [[0, 30_000, -30_000, 0], "Options are settled in shares, so they're credited to APIC, not a liability."],
        [[-30_000, 0, -30_000, -30_000], "No cash is paid for stock compensation."],
      ]),
      journalEntry: [dr("Compensation Expense", 30_000), cr("Additional Paid-in Capital", 30_000)],
      review: PENDING,
    },
    {
      id: "se-18",
      origin: "original",
      source: "Variation of Fall 2025 Final, VI.6",
      concept: "Stock dividends",
      courseSession: SE,
      difficulty: "hard",
      format: "text",
      prompt:
        "A company with 100,000 shares of $1 par stock outstanding declares a 10% stock dividend when its share price is $20. What is the journal entry?",
      choices: textChoices(1, [
        [
          "Dr. Retained Earnings 10,000; Cr. Common Stock 10,000",
          "This uses par value only. A small stock dividend is recorded at the shares' market value.",
        ],
        [
          "Dr. Retained Earnings 200,000; Cr. Common Stock 10,000; Cr. APIC 190,000",
          "10,000 new shares × $20 = $200,000 moves out of retained earnings: $10,000 to common stock (par) and $190,000 to APIC. Total equity doesn't change.",
        ],
        [
          "Dr. Retained Earnings 200,000; Cr. Dividends Payable 200,000",
          "That's a cash dividend. A stock dividend is paid in shares, so no liability arises.",
        ],
        ["No entry; only the number of shares changes", "That describes a stock split. A stock dividend moves retained earnings into paid-in capital."],
      ]),
      journalEntry: [dr("Retained Earnings", 200_000), cr("Common Stock", 10_000), cr("Additional Paid-in Capital", 190_000)],
      review: pendingWithNote(
        "Confirm the course records small stock dividends at market value (the past finals give the accounts but not the valuation basis).",
      ),
    },
    {
      id: "se-19",
      origin: "historical",
      source: "Spring 2025 Final, III.7 (adapted)",
      concept: "Cancelling (retiring) treasury stock",
      courseSession: SE,
      difficulty: "hard",
      format: "text",
      prompt:
        "A company cancels treasury stock that cost $771,819 thousand. The shares' par value is $150 thousand, and it charges the rest to retained earnings. What is the entry (in $ thousands)?",
      choices: textChoices(0, [
        [
          "Dr. Common Stock 150; Dr. Retained Earnings 771,669; Cr. Treasury Stock 771,819",
          "Cancelling removes the shares: common stock falls by their par value, the excess cost reduces retained earnings, and the treasury stock account is cleared.",
        ],
        [
          "Dr. Treasury Stock 771,819; Cr. Common Stock 150; Cr. Retained Earnings 771,669",
          "This is reversed: treasury stock has a debit balance, so clearing it takes a credit.",
        ],
        [
          "Dr. Cash 771,819; Cr. Treasury Stock 771,819",
          "Cancelling shares involves no cash; that entry would be reissuing them.",
        ],
        [
          "Dr. Loss on Cancellation 771,669; Dr. Common Stock 150; Cr. Treasury Stock 771,819",
          "Transactions in a company's own shares never create gains or losses on the income statement.",
        ],
      ]),
      journalEntry: [dr("Common Stock", 150), dr("Retained Earnings", 771_669), cr("Treasury Stock", 771_819)],
      review: PENDING,
    },
    {
      id: "se-20",
      origin: "original",
      source: null,
      concept: "Basic earnings per share",
      courseSession: SE,
      difficulty: "medium",
      format: "text",
      prompt:
        "A company's net income is $5,000,000 and it declared $500,000 of preferred dividends. It had 1,500,000 weighted-average common shares outstanding (1,800,000 at year-end). What is basic EPS?",
      choices: textChoices(1, [
        ["$3.33", "Preferred dividends belong to preferred shareholders, so they're subtracted from net income first."],
        ["$3.00", "Basic EPS = (net income − preferred dividends) ÷ weighted-average common shares = $4,500,000 ÷ 1,500,000 = $3.00."],
        ["$3.67", "Preferred dividends are subtracted from net income, not added."],
        ["$2.50", "This uses year-end shares. EPS uses the weighted average outstanding during the year."],
      ]),
      journalEntry: null,
      review: PENDING,
    },
    {
      id: "se-21",
      origin: "original",
      source: null,
      concept: "Share repurchases, EPS and ROE",
      courseSession: SE,
      difficulty: "medium",
      format: "text",
      prompt:
        "A company uses idle cash to buy back shares. Assume the cash was earning almost nothing, so net income is essentially unchanged. How do EPS and ROE change?",
      choices: textChoices(0, [
        [
          "EPS rises and ROE rises",
          "Fewer shares outstanding means more income per share, and the buyback reduces equity, so the same income over smaller equity raises ROE.",
        ],
        ["EPS rises and ROE falls", "Equity falls with the buyback, so ROE rises, not falls."],
        ["Both stay the same", "Both ratios have a denominator that the buyback shrinks."],
        ["EPS falls and ROE rises", "With fewer shares and the same income, EPS goes up."],
      ]),
      journalEntry: null,
      review: PENDING,
    },
    {
      id: "se-22",
      origin: "original",
      source: null,
      concept: "Equity transactions in the statement of cash flows",
      courseSession: SE,
      difficulty: "medium",
      format: "text",
      prompt: "Which of these appears in the operating section of the statement of cash flows (indirect method)?",
      choices: textChoices(2, [
        ["Dividends paid", "Payments to shareholders are financing activities."],
        ["Share repurchases", "Buying back stock is a financing activity."],
        [
          "The add-back of stock-based compensation expense",
          "Stock compensation reduces net income without using cash, so it's added back in operating activities.",
        ],
        ["Cash received from employees exercising options", "Cash from issuing shares is a financing inflow."],
      ]),
      journalEntry: null,
      review: PENDING,
    },
    {
      id: "se-23",
      origin: "original",
      source: null,
      concept: "Restricted stock units (RSUs)",
      courseSession: SE,
      difficulty: "medium",
      format: "text",
      prompt: "How is the total compensation expense measured for RSUs compared with stock options?",
      choices: textChoices(3, [
        [
          "Both at intrinsic value when they vest",
          "Both are measured at grant-date fair value, not at vesting.",
        ],
        ["RSUs aren't expensed; only options are", "RSUs are compensation too and are expensed over the vesting period."],
        [
          "RSUs at the share price when they vest; options at grant-date fair value",
          "RSUs are also measured at the grant date, not at vesting.",
        ],
        [
          "RSUs at the grant-date share price; options at the grant-date fair value from an option-pricing model",
          "An RSU will become a share, so its grant-date value is the share price. An option's value is estimated with a pricing model. Both are expensed over the vesting period.",
        ],
      ]),
      journalEntry: null,
      review: PENDING,
    },
    {
      id: "se-24",
      origin: "original",
      source: "Variation of Spring 2025 Final, III.6",
      concept: "Reissuing treasury stock",
      courseSession: SE,
      difficulty: "medium",
      format: "text",
      prompt: "A company bought 1,000 of its shares for $30 each. It later reissues all 1,000 for $36 each. What is the entry for the reissue?",
      choices: textChoices(1, [
        [
          "Dr. Cash 36,000; Cr. Treasury Stock 30,000; Cr. Gain on Sale of Stock 6,000",
          "Transactions in a company's own shares never produce income-statement gains; the excess goes to APIC.",
        ],
        [
          "Dr. Cash 36,000; Cr. Treasury Stock 30,000; Cr. APIC 6,000",
          "Treasury stock is removed at its $30,000 cost, and the $6,000 received above cost increases APIC.",
        ],
        [
          "Dr. Cash 36,000; Cr. Treasury Stock 36,000",
          "Treasury stock is carried at cost ($30,000), so only $30,000 is removed from it.",
        ],
        [
          "Dr. Treasury Stock 36,000; Cr. Cash 36,000",
          "That's the entry for buying shares back, not reissuing them.",
        ],
      ]),
      journalEntry: [dr("Cash", 36_000), cr("Treasury Stock", 30_000), cr("Additional Paid-in Capital", 6_000)],
      review: PENDING,
    },
    {
      id: "se-25",
      origin: "original",
      source: null,
      concept: "What changes total equity",
      courseSession: SE,
      difficulty: "medium",
      format: "text",
      prompt: "Which of these changes total stockholders' equity?",
      choices: textChoices(2, [
        ["A 2-for-1 stock split", "A split changes the number of shares and par per share, but no amounts."],
        ["A 10% stock dividend", "It moves amounts from retained earnings to paid-in capital; the total doesn't change."],
        [
          "Declaring a cash dividend",
          "Declaring a cash dividend reduces retained earnings and creates a liability, so total equity falls.",
        ],
        [
          "Recognizing stock compensation expense",
          "The expense lowers retained earnings, but the credit to APIC raises equity by the same amount.",
        ],
      ]),
      journalEntry: null,
      review: PENDING,
    },
  ],
};
