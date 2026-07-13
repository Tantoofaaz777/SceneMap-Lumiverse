import { MESSAGE_METADATA_KEY } from "./shared";

export type TrackerProvenance = {
  presetKey: string;
  schemaHash: string;
};

export function mergeTrackerMetadata(
  metadata: Record<string, unknown> | undefined,
  data: unknown,
  swipeId: number,
  provenance?: TrackerProvenance,
  now = new Date().toISOString(),
): Record<string, unknown> {
  const existing = getTrackerStore(metadata);
  const swipes = existing?.swipes && typeof existing.swipes === "object" && !Array.isArray(existing.swipes)
    ? { ...(existing.swipes as Record<string, unknown>) }
    : {};
  if (existing && "value" in existing) {
    const legacySwipeId = typeof existing.swipeId === "number" ? existing.swipeId : swipeId;
    swipes[String(legacySwipeId)] ??= {
      value: existing.value,
      updatedAt: typeof existing.updatedAt === "string" ? existing.updatedAt : now,
    };
  }
  swipes[String(swipeId)] = {
    value: data,
    updatedAt: now,
    ...(provenance ?? {}),
  };
  return {
    ...(metadata ?? {}),
    [MESSAGE_METADATA_KEY]: {
      version: 3,
      swipes,
      updatedAt: now,
    },
  };
}

function getTrackerStore(metadata: Record<string, unknown> | undefined): Record<string, unknown> | null {
  const data = metadata?.[MESSAGE_METADATA_KEY];
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  return data as Record<string, unknown>;
}
