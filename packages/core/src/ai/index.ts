// The AI API for new tools. Existing tools use the legacy LLM API
// (@penntools/core/llm) until they migrate.

export { z } from "zod";
export { AIError, isAIError } from "./AIError.js";
export type { AIErrorKind, AIErrorInfo } from "./AIError.js";
export {
  AI_PROVIDERS,
  AI_TIERS,
  AI_REASONING_LEVELS,
  MODELS,
  DEFAULT_TIER,
  DEFAULT_MAX_OUTPUT_TOKENS,
  MAX_OUTPUT_TOKENS_LIMIT,
  EMBEDDING_MODEL,
  PROVIDER_LABELS,
} from "./models.js";
export type { ModelSpec, ModelId } from "./models.js";
export {
  AI_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_EDGE,
  MAX_IMAGE_PATCHES,
  IMAGE_PATCH_SIZE,
  imageFitSize,
  fileType,
  base64FileType,
  isBase64,
  base64Bytes,
} from "./attachments.js";
export type { AIImageType } from "./attachments.js";
export type {
  AI,
  AIProvider,
  AITier,
  AIReasoning,
  AIContentPart,
  AIMessage,
  AISchema,
  AIStopReason,
  AIUsage,
  AIStreamEvent,
  GenerateRequest,
  GenerateResult,
  GenerateObjectRequest,
  GenerateObjectResult,
} from "./types.js";
