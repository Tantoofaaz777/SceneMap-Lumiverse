export type ActiveGeneration = {
  key: string;
  messageId: string;
  userId: string;
  controller: AbortController;
};

export class GenerationRegistry {
  private readonly items = new Map<string, ActiveGeneration>();

  get(userId: string, messageId: string): ActiveGeneration | null {
    return this.items.get(this.key(userId, messageId)) ?? null;
  }

  getMessageId(userId: string): string | null {
    for (const generation of this.items.values()) {
      if (generation.userId === userId) return generation.messageId;
    }
    return null;
  }

  start(userId: string, messageId: string, controller: AbortController): ActiveGeneration {
    const key = this.key(userId, messageId);
    if (this.items.has(key)) throw new Error("SceneMap generation is already active for this message.");
    const generation = { key, messageId, userId, controller };
    this.items.set(key, generation);
    return generation;
  }

  cancel(generation: ActiveGeneration): void {
    if (this.items.get(generation.key) !== generation) return;
    generation.controller.abort();
  }

  finish(generation: ActiveGeneration): void {
    if (this.items.get(generation.key) === generation) this.items.delete(generation.key);
  }

  private key(userId: string, messageId: string): string {
    return `${userId}:${messageId}`;
  }
}
