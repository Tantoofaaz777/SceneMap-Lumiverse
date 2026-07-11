import { describe, expect, test } from "bun:test";
import { GenerationRegistry } from "./generation-registry";

describe("GenerationRegistry", () => {
  test("keeps a cancelled generation active until its request finishes", () => {
    const registry = new GenerationRegistry();
    const generation = registry.start("user-1", "message-1", new AbortController());

    registry.cancel(generation);

    expect(generation.controller.signal.aborted).toBe(true);
    expect(registry.get("user-1", "message-1")).toBe(generation);
    expect(() => registry.start("user-1", "message-1", new AbortController())).toThrow(
      "already active",
    );

    registry.finish(generation);
    expect(registry.get("user-1", "message-1")).toBeNull();
  });

  test("does not finish a generation it does not own", () => {
    const registry = new GenerationRegistry();
    const active = registry.start("user-1", "message-1", new AbortController());
    const stale = { ...active, controller: new AbortController() };

    registry.finish(stale);

    expect(registry.get("user-1", "message-1")).toBe(active);
  });
});
