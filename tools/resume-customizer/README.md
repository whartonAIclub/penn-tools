# Resume Customizer

Tailors a student's resume to a job description, using their other files (past resumes, projects, writing samples) for experience the resume leaves out. They then refine it in an editor with an AI chat, compare it with the original, and download it as a PDF or Word document.

## Where things are

| | |
|---|---|
| `src/resume.ts` | The resume as data (`ResumeDoc`), its limits and export settings, the editor's HTML (`docToHtml`, which escapes all text), and the comparison with the original. No AI or DOM code: the page imports it from `@penntools/tool-resume-customizer/resume`. |
| `src/tailor.ts` | The AI calls: `tailorResume` (standard tier, low reasoning) and `reviseResume` for the chat (fast tier). Both use `generateObject`, so there's no model text to parse. `tailorResume` takes an AbortSignal, so cancelling stops the call mid-reply. Also the input checks the route and server action run. |
| `src/pdf.ts`, `src/docx.ts` | The PDF (jsPDF) and Word (docx) writers. Both write real text, never an image, so applicant tracking systems can read it. The page loads `pdf` when it first counts pages (on the Edit screen) and `docx` only for a Word download. |
| `fonts/` | Liberation Serif and Sans, embedded in the PDF (only the styles a resume uses are loaded) and shown in the editor too (SIL Open Font License, `fonts/LICENSE`). They have Times New Roman's and Arial's letter widths, so lines break where they do in the editor and in Word. |
| `apps/web/src/app/tools/resume-customizer/` | The page: `page.tsx` (sign-in and key checks); `ResumeCustomizer.tsx` (the state the steps share) and one file per screen (`LandingScreen`, `OnboardingScreen`, `WorkspaceScreen`, `GeneratingScreen`, `EditScreen` with `AiChatPanel`, `ComparisonScreen`, `ExportScreen`), each with its CSS module; `shared.tsx`, `hooks.ts` and `StepBar.tsx`; `tailor/route.ts` (tailoring, a route so the page can cancel it), `actions.ts` (the chat's server action), `parseFile.ts` (text from uploads), `editor.ts` (reads the editor back into a `ResumeDoc`), `exportResume.ts` (downloads). The color tokens are on `.shell` in `ResumeCustomizer.module.css`. |

## Cost

A generation sends the base resume, the job description and up to 40,000 characters from at most 50 other files (`LIMITS` in `src/resume.ts`): at most about 20k input tokens on the standard tier for English. The limits count characters, so text in Chinese, Japanese or Korean, at about a token a character, can come to three or four times that; each user's free credit still caps what the platform pays. Chat messages send only the current resume, the job description and the last few turns, on the fast tier. Cancelling a generation, or leaving the page during one, stops the call: only the input and what the model had written so far are charged.

## Checks

```
pnpm typecheck
pnpm check:tools
pnpm test
```

The export tests read the PDF back with pdf.js and the .docx with JSZip, to check that the text is there.
