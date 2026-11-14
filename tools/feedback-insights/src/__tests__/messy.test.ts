// The messy-survey cases: what real respondents and real exports do. Each one
// was a bug or a near miss while the tool was being built.

import { describe, it, expect } from "vitest";
import {
  analyze,
  cleanResponses,
  decisionsFromCsv,
  detectSetup,
  FLAGS,
  hasPersonalInfo,
  isJunk,
  maskContactInfo,
  mergeSetup,
  normalizeTimestamp,
  parseCsv,
  quoteMatches,
  sampleWorkspace,
  setQuestionKind,
  stripIdentityColumns,
  tagsFromCsv,
  tagsToCsv,
  toCsv,
  workspaceFromJson,
  workspaceToJson,
} from "../index.js";
import type { Workspace } from "../index.js";

const HEADER = "Timestamp,How useful was each part? [Setup],How useful was each part? [Launch],How useful was each part? [Support],Pace,Where did you get stuck?";

function workspace(lines: string[], header = HEADER): Workspace {
  const table = parseCsv([header, ...lines].join("\n"));
  return { name: "Test", table, setup: detectSetup(table), tags: [], decisions: [], skipped: [] };
}

const GOOD = [
  '11/17/2026 19:41:50,2,4,3,Too fast,"The deploy failed, twice"',
  "11/17/2026 20:02:11,5 - Very useful,3,4,About right,Git setup took a whole session",
  "11/18/2026 9:15:00,1 - Not useful,5,2,Too fast,Nobody answered in Slack",
  "11/18/2026 10:30:00,3,4,5,About right,n/a",
];

describe("reading files", () => {
  it("reads quoted commas, quotes, line breaks, a BOM and Windows line ends", () => {
    const t = parseCsv('﻿a,b\r\n"x, y","say ""hi""\nthere"\r\n');
    expect(t.columns).toEqual(["a", "b"]);
    expect(t.rows).toEqual([{ a: "x, y", b: 'say "hi"\nthere' }]);
  });

  it("reads tab and semicolon separated files", () => {
    expect(parseCsv("a\tb\n1\t2").rows).toEqual([{ a: "1", b: "2" }]);
    expect(parseCsv("a;b\n1;2").rows).toEqual([{ a: "1", b: "2" }]);
  });

  it("keeps two columns with the same header apart, pads short rows and drops blank ones", () => {
    const t = parseCsv("Comments,Comments,\none\n,,\ntwo,three,four");
    expect(t.columns).toEqual(["Comments", "Comments (2)", "Column 3"]);
    expect(t.rows).toHaveLength(2);
    expect(t.rows[0]).toEqual({ Comments: "one", "Comments (2)": "", "Column 3": "" });
  });

  it("an empty file is an empty table, not an error", () => {
    expect(parseCsv("")).toEqual({ columns: [], rows: [] });
    expect(analyze(workspace([], "")).counted).toBe(0);
  });

  it("writes cells a spreadsheet can't run as formulas", () => {
    expect(toCsv(["a"], [{ a: "=HYPERLINK(1)" }, { a: "-5" }, { a: 'x,"y"' }])).toBe("a\n'=HYPERLINK(1)\n-5\n\"x,\"\"y\"\"\"\n");
  });
});

describe("timestamps", () => {
  it("gives every spelling of a moment the same ID", () => {
    for (const text of ["11/17/2026 19:41:50", "11/17/2026 7:41:50 PM", "11/17/2026, 7:41:50 pm", "2026-11-17 19:41:50", "2026-11-17T19:41:50Z"]) {
      expect(normalizeTimestamp(text)).toBe("2026-11-17 19:41:50");
    }
  });

  it("rejects dates that aren't real instead of guessing", () => {
    for (const text of ["13/11/2026 10:00:00", "11/17/2026 25:00:00", "11/17/2026 13:00 PM", "yesterday", ""]) {
      expect(normalizeTimestamp(text)).toBeNull();
    }
  });
});

describe("working out what each column is", () => {
  it("guesses grids, scales, choices and written questions", () => {
    const { setup } = sampleWorkspace();
    const kinds = Object.fromEntries(setup.questions.map((q) => [q.column, q.kind]));
    expect(setup.timestampColumn).toBe("Timestamp");
    expect(setup.questions.filter((q) => q.kind === "rating")).toHaveLength(8);
    expect(setup.questions.filter((q) => q.kind === "text")).toHaveLength(7);
    expect(kinds["How was the pace of the program?"]).toBe("scale");
    expect(kinds["Do you plan to keep maintaining or updating your tool?"]).toBe("choice");
    expect(kinds["Which of these did your tool reach by demo day?"]).toBe("multi");
  });

  it("drops columns that identify people as the file is read, and from saved copies", () => {
    const table = parseCsv("Timestamp,Email Address,Name,RecipientEmail,IPAddress,Rating,Score\n11/17/2026 19:41:50,a@upenn.edu,Pat,p@x.org,1.2.3.4,4,10");
    const { table: clean, removed } = stripIdentityColumns(table);
    expect(removed).toEqual(["Email Address", "Name", "RecipientEmail", "IPAddress"]);
    expect(clean.columns).toEqual(["Timestamp", "Rating", "Score"]);
    expect(JSON.stringify(clean)).not.toContain("upenn.edu");
    const old = JSON.stringify({ format: "penntools-feedback-insights", table });
    expect(JSON.stringify(workspaceFromJson(old))).not.toContain("upenn.edu");
    expect(detectSetup(clean).questions.find((q) => q.column === "Score")?.kind).toBe("ignore");
  });

  it("never analyzes a name or email column unless someone turns it on", () => {
    const ws = workspace(["11/17/2026 19:41:50,a@upenn.edu,4"], "Timestamp,Email Address,Rating");
    expect(ws.setup.questions.find((q) => q.column === "Email Address")?.kind).toBe("ignore");
  });

  it("keeps checkbox options that hold a comma whole", () => {
    const ws = workspace(
      ['1/1/2026 10:00:00,"Merged, but not launched"', '1/1/2026 11:00:00,"Merged, but not launched, Has users"', "1/1/2026 12:00:00,Has users", '1/1/2026 13:00:00,"Has users, Demoed"', "1/1/2026 14:00:00,Demoed"],
      "Timestamp,Reached",
    );
    const q = ws.setup.questions[0]!;
    expect(q.kind).toBe("multi");
    expect(q.options).toContain("Merged, but not launched");
    expect(cleanResponses(ws.table, ws.setup)[1]!.values["Reached"]).toEqual(expect.arrayContaining(["Merged, but not launched", "Has users"]));
  });

  it("keeps what a person chose when a newer export is loaded, and picks up new columns", () => {
    const ws = workspace(GOOD);
    const chosen = setQuestionKind(ws.setup, ws.table, "Pace", "text");
    const newer = parseCsv([HEADER + ",New question", GOOD[0] + ",hello there everyone"].join("\n"));
    const merged = mergeSetup({ ...chosen, themes: ["Mine"], cohortSize: 30 }, newer);
    expect(merged.questions.find((q) => q.column === "Pace")?.kind).toBe("text");
    expect(merged.questions.map((q) => q.column)).toContain("New question");
    expect(merged.themes).toEqual(["Mine"]);
    expect(merged.cohortSize).toBe(30);
  });
});

describe("standardizing: format, never meaning", () => {
  it("turns rating labels into numbers and placeholders into blanks, and leaves written answers alone", () => {
    const ws = workspace(GOOD);
    const [first, second, , fourth] = cleanResponses(ws.table, ws.setup);
    expect(second!.values["How useful was each part? [Setup]"]).toBe(5);
    expect(first!.values["Where did you get stuck?"]).toBe("The deploy failed, twice");
    expect(fourth!.values["Where did you get stuck?"]).toBeNull();
    expect(first!.id).toBe("2026-11-17 19:41:50");
  });

  it("leaves a value it can't read out of the numbers and flags it, instead of guessing", () => {
    const ws = workspace([...GOOD, "11/18/2026 11:00:00,great,ok,4,About right,It was fine overall honestly"]);
    const last = cleanResponses(ws.table, ws.setup)[4]!;
    expect(last.values["How useful was each part? [Setup]"]).toBeNull();
    expect(last.values["How useful was each part? [Launch]"]).toBeNull();
    expect(last.flags).toContain("Unrecognized value in 2 answers");
    expect(analyze(ws).ratings.find((r) => r.label === "Setup")?.answered).toBe(4);
  });
});

describe("flags suggest, people decide", () => {
  it("flags a double submission, and counts it until someone excludes it", () => {
    const ws = workspace([...GOOD, '11/17/2026 19:44:02,2,4,3,Too fast,"The deploy failed, twice"']);
    const before = analyze(ws);
    expect(before.responses[4]!.flags).toContain(FLAGS.duplicate);
    expect(before.counted).toBe(5);
    const after = analyze({ ...ws, decisions: [{ responseId: "11/17/2026 19:44:02", decision: "Exclude", reason: "Sent twice", reviewer: "" }] });
    expect(after.counted).toBe(4);
    expect(after.responses[4]!.status).toBe("Excluded");
  });

  it("does not call the same answers a day apart a duplicate", () => {
    const ws = workspace([...GOOD, '11/19/2026 19:44:02,2,4,3,Too fast,"The deploy failed, twice"']);
    expect(analyze(ws).responses[4]!.flags).not.toContain(FLAGS.duplicate);
  });

  it("flags empty, junk, straight-line and hand-typed responses", () => {
    const ws = workspace([...GOOD, "11/18/2026 12:00:00,,,,,", "11/18/2026 12:05:00,4,4,4,About right,asdfgh", ",3,2,5,Too fast,Typed in by an organizer afterwards"]);
    const r = analyze(ws).responses;
    expect(r[4]!.flags).toContain(FLAGS.empty);
    expect(r[5]!.flags).toEqual(expect.arrayContaining([FLAGS.junk, FLAGS.sameRating]));
    expect(r[6]!.flags).toContain(FLAGS.noTimestamp);
    expect(r.slice(0, 4).every((x) => x.status === "OK")).toBe(true);
  });

  it("tells responses with the same timestamp apart", () => {
    const ws = workspace([GOOD[0]!, "11/17/2026 19:41:50,5,5,1,About right,Something entirely different here"]);
    const r = analyze(ws).responses;
    expect(r.map((x) => x.id)).toEqual(["2026-11-17 19:41:50", "2026-11-17 19:41:50 (2)"]);
    expect(r[1]!.flags).toContain(FLAGS.sharedId);
  });

  it("knows junk in any alphabet from a short real answer", () => {
    expect(isJunk("asdfgh")).toBe(true);
    expect(isJunk("..")).toBe(true);
    expect(isJunk("很好的课程")).toBe(false);
    expect(isJunk("Git")).toBe(false);
  });

  it("works without a timestamp column, going by row", () => {
    const ws = workspace(["4,Too slow in week one", "2,Could not install anything"], "Rating,What went wrong?");
    const a = analyze(ws);
    expect(a.responses.map((r) => r.id)).toEqual(["row 1", "row 2"]);
    expect(a.checks.map((c) => c.id)).toContain("no_timestamp");
  });
});

describe("privacy", () => {
  it("spots names after a role word and contact details, not ordinary sentences", () => {
    expect(hasPersonalInfo("Mentor Jamie Lee was the reason we shipped")).toBe(true);
    expect(hasPersonalInfo("thanks sam, really helped")).toBe(true);
    expect(hasPersonalInfo("email me at someone@example.com")).toBe(true);
    expect(hasPersonalInfo("The mentor sessions were great")).toBe(false);
    expect(hasPersonalInfo("thanks for everything")).toBe(false);
  });

  it("masks contact details before text is sent anywhere", () => {
    expect(maskContactInfo("ping @jlee or j.lee@example.com, 215-555-0100")).toBe("ping [handle] or [email], [phone]");
  });
});

describe("the numbers", () => {
  it("matches the sample survey worked out by hand", () => {
    const a = analyze(sampleWorkspace());
    expect([a.responses.length, a.counted, a.excluded, a.needsReview, a.responseRate]).toEqual([25, 24, 1, 3, 60]);
    expect(a.ratings[0]).toMatchObject({ label: "The PennTools platform", average: 2.88, low: true });
    expect(a.ratings.filter((r) => r.low).map((r) => r.label)).toEqual(["The PennTools platform", "Setup and onboarding", "Testing and prioritization"]);
    expect(a.recommendations[0]).toMatchObject({ theme: "Setup and onboarding", problem: "Install and Git setup", people: 8, fix: "Pre-work setup checklist", score: 16.3 });
    expect(a.recommendations[2]).toMatchObject({ theme: "Pace and workload", rating: null, score: 7.5 });
    // Priority is the score on a 1-5 scale against the top one: 16.3, 14.8, 7.5, 5.3, 4.4, 2.4, 1.5, 1, 0.9.
    expect(a.recommendations.map((r) => r.priority)).toEqual([5, 5, 3, 2, 2, 2, 1, 1, 1]);
    expect(a.checks.map((c) => [c.id, c.count])).toEqual([["untagged", 12], ["needs_review", 3], ["excluded", 1]]);
    expect(new Set(a.untagged.map((u) => u.responseNumber))).toEqual(new Set([24, 25]));
  });

  it("ranks what's working by how many people praised it", () => {
    const { strengths } = analyze(sampleWorkspace());
    expect(strengths.length).toBeGreaterThan(2);
    expect(strengths.map((s) => s.people)).toEqual([...strengths.map((s) => s.people)].sort((a, b) => b - a));
    expect(strengths[0]!.quote).not.toBe("");
    expect(strengths[0]!.topicMentions).toBeGreaterThan(0);
  });

  it("counts a person once per theme however many tags they have", () => {
    const ws = workspace(GOOD);
    const tag = (id: string, text: string, topic: string) => ({ id, responseId: "11/17/2026 19:41:50", source: "Survey", question: "Where did you get stuck?", text, theme: "Setup", topic, type: "Pain point" });
    const a = analyze({ ...ws, tags: [tag("C001", "The deploy failed", "Deploy"), tag("C002", "twice", "Retries")] });
    expect(a.recommendations[0]).toMatchObject({ theme: "Setup", people: 1 });
  });

  it("compares ratings on different scales fairly", () => {
    const ws = workspace(["1/1/2026 10:00:00,5,5", "1/1/2026 11:00:00,5,10", "1/1/2026 12:00:00,5,0"], "Timestamp,Parts [Five],Parts [Ten]");
    const ratings = analyze(ws).ratings;
    expect(ratings.find((r) => r.label === "Ten")).toMatchObject({ average: 5, outOfFive: 3, max: 10 });
    expect(ratings.find((r) => r.label === "Five")).toMatchObject({ average: 5, outOfFive: 5 });
  });
});

describe("checks on tags and decisions", () => {
  const tagged = (over: Record<string, string>): Workspace => {
    const ws = workspace(GOOD);
    return { ...ws, tags: [{ id: "C001", responseId: "11/17/2026 19:41:50", source: "Survey", question: "Where did you get stuck?", text: "The deploy failed", theme: "Setup", topic: "Deploy", type: "Pain point", ...over }] };
  };
  const ids = (ws: Workspace) => analyze(ws).checks.map((c) => c.id);

  it("accepts a tag written with different case, spacing or timestamp spelling", () => {
    const a = analyze(tagged({ responseId: "11/17/2026 7:41:50 PM", theme: "setup", type: "pain point" }));
    expect(a.comments[0]).toMatchObject({ theme: "Setup", type: "Pain point", responseNumber: 1 });
    expect(a.checks.map((c) => c.id)).not.toContain("unknown_themes");
  });

  it("reports tags for a missing response, a misspelled theme and an unknown type", () => {
    expect(ids(tagged({ responseId: "11/20/2026 10:00:00" }))).toContain("orphan_tags");
    expect(ids(tagged({ theme: "Set up" }))).toContain("unknown_themes");
    expect(ids(tagged({ type: "Negative" }))).toContain("unknown_types");
  });

  it("reports a tag whose quote is no longer in the answer, allowing [role] edits", () => {
    expect(ids(tagged({ text: "Something nobody wrote" }))).toContain("stale_tags");
    expect(quoteMatches("[mentor] was the reason we shipped", "Mentor Jamie Lee was the reason we shipped")).toBe(true);
  });

  it("counts feedback from outside the survey, such as an interview", () => {
    const a = analyze(tagged({ responseId: "Interview 3", source: "Interview", question: "", text: "Setup took a week" }));
    expect(a.comments[0]).toMatchObject({ other: true, dropped: null });
    expect(a.checks.map((c) => c.id)).not.toContain("orphan_tags");
  });

  it("stops asking for a tag once an answer is marked as nothing to tag", () => {
    const ws = workspace(GOOD);
    expect(analyze(ws).untagged).toHaveLength(3);
    const a = analyze({ ...ws, skipped: [{ responseId: "11/17/2026 7:41:50 PM", question: "Where did you get stuck?" }] });
    expect(a.untagged.map((u) => u.responseNumber)).toEqual([2, 3]);
  });

  it("counts a repeated tag once", () => {
    const ws = tagged({});
    const a = analyze({ ...ws, tags: [...ws.tags, { ...ws.tags[0]!, id: "C002" }] });
    expect(a.comments).toHaveLength(1);
    expect(a.checks.map((c) => c.id)).toContain("duplicate_tags");
  });

  it("warns when a question was reworded after setup", () => {
    const ws = workspace(GOOD);
    const renamed = parseCsv([HEADER.replace("Pace", "How was the pace?"), ...GOOD].join("\n"));
    expect(ids({ ...ws, table: renamed })).toContain("missing_questions");
  });
});

describe("files in and out", () => {
  it("round-trips tags through CSV, with either heading for the type", () => {
    const { tags } = sampleWorkspace();
    expect(tagsFromCsv(tagsToCsv(tags)).items).toEqual(tags);
    expect(tagsFromCsv("response_id,text,theme,type\nR1,hello,Setup,idea").items[0]).toMatchObject({ id: "T001", type: "Idea" });
    expect(tagsFromCsv("a,b\n1,2").notes[0]).toMatch(/doesn't look like a tags file/);
  });

  it("reads review decisions however they are typed, and reports the ones it can't", () => {
    const { items, notes } = decisionsFromCsv("response_id,decision,reason,reviewer\nR1,excluded,dup,\nR2,KEEP,,\nR3,maybe,,\nR1,keep,changed my mind,");
    expect(items).toEqual([
      { responseId: "R1", decision: "Keep", reason: "changed my mind", reviewer: "" },
      { responseId: "R2", decision: "Keep", reason: "", reviewer: "" },
    ]);
    expect(notes).toHaveLength(2);
  });

  it("round-trips a workspace, and survives a file edited by hand", () => {
    const ws = sampleWorkspace();
    expect(workspaceFromJson(workspaceToJson(ws))).toEqual(ws);
    expect(workspaceFromJson("not json")).toBeNull();
    expect(workspaceFromJson('{"format":"something-else"}')).toBeNull();
    const broken = workspaceFromJson(JSON.stringify({ format: "penntools-feedback-insights", table: { columns: ["Timestamp", "Rating"], rows: [{ Timestamp: "1/1/2026 10:00:00", Rating: "4" }, "junk"] }, setup: { themes: "oops", flagBelow: "high" }, tags: [{ text: 5 }], decisions: [{ decision: "Maybe" }] }));
    expect(broken?.table.rows).toHaveLength(1);
    expect(broken?.setup.flagBelow).toBe(3.5);
    expect(broken?.decisions).toEqual([]);
    expect(() => analyze(broken!)).not.toThrow();
  });
});
