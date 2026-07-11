import { describe, expect, test } from "bun:test";
import { captureSwipeSnapshot, swipeSnapshotMatches } from "./swipe-snapshot";

const original = {
  content: "First swipe",
  swipe_id: 0,
  swipes: ["First swipe", "Second swipe"],
  swipe_dates: [100, 200],
};

describe("swipe snapshots", () => {
  test("still matches when the user only navigates to another swipe", () => {
    const snapshot = captureSwipeSnapshot(original, 0)!;
    const navigated = { ...original, content: "Second swipe", swipe_id: 1 };

    expect(swipeSnapshotMatches(snapshot, navigated, 0)).toBe(true);
  });

  test("detects content edited during generation", () => {
    const snapshot = captureSwipeSnapshot(original, 0)!;
    const edited = { ...original, content: "Edited swipe", swipes: ["Edited swipe", "Second swipe"] };

    expect(swipeSnapshotMatches(snapshot, edited, 0)).toBe(false);
  });

  test("detects a removed swipe", () => {
    const snapshot = captureSwipeSnapshot(original, 1)!;
    const removed = { ...original, content: "First swipe", swipes: ["First swipe"], swipe_dates: [100] };

    expect(swipeSnapshotMatches(snapshot, removed, 1)).toBe(false);
  });

  test("detects swipe replacement even when the text is identical", () => {
    const snapshot = captureSwipeSnapshot(original, 0)!;
    const replaced = { ...original, swipe_dates: [300, 200] };

    expect(swipeSnapshotMatches(snapshot, replaced, 0)).toBe(false);
  });
});
