export type StoredTracker = {
  value: unknown;
  presetKey: string | null;
  schemaHash: string | null;
};

type TrackerProvenance = {
  presetKey: string;
  schemaHash: string;
};

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
