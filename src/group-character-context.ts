type ChatWithCharacterContext = {
  character_id?: string | null;
  metadata?: Record<string, unknown>;
};

type MessageWithCharacterContext = {
  extra?: Record<string, unknown>;
};

/**
 * Resolve the character card that owns an assistant message. Lumiverse stores
 * the focused group member on message.extra.character_id; ordinary and legacy
 * messages fall back to the chat's primary character.
 */
export function resolveMessageCharacterId(
  chat: ChatWithCharacterContext,
  message?: MessageWithCharacterContext | null,
): string | null {
  const fallback = cleanId(chat.character_id);
  const metadata = chat.metadata;
  const isGroup = metadata?.group === true || metadata?.group === 1;
  if (!isGroup) return fallback;

  const memberIds = Array.isArray(metadata?.character_ids)
    ? metadata.character_ids.map(cleanId).filter((id): id is string => id !== null)
    : [];
  const messageCharacterId = cleanId(message?.extra?.character_id);
  if (!messageCharacterId || !memberIds.includes(messageCharacterId)) return fallback;
  return messageCharacterId;
}

function cleanId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
