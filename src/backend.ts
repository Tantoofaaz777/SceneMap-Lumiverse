import {
  CHAT_METADATA_KEY,
  MESSAGE_METADATA_KEY,
  SETTINGS_PATH,
  defaultSettings,
  mergeSettings,
  parseModelJson,
  renderPrompt,
  schemaToExample,
  trackerToText,
  type SceneMapSettings,
  type SceneMapState,
  type TrackerEntry,
} from "./shared";

declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

type ChatMessage = {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  metadata?: Record<string, unknown>;
};

type ActiveChat = {
  id: string;
  character_id?: string | null;
};

type ConnectionSummary = {
  id: string;
  name: string;
  provider: string;
  model: string;
  is_default?: boolean;
};

const activeGenerations = new Map<string, AbortController>();

async function loadSettings(userId?: string): Promise<SceneMapSettings> {
  return mergeSettings(
    await spindle.userStorage.getJson<Partial<SceneMapSettings>>(SETTINGS_PATH, {
      fallback: defaultSettings,
      userId,
    }),
  );
}

async function saveSettings(settings: SceneMapSettings, userId: string) {
  await spindle.userStorage.setJson(SETTINGS_PATH, mergeSettings(settings), { indent: 2, userId });
}

function getMessageTracker(message: ChatMessage | null | undefined): unknown | null {
  const data = message?.metadata?.[MESSAGE_METADATA_KEY];
  if (!data || typeof data !== "object") return null;
  return (data as Record<string, unknown>).value ?? null;
}

function withTrackerMetadata(message: ChatMessage, data: unknown): Record<string, unknown> {
  return {
    ...(message.metadata ?? {}),
    [MESSAGE_METADATA_KEY]: {
      value: data,
      updatedAt: new Date().toISOString(),
    },
  };
}

function withoutTrackerMetadata(message: ChatMessage): Record<string, unknown> {
  const next = { ...(message.metadata ?? {}) };
  delete next[MESSAGE_METADATA_KEY];
  return next;
}

function getLatestTrackerEntry(messages: ChatMessage[]): TrackerEntry | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role !== "assistant") continue;
    const data = getMessageTracker(messages[i]);
    if (data) return { messageId: messages[i].id, data };
  }
  return null;
}

function countAssistantMessagesAfter(messages: ChatMessage[], messageId: string): number {
  const index = messages.findIndex((message) => message.id === messageId);
  if (index === -1) return 0;
  return messages.slice(index + 1).filter((message) => message.role === "assistant").length;
}

function findTargetMessage(messages: ChatMessage[], messageId?: string | null): ChatMessage | null {
  if (messageId) return messages.find((message) => message.id === messageId) ?? null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "assistant") return messages[i];
  }
  return null;
}

function getPreviousTrackerJson(messages: ChatMessage[], currentMessageId: string, skipCurrent: boolean): string {
  let skippedCurrent = !skipCurrent;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    const tracker = getMessageTracker(message);
    if (!tracker) continue;
    if (!skippedCurrent && message.id === currentMessageId) {
      skippedCurrent = true;
      continue;
    }
    return JSON.stringify(tracker, null, 2);
  }
  return "{}";
}

function trimMessagesForPrompt(messages: ChatMessage[], targetId: string, includeLastXMessages: number) {
  const targetIndex = messages.findIndex((message) => message.id === targetId);
  const end = targetIndex === -1 ? messages.length : targetIndex + 1;
  const start = includeLastXMessages > 0 ? Math.max(0, end - includeLastXMessages) : 0;
  return messages.slice(start, end).map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

async function listConnections(userId?: string): Promise<ConnectionSummary[]> {
  try {
    const connections = await spindle.connections.list(userId);
    return connections.map((conn: any) => ({
      id: conn.id,
      name: conn.name,
      provider: conn.provider,
      model: conn.model,
      is_default: conn.is_default,
    }));
  } catch {
    return [];
  }
}

async function getActiveContext(userId: string) {
  const chat = await spindle.chats.getActive(userId) as ActiveChat | null;
  if (!chat) return { chat: null, messages: [] as ChatMessage[] };
  const messages = (await spindle.chat.getMessages(chat.id)) as ChatMessage[];
  return { chat, messages };
}

async function resolveTrackerDisplayData(value: unknown, context: { chatId: string; characterId?: string | null; userId: string }): Promise<unknown> {
  if (typeof value === "string") return resolveDisplayText(value, context);
  if (Array.isArray(value)) return Promise.all(value.map((item) => resolveTrackerDisplayData(item, context)));
  if (!value || typeof value !== "object") return value;

  const entries = await Promise.all(
    Object.entries(value as Record<string, unknown>).map(async ([key, child]) => [
      key,
      await resolveTrackerDisplayData(child, context),
    ] as const),
  );
  return Object.fromEntries(entries);
}

async function resolveDisplayText(text: string, context: { chatId: string; characterId?: string | null; userId: string }): Promise<string> {
  if (!text.includes("{{")) return text;
  try {
    const result = await spindle.macros.resolve(text, {
      chatId: context.chatId,
      characterId: context.characterId || undefined,
      userId: context.userId,
      commit: false,
    });
    return result.text;
  } catch (error) {
    spindle.log.warn(`SceneMap macro display resolve failed: ${(error as Error).message}`);
    return text;
  }
}

async function buildState(userId: string): Promise<SceneMapState> {
  const settings = await loadSettings(userId);
  const { chat, messages } = await getActiveContext(userId);
  const latest = getLatestTrackerEntry(messages);
  if (latest && chat) {
    latest.displayData = await resolveTrackerDisplayData(latest.data, {
      chatId: chat.id,
      characterId: chat.character_id,
      userId,
    });
  }
  return {
    settings,
    chatId: chat?.id ?? null,
    latest,
    messagesBehind: latest ? countAssistantMessagesAfter(messages, latest.messageId) : 0,
    activeMessageId: findTargetMessage(messages)?.id ?? null,
    generatingMessageId: [...activeGenerations.keys()][0] ?? null,
    connections: await listConnections(userId),
  };
}

async function pushState(userId: string) {
  const state = await buildState(userId);
  spindle.sendToFrontend({ type: "state", state }, userId);
  spindle.updateMacroValue("scenemap", trackerToText(state.latest?.displayData ?? state.latest?.data ?? null));
}

async function refreshMacroValue() {
  spindle.updateMacroValue("scenemap", "");
}

async function updateChatPreset(chatId: string, presetKey: string, userId: string) {
  const chat = await spindle.chats.get(chatId, userId);
  if (!chat) throw new Error("Active chat not found.");
  await spindle.chats.update(chatId, {
    metadata: {
      ...(chat.metadata ?? {}),
      [CHAT_METADATA_KEY]: {
        ...((chat.metadata?.[CHAT_METADATA_KEY] as Record<string, unknown> | undefined) ?? {}),
        schemaPreset: presetKey,
      },
    },
  }, userId);
}

function getChatPresetKey(chat: { metadata?: Record<string, unknown> } | null, settings: SceneMapSettings): string {
  const meta = chat?.metadata?.[CHAT_METADATA_KEY];
  const key = meta && typeof meta === "object" ? (meta as Record<string, unknown>).schemaPreset : null;
  return typeof key === "string" && settings.schemaPresets[key] ? key : settings.schemaPreset;
}

async function generateTracker(messageId: string | null | undefined, userId?: string) {
  if (!userId) throw new Error("SceneMap needs a user context before generating a tracker.");
  const { chat, messages } = await getActiveContext(userId);
  if (!chat) throw new Error("Open a chat before generating a SceneMap tracker.");

  const target = findTargetMessage(messages, messageId);
  if (!target) throw new Error("No assistant message found for SceneMap.");
  if (target.role !== "assistant") throw new Error("SceneMap can only track assistant messages.");
  if (activeGenerations.has(target.id)) {
    activeGenerations.get(target.id)?.abort();
    activeGenerations.delete(target.id);
    if (userId) await pushState(userId);
    spindle.toast.info("SceneMap generation cancelled.", { userId });
    return;
  }

  const settings = await loadSettings(userId);
  const presetKey = getChatPresetKey(chat, settings);
  const preset = settings.schemaPresets[presetKey] ?? settings.schemaPresets[settings.schemaPreset] ?? settings.schemaPresets.default;
  const previousTracker = getPreviousTrackerJson(messages, target.id, !!getMessageTracker(target));
  const finalPrompt = renderPrompt(settings.promptJson, {
    schema: JSON.stringify(preset.value, null, 2),
    previous_tracker: previousTracker,
    example_response: JSON.stringify(schemaToExample(preset.value), null, 2),
  });
  const promptMessages = trimMessagesForPrompt(messages, target.id, settings.includeLastXMessages);
  promptMessages.push({ role: "user", content: finalPrompt });

  const controller = new AbortController();
  activeGenerations.set(target.id, controller);
  if (userId) await pushState(userId);

  try {
    const result = await (spindle.generate.quiet as any)({
      messages: promptMessages,
      connection_id: settings.connectionId || undefined,
      userId,
      parameters: {
        max_tokens: Math.max(1, Math.floor(settings.maxResponseTokens || 16000)),
      },
      signal: controller.signal,
    });
    const parsed = parseModelJson(result.content);
    await spindle.chat.updateMessage(chat.id, target.id, {
      metadata: withTrackerMetadata(target, parsed),
    });
    spindle.toast.success("Tracker updated.", { title: "SceneMap", userId });
  } catch (error) {
    if ((error as Error).name !== "AbortError") {
      spindle.toast.error((error as Error).message, { title: "SceneMap generation failed", duration: 10000, userId });
      throw error;
    }
  } finally {
    activeGenerations.delete(target.id);
    if (userId) await pushState(userId);
    else await refreshMacroValue();
  }
}

async function editTracker(messageId: string, data: unknown, userId?: string) {
  if (!userId) throw new Error("SceneMap needs a user context before editing a tracker.");
  const { chat, messages } = await getActiveContext(userId);
  if (!chat) throw new Error("Open a chat before editing a tracker.");
  const message = messages.find((item) => item.id === messageId);
  if (!message) throw new Error("Message not found.");
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Tracker data must be a JSON object.");
  await spindle.chat.updateMessage(chat.id, messageId, {
    metadata: withTrackerMetadata(message, data),
  });
  spindle.toast.success("Tracker saved.", { title: "SceneMap", userId });
  if (userId) await pushState(userId);
  else await refreshMacroValue();
}

async function deleteTracker(messageId: string, userId?: string) {
  if (!userId) throw new Error("SceneMap needs a user context before deleting a tracker.");
  const { chat, messages } = await getActiveContext(userId);
  if (!chat) throw new Error("Open a chat before deleting a tracker.");
  const message = messages.find((item) => item.id === messageId);
  if (!message) throw new Error("Message not found.");
  const { confirmed } = await spindle.modal.confirm({
    title: "Delete Tracker",
    message: "This will permanently remove SceneMap data from this message.",
    variant: "danger",
    confirmLabel: "Delete",
    userId,
  });
  if (!confirmed) return;
  await spindle.chat.updateMessage(chat.id, messageId, {
    metadata: withoutTrackerMetadata(message),
  });
  spindle.toast.success("Tracker deleted.", { title: "SceneMap", userId });
  if (userId) await pushState(userId);
  else await refreshMacroValue();
}

spindle.registerMacro({
  name: "scenemap",
  category: "extension:scenemap",
  description: "Latest SceneMap state formatted as plain text for prompts.",
  returnType: "string",
  handler: "",
});

spindle.onFrontendMessage(async (payload: any, userId?: string) => {
  try {
    if (!userId) throw new Error("SceneMap did not receive a user context from Lumiverse.");
    switch (payload?.type) {
      case "get_state":
        await pushState(userId);
        break;
      case "save_settings":
        await saveSettings(payload.settings, userId);
        await pushState(userId);
        spindle.toast.success("Settings saved.", { title: "SceneMap", userId });
        break;
      case "set_chat_preset": {
        const { chat } = await getActiveContext(userId);
        if (!chat) throw new Error("Open a chat before setting a chat preset.");
        await updateChatPreset(chat.id, payload.presetKey, userId);
        await pushState(userId);
        spindle.toast.success("Chat preset updated.", { title: "SceneMap", userId });
        break;
      }
      case "generate_tracker":
        await generateTracker(payload.messageId ?? null, userId);
        break;
      case "edit_tracker":
        await editTracker(payload.messageId, payload.data, userId);
        break;
      case "delete_tracker":
        await deleteTracker(payload.messageId, userId);
        break;
    }
  } catch (error) {
    spindle.sendToFrontend({ type: "error", message: (error as Error).message }, userId);
    spindle.toast.error((error as Error).message, { title: "SceneMap", duration: 9000, userId });
  }
});

spindle.on("CHAT_SWITCHED", () => {});
spindle.on("MESSAGE_EDITED", () => {});
spindle.on("MESSAGE_DELETED", () => {});
spindle.on("MESSAGE_SWIPED", () => {});
spindle.on("GENERATION_ENDED", (payload: any) => {
  if (payload?.error || !payload?.messageId) return;
  spindle.log.warn("SceneMap auto-generation skipped: generation event does not include a frontend user context.");
});

void refreshMacroValue();
spindle.log.info("SceneMap loaded.");
