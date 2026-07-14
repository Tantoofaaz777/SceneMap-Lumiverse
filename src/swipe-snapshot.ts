export type SwipeSnapshotSource = {
  content: string;
  swipe_id?: number;
  swipes?: string[];
  swipe_dates?: number[];
};

export type SwipeSnapshot = {
  content: string;
  date: number | null;
};

/** Capture the exact swipe being generated, even if it is not currently active. */
export function captureSwipeSnapshot(message: SwipeSnapshotSource, swipeId: number): SwipeSnapshot | null {
  let content: string | undefined;
  if (Array.isArray(message.swipes)) content = message.swipes[swipeId];
  if (content === undefined && (message.swipe_id ?? 0) === swipeId) content = message.content;
  if (typeof content !== "string") return null;
  const date = Array.isArray(message.swipe_dates) && Number.isFinite(message.swipe_dates[swipeId])
    ? message.swipe_dates[swipeId]
    : null;
  return { content, date };
}

export function swipeSnapshotMatches(
  snapshot: SwipeSnapshot,
  message: SwipeSnapshotSource,
  swipeId: number,
): boolean {
  const current = captureSwipeSnapshot(message, swipeId);
  if (!current || current.content !== snapshot.content) return false;
  // Dates distinguish a replaced swipe from an identical-looking copy. Merely
  // navigating to another swipe does not change the captured swipe and is safe.
  if (snapshot.date !== null && current.date !== null && current.date !== snapshot.date) return false;
  return true;
}
