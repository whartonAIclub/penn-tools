import { describe, it, expect } from "vitest";
import { cachedFor, cachedOrStale } from "../cache";

/** A load() that counts its calls and resolves to the call's number. */
function counter() {
  let calls = 0;
  return {
    load: async () => ++calls,
    get calls() {
      return calls;
    },
  };
}

describe("cachedFor", () => {
  it("reuses a load until it's maxAgeMs old, then loads again", async () => {
    let time = 0;
    const source = counter();
    const get = cachedFor(1000, source.load, () => time);

    expect(await get()).toBe(1);
    time = 999;
    expect(await get()).toBe(1);
    time = 1000;
    expect(await get()).toBe(2);
    expect(source.calls).toBe(2);
  });

  it("shares one load between callers that arrive while it's loading", async () => {
    let finish: (value: string) => void = () => {};
    let calls = 0;
    const get = cachedFor(1000, () => {
      calls++;
      return new Promise<string>((resolve) => (finish = resolve));
    }, () => 0);

    const first = get();
    const second = get();
    finish("report");

    expect(await first).toBe("report");
    expect(await second).toBe("report");
    expect(calls).toBe(1);
  });

  it("doesn't keep a failed load, so the next caller tries again", async () => {
    let calls = 0;
    const get = cachedFor(1000, async () => {
      calls++;
      if (calls === 1) throw new Error("database down");
      return "report";
    }, () => 0);

    await expect(get()).rejects.toThrow("database down");
    expect(await get()).toBe("report");
    expect(calls).toBe(2);
  });
});

/** A load() whose calls the test settles: each call waits until resolve() or reject() is called on it. */
function controlled<T>() {
  const calls: { resolve: (value: T) => void; reject: (error: Error) => void }[] = [];
  return {
    calls,
    load: () => new Promise<T>((resolve, reject) => calls.push({ resolve, reject })),
  };
}

const WAIT = 20;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("cachedOrStale", () => {
  it("reuses a value until the last load is maxAgeMs old, then loads again", async () => {
    let time = 0;
    const source = controlled<string>();
    const get = cachedOrStale(1000, WAIT, source.load, () => time);

    const first = get();
    source.calls[0]!.resolve("monday");
    expect(await first).toBe("monday");
    time = 999;
    expect(await get()).toBe("monday");
    expect(source.calls).toHaveLength(1);

    time = 1000;
    const second = get();
    source.calls[1]!.resolve("tuesday");
    expect(await second).toBe("tuesday");
  });

  it("returns the last value when a load fails, and waits maxAgeMs before trying again", async () => {
    let time = 0;
    const source = controlled<string>();
    const get = cachedOrStale(1000, WAIT, source.load, () => time);
    const first = get();
    source.calls[0]!.resolve("monday");
    await first;

    time = 1000;
    const failed = get();
    source.calls[1]!.reject(new Error("database down"));
    expect(await failed).toBe("monday");
    time = 1999;
    expect(await get()).toBe("monday");
    expect(source.calls).toHaveLength(2);

    time = 2000;
    const retried = get();
    source.calls[2]!.resolve("wednesday");
    expect(await retried).toBe("wednesday");
  });

  it("returns the last value when a load takes longer than waitMs, and uses it once it finishes", async () => {
    let time = 0;
    const source = controlled<string>();
    const get = cachedOrStale(1000, WAIT, source.load, () => time);
    const first = get();
    source.calls[0]!.resolve("monday");
    await first;

    time = 1000;
    expect(await get()).toBe("monday"); // waited WAIT ms, then gave up
    source.calls[1]!.resolve("tuesday");
    await tick();
    expect(await get()).toBe("tuesday");
    expect(source.calls).toHaveLength(2);
  });

  it("doesn't make later callers wait again for a load that's past waitMs", async () => {
    let time = 0;
    const source = controlled<string>();
    // A wait far longer than the test's timeout: a caller that waited would fail it.
    const get = cachedOrStale(1000, 60_000, source.load, () => time);
    const first = get();
    source.calls[0]!.resolve("monday");
    await first;

    time = 1000;
    const stuck = get(); // the load hangs; this caller waits
    time = 61_000;
    expect(await get()).toBe("monday"); // its wait is used up: no waiting
    source.calls[1]!.resolve("tuesday");
    expect(await stuck).toBe("tuesday");
  });

  it("returns null when nothing has loaded yet", async () => {
    const source = controlled<string>();
    const get = cachedOrStale(1000, WAIT, source.load, () => 0);
    const failed = get();
    source.calls[0]!.reject(new Error("database down"));
    expect(await failed).toBeNull();
    expect(await get()).toBeNull();
  });

  it("shares one load between callers that arrive while it's loading", async () => {
    const source = controlled<string>();
    const get = cachedOrStale(1000, WAIT, source.load, () => 0);
    const first = get();
    const second = get();
    source.calls[0]!.resolve("monday");
    expect(await first).toBe("monday");
    expect(await second).toBe("monday");
    expect(source.calls).toHaveLength(1);
  });
});
