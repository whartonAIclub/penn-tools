# Due: Plan

## The problem

Every course deadline is on Canvas, but Canvas doesn't send notifications or put deadlines on your calendar. On a day when you think nothing is due, you don't open Canvas, and that's when an assignment gets missed. It has happened to us and to people we know.

## The solution

Due reads a course outline (PDF), pulls out the deadlines, and gives you a calendar file (.ics) with an event and reminders for each deadline. You add it to Google Calendar, Apple Calendar or Outlook once, and from then on your calendar warns you before things are due.

**Who it's for:** anyone at Penn who takes courses, starting with MBA students.

**Goal for a first-time visitor:** understand immediately that the job is to upload the course outline, then confirm and download, in as few steps as possible.

---

## Phase 1: MVP

One course outline in, one calendar file out.

1. **Sign in and AI key.** Like every PennTools AI tool, Due runs on the student's own OpenAI or Anthropic key, saved in Settings. A student without one sees the platform's standard "add a key" screen. This is required, so we keep the rest of the flow as short as possible.
2. **Upload** one course outline PDF.
3. **Extract.** The AI reads the PDF and returns:
   - **Course details:** course name, class meeting days and times, and the semester's first class date, if the outline mentions them.
   - **Deadlines:** graded items only, meaning assignments and exams. Each has a title, a type, and a date and time if given.
4. **Confirm course details.** The student checks or fills in the course name, class days and times, and the **Week 1 start date**. The other two features depend on these:
   - **Week-based dates.** "Week 4, Day 3" becomes a real date once Week 1's date is known.
   - **The "Class time" option.** "Due at class time" uses that day's class time.
5. **Review deadlines** in a table where the student can edit, delete or add rows.
   - Rows with no date the AI could work out are highlighted for the student to fill in.
   - Each row's time is one of:
     - **All day:** shown as a slim banner at the top of the day, not a block that fills the calendar.
     - **Class time**
     - **11:59 PM**
     - **Custom time**
   - Deadlines with no time in the outline default to **All day**.
6. **Reminders.** A sensible default preset, which the student can change before downloading (see Open questions).
7. **Download** the .ics file, with short instructions for adding it to Google, Apple and Outlook calendars.

**Not in the MVP:** multiple PDFs, recurring items (readings and so on), saved reminder settings, Canvas.

## Phase 2

- **Multiple PDFs at once.** Upload all of a semester's outlines (say, six courses) and get one .ics file covering every course.
- **Recurring items** (optional, off by default). For important non-graded work, such as readings that feed graded class discussion. The student turns it on for a course and sets:
  - **How often:** every class, once a week, or every other class
  - **When to remind:** for example, the day before class
  - **The reminder's name**

  This is a deliberately manual setup, while assignments and exams stay one-click.
- **Reminder settings that persist.** The student picks reminder times once, in Due's settings, and they apply every time.

## Phase 3 (much later)

- **Canvas calendar import.** The student downloads Canvas's own calendar file and uploads it to Due, instead of us connecting to Canvas directly. Due merges it with the outline deadlines into one cleaned-up calendar.

---

## Open questions

1. **Default reminders.** Proposed:
   - Timed deadlines: **3 hours before** and **at the due time**.
   - All-day deadlines: **9 AM that day**.

   To confirm, possibly after looking at what students prefer.
2. **Updating a calendar the student already imported.** Google can't update events by re-importing, so the download step should tell students to import into a dedicated "Due" calendar and, to update, delete it and import the new file. Open: should each download use new event IDs, so a mistaken re-import duplicates events instead of failing outright? A later phase could offer a subscription link that updates itself, which needs a database and the Platform team.
3. **What a timed deadline looks like on the calendar.** Proposed: a short event ending at the due time, titled like "DUE: Problem Set 3 (FNCE 6110)".
4. **The review screen.** The table design is a first guess. Judge it once it's visible and simplify if needed.
5. **The AI key.** Raise with the Platform team or workshop leads whether there's any way to make this step easier for students before launch.

## Google Calendar test results (2026-11-10)

- **Reminders built into the .ics file are kept** on import, for timed and all-day events alike. They show as "X minutes before" the event's start time.
- **All-day deadlines** show as a slim banner at the top of the day, as intended.
- **Re-importing can't update events.** A file containing an event whose ID is already in the calendar is rejected entirely ("Imported 0 out of 0 events"). The same event with a new ID imports as a duplicate.

## Technical notes

- **All code stays in our two folders:** `tools/due/` and `apps/web/src/app/tools/due/`.
- **PDF reading** uses the platform AI API, which accepts PDFs and returns structured data checked against a schema. PDF support was added to `main` on 2026-11-02, so merge `main` into the `due` branch before building. Penn Planner has an existing PDF import worth checking.
- **The .ics file** is built in our own code, in Philadelphia time (`America/New_York`), with no outside services.
- **No database in Phase 1.** Nothing is saved. Phase 2's saved settings can use the browser's storage, or Due's own database, which needs the Platform team to add one line.
- **References:** the Platform Playground for structured AI output, and AskPenn for file attachments.
