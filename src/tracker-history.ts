export type StoredTracker = {
  value: unknown;
  presetKey: string | null;
  schemaHash: string | null;
};

type TrackerProvenance = {
  presetKey: string;
  schemaHash: string;
};

/**
 * Select the baseline for {{previous_tracker}}.
 *
 * A tracker already attached to the target message is normally skipped because
 * it already includes that message. The exception is a preset/schema change:
 * then that tracker is the best migration source for the new shape. Otherwise
 * the nearest earlier tracker is useful context regardless of its provenance;
 * only the newly generated response must satisfy the current schema.
 */
export function getPreviousTrackerJson<T extends { id: string }>(
  messages: T[],
  targetId: string,
  current: TrackerProvenance,
  readTracker: (message: T) => StoredTracker | null,
): string {
  const targetIndex = messages.findIndex((message) => message.id === targetId);
  if (targetIndex === -1) return "{}";

  const targetTracker = readTracker(messages[targetIndex]);
  if (targetTracker && trackerComesFromAnotherPreset(targetTracker, current)) {
    return serializeTracker(targetTracker.value);
  }

  // Do not filter history by schema: older shapes can still contain state that
  // the model should carry into fields defined by the current preset.
  for (let i = targetIndex - 1; i >= 0; i -= 1) {
    const tracker = readTracker(messages[i]);
    if (tracker) return serializeTracker(tracker.value);
  }
  return "{}";
}

function trackerComesFromAnotherPreset(tracker: StoredTracker, current: TrackerProvenance): boolean {
  return tracker.presetKey !== current.presetKey || tracker.schemaHash !== current.schemaHash;
}

function serializeTracker(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? "{}";
}
