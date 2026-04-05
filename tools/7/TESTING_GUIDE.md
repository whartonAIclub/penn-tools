# Resume Customizer — Testing Guide

This guide is for teammates testing the tool.

---

## Setup: Adding Your API Key

The tool uses an AI model to generate tailored resumes. You need to provide an API key before it will work.

**Option A — Add it to the app config (recommended for local dev):**

1. Open `apps/web/.env.local` in a text editor
2. Fill in your Anthropic key:
  ```
   ANTHROPIC_API_KEY=sk-ant-...
  ```
   Or your OpenAI key (if you have one with active credits):
3. Save the file and restart the dev server

> **Note:** Anthropic is preferred. If using Anthropic, make sure your account has credits at [console.anthropic.com](https://console.anthropic.com) → Plans & Billing, and that your workspace spend limit is not set to $0 (Settings → Workspaces).

**Option B — Enter it in the AskPenn platform playground:**

1. Go to **[http://localhost:3000/tools/platform-playground](http://localhost:3000/tools/platform-playground)**
2. Find the API key input field and enter your key
3. It saves automatically to your browser — no restart needed
4. The Resume Customizer will pick it up on the next request

---

## How to Run the App

```
pnpm --filter @penntools/web dev
```

Then open **[http://localhost:3000/tools/7](http://localhost:3000/tools/7)** in your browser.

---

## Workflow Overview

The tool follows a linear 5-step flow:

### Step 1 — Upload

Upload one or more files from your computer. Supported formats: **PDF, DOCX, PPTX, TXT**.

- Select a **file type tag** (Resume, Cover Letter, Project, Job Description, Writing Sample) before clicking "+ Add File" — you can change or delete any file after uploading
- You must upload **at least one file tagged "Resume"** to proceed
- Upload as many supporting files as you want — the AI will use all of them as context when generating

### Step 2 — Workspace

Review your uploaded files in the sidebar. The center panel shows a preview of whichever file is selected as your base resume.

- **Change tags or delete files** using the inline controls in the sidebar
- **Select your base resume** by clicking its filename — this is the document that gets tailored
- **Paste the job description** into the right panel
- Click **Generate Tailored Resume** when ready

### Step 3 — Edit

The AI-generated tailored resume is loaded into a rich-text editor.

- Use the **formatting toolbar** to adjust font, size, bold/italic/underline, alignment, and margins
- Use the **AI Editor chat panel** (right side) to ask the AI to revise specific sections — type your request and press Enter
- Click **"Apply to editor ↑"** on any AI response to replace the editor content with the suggested revision
- Click **Compare →** when you're satisfied with your edits

### Step 4 — Compare

Side-by-side view of your original resume (left) and your final edited version (right).

- Click **← Back to Edit** to return to the editor and make further changes
- Click **Export →** when you're happy with the result

### Step 5 — Export

- **Download PDF** — generates a US Letter PDF of your edited resume
- **Copy Text** — copies plain text to your clipboard
- **Tailor for another job →** — returns you to the Workspace with your files still loaded so you can generate for a different role

---

## What the Tool Can Do (Current MVP)

- Parse and extract text from PDF, DOCX, PPTX, and TXT files
- Use your base resume + all uploaded context files to generate a tailored resume for a specific job description
- Show a side-by-side comparison of original vs. your final edited version
- Let you make direct edits in a rich-text editor with formatting controls
- Let you chat with an AI to revise the resume in the editor
- Export as PDF or copy as plain text

## What It Cannot Do Yet

- **Generate cover letters** — resume-only for now
- **Save your session** — refreshing the page clears all uploaded files and generated content
- **Fine-tuned tailoring quality** — the AI generation is basic; the data team will improve prompt quality in a later iteration
- **Handle very large files** — files over ~10MB or very long documents may parse slowly or incompletely

---

## Known Limitations to Watch For

- If the AI chat says "Error: HTTP 500", your API key is missing, has no credits, or the workspace spend limit is $0
- PDF text extraction works best on text-based PDFs — scanned image PDFs will not parse correctly
- The editor's "Apply to editor" button replaces the entire editor content with the AI's response, so make sure you're happy with the suggestion before applying

---

## Feedback

Please share feedback directly with Nicole. Useful things to note:

- Which step did you get stuck on, and what did you expect to happen?
- Did the AI output look reasonable given your resume and job description?
- Any formatting or display issues in the editor or export?

