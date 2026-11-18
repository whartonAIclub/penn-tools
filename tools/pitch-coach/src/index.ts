// What the web app imports from the package. The page's client code imports
// delivery metrics from "@penntools/tool-pitch-coach/delivery" instead, so it
// doesn't bundle the AI code; this package's own tests import its source files
// directly.
export { PitchCoachTool } from "./PitchCoachTool.js";
export {
  MAX_QUESTION_LENGTH,
  MAX_CONTEXT_LENGTH,
  Feedback,
  analyzeAnswer,
  checkAnswer,
  checkImprovements,
  rewriteAnswer,
  type AnalysisResult,
  type PracticeAnswer,
} from "./coach.js";
