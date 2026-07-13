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
