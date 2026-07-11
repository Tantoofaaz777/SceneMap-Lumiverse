export class SettingsDraftTracker {
  private revision = 0;
  private savedRevision = 0;
  private pendingSave: { requestId: string; revision: number } | null = null;

  get dirty(): boolean {
    return this.revision !== this.savedRevision;
  }

  get saving(): boolean {
    return this.pendingSave !== null;
  }

  markChanged(): void {
    this.revision += 1;
  }

  beginSave(requestId: string): boolean {
    if (this.pendingSave) return false;
    this.pendingSave = { requestId, revision: this.revision };
    return true;
  }

  acknowledge(requestId: string): boolean {
    if (this.pendingSave?.requestId !== requestId) return false;
    this.savedRevision = this.pendingSave.revision;
    this.pendingSave = null;
    return true;
  }

  fail(requestId: string): boolean {
    if (this.pendingSave?.requestId !== requestId) return false;
    this.pendingSave = null;
    return true;
  }

  reset(): void {
    this.revision = 0;
    this.savedRevision = 0;
    this.pendingSave = null;
  }
}
