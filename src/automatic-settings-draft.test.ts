import { describe, expect, test } from "bun:test";
import { AutomaticSettingsDraftTracker } from "./automatic-settings-draft";

type Settings = {
  temperature: number | null;
  topP: number | null;
};

const stored: Settings = { temperature: 1, topP: 1 };

describe("AutomaticSettingsDraftTracker", () => {
  test("overlays debounced values onto stale incoming settings", () => {
    const tracker = new AutomaticSettingsDraftTracker<Settings>();
    tracker.queue("temperature", 0.7);

    expect(tracker.overlay(stored)).toEqual({ temperature: 0.7, topP: 1 });
  });

  test("keeps sent values until the backend acknowledges them", () => {
    const tracker = new AutomaticSettingsDraftTracker<Settings>();
    tracker.queue("temperature", 0.7);
    expect(tracker.begin("save-1")).toEqual({ temperature: 0.7 });

    expect(tracker.overlay(stored).temperature).toBe(0.7);
    expect(tracker.acknowledge("save-1")).toBe(true);
    expect(tracker.overlay(stored).temperature).toBe(1);
  });

  test("preserves newer values when an older save fails", () => {
    const tracker = new AutomaticSettingsDraftTracker<Settings>();
    tracker.queue("temperature", 0.7);
    tracker.begin("save-1");
    tracker.queue("temperature", 0.8);

    expect(tracker.fail("save-1")).toBe(true);
    expect(tracker.overlay(stored).temperature).toBe(0.8);
  });
});
