/**
 * Keeps optimistic auto-save patches on top of full state snapshots returned by
 * the backend. Pending edits must win over older in-flight requests so a slow
 * acknowledgement cannot make a recently typed value flicker or disappear.
 */
export class AutomaticSettingsDraftTracker<T extends object> {
  private pending: Partial<T> = {};
  private readonly inFlight = new Map<string, Partial<T>>();

  queue<K extends keyof T>(key: K, value: T[K]): void {
    this.pending[key] = value;
  }

  begin(requestId: string): Partial<T> | null {
    if (Object.keys(this.pending).length === 0) return null;
    const patch = this.pending;
    this.pending = {};
    this.inFlight.set(requestId, patch);
    return patch;
  }

  acknowledge(requestId: string): boolean {
    return this.inFlight.delete(requestId);
  }

  fail(requestId: string): boolean {
    const patch = this.inFlight.get(requestId);
    if (!patch) return false;
    this.inFlight.delete(requestId);
    // Requeue the failed patch, but never overwrite edits made after it was sent.
    this.pending = { ...patch, ...this.pending };
    return true;
  }

  overlay(value: T): T {
    let merged = { ...value };
    for (const patch of this.inFlight.values()) merged = { ...merged, ...patch };
    return { ...merged, ...this.pending };
  }

  reset(): void {
    this.pending = {};
    this.inFlight.clear();
  }
}
