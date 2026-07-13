import { describe, expect, test } from "bun:test";
import { GenerationRegistry } from "./generation-registry";

describe("GenerationRegistry", () => {
  test("keeps a cancelled generation active until its request finishes", () => {
    const registry = new GenerationRegistry();
    const generation = registry.start("user-1", new AbortController());
    registry.setMessageId(generation, "message-1");

    registry.cancel(generation);

    expect(generation.controller.signal.aborted).toBe(true);
    expect(registry.get("user-1")).toBe(generation);
    expect(registry.getMessageId("user-1")).toBe("message-1");
    expect(() => registry.start("user-1", new AbortController())).toThrow(
      "already active",
    );

    registry.finish(generation);
    expect(registry.get("user-1")).toBeNull();
  });

  test("does not finish a generation it does not own", () => {
    const registry = new GenerationRegistry();
    const active = registry.start("user-1", new AbortController());
    const stale = { ...active, controller: new AbortController() };

    registry.finish(stale);

    expect(registry.get("user-1")).toBe(active);
  });

  test("allows only one active generation per user", () => {
    const registry = new GenerationRegistry();
    registry.start("user-1", new AbortController());

    expect(() => registry.start("user-1", new AbortController())).toThrow("already active");
    expect(() => registry.start("user-2", new AbortController())).not.toThrow();
  });
});
