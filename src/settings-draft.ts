/**
 * Tracks explicit preset saves by content fingerprint. An acknowledgement marks
 * the snapshot that was actually sent as saved, not the possibly newer draft;
 * edits made while saving therefore remain dirty and cannot be lost silently.
 */
export class SettingsDraftTracker {
  private currentFingerprint: string | null = null;
  private savedFingerprint: string | null = null;
  private pendingSave: { requestId: string; fingerprint: string | null } | null = null;

  get dirty(): boolean {
    return this.currentFingerprint !== null && this.currentFingerprint !== this.savedFingerprint;
  }

  get saving(): boolean {
    return this.pendingSave !== null;
  }

  get initialized(): boolean {
    return this.currentFingerprint !== null;
  }

  initialize(fingerprint: string): void {
    if (this.initialized) return;
    this.currentFingerprint = fingerprint;
    this.savedFingerprint = fingerprint;
  }

  update(fingerprint: string): void {
    this.currentFingerprint = fingerprint;
  }

  synchronize(fingerprint: string): void {
    if (this.pendingSave || this.dirty) return;
    this.currentFingerprint = fingerprint;
    this.savedFingerprint = fingerprint;
  }

  beginSave(requestId: string): boolean {
    if (this.pendingSave) return false;
    this.pendingSave = { requestId, fingerprint: this.currentFingerprint };
    return true;
  }

  acknowledge(requestId: string): boolean {
    if (this.pendingSave?.requestId !== requestId) return false;
    if (this.pendingSave.fingerprint !== null) this.savedFingerprint = this.pendingSave.fingerprint;
    this.pendingSave = null;
    return true;
  }

  fail(requestId: string): boolean {
    if (this.pendingSave?.requestId !== requestId) return false;
    this.pendingSave = null;
    return true;
  }

  reset(): void {
    this.currentFingerprint = null;
    this.savedFingerprint = null;
    this.pendingSave = null;
  }
}
