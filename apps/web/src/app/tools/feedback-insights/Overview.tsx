"use client";

// The read-only tabs: Summary, Ratings & answers, Themes and How it works.

import { TAG_TYPES } from "@penntools/tool-feedback-insights";
import type { Focus } from "./Feedback";
import { Badge, plural, Short, typeTone, type TabProps } from "./shared";
import styles from "./FeedbackInsights.module.css";

const scaleText = (value: number, max: number) => `${value} / ${max}`;

type GoTo = (tab: "feedback" | "setup" | "review", show?: Focus | null) => void;

export function Summary({ ws, analysis, goTo }: TabProps & { goTo: GoTo }) {
  const lowest = analysis.ratings[0];
  // The top three ratings that aren't marked low, best first.
  const best = analysis.ratings
    .filter((r) => !r.low)
    .slice(-3)
    .reverse();
  return (
    <>
      <div className={styles.tiles}>
        <div className={styles.tile}>
          <p className={styles.tileLabel}>Responses counted</p>
          <p className={styles.tileValue}>{analysis.counted}</p>
          <p className={styles.tileSub}>
            {analysis.excluded} excluded, {analysis.needsReview} to review
          </p>
        </div>
        <div className={styles.tile}>
          <p className={styles.tileLabel}>Response rate</p>
          <p className={styles.tileValue}>{analysis.responseRate == null ? "–" : `${analysis.responseRate}%`}</p>
          <p className={styles.tileSub}>
            {ws.setup.cohortSize ? (
              `of ${ws.setup.cohortSize} people asked`
            ) : (
              <button type="button" className={styles.linkButton} onClick={() => goTo("setup")}>
                Add how many people were asked
              </button>
            )}
          </p>
        </div>
        <div className={styles.tile}>
          <p className={styles.tileLabel}>Lowest rated</p>
          <p className={styles.tileValue}>{lowest ? scaleText(lowest.average, lowest.max) : "–"}</p>
          <p className={styles.tileSub}>{lowest ? lowest.label : "No rating questions found"}</p>
        </div>
        <div className={styles.tile}>
          <p className={styles.tileLabel}>Tagged comments</p>
          <p className={styles.tileValue}>{analysis.comments.length}</p>
          <p className={styles.tileSub}>
            {analysis.untagged.length > 0 ? (
              <button type="button" className={styles.linkButton} onClick={() => goTo("feedback")}>
                {analysis.untagged.length} {plural(analysis.untagged.length, "answer", "answers")} still to tag
              </button>
            ) : (
              "Every written answer is tagged"
            )}
          </p>
        </div>
      </div>

      <section className={styles.section}>
        <h2 className={styles.h2}>What to change first</h2>
        {analysis.recommendations.length === 0 ? (
          <p className={styles.empty}>
            Nothing to rank yet. Recommendations come from written answers tagged as pain points.{" "}
            <button type="button" className={styles.linkButton} onClick={() => goTo("feedback")}>
              Tag the written answers
            </button>
          </p>
        ) : (
          <>
            <p className={styles.muted}>
              Priority runs from 1 to 5, and 5 is the most urgent in this survey. It combines how many people raised a problem in the theme with how low the
              theme was rated.
            </p>
            <ol className={styles.ranked}>
              {analysis.recommendations.map((r) => (
                <li key={r.theme} className={styles.rankCard}>
                  <span className={styles.rankNumber} aria-label={`Rank ${r.rank}`}>
                    {r.rank}
                  </span>
                  <div className={styles.rankBody}>
                    <div className={styles.rankHead}>
                      <h3 className={styles.rankTitle}>{r.theme || "(no theme)"}</h3>
                      <span className={styles.rankStats}>
                        <span>
                          <button
                            type="button"
                            className={styles.countLink}
                            title="See the comments behind this"
                            onClick={() => goTo("feedback", { theme: r.theme, type: "Pain point" })}
                          >
                            <strong>{r.people}</strong> {plural(r.people, "person", "people")} · see comments
                          </button>
                        </span>
                        <span>
                          {r.rating == null ? (
                            "not rated"
                          ) : (
                            <>
                              <strong>{r.rating}</strong> / 5
                            </>
                          )}
                        </span>
                        <span
                          title={`Score ${r.score}: ${r.people} × a rating gap of ${r.rating == null ? ws.setup.noRatingGap : Math.round((5 - r.rating) * 100) / 100}`}
                        >
                          <Badge tone={r.priority >= 4 ? "bad" : r.priority === 3 ? "warn" : "info"}>Priority {r.priority} of 5</Badge>
                        </span>
                      </span>
                    </div>
                    <dl className={styles.pairs}>
                      <div>
                        <dt>Main problem</dt>
                        <dd>
                          {r.problemMentions > 0 ? (
                            <>
                              {r.problem} <span className={styles.mentions}>said {r.problemMentions}×</span>
                            </>
                          ) : (
                            <span className={styles.mentions}>{r.problem}</span>
                          )}
                          <span className={styles.quote}>“{r.quote}”</span>
                        </dd>
                      </div>
                      <div>
                        <dt>Most suggested fix</dt>
                        <dd>
                          {r.fix ? (
                            <>
                              {r.fix} <span className={styles.mentions}>said {r.fixMentions}×</span>
                            </>
                          ) : (
                            <span className={styles.mentions}>No idea tagged yet</span>
                          )}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>What to keep</h2>
        {analysis.strengths.length === 0 && best.length === 0 ? (
          <p className={styles.empty}>Nothing here yet. This fills in from ratings and from written answers tagged as Working.</p>
        ) : (
          <>
            <p className={styles.muted}>What people said went well, most praised first. Protect these when you make changes.</p>
            {best.length > 0 && (
              <div className={styles.tiles}>
                {best.map((r) => (
                  <div key={r.column} className={styles.tileGood}>
                    <p className={styles.tileLabel}>Highly rated</p>
                    <p className={styles.tileValue}>{scaleText(r.average, r.max)}</p>
                    <p className={styles.tileSub}>{r.label}</p>
                  </div>
                ))}
              </div>
            )}
            <ol className={styles.ranked}>
              {analysis.strengths.map((k) => (
                <li key={k.theme} className={styles.rankCard}>
                  <span className={styles.rankNumberGood} aria-label={`Rank ${k.rank}`}>
                    {k.rank}
                  </span>
                  <div className={styles.rankBody}>
                    <div className={styles.rankHead}>
                      <h3 className={styles.rankTitle}>{k.theme || "(no theme)"}</h3>
                      <span className={styles.rankStats}>
                        <span>
                          <button
                            type="button"
                            className={styles.countLink}
                            title="See the comments behind this"
                            onClick={() => goTo("feedback", { theme: k.theme, type: "Working" })}
                          >
                            <strong>{k.people}</strong> {plural(k.people, "person", "people")} · see comments
                          </button>
                        </span>
                        <span>
                          {k.rating == null ? (
                            "not rated"
                          ) : (
                            <>
                              <strong>{k.rating}</strong> / 5
                            </>
                          )}
                        </span>
                      </span>
                    </div>
                    <dl className={styles.pairs}>
                      <div>
                        <dt>Most praised</dt>
                        <dd>
                          {k.topic} <span className={styles.mentions}>said {k.topicMentions}×</span>
                          <span className={styles.quote}>“{k.quote}”</span>
                        </dd>
                      </div>
                      {k.alsoPraised.length > 0 && (
                        <div>
                          <dt>Also praised</dt>
                          <dd>
                            {k.alsoPraised.map((a, i) => (
                              <span key={a.topic}>
                                {i > 0 && ", "}
                                {a.topic} <span className={styles.mentions}>{a.mentions}×</span>
                              </span>
                            ))}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>
    </>
  );
}

function Bar({ fraction, low = false }: { fraction: number; low?: boolean }) {
  const width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
  return (
    <span className={styles.barTrack} aria-hidden="true">
      <span className={low ? styles.barFillLow : styles.barFill} style={{ width }} />
    </span>
  );
}

export function Ratings({ ws, analysis }: TabProps) {
  const { ratings, distributions } = analysis;
  if (ratings.length === 0 && distributions.length === 0) {
    return (
      <p className={styles.empty}>No rating or multiple-choice questions were found. If that&apos;s wrong, set each question&apos;s type on the Setup tab.</p>
    );
  }
  return (
    <>
      {ratings.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.h2}>Ratings, lowest first</h2>
          <p className={styles.muted}>Average of the responses that answered. “Low” marks anything under {ws.setup.flagBelow} out of 5.</p>
          <div className={styles.bars}>
            {ratings.map((r) => (
              <div key={r.column} className={styles.barRow}>
                <span className={styles.barLabel} title={r.group ? `${r.group} [${r.label}]` : r.label}>
                  {r.label}
                </span>
                <Bar fraction={r.max > r.min ? (r.average - r.min) / (r.max - r.min) : 0} low={r.low} />
                <span className={styles.barValue}>
                  {scaleText(r.average, r.max)} {r.low && <Badge tone="bad">Low</Badge>}
                  <span className={styles.barCount}>{r.answered} answered</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {distributions.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.h2}>Other questions</h2>
          <div className={styles.cards}>
            {distributions.map((d) => (
              <div key={d.column} className={styles.card}>
                <h3 className={styles.h3}>{d.label}</h3>
                <p className={styles.muted}>
                  {d.answered} answered
                  {d.average != null ? `, average ${d.average}` : ""}
                  {d.kind === "multi" ? ", could pick several" : ""}
                </p>
                {d.options.length === 0 ? (
                  <p className={styles.muted}>No answers yet.</p>
                ) : (
                  <div className={styles.bars}>
                    {d.options.map((o) => (
                      <div key={o.option} className={styles.optionRow}>
                        <span className={styles.optionLabel}>{o.option}</span>
                        <Bar fraction={o.percent / 100} />
                        <span className={styles.optionValue}>
                          {o.count} ({o.percent}%)
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

export function Themes({ analysis, goTo }: TabProps & { goTo: GoTo }) {
  if (analysis.themes.length === 0) {
    return <p className={styles.empty}>No tagged comments yet. Tag the written answers on the All feedback tab and the themes show up here.</p>;
  }
  const top = Math.max(...analysis.themes.map((t) => t.total), 1);
  return (
    <>
      <section className={styles.section}>
        <h2 className={styles.h2}>Comments by theme</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Theme</th>
                <th className={styles.num}>Pain points</th>
                <th className={styles.num}>Working</th>
                <th className={styles.num}>Ideas</th>
                <th className={styles.num}>All</th>
                <th aria-hidden="true" className={styles.stackHead} />
              </tr>
            </thead>
            <tbody>
              {analysis.themes.map((t) => (
                <tr key={t.theme}>
                  <td data-label="Theme">
                    <button
                      type="button"
                      className={styles.countLink}
                      title="See this theme's comments"
                      onClick={() => goTo("feedback", { theme: t.theme, type: "" })}
                    >
                      <strong>{t.theme || "(no theme)"}</strong>
                    </button>
                  </td>
                  <td data-label="Pain points" className={styles.num}>
                    {t.pain}
                  </td>
                  <td data-label="Working" className={styles.num}>
                    {t.working}
                  </td>
                  <td data-label="Ideas" className={styles.num}>
                    {t.idea}
                  </td>
                  <td data-label="All" className={styles.num}>
                    {t.total}
                  </td>
                  <td aria-hidden="true" className={styles.stackCell}>
                    <span className={styles.stack} style={{ width: `${(t.total / top) * 100}%` }}>
                      {t.pain > 0 && <span className={styles.stackPain} style={{ flexGrow: t.pain }} />}
                      {t.working > 0 && <span className={styles.stackWorking} style={{ flexGrow: t.working }} />}
                      {t.idea > 0 && <span className={styles.stackIdea} style={{ flexGrow: t.idea }} />}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Most mentioned topics</h2>
        <div className={styles.cards}>
          {TAG_TYPES.map((type) => {
            const topics = analysis.topics.filter((t) => t.type === type).slice(0, 8);
            return (
              <div key={type} className={styles.card}>
                <h3 className={styles.h3}>
                  <Badge tone={typeTone(type)}>{type === "Pain point" ? "Pain points" : type === "Idea" ? "Ideas" : type}</Badge>
                </h3>
                {topics.length === 0 ? (
                  <p className={styles.muted}>None tagged yet.</p>
                ) : (
                  <ol className={styles.list}>
                    {topics.map((t) => (
                      <li key={t.topic}>
                        {t.topic}{" "}
                        <span className={styles.muted}>
                          {t.count}× · <Short text={t.theme} max={30} />
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

export function HowItWorks({ ws, analysis }: TabProps) {
  return (
    <div className={styles.prose}>
      <h2 className={styles.h2}>The short version</h2>
      <ol>
        <li>You load a file of survey responses. The tool works out what each question is; you can correct it on the Setup tab.</li>
        <li>It standardizes formats, flags responses that look off, and counts everything else.</li>
        <li>Written answers get tagged with a theme, a topic and a type, by AI or by hand. You can edit any tag.</li>
        <li>The Summary ranks what to change first.</li>
      </ol>

      <h2 className={styles.h2}>What gets changed in your data</h2>
      <p>Formats are standardized. Meaning never is: no written answer is reworded and nothing is deleted. In this survey so far:</p>
      <ul>
        {analysis.standardized.map((s) => (
          <li key={s.rule}>
            {s.rule}: <strong>{s.count}</strong>
          </li>
        ))}
      </ul>

      <h2 className={styles.h2}>Flags suggest, people decide</h2>
      <p>
        A response is flagged when it looks like a duplicate, is empty, has junk text, gives the same rating to everything, contradicts itself, or may contain a
        name or contact details. A flagged response still counts. It leaves the numbers only when someone presses Exclude on the Needs review tab, and that can
        be undone.
      </p>

      <h2 className={styles.h2}>How the ranking works</h2>
      <p>
        Each theme gets a score: the number of different people who raised a pain point in it × how far its rating is from 5. A theme named the same as a rating
        question uses that rating; any other theme uses a gap of {ws.setup.noRatingGap}. Ten people complaining about something rated 2.9 outranks three people
        complaining about something rated 4.1.
      </p>
      <p>
        The score is then put on a 1 to 5 scale against the highest score in the survey, so the top problem is always 5 and one with half its score is a 3.
        Priority compares problems within one survey. A 5 means “the biggest problem here”, not “a serious problem”: in a survey where everything went well,
        something is still a 5.
      </p>
      <p>With fewer than {ws.setup.lowSample} responses, treat rankings as a starting point for conversation, not a result.</p>

      <h2 className={styles.h2}>Privacy</h2>
      <ul>
        <li>Your file is read in this browser and kept in this browser&apos;s storage. PennTools does not store it.</li>
        <li>Responses are shown by number, never by timestamp, and columns named like Name or Email are ignored unless you turn them on.</li>
        <li>
          Tag with AI sends only the written answers you haven&apos;t tagged, with emails, phone numbers and @handles masked. A name written inside an answer is
          sent as written; the AI is told to replace it with a role like [mentor], and the page warns you if one slips through.
        </li>
      </ul>

      <h2 className={styles.h2}>Working with other people</h2>
      <p>
        Use Save a copy to download this survey with its tags and decisions as one file. Anyone can open that file here with Choose a file and carry on. Only
        one person should edit at a time: two copies edited separately can&apos;t be merged automatically. Tags and decisions can also be exported as CSV from
        the Setup tab.
      </p>
    </div>
  );
}
