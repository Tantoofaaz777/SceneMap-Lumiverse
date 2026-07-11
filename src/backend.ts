import {
  CHAT_METADATA_KEY,
  MESSAGE_METADATA_KEY,
  SETTINGS_PATH,
  defaultSettings,
  getPresetLayout,
  getPresetPrompt,
  mergeSettings,
  renderPrompt,
  resolveSamplingParameter,
  trackerToText,
  type SceneMapSettings,
  type SceneMapState,
  type TrackerEntry,
} from "./shared";
import { createValidatedSchemaExample, parseAndValidateModelJson, validateTrackerData } from "./schema-validator";
import { GenerationRegistry } from "./generation-registry";
import { mergeTrackerMetadata } from "./tracker-metadata";
import { KeyedAsyncQueue } from "./keyed-async-queue";
import { captureSwipeSnapshot, swipeSnapshotMatches } from "./swipe-snapshot";

declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

type ChatMessage = {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  swipe_id?: number;
  swipes?: string[];
  swipe_dates?: number[];
  metadata?: Record<string, unknown>;
};

type PromptMessage = Pick<ChatMessage, "role" | "content">;

type ActiveChat = {
  id: string;
  character_id?: string | null;
  metadata?: Record<string, unknown>;
};

type CharacterCard = {
  id?: string;
  name?: unknown;
  description?: unknown;
  personality?: unknown;
  scenario?: unknown;
  extensions?: Record<string, unknown>;
};

type ReferenceContext = {
  chatId: string;
  characterId?: string | null;
  userId: string;
};

type ConnectionSummary = {
  id: string;
  name: string;
  provider: string;
  model: string;
  is_default?: boolean;
};

const activeGenerations = new GenerationRegistry();
const statePushQueue = new KeyedAsyncQueue();
const macroLayoutsByChatId = new Map<string, ReturnType<typeof getPresetLayout>>();
const alternateCharacterFields = ["description", "personality", "scenario"] as const;

type SceneMapMacroContext = {
  env?: {
    chat?: {
      id?: unknown;
    };
  };
};

type PullMacroDefinition = Omit<import("lumiverse-spindle-types").MacroDefinitionDTO, "handler"> & {
  handler: (context: SceneMapMacroContext) => string | Promise<string>;
};

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

function getActiveSwipeId(message: ChatMessage | null | undefined): number {
  return typeof message?.swipe_id === "number" && Number.isFinite(message.swipe_id) ? message.swipe_id : 0;
}

function getActiveGenerationMessageId(userId: string): string | null {
  return activeGenerations.getMessageId(userId);
}

function getTrackerStore(message: ChatMessage | null | undefined): Record<string, unknown> | null {
  const data = message?.metadata?.[MESSAGE_METADATA_KEY];
  if (!data || typeof data !== "object") return null;
  return data as Record<string, unknown>;
}

function getTrackerFromStore(store: Record<string, unknown> | null, swipeId: number): unknown | null {
  if (!store) return null;
  const swipes = store.swipes;
  if (swipes && typeof swipes === "object" && !Array.isArray(swipes)) {
    const item = (swipes as Record<string, unknown>)[String(swipeId)];
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return (item as Record<string, unknown>).value ?? null;
    }
  }

  if ("value" in store) {
    const legacySwipeId = store.swipeId;
    if (typeof legacySwipeId !== "number" || legacySwipeId === swipeId) return store.value ?? null;
  }
  return null;
}

function getMessageTracker(message: ChatMessage | null | undefined): unknown | null {
  return getTrackerFromStore(getTrackerStore(message), getActiveSwipeId(message));
}

function withoutTrackerMetadata(message: ChatMessage): Record<string, unknown> {
  const next = { ...(message.metadata ?? {}) };
  const existing = getTrackerStore(message);
  const swipeId = getActiveSwipeId(message);
  const swipes = existing?.swipes && typeof existing.swipes === "object" && !Array.isArray(existing.swipes)
    ? { ...(existing.swipes as Record<string, unknown>) }
    : {};
  if (existing && "value" in existing) {
    const legacySwipeId = typeof existing.swipeId === "number" ? existing.swipeId : swipeId;
    swipes[String(legacySwipeId)] ??= {
      value: existing.value,
      updatedAt: typeof existing.updatedAt === "string" ? existing.updatedAt : new Date().toISOString(),
    };
  }
  delete swipes[String(swipeId)];
  if (Object.keys(swipes).length === 0) {
    delete next[MESSAGE_METADATA_KEY];
  } else {
    next[MESSAGE_METADATA_KEY] = {
      version: 2,
      swipes,
      updatedAt: new Date().toISOString(),
    };
  }
  return next;
}

function getLatestTrackerEntry(messages: ChatMessage[]): TrackerEntry | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role !== "assistant") continue;
    const data = getMessageTracker(messages[i]);
    if (data) return { messageId: messages[i].id, swipeId: getActiveSwipeId(messages[i]), data };
  }
  return null;
}

function countAssistantMessagesAfter(messages: ChatMessage[], messageId: string): number {
  const index = messages.findIndex((message) => message.id === messageId);
  if (index === -1) return 0;
  return messages.slice(index + 1).filter((message) => message.role === "assistant").length;
}

function countAssistantMessagesBetween(messages: ChatMessage[], afterMessageId: string | null, throughMessageId: string): number {
  const startIndex = afterMessageId ? messages.findIndex((message) => message.id === afterMessageId) + 1 : 0;
  const endIndex = messages.findIndex((message) => message.id === throughMessageId);
  if (endIndex === -1) return 0;
  return messages
    .slice(Math.max(0, startIndex), endIndex + 1)
    .filter((message) => message.role === "assistant")
    .length;
}

function findLatestAssistantMessage(messages: ChatMessage[]): ChatMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "assistant") return messages[i];
  }
  return null;
}

function getAutoGenerateMessagesRemaining(settings: SceneMapSettings, messages: ChatMessage[], latest: TrackerEntry | null, activeMessage: ChatMessage | null): number | null {
  if (!settings.autoGenerateAiTrackers || !activeMessage || activeMessage.role !== "assistant") return null;
  const interval = Math.max(1, Math.floor(settings.autoGenerateInterval || 1));
  const messagesDue = latest
    ? countAssistantMessagesAfter(messages, latest.messageId)
    : countAssistantMessagesBetween(messages, null, activeMessage.id);
  return Math.max(0, interval - messagesDue);
}

function getTrackerBeforeTargetJson(messages: ChatMessage[], targetId: string): string {
  const targetIndex = messages.findIndex((message) => message.id === targetId);
  if (targetIndex <= 0) return "{}";
  for (let i = targetIndex - 1; i >= 0; i -= 1) {
    const message = messages[i];
    const tracker = getMessageTracker(message);
    if (!tracker) continue;
    return JSON.stringify(tracker, null, 2);
  }
  return "{}";
}

function trimMessagesForPrompt(messages: ChatMessage[], targetId: string, includeLastXMessages: number): PromptMessage[] {
  const targetIndex = messages.findIndex((message) => message.id === targetId);
  const end = targetIndex === -1 ? messages.length : targetIndex + 1;
  const start = includeLastXMessages > 0 ? Math.max(0, end - includeLastXMessages) : 0;
  return messages.slice(start, end).map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

async function resolvePromptMessages(messages: PromptMessage[], context: ReferenceContext): Promise<PromptMessage[]> {
  return Promise.all(messages.map(async (message) => ({
    ...message,
    content: await resolveDisplayText(message.content, context),
  })));
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

async function buildReferencePromptMessage(chat: ActiveChat, userId: string): Promise<PromptMessage | null> {
  const context: ReferenceContext = {
    chatId: chat.id,
    characterId: chat.character_id,
    userId,
  };
  const sections = [
    await buildCharacterReference(chat, userId),
    await buildPersonaReference(chat, userId),
    await buildActiveWorldInfoReference(chat.id, userId),
  ].filter(Boolean) as string[];
  if (sections.length === 0) return null;
  const content = sections.join("\n\n");
  return {
    role: "system",
    content: await resolveDisplayText(content, context),
  };
}

async function buildCharacterReference(chat: ActiveChat, userId: string): Promise<string | null> {
  if (!chat.character_id) return null;
  try {
    const character = await spindle.characters.get(chat.character_id, userId);
    if (!character) return null;
    const effectiveCharacter = resolveCharacterAlternateFields(character, chat);
    return taggedReferenceBlock(getEffectiveCharacterName(effectiveCharacter), [
      compactText(effectiveCharacter.description),
      compactText(effectiveCharacter.personality),
      compactText(effectiveCharacter.scenario),
    ]);
  } catch (error) {
    spindle.log.warn(`SceneMap could not read character card context: ${(error as Error).message}`);
    return null;
  }
}

async function buildPersonaReference(chat: ActiveChat, userId: string): Promise<string | null> {
  try {
    const persona = await spindle.personas.getActive(userId) ?? await spindle.personas.getDefault(userId);
    if (!persona) return null;
    const resolvedPersona = await resolvePersonaMacro(chat, userId, persona.description);
    return taggedReferenceBlock(compactText(persona.name) || "Persona", [
      compactText(resolvedPersona),
    ]);
  } catch (error) {
    spindle.log.warn(`SceneMap could not read persona context: ${(error as Error).message}`);
    return null;
  }
}

async function buildActiveWorldInfoReference(chatId: string, userId: string): Promise<string | null> {
  try {
    const activated = await spindle.world_books.getActivated(chatId, userId);
    if (!activated.length) return null;
    const entries = await Promise.all(activated.map(async (entry: any) => {
      const fullEntry = await spindle.world_books.entries.get(entry.id, userId);
      return compactText(fullEntry?.content);
    }));
    const activeEntries = entries.filter(Boolean);
    if (activeEntries.length === 0) return null;
    return activeEntries.join("\n\n");
  } catch (error) {
    spindle.log.warn(`SceneMap could not read active world info context: ${(error as Error).message}`);
    return null;
  }
}

function getEffectiveCharacterName(character: { name?: unknown; extensions?: Record<string, unknown> }): string {
  return compactText(character.extensions?.alternate_character_name) || compactText(character.name) || "Character";
}

function resolveCharacterAlternateFields(character: CharacterCard, chat: ActiveChat): CharacterCard {
  const selections = getCharacterAlternateFieldSelections(character, chat);
  const alternateFields = getRecord(character.extensions?.alternate_fields);
  if (!selections || !alternateFields) return character;

  const overrides: Partial<CharacterCard> = {};
  for (const field of alternateCharacterFields) {
    const variantId = compactText(selections[field]);
    if (!variantId) continue;
    const variants = alternateFields[field];
    if (!Array.isArray(variants)) continue;
    const variant = variants.find((item) => {
      const record = getRecord(item);
      return record ? compactText(record.id) === variantId : false;
    });
    const content = compactText(getRecord(variant)?.content);
    if (content) overrides[field] = content;
  }

  return Object.keys(overrides).length > 0 ? { ...character, ...overrides } : character;
}

function getCharacterAlternateFieldSelections(character: CharacterCard, chat: ActiveChat): Record<string, unknown> | null {
  const metadata = chat.metadata;
  if (!metadata) return null;

  if (metadata.group === true) {
    const byCharacter = getRecord(metadata.group_alternate_field_selections);
    const characterId = compactText(character.id);
    const groupSelections = characterId ? getRecord(byCharacter?.[characterId]) : null;
    if (groupSelections) return groupSelections;

    if (chat.character_id && characterId && chat.character_id !== characterId) return null;
  }

  return getRecord(metadata.alternate_field_selections);
}

function taggedReferenceBlock(name: string, parts: string[]): string | null {
  const tag = compactTagName(name) || "Reference";
  const body = parts.map(compactText).filter(Boolean).join("\n\n");
  return body ? [`<${tag}>`, body, `</${tag}>`].join("\n") : null;
}

function compactTagName(name: unknown): string {
  return compactText(name).replace(/[<>]/g, "").trim();
}

function wrapInstructions(text: string): string {
  const body = compactText(text);
  return body ? `<Instructions>\n${body}\n</Instructions>` : "";
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

async function resolvePersonaMacro(chat: ActiveChat, userId: string, fallback: unknown): Promise<string> {
  try {
    const result = await spindle.macros.resolve("{{persona}}", {
      chatId: chat.id,
      characterId: chat.character_id || undefined,
      userId,
      commit: false,
    });
    const text = compactText(result.text);
    return text && text !== "{{persona}}" ? text : compactText(fallback);
  } catch (error) {
    spindle.log.warn(`SceneMap could not resolve persona add-ons: ${(error as Error).message}`);
    return compactText(fallback);
  }
}

function compactText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\r\n/g, "\n").trim() : "";
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
  const effectivePresetKey = getChatPresetKey(chat, settings);
  const latest = getLatestTrackerEntry(messages);
  const activeMessage = findLatestAssistantMessage(messages);
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
    effectivePresetKey,
    latest,
    messagesBehind: latest ? countAssistantMessagesAfter(messages, latest.messageId) : 0,
    autoGenerateMessagesRemaining: getAutoGenerateMessagesRemaining(settings, messages, latest, activeMessage),
    activeMessageId: activeMessage?.id ?? null,
    activeSwipeId: activeMessage ? getActiveSwipeId(activeMessage) : null,
    generatingMessageId: getActiveGenerationMessageId(userId),
    connections: await listConnections(userId),
  };
}

function pushState(userId: string, response: Record<string, unknown> = {}): Promise<void> {
  return statePushQueue.enqueue(userId, async () => {
    const state = await buildState(userId);
    if (state.chatId) {
      macroLayoutsByChatId.set(state.chatId, getPresetLayout(state.settings, state.effectivePresetKey));
    }
    spindle.sendToFrontend({ type: "state", state, ...response }, userId);
  });
}

async function resolveSceneMapMacro(context: SceneMapMacroContext): Promise<string> {
  const chatId = context.env?.chat?.id;
  if (typeof chatId !== "string" || !chatId) return "";
  try {
    const messages = (await spindle.chat.getMessages(chatId)) as ChatMessage[];
    const latest = getLatestTrackerEntry(messages);
    if (!latest) return "";
    return trackerToText(latest.data, macroLayoutsByChatId.get(chatId));
  } catch (error) {
    spindle.log.warn(`SceneMap macro resolution failed: ${(error as Error).message}`);
    return "";
  }
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

function removeLegacyExampleSection(template: string): string {
  return template.replace(
    /EXAMPLE OF A PERFECT RESPONSE:\s*```json\s*\{\{\s*example_response\s*\}\}\s*```/gi,
    "",
  );
}

async function generateTracker(userId?: string, expectedLatestMessageId?: string) {
  if (!userId) throw new Error("SceneMap needs a user context before generating a tracker.");
  const activeMessageId = getActiveGenerationMessageId(userId);
  if (activeMessageId) {
    const activeGeneration = activeGenerations.get(userId, activeMessageId);
    if (activeGeneration) activeGenerations.cancel(activeGeneration);
    spindle.toast.info("SceneMap generation cancelled.", { userId });
    return;
  }

  const { chat, messages } = await getActiveContext(userId);
  if (!chat) throw new Error("Open a chat before generating a SceneMap tracker.");

  const target = findLatestAssistantMessage(messages);
  if (!target) throw new Error("No assistant message found for SceneMap.");
  if (expectedLatestMessageId && target.id !== expectedLatestMessageId) {
    await pushState(userId);
    return;
  }
  const targetSwipeId = getActiveSwipeId(target);
  const targetSwipeSnapshot = captureSwipeSnapshot(target, targetSwipeId);
  if (!targetSwipeSnapshot) throw new Error("SceneMap could not read the target swipe.");

  const settings = await loadSettings(userId);
  const presetKey = getChatPresetKey(chat, settings);
  const preset = settings.schemaPresets[presetKey] ?? settings.schemaPresets[settings.schemaPreset] ?? settings.schemaPresets.default;
  const previousTracker = getTrackerBeforeTargetJson(messages, target.id);
  const schemaExample = createValidatedSchemaExample(preset.value);
  const exampleResponse = schemaExample === null ? "" : JSON.stringify(schemaExample, null, 2);
  const exampleSection = schemaExample === null
    ? ""
    : `EXAMPLE OF A PERFECT RESPONSE:\n\`\`\`json\n${exampleResponse}\n\`\`\``;
  const rawPromptTemplate = getPresetPrompt(settings, presetKey);
  const promptTemplate = schemaExample === null ? removeLegacyExampleSection(rawPromptTemplate) : rawPromptTemplate;
  const finalPrompt = renderPrompt(promptTemplate, {
    schema: JSON.stringify(preset.value, null, 2),
    previous_tracker: previousTracker,
    example_response: exampleResponse,
    example_section: exampleSection,
  });
  const context = { chatId: chat.id, characterId: chat.character_id, userId };
  const promptMessages = await resolvePromptMessages(trimMessagesForPrompt(messages, target.id, settings.includeLastXMessages), context);
  const referenceMessage = await buildReferencePromptMessage(chat, userId);
  if (referenceMessage) promptMessages.unshift(referenceMessage);
  promptMessages.push({ role: "user", content: wrapInstructions(finalPrompt) });

  const controller = new AbortController();
  const generation = activeGenerations.start(userId, target.id, controller);
  await pushState(userId);
  spindle.toast.info("Mapping this scene...", { title: "SceneMap", userId });

  try {
    const result = await (spindle.generate.quiet as any)({
      messages: promptMessages,
      connection_id: settings.connectionId || undefined,
      userId,
      parameters: {
        max_tokens: Math.max(1, Math.floor(settings.maxResponseTokens || 16000)),
        temperature: resolveSamplingParameter(settings.temperature, 0, 2),
        top_p: resolveSamplingParameter(settings.topP, 0, 1),
      },
      signal: controller.signal,
    });
    const parsed = parseAndValidateModelJson(result.content, preset.value);
    const currentMessages = (await spindle.chat.getMessages(chat.id)) as ChatMessage[];
    const currentTarget = currentMessages.find((message) => message.id === target.id);
    if (!currentTarget) throw new Error("SceneMap target message was deleted during generation.");
    if (!swipeSnapshotMatches(targetSwipeSnapshot, currentTarget, targetSwipeId)) {
      throw new Error("SceneMap target swipe changed during generation. Generate the tracker again.");
    }
    await spindle.chat.updateMessage(chat.id, target.id, {
      metadata: mergeTrackerMetadata(currentTarget.metadata, parsed, targetSwipeId),
    });
    spindle.toast.success("Tracker updated.", { title: "SceneMap", userId });
  } catch (error) {
    if ((error as Error).name !== "AbortError") {
      throw error;
    }
  } finally {
    activeGenerations.finish(generation);
    await pushState(userId);
  }
}

async function maybeAutoGenerateTracker(messageId: string | null | undefined, userId: string) {
  const settings = await loadSettings(userId);
  if (!settings.autoGenerateAiTrackers) {
    await pushState(userId);
    return;
  }

  const interval = Math.max(1, Math.floor(settings.autoGenerateInterval || 1));
  const { messages } = await getActiveContext(userId);
  const target = findLatestAssistantMessage(messages);
  if (!target || target.id !== messageId) {
    await pushState(userId);
    return;
  }
  if (getMessageTracker(target)) {
    await pushState(userId);
    return;
  }

  if (getActiveGenerationMessageId(userId)) {
    await pushState(userId);
    return;
  }

  const latest = getLatestTrackerEntry(messages);
  const messagesDue = countAssistantMessagesBetween(messages, latest?.messageId ?? null, target.id);
  if (messagesDue >= interval) {
    await generateTracker(userId, target.id);
  } else {
    await pushState(userId);
  }
}

async function editTracker(chatId: string, messageId: string, swipeId: number, data: unknown, userId?: string) {
  if (!userId) throw new Error("SceneMap needs a user context before editing a tracker.");
  if (!chatId) throw new Error("Tracker chat is missing.");
  const chat = await spindle.chats.get(chatId, userId);
  if (!chat) throw new Error("Tracker chat was not found.");
  if (!Number.isInteger(swipeId) || swipeId < 0) throw new Error("Tracker swipe is invalid.");
  const messages = (await spindle.chat.getMessages(chatId)) as ChatMessage[];
  const message = messages.find((item) => item.id === messageId);
  if (!message) throw new Error("Message not found.");
  if (Array.isArray(message.swipes) && swipeId >= message.swipes.length) {
    throw new Error("Tracker swipe was removed while the editor was open.");
  }
  const settings = await loadSettings(userId);
  const presetKey = getChatPresetKey(chat, settings);
  const preset = settings.schemaPresets[presetKey] ?? settings.schemaPresets[settings.schemaPreset] ?? settings.schemaPresets.default;
  const validatedData = validateTrackerData(data, preset.value);
  await spindle.chat.updateMessage(chatId, messageId, {
    metadata: mergeTrackerMetadata(message.metadata, validatedData, swipeId),
  });
  spindle.toast.success("Tracker saved.", { title: "SceneMap", userId });
  await pushState(userId);
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
  const currentMessages = (await spindle.chat.getMessages(chat.id)) as ChatMessage[];
  const currentMessage = currentMessages.find((item) => item.id === messageId);
  if (!currentMessage) throw new Error("Message was deleted before its tracker could be removed.");
  await spindle.chat.updateMessage(chat.id, messageId, {
    metadata: withoutTrackerMetadata(currentMessage),
  });
  spindle.toast.success("Tracker deleted.", { title: "SceneMap", userId });
  await pushState(userId);
}

const registerPullMacro = spindle.registerMacro as unknown as (definition: PullMacroDefinition) => void;
registerPullMacro({
  name: "scenemap",
  category: "extension:scenemap",
  description: "Latest SceneMap state formatted as plain text for prompts.",
  returnType: "string",
  handler: resolveSceneMapMacro,
  volatile: true,
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
        await pushState(userId, {
          settingsSaveRequestId: typeof payload.requestId === "string" ? payload.requestId : "",
        });
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
        await generateTracker(userId);
        break;
      case "maybe_auto_generate":
        await maybeAutoGenerateTracker(payload.messageId ?? null, userId);
        break;
      case "edit_tracker":
        await editTracker(payload.chatId, payload.messageId, payload.swipeId, payload.data, userId);
        break;
      case "delete_tracker":
        await deleteTracker(payload.messageId, userId);
        break;
      case "open_text_editor": {
        const result = await (spindle.textEditor as any).open({
          title: typeof payload.title === "string" ? payload.title : "Edit Text",
          value: typeof payload.value === "string" ? payload.value : "",
          placeholder: typeof payload.placeholder === "string" ? payload.placeholder : "",
          userId,
        });
        spindle.sendToFrontend({
          type: "text_editor_result",
          requestId: payload.requestId,
          text: result?.text ?? "",
          cancelled: result?.cancelled === true,
        }, userId);
        break;
      }
    }
  } catch (error) {
    const isGenerationRequest = payload?.type === "generate_tracker" || payload?.type === "maybe_auto_generate";
    spindle.sendToFrontend({
      type: "error",
      message: (error as Error).message,
      requestId: typeof payload?.requestId === "string" ? payload.requestId : undefined,
    }, userId);
    spindle.toast.error((error as Error).message, {
      title: isGenerationRequest ? "SceneMap generation failed" : "SceneMap",
      duration: isGenerationRequest ? 10000 : 9000,
      userId,
    });
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

spindle.log.info("SceneMap loaded.");
