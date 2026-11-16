import { describe, it, expect, vi } from "vitest";
import {
  EMBEDDING_MODEL,
  EXPECTED_REPLY_TOKENS,
  MIN_CALL_USD,
  MODELS,
  MODEL_PRICES,
  UNKNOWN_MODEL_PRICE,
  costUsd,
  priceOf,
} from "@penntools/core/ai";
import { callCost } from "../usage.js";

describe("MODEL_PRICES", () => {
  it("prices every catalog model and the embedding model", () => {
    const models = [...Object.values(MODELS).flatMap((tiers) => Object.values(tiers).map((spec) => spec.id)), EMBEDDING_MODEL];
    for (const model of models) expect(priceOf(model), model).not.toBeNull();
  });

  it("charges an unpriced model at least as much as any priced one", () => {
    for (const price of Object.values(MODEL_PRICES)) {
      expect(UNKNOWN_MODEL_PRICE.input).toBeGreaterThanOrEqual(price.longContext?.input ?? price.input);
      expect(UNKNOWN_MODEL_PRICE.output).toBeGreaterThanOrEqual(price.longContext?.output ?? price.output);
    }
  });
});

describe("MIN_CALL_USD", () => {
  it("is what the cheapest catalog model reserves", () => {
    // gpt-6-luna and claude-haiku-5-5: $0.50 per million output tokens
    expect(MIN_CALL_USD).toBeCloseTo((EXPECTED_REPLY_TOKENS * 0.5) / 1e6);
  });
});

describe("priceOf", () => {
  it("gives a dated snapshot its model's price", () => {
    expect(priceOf("gpt-4o-2024-08-06")).toBe(MODEL_PRICES["gpt-4o"]);
  });

  it("is null for a model it doesn't know", () => {
    expect(priceOf("gpt-4")).toBeNull();
    expect(priceOf("claude-sonnet")).toBeNull();
  });
});

describe("costUsd", () => {
  it("charges input and output per million tokens", () => {
    expect(costUsd({ input: 2, output: 10 }, 1_000_000, 100_000)).toBeCloseTo(3);
  });

  it("charges the long-context rates for the whole request once input is over the threshold", () => {
    const price = { input: 0.1, output: 0.5, longContext: { above: 100_000, input: 0.5, output: 2.5 } };
    expect(costUsd(price, 100_000, 1_000)).toBeCloseTo((100_000 * 0.1 + 1_000 * 0.5) / 1e6);
    expect(costUsd(price, 100_001, 1_000)).toBeCloseTo((100_001 * 0.5 + 1_000 * 2.5) / 1e6);
  });
});

describe("callCost", () => {
  it("charges an unpriced model the highest price, and logs it", () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    expect(callCost("mystery-model", 1_000, 1_000, logger)).toBe(costUsd(UNKNOWN_MODEL_PRICE, 1_000, 1_000));
    expect(logger.warn).toHaveBeenCalledWith("ai.unpriced_model", { model: "mystery-model" });
  });
});
