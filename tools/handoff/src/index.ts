// @penntools/tool-handoff: the tool's manifest (HandoffTool) and the server API its page folder uses (page.tsx and the server
// actions in actions.ts). Server only: the store needs the tool's database pool, and the handlers the session's user. The
// browser imports the engine from "@penntools/tool-handoff/engine" (and the preview's sample data from "/preview"), never
// this entry.

export { HandoffTool } from "./HandoffTool.js";

// The store (C-DESIGN §2.3): every SQL statement, behind the real engine by default.
export {
  applyAction,
  deleteMyData,
  documentCacheStats,
  ensurePerson,
  getGuestView,
  getView,
  isWorldId,
  markNotificationsRead,
  pruneWorld,
  readStoredWorld,
  refreshGuestView,
  refreshView,
  savePayMethods,
  saveProfile,
  ACTIONS_PER_MINUTE,
  BAD_REQUEST_ERROR,
  BUSY_ERROR,
  DELETE_OPEN_ERROR,
  FULL_ERROR,
  INTERNAL_ERROR,
  LAST_METHOD_ERROR,
  LAST_METHOD_OPEN_ERROR,
  OPEN_LIMIT_ERROR,
  OPEN_RECORDS_MAX,
  RATE_ERROR,
  RECORD_MAX_BYTES,
  REUSED_REQUEST_ERROR,
  SAVED_NO_VIEW_ERROR,
} from "./store.js";
export type { ApplyHooks, ApplyInput, PruneCounts } from "./store.js";

// The server actions' logic: actions.ts supplies the session's user, the pool and the world (C-DESIGN §2.4).
export {
  handleAct,
  handleDeleteMyData,
  handleGetPhoto,
  handleMarkRead,
  handleRefresh,
  handleSaveMyProfile,
  ACT_BODY_MAX_BYTES,
  DATA_DELETED,
  PAY_METHODS_INVALID,
  PHOTO_ROUTE_ERROR,
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
  SaveProfileInput,
  SessionUser,
  Stale,
  StaleCode,
} from "./handlers.js";

// A Goods item's one photo (§9s item 6): what the server accepts (photo.ts), and what the photo route serves (readItemPhoto, behind
// handleGetPhoto above). The image lives in item_photos; views carry only its reference (PhotoRef).
export { PHOTO_MAX_BYTES, PHOTO_MAX_SIDE, PHOTO_NOT_HERE_ERROR, PHOTO_SIZE_ERROR, PHOTO_TYPE_ERROR } from "./photo.js";
export type { Photo, PhotoMime, PhotoRef } from "./photo.js";
export { readItemPhoto } from "./store.js";
export type { PhotoNotModified, StoredPhoto } from "./store.js";

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
