import { describe, expect, test } from "bun:test";
import { getPreviousTrackerJson, type StoredTracker } from "./tracker-history";

type Message = {
  id: string;
  tracker: StoredTracker | null;
};

const current = { presetKey: "new-preset", schemaHash: "new-schema" };
const readTracker = (message: Message) => message.tracker;

describe("getPreviousTrackerJson", () => {
  test("uses the target tracker as migration context after a preset change", () => {
    const messages: Message[] = [{
      id: "target",
      tracker: {
        value: { location: "Old preset location", relationship: "Trusted" },
        presetKey: "old-preset",
        schemaHash: current.schemaHash,
      },
    }];

    expect(JSON.parse(getPreviousTrackerJson(messages, "target", current, readTracker))).toEqual({
      location: "Old preset location",
      relationship: "Trusted",
    });
  });

  test("uses the target tracker as migration context after a schema change", () => {
    const messages: Message[] = [{
      id: "target",
      tracker: {
        value: { location: "Old schema location" },
        presetKey: current.presetKey,
        schemaHash: "old-schema",
      },
    }];

    expect(JSON.parse(getPreviousTrackerJson(messages, "target", current, readTracker))).toEqual({
      location: "Old schema location",
    });
  });

  test("uses the nearest earlier tracker even when its schema is different", () => {
    const messages: Message[] = [
      {
        id: "previous",
        tracker: {
          value: { outfit: "Blue coat" },
          presetKey: "old-preset",
          schemaHash: "old-schema",
        },
      },
      { id: "target", tracker: null },
    ];

    expect(JSON.parse(getPreviousTrackerJson(messages, "target", current, readTracker))).toEqual({
      outfit: "Blue coat",
    });
  });

  test("keeps same-preset regeneration based on the tracker before the target", () => {
    const messages: Message[] = [
      {
        id: "previous",
        tracker: {
          value: { location: "Before the reply" },
          ...current,
        },
      },
      {
        id: "target",
        tracker: {
          value: { location: "Existing regeneration" },
          ...current,
        },
      },
    ];

    expect(JSON.parse(getPreviousTrackerJson(messages, "target", current, readTracker))).toEqual({
      location: "Before the reply",
    });
  });

  test("returns an empty object when no tracker is available", () => {
    expect(getPreviousTrackerJson([{ id: "target", tracker: null }], "target", current, readTracker)).toBe("{}");
  });
});
