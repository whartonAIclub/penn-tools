// @penntools/tool-handoff: the tool's manifest (HandoffTool) and the server API its page folder uses (page.tsx and the server
// actions in actions.ts). Server only: the store needs the tool's database pool, and the handlers the session's user. The
// browser imports the engine from "@penntools/tool-handoff/engine" (and the preview's sample data from "/preview"), never
// this entry.

export { HandoffTool } from "./HandoffTool.js";

// The store (C-DESIGN §2.3): every SQL statement, behind the real engine by default.
export {
  applyAction,
  documentCacheStats,
  ensurePerson,
  getGuestView,
  getView,
  isWorldId,
  markNotificationsRead,
  pruneWorld,
  refreshGuestView,
  refreshView,
  savePayMethods,
  saveProfile,
  BAD_REQUEST_ERROR,
  BUSY_ERROR,
  DOC_MAX_BYTES,
  DOC_WARN_BYTES,
  FULL_ERROR,
  INTERNAL_ERROR,
  LAST_METHOD_ERROR,
  LAST_METHOD_OPEN_ERROR,
  REUSED_REQUEST_ERROR,
  SAVED_NO_VIEW_ERROR,
} from "./store.js";
export type { ApplyHooks, ApplyInput, PruneCounts } from "./store.js";

// The server actions' logic: actions.ts supplies the session's user, the pool and the world (C-DESIGN §2.4), and for saveEmailPrefs
// the sign-in provider.
export {
  handleAct,
  handleGetPhoto,
  handleMarkRead,
  handleRefresh,
  handleSaveEmailPrefs,
  handleSaveMyProfile,
  EMAIL_PREFS_INVALID,
  EMAIL_PREFS_SAVED,
  PAY_METHODS_INVALID,
  STALE_ERRORS,
} from "./handlers.js";
export type {
  ActAnswer,
  ActInput,
  ActionContext,
  Failure,
  Guard,
  MarkReadAnswer,
  MarkReadInput,
  PhotoAnswer,
  RefreshAnswer,
  RefreshInput,
  SaveEmailPrefsInput,
  SaveProfileInput,
  SessionUser,
  Stale,
  StaleCode,
} from "./handlers.js";

// Email updates (follow-on B4): the dispatcher, the capture sender and the store's hooks for the dispatch route (email/dispatch/route.ts),
// the provider gate the page folder's provider adapter (email-provider.ts) enforces, and the preferences' refusals. One small sender
// interface (EmailSender), nothing more general.
export { dispatchEmail } from "./email/dispatch.js";
export { sqlCaptureSender } from "./email/capture.js";
export { providerAllows } from "./email/gates.js";
export { EMAIL_UNAVAILABLE_ERROR, NOT_FOR_THIS_ACCOUNT_ERROR, NO_EMAIL_ADDRESS_ERROR } from "./email/prefs.js";
export { checkEmailJobs, storeDispatchDeps, sweepDue } from "./store.js";
export type {
  DispatchCounts,
  DispatchDeps,
  DispatchOptions,
  EmailMessage,
  EmailSender,
  SendErrorCode,
  SendResult,
  SignInKind,
  ViewEmail,
} from "./email/types.js";

// A Goods item's one photo (§9s item 6): what the server accepts (photo.ts), and what the photo route serves (readItemPhoto, behind
// handleGetPhoto above). The image lives in item_photos; views carry only its reference (PhotoRef).
export { PHOTO_MAX_BYTES, PHOTO_MAX_SIDE, PHOTO_NOT_HERE_ERROR, PHOTO_SIZE_ERROR, PHOTO_TYPE_ERROR } from "./photo.js";
export type { Photo, PhotoMime, PhotoRef } from "./photo.js";
export { readItemPhoto } from "./store.js";
export type { StoredPhoto } from "./store.js";

// Why the shared data can't be used, for page.tsx's HandoffUnavailable.
export { isBusy, setupErrorKind, unavailableMessage } from "./db-errors.js";

// The real engine behind the store (its optional `port` argument).
export { enginePort, WORLD_FORMAT } from "./engine-port.js";
export type { EnginePort } from "./engine-port.js";

// The view and the outcomes (C-CONTRACT.md §2), and the guest view a signed-out visitor gets (§7).
export type {
  ActOutcome,
  Actor,
  CloseReason,
  GoodsRequest,
  GuestEvent,
  GuestItem,
  GuestListing,
  GuestRefreshOutcome,
  GuestTier,
  GuestView,
  GuestWanted,
  Holding,
  Interest,
  PayKind,
  PayMethod,
  PayMethodInput,
  RefreshOutcome,
  SeqStep,
  SetupErrorKind,
  Share,
  TicketRequest,
  View,
  ViewEvent,
  ViewItem,
  ViewListing,
  ViewNotification,
  ViewPerson,
  WorldId,
} from "./types.js";
