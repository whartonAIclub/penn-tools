export { ChooseMbaMajorTool } from "./ChooseMbaMajorTool.js";
export { buildCatalog, departmentName, termLabel, DEPARTMENTS } from "./courses.js";
export type { Catalog, Course, PennCoursePlanCourse } from "./courses.js";
export { CURRENT_CATALOG } from "./currentCatalog.js";
export {
  MAJORS,
  MAJORS_RETRIEVED,
  MULTIPLE_MAJOR_RULES,
  courseCodes,
  groupIncludes,
  majorIncludes,
} from "./majors.js";
export type { Major, CourseGroup, DepartmentSelector } from "./majors.js";
export { fitMajor, recommendMajors, bestPair, MAX_SHARED_CREDITS } from "./recommend.js";
export type { MajorFit, MajorPair, PlannedCourse, Gap } from "./recommend.js";
export { rankCourses, setRating, sanitizeRatings, isRating, RATING_LABELS } from "./ratings.js";
export type { Rating, Ratings, RankedCourse } from "./ratings.js";
export {
  EMPTY_DRAFT,
  INDIVIDUALIZED_MAX_CREDITS,
  MAX_ALIGNMENT_LENGTH,
  MAX_THEME_LENGTH,
  MAX_TITLE_LENGTH,
  OVERLAP_WARNING_SHARE,
  candidateCourses,
  checkDraft,
  creditsOf,
  isReady,
  majorOverlaps,
  planCourses,
  sanitizeDraft,
  toggleCourse,
  totalCredits,
} from "./individualized.js";
export type { IndividualizedDraft, MajorOverlap, Requirement, RequirementId } from "./individualized.js";
export {
  MAX_SUGGESTION_COURSES,
  SUGGESTION_PROVIDER,
  THEME_MIN_COURSES,
  THEME_MIN_RATING,
  suggestAlignments,
  suggestThemes,
} from "./suggestions.js";
export type { ThemeSuggestion } from "./suggestions.js";
export { createDocx, DOCX_MIME_TYPE } from "./docx.js";
export type { DocxBlock } from "./docx.js";
export { proposalBlocks, proposalDocx, proposalFileName } from "./proposal.js";
