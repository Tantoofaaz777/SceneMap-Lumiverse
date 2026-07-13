import { describe, expect, test } from "bun:test";
import { SettingsDraftTracker } from "./settings-draft";

describe("SettingsDraftTracker", () => {
  test("keeps a draft dirty across unrelated state updates", () => {
    const tracker = new SettingsDraftTracker();
    tracker.initialize("saved");
    tracker.update("changed");

    expect(tracker.dirty).toBe(true);
    expect(tracker.saving).toBe(false);
  });

  test("becomes clean when the saved snapshot is acknowledged", () => {
    const tracker = new SettingsDraftTracker();
    tracker.initialize("saved");
    tracker.update("changed");
    expect(tracker.beginSave("save-1")).toBe(true);

    expect(tracker.acknowledge("save-1")).toBe(true);
    expect(tracker.dirty).toBe(false);
    expect(tracker.saving).toBe(false);
  });

  test("preserves edits made while a save is in flight", () => {
    const tracker = new SettingsDraftTracker();
    tracker.initialize("saved");
    tracker.update("first-change");
    tracker.beginSave("save-1");
    tracker.update("newer-change");

    tracker.acknowledge("save-1");

    expect(tracker.dirty).toBe(true);
    expect(tracker.saving).toBe(false);
  });

  test("allows retrying after a failed save", () => {
    const tracker = new SettingsDraftTracker();
    tracker.initialize("saved");
    tracker.update("changed");
    tracker.beginSave("save-1");

    expect(tracker.fail("save-1")).toBe(true);
    expect(tracker.dirty).toBe(true);
    expect(tracker.beginSave("save-2")).toBe(true);
  });

  test("becomes clean when tracked content returns to its saved value", () => {
    const tracker = new SettingsDraftTracker();
    tracker.initialize("saved");

    tracker.update("changed");
    expect(tracker.dirty).toBe(true);

    tracker.update("saved");
    expect(tracker.dirty).toBe(false);
  });

  test("keeps a local revert dirty after a different snapshot is saved", () => {
    const tracker = new SettingsDraftTracker();
    tracker.initialize("saved");
    tracker.update("first-change");
    tracker.beginSave("save-1");
    tracker.update("saved");

    tracker.acknowledge("save-1");

    expect(tracker.dirty).toBe(true);
    expect(tracker.saving).toBe(false);
  });

  test("synchronizes clean tracked content received from storage", () => {
    const tracker = new SettingsDraftTracker();
    tracker.initialize("first");

    tracker.synchronize("external-update");

    expect(tracker.dirty).toBe(false);
    tracker.update("external-update");
    expect(tracker.dirty).toBe(false);
  });
});
