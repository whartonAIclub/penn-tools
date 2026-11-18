// Nothing here loads data or connects on import: container.ts loads this
// package on every page to register the tool.
export { IndustryConnectorTool } from "./IndustryConnectorTool.js";
export { INDUSTRIES, isIndustry, type Industry } from "./industries.js";
export type { Person, PersonCard } from "./types.js";
export {
  applyUpload,
  dataVersion,
  getPerson,
  industryCounts,
  lastUpload,
  PAGE_SIZE,
  previewUpload,
  searchPeople,
  type SearchPage,
  type UploadPreview,
  type UploadRecord,
} from "./people.js";
export {
  checkUpload,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_PEOPLE,
  personKey,
  UploadEntry,
  type UploadCheck,
  type UploadProblem,
} from "./upload.js";
export { canManageData, TOOL_ADMIN_IDS } from "./admins.js";
export { createRateLimiter, type RateLimiter } from "./rateLimit.js";
export {
  AFTER_CONVERSATION,
  DraftRequest,
  draftOutreach,
  LENGTHS,
  MESSAGE_TYPES,
  OutreachAnswers,
  OutreachDraft,
  outreachPrompt,
  PURPOSES,
  recipientProblem,
  TONES,
  type MessageType,
  type Purpose,
} from "./outreach.js";
