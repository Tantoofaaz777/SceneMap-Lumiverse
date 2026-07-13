import { describe, expect, test } from "bun:test";
import { MESSAGE_METADATA_KEY } from "./shared";
import { mergeTrackerMetadata } from "./tracker-metadata";

describe("mergeTrackerMetadata", () => {
  test("preserves current metadata and writes to the generation's original swipe", () => {
    const metadata = {
      otherExtension: { updatedWhileGenerating: true },
      [MESSAGE_METADATA_KEY]: {
        version: 2,
        swipes: {
          0: { value: { location: "Old room" }, updatedAt: "earlier" },
          2: { value: { location: "Current swipe" }, updatedAt: "later" },
        },
      },
    };

    const result = mergeTrackerMetadata(
      metadata,
      { location: "Generated room" },
      0,
      { presetKey: "default", schemaHash: "hash-1" },
      "2026-07-11T12:00:00.000Z",
    );

    expect(result.otherExtension).toEqual({ updatedWhileGenerating: true });
    expect(result[MESSAGE_METADATA_KEY]).toEqual({
      version: 3,
      swipes: {
        0: {
          value: { location: "Generated room" },
          updatedAt: "2026-07-11T12:00:00.000Z",
          presetKey: "default",
          schemaHash: "hash-1",
        },
        2: { value: { location: "Current swipe" }, updatedAt: "later" },
      },
      updatedAt: "2026-07-11T12:00:00.000Z",
    });
  });

  test("migrates legacy tracker metadata without losing it", () => {
    const result = mergeTrackerMetadata({
      [MESSAGE_METADATA_KEY]: {
        value: { location: "Legacy" },
        swipeId: 1,
        updatedAt: "legacy-date",
      },
    }, { location: "New" }, 2, undefined, "new-date");

    expect(result[MESSAGE_METADATA_KEY]).toEqual({
      version: 3,
      swipes: {
        1: { value: { location: "Legacy" }, updatedAt: "legacy-date" },
        2: { value: { location: "New" }, updatedAt: "new-date" },
      },
      updatedAt: "new-date",
    });
  });
});
