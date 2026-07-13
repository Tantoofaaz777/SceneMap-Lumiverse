export type ActiveGeneration = {
  messageId: string | null;
  userId: string;
  controller: AbortController;
};

export class GenerationRegistry {
  private readonly items = new Map<string, ActiveGeneration>();

  get(userId: string): ActiveGeneration | null {
    return this.items.get(userId) ?? null;
  }

  getMessageId(userId: string): string | null {
    return this.get(userId)?.messageId ?? null;
  }

  start(userId: string, controller: AbortController): ActiveGeneration {
    if (this.items.has(userId)) throw new Error("SceneMap generation is already active for this user.");
    const generation = { messageId: null, userId, controller };
    this.items.set(userId, generation);
    return generation;
  }

  setMessageId(generation: ActiveGeneration, messageId: string): void {
    if (this.items.get(generation.userId) === generation) generation.messageId = messageId;
  }

  cancel(generation: ActiveGeneration): void {
    if (this.items.get(generation.userId) !== generation) return;
    generation.controller.abort();
  }

  finish(generation: ActiveGeneration): void {
    if (this.items.get(generation.userId) === generation) this.items.delete(generation.userId);
  }
}
