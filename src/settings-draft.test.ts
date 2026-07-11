import { describe, expect, test } from "bun:test";
import { SettingsDraftTracker } from "./settings-draft";

describe("SettingsDraftTracker", () => {
  test("keeps a draft dirty across unrelated state updates", () => {
    const tracker = new SettingsDraftTracker();

    tracker.markChanged();

    expect(tracker.dirty).toBe(true);
    expect(tracker.saving).toBe(false);
  });

  test("becomes clean when the saved revision is acknowledged", () => {
    const tracker = new SettingsDraftTracker();
    tracker.markChanged();
    expect(tracker.beginSave("save-1")).toBe(true);

    expect(tracker.acknowledge("save-1")).toBe(true);
    expect(tracker.dirty).toBe(false);
    expect(tracker.saving).toBe(false);
  });

  test("preserves edits made while a save is in flight", () => {
    const tracker = new SettingsDraftTracker();
    tracker.markChanged();
    tracker.beginSave("save-1");
    tracker.markChanged();

    tracker.acknowledge("save-1");

    expect(tracker.dirty).toBe(true);
    expect(tracker.saving).toBe(false);
  });

  test("allows retrying after a failed save", () => {
    const tracker = new SettingsDraftTracker();
    tracker.markChanged();
    tracker.beginSave("save-1");

    expect(tracker.fail("save-1")).toBe(true);
    expect(tracker.dirty).toBe(true);
    expect(tracker.beginSave("save-2")).toBe(true);
  });
});
