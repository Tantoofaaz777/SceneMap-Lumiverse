// @bun
// src/shared.ts
var SETTINGS_PATH = "settings.json";
var CHAT_METADATA_KEY = "scenemap";
var MESSAGE_METADATA_KEY = "scenemap";
var DEFAULT_SCHEMA_VALUE = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "SceneTracker",
  description: "Schema for tracking roleplay scene details",
  type: "object",
  properties: {
    time: {
      type: "string",
      description: "Format: HH:MM:SS; MM/DD/YYYY (Day Name)"
    },
    location: {
      type: "string",
      description: "Specific scene location with increasing specificity"
    },
    weather: {
      type: "string",
      description: "Current weather conditions and temperature"
    },
    topics: {
      type: "object",
      properties: {
        primaryTopic: {
          type: "string",
          description: "1-2 word main topic of interaction"
        },
        emotionalTone: {
          type: "string",
          description: "Dominant emotional tone of scene"
        },
        interactionTheme: {
          type: "string",
          description: "Type of character interaction"
        }
      },
      required: ["primaryTopic", "emotionalTone", "interactionTheme"]
    },
    charactersPresent: {
      type: "array",
      items: {
        type: "string",
        description: "Character name"
      },
      description: "List of character names present in scene"
    },
    characters: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Character name"
          },
          hair: {
            type: "string",
            description: "Hairstyle and condition"
          },
          makeup: {
            type: "string",
            description: "Makeup description or 'None'"
          },
          outfit: {
            type: "string",
            description: "Complete outfit including underwear"
          },
          stateOfDress: {
            type: "string",
            description: "How put-together/disheveled character appears"
          },
          postureAndInteraction: {
            type: "string",
            description: "Character's physical positioning and interaction"
          }
        },
        required: ["name", "hair", "makeup", "outfit", "stateOfDress", "postureAndInteraction"]
      },
      description: "Array of character objects"
    }
  },
  required: ["time", "location", "weather", "topics", "charactersPresent", "characters"]
};
var DEFAULT_DISPLAY_LAYOUT = {
  sections: [
    {
      title: "Scene",
      fields: [
        { path: "location", label: "Location", display: "text" },
        { path: "time", label: "Time", display: "subtle" },
        { path: "weather", label: "Weather", display: "text" }
      ]
    },
    {
      title: "Topics",
      fields: [
        { path: "topics.primaryTopic", label: "Primary Topic", display: "text" },
        { path: "topics.emotionalTone", label: "Emotional Tone", display: "subtle" },
        { path: "topics.interactionTheme", label: "Interaction Theme", display: "subtle" }
      ]
    },
    {
      title: "Present",
      fields: [{ path: "charactersPresent", label: "Characters", display: "chips" }]
    },
    {
      title: "Characters",
      fields: [
        {
          path: "characters",
          label: "Characters",
          display: "character_cards",
          fields: [
            { path: "outfit", label: "Outfit", display: "text" },
            { path: "stateOfDress", label: "State Of Dress", display: "subtle" },
            { path: "postureAndInteraction", label: "Posture And Interaction", display: "mono" },
            { path: "hair", label: "Hair", display: "subtle" },
            { path: "makeup", label: "Makeup", display: "subtle" }
          ]
        }
      ]
    }
  ]
};
var DEFAULT_PROMPT_JSON = `You are a highly specialized AI assistant. Your SOLE purpose is to generate a single, valid JSON object that strictly adheres to the provided JSON schema.

CRITICAL INSTRUCTIONS:
1. You MUST wrap the entire JSON object in a markdown code block (\`\`\`json\\n...\\n\`\`\`).
2. Your response MUST NOT contain explanatory text, comments, or any content outside this single code block.
3. The JSON object inside the code block MUST be valid and conform to the schema.

JSON SCHEMA TO FOLLOW:
\`\`\`json
{{schema}}
\`\`\`

PREVIOUS TRACKER TO UPDATE:
If this object is not empty, use it as the baseline and update it instead of starting from scratch. Preserve unchanged fields unless recent chat messages clearly changed them.
\`\`\`json
{{previous_tracker}}
\`\`\`

EXAMPLE OF A PERFECT RESPONSE:
\`\`\`json
{{example_response}}
\`\`\``;
var defaultSettings = {
  version: "1.0.1",
  formatVersion: "F_1.0",
  connectionId: "",
  maxResponseTokens: 16000,
  autoGenerateAiTrackers: false,
  schemaPreset: "default",
  schemaPresets: {
    default: {
      name: "Default",
      value: DEFAULT_SCHEMA_VALUE
    }
  },
  includeLastXMessages: 0,
  promptJson: DEFAULT_PROMPT_JSON,
  displayLayout: DEFAULT_DISPLAY_LAYOUT
};
function cloneDefaultSettings() {
  return JSON.parse(JSON.stringify(defaultSettings));
}
function mergeSettings(value) {
  const base = cloneDefaultSettings();
  if (!value || typeof value !== "object")
    return base;
  return {
    ...base,
    ...value,
    schemaPresets: {
      ...base.schemaPresets,
      ...value.schemaPresets ?? {}
    },
    displayLayout: value.displayLayout?.sections?.length ? value.displayLayout : base.displayLayout
  };
}
function schemaToExample(schema) {
  if (!schema || typeof schema !== "object")
    return null;
  if (schema.example !== undefined)
    return schema.example;
  switch (schema.type) {
    case "object": {
      const obj = {};
      const properties = schema.properties && typeof schema.properties === "object" ? schema.properties : {};
      for (const [key, child] of Object.entries(properties))
        obj[key] = schemaToExample(child);
      return obj;
    }
    case "array":
      return schema.items ? [schemaToExample(schema.items)] : [];
    case "string":
      return schema.description || "string";
    case "number":
    case "integer":
      return 0;
    case "boolean":
      return false;
    default:
      return null;
  }
}
function parseModelJson(content) {
  const match = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const cleaned = (match ? match[1] : content).trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Model response must be a JSON object.");
    }
    return parsed;
  } catch (error) {
    throw new Error(`Model response is not valid JSON: ${error.message}`);
  }
}
function renderPrompt(template, values) {
  return template.replace(/\{\{\s*(schema|previous_tracker|example_response)\s*\}\}/g, (_match, key) => values[key] ?? "");
}
function humanizeTrackerKey(key) {
  return key.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\s+/g, " ").trim().replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}
function formatPrimitive(value) {
  if (value === null || value === undefined)
    return "";
  if (typeof value === "string")
    return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return JSON.stringify(value);
}
function trackerToText(tracker) {
  if (!tracker || typeof tracker !== "object" || Array.isArray(tracker))
    return "";
  const record = tracker;
  const sceneLines = renderSceneMapSummary(record);
  if (sceneLines.length > 0)
    return sceneLines.join(`
`);
  const lines = [];
  for (const [key, value] of Object.entries(record)) {
    const child = trackerValueToText(key, value);
    if (child.length === 0)
      continue;
    if (lines.length > 0)
      lines.push("");
    lines.push(...child);
  }
  return lines.join(`
`);
}
function renderSceneMapSummary(tracker) {
  const lines = [];
  pushPrimitiveLine(lines, "Time", tracker.time);
  pushPrimitiveLine(lines, "Location", tracker.location);
  pushPrimitiveLine(lines, "Weather", tracker.weather);
  const topics = tracker.topics && typeof tracker.topics === "object" && !Array.isArray(tracker.topics) ? tracker.topics : null;
  if (topics) {
    const tone = [
      formatPrimitive(topics.primaryTopic),
      formatPrimitive(topics.emotionalTone),
      formatPrimitive(topics.interactionTheme)
    ].filter(Boolean);
    if (tone.length > 0) {
      if (lines.length > 0)
        lines.push("");
      lines.push(`Scene tone: ${tone.join("; ")}.`);
    }
  }
  if (Array.isArray(tracker.charactersPresent) && tracker.charactersPresent.length > 0) {
    const present = tracker.charactersPresent.map(formatPrimitive).filter(Boolean);
    if (present.length > 0)
      lines.push(`Present: ${present.join(", ")}.`);
  }
  if (Array.isArray(tracker.characters) && tracker.characters.length > 0) {
    for (const character of tracker.characters) {
      if (!character || typeof character !== "object" || Array.isArray(character))
        continue;
      const characterLines = renderCharacterSummary(character);
      if (characterLines.length === 0)
        continue;
      if (lines.length > 0)
        lines.push("");
      lines.push(...characterLines);
    }
  }
  return lines;
}
function pushPrimitiveLine(lines, label, value) {
  const text = formatPrimitive(value);
  if (text)
    lines.push(`${label}: ${text}`);
}
function renderCharacterSummary(character) {
  const name = formatPrimitive(character.name) || "Character";
  const lines = [`${name}:`];
  for (const [key, value] of Object.entries(character)) {
    if (key === "name")
      continue;
    const text = formatPrimitive(value);
    if (!text)
      continue;
    lines.push(`- ${humanizeTrackerKey(key)}: ${text}`);
  }
  return lines.length > 1 ? lines : [];
}
function trackerValueToText(key, value, depth = 0) {
  const indent = "  ".repeat(depth);
  const label = humanizeTrackerKey(key);
  if (value === null || value === undefined || value === "")
    return [];
  if (Array.isArray(value)) {
    if (value.length === 0)
      return [];
    const lines = [`${indent}${label}:`];
    for (const item of value) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const entries = Object.entries(item).filter(([, child]) => child !== null && child !== undefined && child !== "");
        if (entries.length === 0)
          continue;
        const [firstKey, firstValue] = entries[0];
        lines.push(`${indent}- ${humanizeTrackerKey(firstKey)}: ${formatPrimitive(firstValue)}`);
        for (const [childKey, childValue] of entries.slice(1)) {
          lines.push(...trackerValueToText(childKey, childValue, depth + 1));
        }
      } else {
        lines.push(`${indent}- ${formatPrimitive(item)}`);
      }
    }
    return lines;
  }
  if (typeof value === "object") {
    const lines = [`${indent}${label}:`];
    for (const [childKey, childValue] of Object.entries(value)) {
      lines.push(...trackerValueToText(childKey, childValue, depth));
    }
    return lines.length > 1 ? lines : [];
  }
  return [`${indent}${label}: ${formatPrimitive(value)}`];
}

// src/backend.ts
var activeGenerations = new Map;
async function loadSettings(userId) {
  return mergeSettings(await spindle.userStorage.getJson(SETTINGS_PATH, {
    fallback: defaultSettings,
    userId
  }));
}
async function saveSettings(settings, userId) {
  await spindle.userStorage.setJson(SETTINGS_PATH, mergeSettings(settings), { indent: 2, userId });
}
function getActiveSwipeId(message) {
  return typeof message?.swipe_id === "number" && Number.isFinite(message.swipe_id) ? message.swipe_id : 0;
}
function getTrackerStore(message) {
  const data = message?.metadata?.[MESSAGE_METADATA_KEY];
  if (!data || typeof data !== "object")
    return null;
  return data;
}
function getTrackerFromStore(store, swipeId) {
  if (!store)
    return null;
  const swipes = store.swipes;
  if (swipes && typeof swipes === "object" && !Array.isArray(swipes)) {
    const item = swipes[String(swipeId)];
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return item.value ?? null;
    }
  }
  if ("value" in store) {
    const legacySwipeId = store.swipeId;
    if (typeof legacySwipeId !== "number" || legacySwipeId === swipeId)
      return store.value ?? null;
  }
  return null;
}
function getMessageTracker(message) {
  return getTrackerFromStore(getTrackerStore(message), getActiveSwipeId(message));
}
function withTrackerMetadata(message, data) {
  const now = new Date().toISOString();
  const swipeId = getActiveSwipeId(message);
  const existing = getTrackerStore(message);
  const swipes = existing?.swipes && typeof existing.swipes === "object" && !Array.isArray(existing.swipes) ? { ...existing.swipes } : {};
  if (existing && "value" in existing) {
    const legacySwipeId = typeof existing.swipeId === "number" ? existing.swipeId : swipeId;
    swipes[String(legacySwipeId)] ??= {
      value: existing.value,
      updatedAt: typeof existing.updatedAt === "string" ? existing.updatedAt : now
    };
  }
  swipes[String(swipeId)] = { value: data, updatedAt: now };
  return {
    ...message.metadata ?? {},
    [MESSAGE_METADATA_KEY]: {
      version: 2,
      swipes,
      updatedAt: now
    }
  };
}
function withoutTrackerMetadata(message) {
  const next = { ...message.metadata ?? {} };
  const existing = getTrackerStore(message);
  const swipeId = getActiveSwipeId(message);
  const swipes = existing?.swipes && typeof existing.swipes === "object" && !Array.isArray(existing.swipes) ? { ...existing.swipes } : {};
  if (existing && "value" in existing) {
    const legacySwipeId = typeof existing.swipeId === "number" ? existing.swipeId : swipeId;
    swipes[String(legacySwipeId)] ??= {
      value: existing.value,
      updatedAt: typeof existing.updatedAt === "string" ? existing.updatedAt : new Date().toISOString()
    };
  }
  delete swipes[String(swipeId)];
  if (Object.keys(swipes).length === 0) {
    delete next[MESSAGE_METADATA_KEY];
  } else {
    next[MESSAGE_METADATA_KEY] = {
      version: 2,
      swipes,
      updatedAt: new Date().toISOString()
    };
  }
  return next;
}
function getLatestTrackerEntry(messages) {
  for (let i = messages.length - 1;i >= 0; i -= 1) {
    if (messages[i].role !== "assistant")
      continue;
    const data = getMessageTracker(messages[i]);
    if (data)
      return { messageId: messages[i].id, swipeId: getActiveSwipeId(messages[i]), data };
  }
  return null;
}
function countAssistantMessagesAfter(messages, messageId) {
  const index = messages.findIndex((message) => message.id === messageId);
  if (index === -1)
    return 0;
  return messages.slice(index + 1).filter((message) => message.role === "assistant").length;
}
function findTargetMessage(messages, messageId) {
  if (messageId)
    return messages.find((message) => message.id === messageId) ?? null;
  for (let i = messages.length - 1;i >= 0; i -= 1) {
    if (messages[i].role === "assistant")
      return messages[i];
  }
  return null;
}
function getPreviousTrackerJson(messages, currentMessageId, skipCurrent) {
  let skippedCurrent = !skipCurrent;
  for (let i = messages.length - 1;i >= 0; i -= 1) {
    const message = messages[i];
    const tracker = getMessageTracker(message);
    if (!tracker)
      continue;
    if (!skippedCurrent && message.id === currentMessageId) {
      skippedCurrent = true;
      continue;
    }
    return JSON.stringify(tracker, null, 2);
  }
  return "{}";
}
function trimMessagesForPrompt(messages, targetId, includeLastXMessages) {
  const targetIndex = messages.findIndex((message) => message.id === targetId);
  const end = targetIndex === -1 ? messages.length : targetIndex + 1;
  const start = includeLastXMessages > 0 ? Math.max(0, end - includeLastXMessages) : 0;
  return messages.slice(start, end).map((message) => ({
    role: message.role,
    content: message.content
  }));
}
async function resolvePromptMessages(messages, context) {
  return Promise.all(messages.map(async (message) => ({
    ...message,
    content: await resolveDisplayText(message.content, context)
  })));
}
async function listConnections(userId) {
  try {
    const connections = await spindle.connections.list(userId);
    return connections.map((conn) => ({
      id: conn.id,
      name: conn.name,
      provider: conn.provider,
      model: conn.model,
      is_default: conn.is_default
    }));
  } catch {
    return [];
  }
}
async function getActiveContext(userId) {
  const chat = await spindle.chats.getActive(userId);
  if (!chat)
    return { chat: null, messages: [] };
  const messages = await spindle.chat.getMessages(chat.id);
  return { chat, messages };
}
async function resolveTrackerDisplayData(value, context) {
  if (typeof value === "string")
    return resolveDisplayText(value, context);
  if (Array.isArray(value))
    return Promise.all(value.map((item) => resolveTrackerDisplayData(item, context)));
  if (!value || typeof value !== "object")
    return value;
  const entries = await Promise.all(Object.entries(value).map(async ([key, child]) => [
    key,
    await resolveTrackerDisplayData(child, context)
  ]));
  return Object.fromEntries(entries);
}
async function buildReferencePromptMessage(chat, userId) {
  const context = {
    chatId: chat.id,
    characterId: chat.character_id,
    userId
  };
  const sections = [
    await buildCharacterReference(chat, userId),
    await buildPersonaReference(userId),
    await buildActiveWorldInfoReference(chat.id, userId)
  ].filter(Boolean);
  if (sections.length === 0)
    return null;
  const content = sections.join(`

`);
  return {
    role: "system",
    content: await resolveDisplayText(content, context)
  };
}
async function buildCharacterReference(chat, userId) {
  if (!chat.character_id)
    return null;
  try {
    const character = await spindle.characters.get(chat.character_id, userId);
    if (!character)
      return null;
    const lines = [
      `${compactText(character.name) || "Character"}:`,
      labeledText("Description", character.description),
      labeledText("Personality", character.personality),
      labeledText("Scenario", character.scenario)
    ].filter(Boolean);
    return lines.length > 1 ? lines.join(`
`) : null;
  } catch (error) {
    spindle.log.warn(`SceneMap could not read character card context: ${error.message}`);
    return null;
  }
}
async function buildPersonaReference(userId) {
  try {
    const persona = await spindle.personas.getActive(userId) ?? await spindle.personas.getDefault(userId);
    if (!persona)
      return null;
    const lines = [
      `${compactText(persona.name) || "Persona"}:`,
      labeledText("Description", persona.description)
    ].filter(Boolean);
    return lines.length > 1 ? lines.join(`
`) : null;
  } catch (error) {
    spindle.log.warn(`SceneMap could not read persona context: ${error.message}`);
    return null;
  }
}
async function buildActiveWorldInfoReference(chatId, userId) {
  try {
    const activated = await spindle.world_books.getActivated(chatId, userId);
    if (!activated.length)
      return null;
    const entries = await Promise.all(activated.map(async (entry) => {
      const fullEntry = await spindle.world_books.entries.get(entry.id, userId);
      const content = compactText(fullEntry?.content);
      if (!content)
        return "";
      const label = compactText(entry.comment || fullEntry?.comment || entry.id);
      const source = [entry.bookSource, entry.source].filter(Boolean).join(", ");
      return [`- ${label}${source ? ` (${source})` : ""}:`, content].join(`
`);
    }));
    const activeEntries = entries.filter(Boolean);
    if (activeEntries.length === 0)
      return null;
    return ["Active world info:", ...activeEntries].join(`
`);
  } catch (error) {
    spindle.log.warn(`SceneMap could not read active world info context: ${error.message}`);
    return null;
  }
}
function labeledText(label, value) {
  const text = compactText(value);
  return text ? `${label}: ${text}` : "";
}
function compactText(value) {
  return typeof value === "string" ? value.replace(/\r\n/g, `
`).trim() : "";
}
async function resolveDisplayText(text, context) {
  if (!text.includes("{{"))
    return text;
  try {
    const result = await spindle.macros.resolve(text, {
      chatId: context.chatId,
      characterId: context.characterId || undefined,
      userId: context.userId,
      commit: false
    });
    return result.text;
  } catch (error) {
    spindle.log.warn(`SceneMap macro display resolve failed: ${error.message}`);
    return text;
  }
}
async function buildState(userId) {
  const settings = await loadSettings(userId);
  const { chat, messages } = await getActiveContext(userId);
  const latest = getLatestTrackerEntry(messages);
  const activeMessage = findTargetMessage(messages);
  if (latest && chat) {
    latest.displayData = await resolveTrackerDisplayData(latest.data, {
      chatId: chat.id,
      characterId: chat.character_id,
      userId
    });
  }
  return {
    settings,
    chatId: chat?.id ?? null,
    latest,
    messagesBehind: latest ? countAssistantMessagesAfter(messages, latest.messageId) : 0,
    activeMessageId: activeMessage?.id ?? null,
    activeSwipeId: activeMessage ? getActiveSwipeId(activeMessage) : null,
    generatingMessageId: [...activeGenerations.keys()][0] ?? null,
    connections: await listConnections(userId)
  };
}
async function pushState(userId) {
  const state = await buildState(userId);
  spindle.sendToFrontend({ type: "state", state }, userId);
  spindle.updateMacroValue("scenemap", trackerToText(state.latest?.displayData ?? state.latest?.data ?? null));
}
async function refreshMacroValue() {
  spindle.updateMacroValue("scenemap", "");
}
async function updateChatPreset(chatId, presetKey, userId) {
  const chat = await spindle.chats.get(chatId, userId);
  if (!chat)
    throw new Error("Active chat not found.");
  await spindle.chats.update(chatId, {
    metadata: {
      ...chat.metadata ?? {},
      [CHAT_METADATA_KEY]: {
        ...chat.metadata?.[CHAT_METADATA_KEY] ?? {},
        schemaPreset: presetKey
      }
    }
  }, userId);
}
function getChatPresetKey(chat, settings) {
  const meta = chat?.metadata?.[CHAT_METADATA_KEY];
  const key = meta && typeof meta === "object" ? meta.schemaPreset : null;
  return typeof key === "string" && settings.schemaPresets[key] ? key : settings.schemaPreset;
}
async function generateTracker(messageId, userId) {
  if (!userId)
    throw new Error("SceneMap needs a user context before generating a tracker.");
  const { chat, messages } = await getActiveContext(userId);
  if (!chat)
    throw new Error("Open a chat before generating a SceneMap tracker.");
  const target = findTargetMessage(messages, messageId);
  if (!target)
    throw new Error("No assistant message found for SceneMap.");
  if (target.role !== "assistant")
    throw new Error("SceneMap can only track assistant messages.");
  if (activeGenerations.has(target.id)) {
    activeGenerations.get(target.id)?.abort();
    activeGenerations.delete(target.id);
    if (userId)
      await pushState(userId);
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
    example_response: JSON.stringify(schemaToExample(preset.value), null, 2)
  });
  const context = { chatId: chat.id, characterId: chat.character_id, userId };
  const promptMessages = await resolvePromptMessages(trimMessagesForPrompt(messages, target.id, settings.includeLastXMessages), context);
  const referenceMessage = await buildReferencePromptMessage(chat, userId);
  if (referenceMessage)
    promptMessages.unshift(referenceMessage);
  promptMessages.push({ role: "user", content: finalPrompt });
  const controller = new AbortController;
  activeGenerations.set(target.id, controller);
  if (userId)
    await pushState(userId);
  try {
    const result = await spindle.generate.quiet({
      messages: promptMessages,
      connection_id: settings.connectionId || undefined,
      userId,
      parameters: {
        max_tokens: Math.max(1, Math.floor(settings.maxResponseTokens || 16000))
      },
      signal: controller.signal
    });
    const parsed = parseModelJson(result.content);
    await spindle.chat.updateMessage(chat.id, target.id, {
      metadata: withTrackerMetadata(target, parsed)
    });
    spindle.toast.success("Tracker updated.", { title: "SceneMap", userId });
  } catch (error) {
    if (error.name !== "AbortError") {
      spindle.toast.error(error.message, { title: "SceneMap generation failed", duration: 1e4, userId });
      throw error;
    }
  } finally {
    activeGenerations.delete(target.id);
    if (userId)
      await pushState(userId);
    else
      await refreshMacroValue();
  }
}
async function editTracker(messageId, data, userId) {
  if (!userId)
    throw new Error("SceneMap needs a user context before editing a tracker.");
  const { chat, messages } = await getActiveContext(userId);
  if (!chat)
    throw new Error("Open a chat before editing a tracker.");
  const message = messages.find((item) => item.id === messageId);
  if (!message)
    throw new Error("Message not found.");
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("Tracker data must be a JSON object.");
  await spindle.chat.updateMessage(chat.id, messageId, {
    metadata: withTrackerMetadata(message, data)
  });
  spindle.toast.success("Tracker saved.", { title: "SceneMap", userId });
  if (userId)
    await pushState(userId);
  else
    await refreshMacroValue();
}
async function deleteTracker(messageId, userId) {
  if (!userId)
    throw new Error("SceneMap needs a user context before deleting a tracker.");
  const { chat, messages } = await getActiveContext(userId);
  if (!chat)
    throw new Error("Open a chat before deleting a tracker.");
  const message = messages.find((item) => item.id === messageId);
  if (!message)
    throw new Error("Message not found.");
  const { confirmed } = await spindle.modal.confirm({
    title: "Delete Tracker",
    message: "This will permanently remove SceneMap data from this message.",
    variant: "danger",
    confirmLabel: "Delete",
    userId
  });
  if (!confirmed)
    return;
  await spindle.chat.updateMessage(chat.id, messageId, {
    metadata: withoutTrackerMetadata(message)
  });
  spindle.toast.success("Tracker deleted.", { title: "SceneMap", userId });
  if (userId)
    await pushState(userId);
  else
    await refreshMacroValue();
}
spindle.registerMacro({
  name: "scenemap",
  category: "extension:scenemap",
  description: "Latest SceneMap state formatted as plain text for prompts.",
  returnType: "string",
  handler: ""
});
spindle.onFrontendMessage(async (payload, userId) => {
  try {
    if (!userId)
      throw new Error("SceneMap did not receive a user context from Lumiverse.");
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
        if (!chat)
          throw new Error("Open a chat before setting a chat preset.");
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
    spindle.sendToFrontend({ type: "error", message: error.message }, userId);
    spindle.toast.error(error.message, { title: "SceneMap", duration: 9000, userId });
  }
});
spindle.on("CHAT_SWITCHED", () => {});
spindle.on("MESSAGE_EDITED", () => {});
spindle.on("MESSAGE_DELETED", () => {});
spindle.on("MESSAGE_SWIPED", () => {});
spindle.on("GENERATION_ENDED", (payload) => {
  if (payload?.error || !payload?.messageId)
    return;
  spindle.log.warn("SceneMap auto-generation skipped: generation event does not include a frontend user context.");
});
refreshMacroValue();
spindle.log.info("SceneMap loaded.");
