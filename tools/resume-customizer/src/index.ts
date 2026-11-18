// What the web app's server code imports from the package. The page's client
// code imports "@penntools/tool-resume-customizer/resume" (the resume model)
// and, when it needs them, "/pdf" and "/docx" (the exports), so it doesn't
// bundle the AI code; this package's own tests import its source files
// directly.
export { ResumeCustomizerTool } from "./ResumeCustomizerTool.js";
export {
  checkReviseInput,
  MAX_TAILOR_BYTES,
  checkTailorInput,
  reviseResume,
  tailorResume,
  type ReviseInput,
  type RevisionResult,
  type TailorInput,
} from "./tailor.js";
