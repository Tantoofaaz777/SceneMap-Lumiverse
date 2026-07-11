// src/shared.ts
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

{{example_section}}`;
var defaultSettings = {
  version: "1.0.1",
  formatVersion: "F_1.0",
  connectionId: "",
  maxResponseTokens: 16000,
  autoGenerateAiTrackers: false,
  autoGenerateInterval: 1,
  showInputBarButton: true,
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
  const currentValue = { ...value };
  delete currentValue.showMessageButtons;
  const schemaPresets = {
    ...base.schemaPresets,
    ...currentValue.schemaPresets ?? {}
  };
  return {
    ...base,
    ...currentValue,
    schemaPresets,
    displayLayout: currentValue.displayLayout?.sections?.length ? currentValue.displayLayout : base.displayLayout
  };
}
function getPresetPrompt(settings, presetKey = settings.schemaPreset) {
  const preset = settings.schemaPresets[presetKey] ?? settings.schemaPresets[settings.schemaPreset] ?? settings.schemaPresets.default;
  return typeof preset?.promptJson === "string" ? preset.promptJson : settings.promptJson;
}
function getPresetLayout(settings, presetKey = settings.schemaPreset) {
  const preset = settings.schemaPresets[presetKey] ?? settings.schemaPresets[settings.schemaPreset] ?? settings.schemaPresets.default;
  return preset?.displayLayout?.sections?.length ? preset.displayLayout : settings.displayLayout;
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

// src/settings-draft.ts
class SettingsDraftTracker {
  revision = 0;
  savedRevision = 0;
  pendingSave = null;
  get dirty() {
    return this.revision !== this.savedRevision;
  }
  get saving() {
    return this.pendingSave !== null;
  }
  markChanged() {
    this.revision += 1;
  }
  beginSave(requestId) {
    if (this.pendingSave)
      return false;
    this.pendingSave = { requestId, revision: this.revision };
    return true;
  }
  acknowledge(requestId) {
    if (this.pendingSave?.requestId !== requestId)
      return false;
    this.savedRevision = this.pendingSave.revision;
    this.pendingSave = null;
    return true;
  }
  fail(requestId) {
    if (this.pendingSave?.requestId !== requestId)
      return false;
    this.pendingSave = null;
    return true;
  }
  reset() {
    this.revision = 0;
    this.savedRevision = 0;
    this.pendingSave = null;
  }
}

// src/frontend.ts
var state = {
  settings: defaultSettings,
  chatId: null,
  effectivePresetKey: defaultSettings.schemaPreset,
  latest: null,
  messagesBehind: 0,
  autoGenerateMessagesRemaining: null,
  activeMessageId: null,
  activeSwipeId: null,
  generatingMessageId: null,
  connections: []
};
var ctxRef = null;
var rootRef = null;
var settingsRootRef = null;
var toolbarRootRef = null;
var tabHandle = null;
var isRefreshingState = false;
var isGenerationRequestPending = false;
var editorRequestSeq = 0;
var settingsSaveRequestSeq = 0;
var pendingTextEditors = new Map;
var settingsDraft = new SettingsDraftTracker;
var iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z"/><path d="M9 3v15"/><path d="M15 6v15"/></svg>`;
function setup(ctx) {
  settingsDraft.reset();
  ctxRef = ctx;
  const removeStyle = ctx.dom.addStyle(styles);
  const tab = ctx.ui.registerDrawerTab({
    id: "scenemap",
    title: "SceneMap",
    shortName: "Map",
    headerTitle: "SceneMap",
    description: "Track the current scene as structured JSON",
    keywords: ["tracker", "scene", "map", "json"],
    iconSvg
  });
  tabHandle = tab;
  rootRef = tab.root;
  rootRef.classList.add("scenemap-lv");
  const settingsRoot = ctx.ui.mount("settings_extensions");
  settingsRootRef = settingsRoot;
  settingsRoot.classList.add("scenemap-settings-root");
  const toolbarRoot = ctx.ui.mount("chat_toolbar");
  toolbarRootRef = toolbarRoot;
  toolbarRoot.classList.add("scenemap-chat-toolbar-root");
  render();
  const offBackend = ctx.onBackendMessage((payload) => {
    if (payload?.type === "state") {
      isRefreshingState = false;
      isGenerationRequestPending = false;
      const incomingState = payload.state;
      if (typeof payload.settingsSaveRequestId === "string") {
        settingsDraft.acknowledge(payload.settingsSaveRequestId);
      }
      state = settingsDraft.dirty ? { ...incomingState, settings: state.settings } : incomingState;
      render();
      return;
    }
    if (payload?.type === "error") {
      isRefreshingState = false;
      isGenerationRequestPending = false;
      const saveFailed = typeof payload.requestId === "string" && settingsDraft.fail(payload.requestId);
      renderDrawer();
      renderChatToolbar();
      if (saveFailed)
        renderSettings();
      showInlineError(payload.message);
    }
    if (payload?.type === "text_editor_result") {
      handleTextEditorResult(payload);
    }
  });
  const offEvents = [
    ctx.events.on("CHAT_SWITCHED", () => requestState()),
    ctx.events.on("MESSAGE_EDITED", () => requestState()),
    ctx.events.on("MESSAGE_DELETED", () => requestState()),
    ctx.events.on("MESSAGE_SWIPED", () => requestState()),
    ctx.events.on("SWIPE_EDITED", () => requestState()),
    ctx.events.on("GENERATION_ENDED", (payload) => {
      if (state.settings.autoGenerateAiTrackers && payload?.messageId && !payload?.error) {
        send({ type: "maybe_auto_generate", messageId: payload.messageId });
        return;
      }
      requestState();
    })
  ];
  rootRef.addEventListener("click", handleClick);
  rootRef.addEventListener("change", handleChange);
  rootRef.addEventListener("input", handleInput);
  settingsRoot.addEventListener("click", handleClick);
  settingsRoot.addEventListener("change", handleChange);
  settingsRoot.addEventListener("input", handleInput);
  toolbarRoot.addEventListener("click", handleClick);
  requestState();
  return () => {
    rootRef?.removeEventListener("click", handleClick);
    rootRef?.removeEventListener("change", handleChange);
    rootRef?.removeEventListener("input", handleInput);
    settingsRoot.removeEventListener("click", handleClick);
    settingsRoot.removeEventListener("change", handleChange);
    settingsRoot.removeEventListener("input", handleInput);
    toolbarRoot.removeEventListener("click", handleClick);
    offBackend();
    for (const off of offEvents)
      off();
    tab.destroy();
    removeStyle();
    ctx.dom.cleanup();
    ctxRef = null;
    rootRef = null;
    settingsRootRef = null;
    toolbarRootRef = null;
    tabHandle = null;
    isGenerationRequestPending = false;
    settingsDraft.reset();
  };
}
function send(payload) {
  ctxRef?.sendToBackend(payload);
}
function requestState(showRefresh = false) {
  if (showRefresh) {
    isRefreshingState = true;
    renderDrawer();
  }
  send({ type: "get_state" });
}
function render() {
  renderDrawer();
  renderSettings();
  renderChatToolbar();
  tabHandle?.setBadge(state.messagesBehind > 0 ? String(state.messagesBehind) : null);
}
function renderChatToolbar() {
  if (!toolbarRootRef)
    return;
  if (!state.settings.showInputBarButton) {
    toolbarRootRef.innerHTML = "";
    return;
  }
  const isGenerating = Boolean(state.generatingMessageId || isGenerationRequestPending);
  const label = isGenerating ? "Cancel SceneMap generation" : state.latest ? "Regenerate SceneMap" : "Generate SceneMap";
  const isBehind = !state.latest || state.messagesBehind > 0;
  toolbarRootRef.innerHTML = `
    <button
      type="button"
      class="scenemap-chat-toolbar-btn ${isBehind ? "is-attention" : ""} ${isGenerating ? "is-generating" : ""}"
      data-action="generate"
      title="${escapeAttr(label)}"
      aria-label="${escapeAttr(label)}"
      ${state.activeMessageId && !isGenerationRequestPending ? "" : "disabled"}
    >
      ${isGenerating ? refreshSvg() : iconSvg}
    </button>
  `;
}
function renderDrawer() {
  if (!rootRef)
    return;
  const settings = mergeSettings(state.settings);
  const layout = getPresetLayout(settings, state.effectivePresetKey);
  const latest = state.latest;
  rootRef.innerHTML = `
    <div class="scenemap-shell">
      <header class="scenemap-header">
        <button class="scenemap-pill-action scenemap-primary" data-action="generate" ${state.activeMessageId && !isGenerationRequestPending ? "" : "disabled"}>
          ${state.generatingMessageId || isGenerationRequestPending ? "Cancel" : latest ? "Regenerate" : "Generate"}
        </button>
        <button class="scenemap-pill-action" data-action="edit" ${latest ? "" : "disabled"}>Edit</button>
        <button class="scenemap-pill-action scenemap-danger" data-action="delete" ${latest ? "" : "disabled"}>Delete</button>
        <button class="scenemap-pill-action scenemap-pill-icon ${isRefreshingState ? "is-refreshing" : ""}" data-action="refresh" title="Refresh">${refreshSvg()}</button>
      </header>

      <p class="scenemap-status ${state.generatingMessageId ? "is-generating" : ""}">${statusMarkup()}</p>

      <section class="scenemap-card scenemap-board">
        ${latest ? renderTracker(latest.displayData ?? latest.data, layout) : `<div class="scenemap-empty">Generate a SceneMap for this swipe</div>`}
      </section>
    </div>
  `;
}
function renderSettings() {
  if (!settingsRootRef)
    return;
  const settings = mergeSettings(state.settings);
  const presetKeys = Object.keys(settings.schemaPresets);
  const canDeletePreset = settings.schemaPreset !== "default" && presetKeys.length > 1;
  settingsRootRef.innerHTML = `
    <section class="scenemap-card scenemap-settings">
      <div class="scenemap-settings-heading">
        <h3>SceneMap</h3>
      </div>
      <label>
        <span>Connection</span>
        <select data-setting="connectionId">
          <option value="">Default active connection</option>
          ${state.connections.map((conn) => `<option value="${escapeAttr(conn.id)}" ${settings.connectionId === conn.id ? "selected" : ""}>${escapeHtml(conn.name)} (${escapeHtml(conn.model || conn.provider)})${conn.is_default ? " - default" : ""}</option>`).join("")}
        </select>
      </label>
      <div class="scenemap-auto-row">
        <label class="scenemap-switch-row">
          <span>Auto-generate after assistant replies</span>
          <input type="checkbox" data-setting="autoGenerateAiTrackers" ${settings.autoGenerateAiTrackers ? "checked" : ""}>
          <span class="scenemap-switch" aria-hidden="true"></span>
        </label>
        <label class="scenemap-interval-field">
          <span>Interval</span>
          <input type="number" min="1" step="1" data-setting="autoGenerateInterval" value="${settings.autoGenerateInterval > 1 ? settings.autoGenerateInterval : ""}" placeholder="Empty = 1 = every assistant message">
        </label>
      </div>
      <label class="scenemap-switch-row">
        <span>Show input bar button</span>
        <input type="checkbox" data-setting="showInputBarButton" ${settings.showInputBarButton ? "checked" : ""}>
        <span class="scenemap-switch" aria-hidden="true"></span>
      </label>
      <label>
        <span>Max response tokens</span>
        <input type="number" min="1" step="1" data-setting="maxResponseTokens" value="${settings.maxResponseTokens}">
      </label>
      <label>
        <span>Include last messages</span>
        <select data-setting="includeLastXMessages">
          <option value="0" ${settings.includeLastXMessages === 0 ? "selected" : ""}>All messages up to target</option>
          ${Array.from({ length: 20 }, (_, i) => i + 1).map((count) => `<option value="${count}" ${settings.includeLastXMessages === count ? "selected" : ""}>Last ${count}</option>`).join("")}
        </select>
      </label>
      <div class="scenemap-settings-preset-row">
        <label>
          <span>Global preset</span>
          <select data-setting="schemaPreset">
            ${Object.entries(settings.schemaPresets).map(([key, preset]) => `<option value="${escapeAttr(key)}" ${settings.schemaPreset === key ? "selected" : ""}>${escapeHtml(preset.name)}</option>`).join("")}
          </select>
        </label>
        <button class="scenemap-pill-action" data-action="create-preset">New</button>
        <button class="scenemap-pill-action" data-action="rename-preset">Rename</button>
        <button class="scenemap-pill-action" data-action="import-preset">Import</button>
        <button class="scenemap-pill-action" data-action="export-preset">Export</button>
        <button class="scenemap-pill-action scenemap-danger" data-action="delete-preset" ${canDeletePreset ? "" : "disabled"}>Delete</button>
      </div>
      <div class="scenemap-settings-actions">
        <div class="scenemap-settings-actions-left">
          <button class="scenemap-pill-action" data-action="edit-schema">Schema</button>
          <button class="scenemap-pill-action" data-action="edit-prompt">Prompt</button>
          <button class="scenemap-pill-action" data-action="edit-layout">Layout</button>
        </div>
        <div class="scenemap-settings-actions-right">
          <button class="scenemap-pill-action scenemap-primary" data-action="save-settings" ${settingsDraft.saving ? "disabled" : ""}>${settingsDraft.saving ? "Saving..." : "Save settings"}</button>
        </div>
      </div>
    </section>
  `;
}
function statusText() {
  if (!state.chatId)
    return "Open a chat to start tracking";
  if (state.generatingMessageId)
    return "Mapping this scene";
  const autoText = autoGenerateStatusText();
  if (autoText)
    return autoText;
  if (!state.latest)
    return "This scene is unmapped";
  if (state.messagesBehind > 0)
    return `SceneMap is ${state.messagesBehind} message${state.messagesBehind === 1 ? "" : "s"} behind`;
  return "SceneMap is updated";
}
function autoGenerateStatusText() {
  if (!state.settings.autoGenerateAiTrackers || state.autoGenerateMessagesRemaining == null)
    return null;
  if (state.autoGenerateMessagesRemaining <= 0)
    return "Auto-generation is due";
  if (state.autoGenerateMessagesRemaining === 1)
    return "Auto-generates on next assistant message";
  return `Auto-generates in ${state.autoGenerateMessagesRemaining} assistant messages`;
}
function statusMarkup() {
  if (!state.generatingMessageId)
    return escapeHtml(statusText());
  return `Mapping this scene<span class="scenemap-loading-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>`;
}
function handleClick(event) {
  const target = event.target;
  const button = target.closest("[data-action]");
  if (!button)
    return;
  const action = button.dataset.action;
  if (action === "refresh")
    requestState(true);
  if (action === "generate") {
    if (isGenerationRequestPending)
      return;
    isGenerationRequestPending = true;
    renderDrawer();
    renderChatToolbar();
    send({ type: "generate_tracker" });
  }
  if (action === "edit" && state.latest && state.chatId) {
    const { messageId, swipeId, data: trackerData } = state.latest;
    const chatId = state.chatId;
    openJsonEditor("Edit Tracker JSON", trackerData, (data) => {
      send({ type: "edit_tracker", chatId, messageId, swipeId, data });
    });
  }
  if (action === "delete" && state.latest)
    send({ type: "delete_tracker", messageId: state.latest.messageId });
  if (action === "create-preset")
    createPreset();
  if (action === "rename-preset")
    renamePreset();
  if (action === "import-preset")
    importPreset();
  if (action === "export-preset")
    exportPreset();
  if (action === "delete-preset")
    deletePreset();
  if (action === "edit-schema")
    editActiveSchema();
  if (action === "edit-prompt")
    editPrompt();
  if (action === "edit-layout")
    editLayout();
  if (action === "save-settings") {
    const requestId = `settings-${Date.now()}-${++settingsSaveRequestSeq}`;
    if (!settingsDraft.beginSave(requestId))
      return;
    renderSettings();
    send({ type: "save_settings", requestId, settings: state.settings });
  }
}
function updateSettingsDraft(settings) {
  settingsDraft.markChanged();
  state = { ...state, settings };
}
function handleChange(event) {
  const target = event.target;
  const key = target.dataset.setting;
  if (!key)
    return;
  updateSettingFromControl(target, key);
}
function handleInput(event) {
  const target = event.target;
  const key = target.dataset.setting;
  if (!key || target.type === "checkbox")
    return;
  updateSettingFromControl(target, key);
}
function updateSettingFromControl(target, key) {
  const settings = mergeSettings(state.settings);
  if (key === "autoGenerateAiTrackers") {
    settings.autoGenerateAiTrackers = target.checked;
  } else if (key === "showInputBarButton") {
    settings.showInputBarButton = target.checked;
  } else if (key === "autoGenerateInterval") {
    settings.autoGenerateInterval = Math.max(1, Math.floor(Number(target.value) || 1));
  } else if (key === "maxResponseTokens" || key === "includeLastXMessages") {
    settings[key] = Math.max(0, Math.floor(Number(target.value) || 0));
  } else {
    settings[key] = target.value;
  }
  updateSettingsDraft(settings);
  if (key === "schemaPreset")
    render();
  if (key === "showInputBarButton")
    render();
}
function createPreset() {
  const settings = mergeSettings(state.settings);
  const activePreset = settings.schemaPresets[settings.schemaPreset] ?? settings.schemaPresets.default;
  openNameEditor("New Preset", "", "Create preset", (name) => {
    const key = uniquePresetKey(slugifyPresetName(name), settings.schemaPresets);
    settings.schemaPresets[key] = {
      name,
      value: JSON.parse(JSON.stringify(activePreset.value)),
      promptJson: getPresetPrompt(settings),
      displayLayout: cloneLayout(getPresetLayout(settings))
    };
    updateSettingsDraft({ ...settings, schemaPreset: key });
    render();
  });
}
function renamePreset() {
  const settings = mergeSettings(state.settings);
  const key = settings.schemaPreset;
  const preset = settings.schemaPresets[key] ?? settings.schemaPresets.default;
  openNameEditor("Rename Preset", preset.name, "Save", (name) => {
    settings.schemaPresets[key] = { ...preset, name };
    updateSettingsDraft(settings);
    render();
  });
}
async function deletePreset() {
  const settings = mergeSettings(state.settings);
  const key = settings.schemaPreset;
  if (key === "default")
    return;
  const preset = settings.schemaPresets[key];
  if (!preset || Object.keys(settings.schemaPresets).length <= 1)
    return;
  const result = await ctxRef?.ui.showConfirm({
    title: "Delete Preset",
    message: `Delete "${preset.name}"?`,
    variant: "danger",
    confirmLabel: "Delete"
  });
  if (!result?.confirmed)
    return;
  delete settings.schemaPresets[key];
  const fallbackKey = settings.schemaPresets.default ? "default" : Object.keys(settings.schemaPresets)[0];
  updateSettingsDraft({ ...settings, schemaPreset: fallbackKey });
  render();
}
function exportPreset() {
  const settings = mergeSettings(state.settings);
  const preset = settings.schemaPresets[settings.schemaPreset] ?? settings.schemaPresets.default;
  const data = {
    type: "scenemap-preset",
    version: 1,
    name: preset.name,
    schema: preset.value,
    prompt: getPresetPrompt(settings),
    layout: getPresetLayout(settings)
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slugifyPresetName(preset.name)}.scenemap-preset.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
async function importPreset() {
  const ctx = ctxRef;
  if (!ctx?.uploads?.pickFile) {
    showSettingsError("File import is not available in this Lumiverse build.");
    return;
  }
  try {
    const files = await ctx.uploads.pickFile({
      accept: [".json", "application/json"],
      multiple: false,
      maxSizeBytes: 512000
    });
    const file = files?.[0];
    if (!file)
      return;
    const text = new TextDecoder().decode(file.bytes);
    const imported = parsePresetImport(JSON.parse(text), file.name);
    openNameEditor("Import Preset", imported.name, "Import", (name) => {
      const settings = mergeSettings(state.settings);
      const key = uniquePresetKey(slugifyPresetName(name), settings.schemaPresets);
      settings.schemaPresets[key] = {
        name,
        value: imported.schema,
        promptJson: imported.prompt,
        displayLayout: imported.layout
      };
      settings.schemaPreset = key;
      updateSettingsDraft(settings);
      render();
    });
  } catch (err) {
    showSettingsError(err.message || "Could not import preset.");
  }
}
function parsePresetImport(value, filename) {
  const record = getRecord(value);
  if (record.type !== "scenemap-preset")
    throw new Error("This is not a SceneMap preset file.");
  const schema = getRecord(record.schema);
  if (Object.keys(schema).length === 0)
    throw new Error("Preset file is missing a schema object.");
  if (typeof record.prompt !== "string")
    throw new Error("Preset file is missing a prompt string.");
  const layout = normalizeImportedLayout(record.layout);
  validateLayout(layout);
  return {
    name: typeof record.name === "string" && record.name.trim() ? record.name.trim() : filename.replace(/\.json$/i, "").replace(/\.scenemap-preset$/i, ""),
    schema,
    prompt: record.prompt,
    layout
  };
}
function normalizeImportedLayout(value) {
  const record = getRecord(value);
  if (!Array.isArray(record.sections))
    throw new Error("Preset file is missing a layout sections array.");
  return {
    sections: record.sections.map((section) => {
      const sectionRecord = getRecord(section);
      if (!Array.isArray(sectionRecord.fields))
        throw new Error("Every layout section must include a fields array.");
      return {
        title: typeof sectionRecord.title === "string" ? sectionRecord.title : "",
        fields: sectionRecord.fields.map(normalizeImportedField)
      };
    })
  };
}
function normalizeImportedField(value) {
  const record = getRecord(value);
  const display = typeof record.display === "string" && isTrackerFieldDisplay(record.display) ? record.display : "text";
  return {
    path: typeof record.path === "string" ? record.path : "",
    label: typeof record.label === "string" ? record.label : undefined,
    display,
    center: record.center === true,
    fields: Array.isArray(record.fields) ? record.fields.map(normalizeImportedField) : undefined
  };
}
function isTrackerFieldDisplay(value) {
  return ["text", "subtle", "mono", "chips", "progress", "character_cards"].includes(value);
}
function openNameEditor(title, initialValue, submitLabel, onSave) {
  const ctx = ctxRef;
  if (!ctx)
    return;
  const modal = ctx.ui.showModal({ title, width: 420, maxHeight: 260 });
  modal.root.innerHTML = `
    <div class="scenemap-name-editor">
      <label>
        <span>Name</span>
        <input data-name-input value="${escapeAttr(initialValue)}" placeholder="Preset name">
      </label>
      <div class="scenemap-modal-actions">
        <button class="scenemap-pill-action" data-modal-action="cancel">Cancel</button>
        <button class="scenemap-pill-action scenemap-primary" data-modal-action="save">${escapeHtml(submitLabel)}</button>
      </div>
      <div class="scenemap-inline-error" hidden></div>
    </div>
  `;
  const input = modal.root.querySelector("[data-name-input]");
  const error = modal.root.querySelector(".scenemap-inline-error");
  input.focus();
  input.select();
  const save = () => {
    const name = input.value.trim();
    if (!name)
      throw new Error("Preset name is required.");
    onSave(name);
    modal.dismiss();
  };
  modal.root.addEventListener("keydown", (event) => {
    if (event.key !== "Enter")
      return;
    try {
      save();
    } catch (err) {
      error.hidden = false;
      error.textContent = err.message;
    }
  });
  modal.root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-modal-action]");
    if (!button)
      return;
    if (button.dataset.modalAction === "cancel") {
      modal.dismiss();
      return;
    }
    try {
      save();
    } catch (err) {
      error.hidden = false;
      error.textContent = err.message;
    }
  });
}
function slugifyPresetName(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return slug || "preset";
}
function uniquePresetKey(base, presets) {
  let key = base;
  let index = 2;
  while (Object.prototype.hasOwnProperty.call(presets, key)) {
    key = `${base}_${index}`;
    index += 1;
  }
  return key;
}
function editActiveSchema() {
  const settings = mergeSettings(state.settings);
  const preset = settings.schemaPresets[settings.schemaPreset] ?? settings.schemaPresets.default;
  openJsonEditor("SceneMap Schema", preset.value, (data) => {
    settings.schemaPresets[settings.schemaPreset] = { ...preset, value: data };
    updateSettingsDraft(settings);
    render();
  });
}
function editPrompt() {
  const settings = mergeSettings(state.settings);
  const key = settings.schemaPreset;
  const preset = settings.schemaPresets[key] ?? settings.schemaPresets.default;
  openTextEditor("SceneMap Prompt", getPresetPrompt(settings, key), (text) => {
    settings.schemaPresets[key] = { ...preset, promptJson: text || DEFAULT_PROMPT_JSON };
    updateSettingsDraft(settings);
    render();
  });
}
function editLayout() {
  const settings = mergeSettings(state.settings);
  const key = settings.schemaPreset;
  const preset = settings.schemaPresets[key] ?? settings.schemaPresets.default;
  const fieldOptions = extractSchemaFieldOptions(preset.value);
  const workingLayout = cloneLayout(getPresetLayout(settings, key));
  const ctx = ctxRef;
  if (!ctx)
    return;
  const modal = ctx.ui.showModal({ title: "SceneMap Layout", width: 860, maxHeight: 760 });
  const draw = (preserveScroll = true) => {
    const scroller = modal.root.querySelector(".scenemap-layout-sections");
    const scrollTop = preserveScroll ? scroller?.scrollTop ?? 0 : 0;
    modal.root.innerHTML = renderLayoutEditor(workingLayout, fieldOptions);
    const nextScroller = modal.root.querySelector(".scenemap-layout-sections");
    if (nextScroller)
      nextScroller.scrollTop = scrollTop;
  };
  draw(false);
  modal.root.addEventListener("input", (event) => {
    const target = event.target;
    const sectionIndex = readIndex(target.dataset.section);
    const fieldIndex = readIndex(target.dataset.field);
    const childIndex = readIndex(target.dataset.child);
    if (target.dataset.layoutInput === "section-title" && sectionIndex !== null) {
      workingLayout.sections[sectionIndex].title = target.value;
    }
    if (target.dataset.layoutInput === "field-label" && sectionIndex !== null && fieldIndex !== null) {
      workingLayout.sections[sectionIndex].fields[fieldIndex].label = target.value;
    }
    if (target.dataset.layoutInput === "child-label" && sectionIndex !== null && fieldIndex !== null && childIndex !== null) {
      const field = workingLayout.sections[sectionIndex].fields[fieldIndex];
      if (field.fields?.[childIndex])
        field.fields[childIndex].label = target.value;
    }
  });
  modal.root.addEventListener("change", (event) => {
    const target = event.target;
    const sectionIndex = readIndex(target.dataset.section);
    const fieldIndex = readIndex(target.dataset.field);
    const childIndex = readIndex(target.dataset.child);
    if (sectionIndex === null || fieldIndex === null)
      return;
    const field = workingLayout.sections[sectionIndex].fields[fieldIndex];
    if (target.dataset.layoutInput === "field-path") {
      const option = findFieldOption(fieldOptions, target.value);
      field.path = target.value;
      field.label = option?.label ?? humanizeTrackerKey(target.value.split(".").pop() || target.value);
      field.display = option?.display ?? "text";
      field.fields = option?.children?.slice(0, 4).map((child) => ({
        path: child.path,
        label: child.label,
        display: child.display === "character_cards" ? "text" : child.display
      }));
      draw();
    }
    if (target.dataset.layoutInput === "field-display") {
      field.display = target.value;
      draw();
    }
    if (target.dataset.layoutInput === "field-center") {
      field.center = target.checked;
    }
    if (target.dataset.layoutInput === "child-path" && childIndex !== null) {
      const parentOption = findFieldOption(fieldOptions, field.path);
      const option = parentOption?.children?.find((child) => child.path === target.value);
      if (field.fields?.[childIndex]) {
        field.fields[childIndex].path = target.value;
        field.fields[childIndex].label = option?.label ?? humanizeTrackerKey(target.value.split(".").pop() || target.value);
        field.fields[childIndex].display = option?.display === "character_cards" ? "text" : option?.display ?? "text";
      }
      draw();
    }
    if (target.dataset.layoutInput === "child-display" && childIndex !== null && field.fields?.[childIndex]) {
      field.fields[childIndex].display = target.value;
      draw();
    }
    if (target.dataset.layoutInput === "child-center" && childIndex !== null && field.fields?.[childIndex]) {
      field.fields[childIndex].center = target.checked;
    }
  });
  modal.root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-layout-action]");
    if (!button)
      return;
    const sectionIndex = readIndex(button.dataset.section);
    const fieldIndex = readIndex(button.dataset.field);
    const childIndex = readIndex(button.dataset.child);
    const action = button.dataset.layoutAction;
    try {
      if (action === "add-section")
        workingLayout.sections.push({ title: "New Section", fields: [] });
      if (action === "remove-section" && sectionIndex !== null)
        workingLayout.sections.splice(sectionIndex, 1);
      if (action === "move-section-up" && sectionIndex !== null)
        moveItem(workingLayout.sections, sectionIndex, sectionIndex - 1);
      if (action === "move-section-down" && sectionIndex !== null)
        moveItem(workingLayout.sections, sectionIndex, sectionIndex + 1);
      if (action === "add-field" && sectionIndex !== null) {
        workingLayout.sections[sectionIndex].fields.push(createFieldFromOption(getAvailableFieldOptions(workingLayout, fieldOptions)[0]));
      }
      if (action === "remove-field" && sectionIndex !== null && fieldIndex !== null) {
        workingLayout.sections[sectionIndex].fields.splice(fieldIndex, 1);
      }
      if (action === "move-field-up" && sectionIndex !== null && fieldIndex !== null) {
        moveItem(workingLayout.sections[sectionIndex].fields, fieldIndex, fieldIndex - 1);
      }
      if (action === "move-field-down" && sectionIndex !== null && fieldIndex !== null) {
        moveItem(workingLayout.sections[sectionIndex].fields, fieldIndex, fieldIndex + 1);
      }
      if (action === "add-child" && sectionIndex !== null && fieldIndex !== null) {
        const field = workingLayout.sections[sectionIndex].fields[fieldIndex];
        const parentOption = findFieldOption(fieldOptions, field.path);
        field.fields = field.fields ?? [];
        field.fields.push(createFieldFromOption(getAvailableChildOptions(field, parentOption?.children ?? [])[0]));
      }
      if (action === "remove-child" && sectionIndex !== null && fieldIndex !== null && childIndex !== null) {
        workingLayout.sections[sectionIndex].fields[fieldIndex].fields?.splice(childIndex, 1);
      }
      if (action === "move-child-up" && sectionIndex !== null && fieldIndex !== null && childIndex !== null) {
        moveItem(workingLayout.sections[sectionIndex].fields[fieldIndex].fields ?? [], childIndex, childIndex - 1);
      }
      if (action === "move-child-down" && sectionIndex !== null && fieldIndex !== null && childIndex !== null) {
        moveItem(workingLayout.sections[sectionIndex].fields[fieldIndex].fields ?? [], childIndex, childIndex + 1);
      }
      if (action === "reset-layout") {
        workingLayout.sections = createSchemaDefaultLayout(preset.value).sections;
      }
      if (action === "cancel") {
        modal.dismiss();
        return;
      }
      if (action === "save-layout") {
        validateLayout(workingLayout);
        settings.schemaPresets[key] = { ...preset, displayLayout: cloneLayout(workingLayout) };
        updateSettingsDraft(settings);
        render();
        modal.dismiss();
        return;
      }
      draw();
    } catch (err) {
      const error = modal.root.querySelector(".scenemap-inline-error");
      if (error) {
        error.hidden = false;
        error.textContent = err.message;
      }
    }
  });
}
function renderLayoutEditor(layout, options) {
  const hasAvailableFields = getAvailableFieldOptions(layout, options).length > 0;
  return `
    <div class="scenemap-layout-editor">
      <div class="scenemap-layout-intro">
        <button type="button" class="scenemap-layout-add-btn" data-layout-action="add-section" ${hasAvailableFields ? "" : "disabled"}>${layoutIcon("plus")}<span>Add section</span></button>
      </div>
      <div class="scenemap-layout-sections">
        ${layout.sections.map((section, sectionIndex) => renderLayoutSection(section, sectionIndex, layout, options)).join("")}
      </div>
      <div class="scenemap-modal-actions">
        <button type="button" class="scenemap-pill-action scenemap-danger" data-layout-action="reset-layout">Reset default</button>
        <span class="scenemap-modal-spacer"></span>
        <button type="button" class="scenemap-pill-action" data-layout-action="cancel">Cancel</button>
        <button type="button" class="scenemap-pill-action scenemap-primary" data-layout-action="save-layout">Save</button>
      </div>
      <div class="scenemap-inline-error" hidden></div>
    </div>
  `;
}
function renderLayoutSection(section, sectionIndex, layout, options) {
  const hasAvailableFields = getAvailableFieldOptions(layout, options).length > 0;
  return `
    <section class="scenemap-layout-section">
      <header class="scenemap-layout-section-header">
        <label>
          <span>Section name</span>
          <input data-layout-input="section-title" data-section="${sectionIndex}" value="${escapeAttr(section.title)}">
        </label>
        <div class="scenemap-layout-actions">
          ${iconButton("move-section-up", "Move up", "up", { section: sectionIndex, disabled: sectionIndex === 0 })}
          ${iconButton("move-section-down", "Move down", "down", { section: sectionIndex, disabled: sectionIndex >= layout.sections.length - 1 })}
          ${iconButton("remove-section", "Remove section", "trash", { section: sectionIndex })}
        </div>
      </header>
      <div class="scenemap-layout-fields">
        ${section.fields.map((field, fieldIndex) => renderLayoutField(field, sectionIndex, fieldIndex, layout, options)).join("")}
      </div>
      <button type="button" class="scenemap-layout-add-btn" data-layout-action="add-field" data-section="${sectionIndex}" ${hasAvailableFields ? "" : "disabled"}>${layoutIcon("plus")}<span>Add field</span></button>
    </section>
  `;
}
function renderLayoutField(field, sectionIndex, fieldIndex, layout, options) {
  const option = findFieldOption(options, field.path);
  const selectOptions = getAvailableFieldOptions(layout, options, field.path).map((item) => `<option value="${escapeAttr(item.path)}" ${item.path === field.path ? "selected" : ""}>${escapeHtml(item.label)} (${escapeHtml(item.path)})</option>`).join("");
  const childEditor = field.display === "character_cards" ? renderChildFieldEditor(field, option?.children ?? [], sectionIndex, fieldIndex) : "";
  return `
    <article class="scenemap-layout-field">
      <div class="scenemap-layout-field-row">
        <select aria-label="Field" data-layout-input="field-path" data-section="${sectionIndex}" data-field="${fieldIndex}">
          ${selectOptions}
        </select>
        <input aria-label="Label" data-layout-input="field-label" data-section="${sectionIndex}" data-field="${fieldIndex}" value="${escapeAttr(field.label ?? option?.label ?? "")}" placeholder="Label">
        <select aria-label="Display" data-layout-input="field-display" data-section="${sectionIndex}" data-field="${fieldIndex}">
          ${renderDisplayOptions(field.display ?? option?.display ?? "text", !!option?.children?.length)}
        </select>
        ${iconButton("move-field-up", "Move up", "up", { section: sectionIndex, field: fieldIndex, disabled: fieldIndex === 0 })}
        ${iconButton("move-field-down", "Move down", "down", { section: sectionIndex, field: fieldIndex, disabled: fieldIndex >= layout.sections[sectionIndex].fields.length - 1 })}
        ${iconButton("remove-field", "Remove field", "trash", { section: sectionIndex, field: fieldIndex })}
      </div>
      ${renderChipCenterToggle("field-center", field.center === true, { section: sectionIndex, field: fieldIndex }, field.display === "chips")}
      ${childEditor}
    </article>
  `;
}
function renderChildFieldEditor(field, options, sectionIndex, fieldIndex) {
  const children = field.fields ?? [];
  const hasAvailableChildren = getAvailableChildOptions(field, options).length > 0;
  return `
    <div class="scenemap-layout-child-box">
      <div class="scenemap-layout-child-header">
        <strong>Card fields</strong>
        <button type="button" class="scenemap-layout-add-btn" data-layout-action="add-child" data-section="${sectionIndex}" data-field="${fieldIndex}" ${hasAvailableChildren ? "" : "disabled"}>${layoutIcon("plus")}<span>Add card field</span></button>
      </div>
      ${children.map((child, childIndex) => renderChildField(field, child, childIndex, children.length, options, sectionIndex, fieldIndex)).join("")}
    </div>
  `;
}
function renderChildField(parent, child, childIndex, childCount, options, sectionIndex, fieldIndex) {
  const selectOptions = getAvailableChildOptions(parent, options, child.path).map((item) => `<option value="${escapeAttr(item.path)}" ${item.path === child.path ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("");
  return `
    <div class="scenemap-layout-child-row">
      <select data-layout-input="child-path" data-section="${sectionIndex}" data-field="${fieldIndex}" data-child="${childIndex}">
        ${selectOptions}
      </select>
      <input data-layout-input="child-label" data-section="${sectionIndex}" data-field="${fieldIndex}" data-child="${childIndex}" value="${escapeAttr(child.label ?? "")}" placeholder="Label">
      <select data-layout-input="child-display" data-section="${sectionIndex}" data-field="${fieldIndex}" data-child="${childIndex}">
        ${renderDisplayOptions(child.display ?? "text", false)}
      </select>
      ${iconButton("move-child-up", "Move up", "up", { section: sectionIndex, field: fieldIndex, child: childIndex, disabled: childIndex === 0 })}
      ${iconButton("move-child-down", "Move down", "down", { section: sectionIndex, field: fieldIndex, child: childIndex, disabled: childIndex >= childCount - 1 })}
      ${iconButton("remove-child", "Remove card field", "trash", { section: sectionIndex, field: fieldIndex, child: childIndex })}
    </div>
    ${renderChipCenterToggle("child-center", child.center === true, { section: sectionIndex, field: fieldIndex, child: childIndex }, child.display === "chips")}
  `;
}
function renderChipCenterToggle(input, checked, indexes, visible) {
  if (!visible)
    return "";
  return `
    <label class="scenemap-layout-check-row">
      <input
        type="checkbox"
        data-layout-input="${input}"
        data-section="${indexes.section}"
        data-field="${indexes.field}"
        ${indexes.child !== undefined ? `data-child="${indexes.child}"` : ""}
        ${checked ? "checked" : ""}
      >
      <span>Center chips</span>
    </label>
  `;
}
function renderDisplayOptions(selected, allowCards) {
  const displays = [
    { value: "text", label: "Text" },
    { value: "subtle", label: "Subtle" },
    { value: "mono", label: "Mono" },
    { value: "chips", label: "Chips" },
    { value: "progress", label: "Progress" }
  ];
  if (allowCards)
    displays.push({ value: "character_cards", label: "Cards" });
  return displays.map((display) => `<option value="${display.value}" ${display.value === selected ? "selected" : ""}>${display.label}</option>`).join("");
}
function extractSchemaFieldOptions(schema) {
  const normalized = normalizeSchemaForLayout(schema, schema);
  const properties = getSchemaProperties(normalized);
  if (!properties)
    return [];
  return Object.entries(properties).flatMap(([key, value]) => schemaToOptions(value, key, key, schema));
}
function schemaToOptions(schema, path, labelSeed, rootSchema) {
  const record = normalizeSchemaForLayout(schema, rootSchema);
  const type = record.type;
  if (type === "array") {
    const items = normalizeSchemaForLayout(record.items, rootSchema);
    const itemProperties = getSchemaProperties(items);
    if (itemProperties) {
      return [{
        path,
        label: schemaLabel(record, labelSeed),
        display: "character_cards",
        children: Object.entries(itemProperties).flatMap(([key, value]) => schemaToOptions(value, key, key, rootSchema))
      }];
    }
    return [{ path, label: schemaLabel(record, labelSeed), display: "chips" }];
  }
  const properties = getSchemaProperties(record);
  if (properties) {
    return Object.entries(properties).flatMap(([key, value]) => schemaToOptions(value, `${path}.${key}`, key, rootSchema));
  }
  return [{ path, label: schemaLabel(record, labelSeed), display: defaultDisplayForSchema(record, path) }];
}
function normalizeSchemaForLayout(schema, rootSchema, seenRefs = new Set) {
  const source = getRecord(schema);
  let normalized = { ...source };
  const ref = typeof source.$ref === "string" ? source.$ref : null;
  if (ref?.startsWith("#/") && !seenRefs.has(ref)) {
    const resolved = resolveLocalLayoutRef(rootSchema, ref);
    if (resolved) {
      const nextSeen = new Set(seenRefs).add(ref);
      normalized = mergeLayoutSchemas(normalizeSchemaForLayout(resolved, rootSchema, nextSeen), normalized);
    }
  }
  for (const keyword of ["allOf", "oneOf", "anyOf"]) {
    const variants = source[keyword];
    if (!Array.isArray(variants))
      continue;
    for (const variant of variants) {
      normalized = mergeLayoutSchemas(normalized, normalizeSchemaForLayout(variant, rootSchema, seenRefs));
    }
  }
  return normalized;
}
function mergeLayoutSchemas(left, right) {
  const leftProperties = getSchemaProperties(left);
  const rightProperties = getSchemaProperties(right);
  return {
    ...left,
    ...right,
    ...leftProperties || rightProperties ? { properties: { ...leftProperties ?? {}, ...rightProperties ?? {} } } : {}
  };
}
function resolveLocalLayoutRef(rootSchema, ref) {
  let current = rootSchema;
  for (const token of ref.slice(2).split("/")) {
    if (!current || typeof current !== "object" || Array.isArray(current))
      return null;
    const key = token.replaceAll("~1", "/").replaceAll("~0", "~");
    current = current[key];
  }
  return current;
}
function getSchemaProperties(schema) {
  const record = getRecord(schema);
  return record.properties && typeof record.properties === "object" && !Array.isArray(record.properties) ? record.properties : null;
}
function schemaLabel(schema, fallback) {
  return typeof schema.title === "string" && schema.title.trim() ? schema.title.trim() : humanizeTrackerKey(fallback.split(".").pop() || fallback);
}
function defaultDisplayForSchema(schema, path) {
  if (schema.type === "array")
    return "chips";
  if (/posture|interaction|notes?|description/i.test(path))
    return "mono";
  if (/tone|time|state|hair|makeup/i.test(path))
    return "subtle";
  return "text";
}
function findFieldOption(options, path) {
  return options.find((option) => option.path === path);
}
function getAvailableFieldOptions(layout, options, currentPath) {
  const used = new Set;
  for (const section of layout.sections) {
    for (const field of section.fields) {
      if (field.path && field.path !== currentPath)
        used.add(field.path);
    }
  }
  const available = options.filter((option) => !used.has(option.path));
  if (currentPath && !available.some((option) => option.path === currentPath)) {
    available.unshift({ path: currentPath, label: humanizeTrackerKey(currentPath.split(".").pop() || currentPath), display: "text" });
  }
  return available;
}
function getAvailableChildOptions(parent, options, currentPath) {
  const used = new Set((parent.fields ?? []).map((field) => field.path).filter((path) => path && path !== currentPath));
  const available = options.filter((option) => !used.has(option.path));
  if (currentPath && !available.some((option) => option.path === currentPath)) {
    available.unshift({ path: currentPath, label: humanizeTrackerKey(currentPath.split(".").pop() || currentPath), display: "text" });
  }
  return available;
}
function createFieldFromOption(option, maxChildren = 4) {
  if (!option)
    return { path: "", label: "", display: "text" };
  return {
    path: option.path,
    label: option.label,
    display: option.display,
    fields: option.display === "character_cards" ? option.children?.slice(0, maxChildren).map((child) => ({ path: child.path, label: child.label, display: child.display === "character_cards" ? "text" : child.display })) : undefined
  };
}
function createSchemaDefaultLayout(schema) {
  if (JSON.stringify(schema) === JSON.stringify(DEFAULT_SCHEMA_VALUE))
    return cloneLayout(DEFAULT_DISPLAY_LAYOUT);
  const options = extractSchemaFieldOptions(schema);
  const title = typeof schema.title === "string" && schema.title.trim() ? schema.title.trim() : "Scene";
  return {
    sections: [{
      title,
      fields: options.map((option) => createFieldFromOption(option, Number.POSITIVE_INFINITY))
    }]
  };
}
function cloneLayout(layout) {
  return JSON.parse(JSON.stringify(layout));
}
function moveItem(items, from, to) {
  if (to < 0 || to >= items.length || from === to)
    return;
  const [item] = items.splice(from, 1);
  items.splice(to, 0, item);
}
function readIndex(value) {
  if (value === undefined)
    return null;
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 ? index : null;
}
function validateLayout(layout) {
  if (!layout.sections.length)
    throw new Error("Add at least one section.");
  for (const section of layout.sections) {
    section.title = section.title.trim();
    section.fields = section.fields.filter((field) => field.path.trim());
    for (const field of section.fields) {
      field.path = field.path.trim();
      if (Object.prototype.hasOwnProperty.call(field, "label"))
        field.label = field.label?.trim() ?? "";
      field.fields = field.fields?.filter((child) => child.path.trim()).map((child) => ({
        ...child,
        path: child.path.trim(),
        label: Object.prototype.hasOwnProperty.call(child, "label") ? child.label?.trim() ?? "" : undefined,
        center: child.display === "chips" ? child.center === true : undefined
      }));
      field.center = field.display === "chips" ? field.center === true : undefined;
    }
  }
}
function iconButton(action, label, icon, options) {
  const data = [
    `data-layout-action="${action}"`,
    options.section !== undefined ? `data-section="${options.section}"` : "",
    options.field !== undefined ? `data-field="${options.field}"` : "",
    options.child !== undefined ? `data-child="${options.child}"` : ""
  ].filter(Boolean).join(" ");
  return `<button type="button" class="scenemap-layout-icon-btn" title="${escapeAttr(label)}" aria-label="${escapeAttr(label)}" ${data} ${options.disabled ? "disabled" : ""}>${layoutIcon(icon)}</button>`;
}
function layoutIcon(name) {
  const paths = {
    plus: `<path d="M12 5v14"/><path d="M5 12h14"/>`,
    up: `<path d="m18 15-6-6-6 6"/>`,
    down: `<path d="m6 9 6 6 6-6"/>`,
    trash: `<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/><path d="M10 11v5"/><path d="M14 11v5"/>`
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}
function openJsonEditor(title, value, onSave) {
  openTextEditor(title, JSON.stringify(value, null, 2), (text) => {
    const data = JSON.parse(text);
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error("JSON must be an object.");
    onSave(data);
  });
}
function openTextEditor(title, value, onSave) {
  const requestId = `editor-${Date.now()}-${++editorRequestSeq}`;
  pendingTextEditors.set(requestId, {
    title,
    onSave,
    errorTarget: title.includes("Tracker") ? "drawer" : "settings"
  });
  send({
    type: "open_text_editor",
    requestId,
    title,
    value,
    placeholder: title.includes("Prompt") ? "Write the SceneMap generation prompt. Macros like {{schema}} are supported." : ""
  });
}
function handleTextEditorResult(payload) {
  const requestId = typeof payload.requestId === "string" ? payload.requestId : "";
  const pending = pendingTextEditors.get(requestId);
  if (!pending)
    return;
  pendingTextEditors.delete(requestId);
  if (payload.cancelled)
    return;
  const text = typeof payload.text === "string" ? payload.text : "";
  try {
    pending.onSave(text);
  } catch (err) {
    if (pending.errorTarget === "settings")
      showSettingsError(err.message);
    else
      showInlineError(err.message);
    openTextEditor(pending.title, text, pending.onSave);
  }
}
function showInlineError(message) {
  if (!rootRef)
    return;
  const existing = rootRef.querySelector(".scenemap-runtime-error");
  existing?.remove();
  const node = document.createElement("div");
  node.className = "scenemap-runtime-error";
  node.textContent = message;
  rootRef.prepend(node);
}
function showSettingsError(message) {
  if (!settingsRootRef)
    return;
  const existing = settingsRootRef.querySelector(".scenemap-runtime-error");
  existing?.remove();
  const node = document.createElement("div");
  node.className = "scenemap-runtime-error";
  node.textContent = message;
  settingsRootRef.prepend(node);
}
function renderTracker(value, layout) {
  const record = getRecord(value);
  if (Object.keys(record).length === 0)
    return `<div class="scenemap-empty">Tracker data is empty.</div>`;
  const sections = layout?.sections?.length ? layout.sections : DEFAULT_DISPLAY_LAYOUT.sections;
  const html = sections.map((section) => {
    const fields = section.fields.map((field) => renderField(field, record)).filter(Boolean).join("");
    if (!fields)
      return "";
    const title = section.title?.trim();
    return `<section class="scenemap-section ${title ? "" : "scenemap-section--untitled"}">${title ? `<h3>${escapeHtml(title)}</h3>` : ""}<div>${fields}</div></section>`;
  }).filter(Boolean).join("");
  return html || `<div class="scenemap-empty">Tracker data is empty.</div>`;
}
function renderField(field, tracker) {
  const value = getValueByPath(tracker, field.path);
  if (!hasRenderableValue(value))
    return "";
  const label = getFieldLabel(field);
  const labelMarkup = label ? `<span>${escapeHtml(label)}</span>` : "";
  const display = field.display || "text";
  if (display === "chips") {
    return `<div class="scenemap-field">${labelMarkup}<div class="scenemap-chips ${field.center ? "is-centered" : ""}">${toChips(value).map((item) => `<b>${escapeHtml(item)}</b>`).join("")}</div></div>`;
  }
  if (display === "progress")
    return renderProgressField(label, field.path, value);
  if (display === "character_cards" && Array.isArray(value)) {
    return `<div class="scenemap-character-grid">${value.map((item, index) => renderCharacterCard(item, index, field.fields ?? [])).join("")}</div>`;
  }
  return `<div class="scenemap-field">${labelMarkup}<p class="${display === "subtle" ? "subtle" : ""} ${display === "mono" ? "mono" : ""}">${escapeHtml(formatDisplayValue(value))}</p></div>`;
}
function getFieldLabel(field) {
  if (Object.prototype.hasOwnProperty.call(field, "label")) {
    const label = field.label?.trim() ?? "";
    return label ? label : null;
  }
  return humanizeTrackerKey(field.path.split(".").pop() || field.path);
}
function renderProgressField(label, path, value) {
  const progress = parseProgressValue(value);
  const labelMarkup = label ? `<span>${escapeHtml(label)}</span>` : "";
  if (!progress)
    return `<div class="scenemap-field">${labelMarkup}<p>${escapeHtml(formatDisplayValue(value))}</p></div>`;
  const tone = progress.value < 34 ? "danger" : progress.value < 67 ? "warning" : "success";
  const ariaLabel = label || humanizeTrackerKey(path.split(".").pop() || path);
  return `
    <div class="scenemap-field scenemap-progress-field" data-progress-tone="${tone}">
      <div class="scenemap-progress-head">
        ${labelMarkup}
        <strong>${progress.label}</strong>
      </div>
      <div class="scenemap-progress-track" role="meter" aria-label="${escapeAttr(ariaLabel)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress.value}">
        <i style="width: ${progress.value}%"></i>
      </div>
    </div>
  `;
}
function renderCharacterCard(value, index, fields) {
  const record = getRecord(value);
  const name = formatDisplayValue(record.name) || `Character ${index + 1}`;
  const innerFields = fields.length > 0 ? fields.map((field) => renderField(field, record)).join("") : Object.entries(record).filter(([key]) => key !== "name").map(([key, child]) => renderField({ path: key, label: humanizeTrackerKey(key), display: key === "postureAndInteraction" ? "mono" : "text" }, { [key]: child })).join("");
  return `<article class="scenemap-character"><h4>${escapeHtml(name)}</h4>${innerFields}</article>`;
}
function getRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function getValueByPath(value, path) {
  let current = value;
  for (const part of path.split(".").filter(Boolean)) {
    if (current === null || current === undefined || typeof current !== "object")
      return;
    current = current[part];
  }
  return current;
}
function hasRenderableValue(value) {
  if (value === null || value === undefined || value === "")
    return false;
  if (Array.isArray(value))
    return value.some(hasRenderableValue);
  if (typeof value === "object")
    return Object.values(value).some(hasRenderableValue);
  return true;
}
function toChips(value) {
  if (Array.isArray(value))
    return value.map(formatDisplayValue).filter(Boolean).slice(0, 32);
  if (typeof value === "string")
    return value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 32);
  return [];
}
function parseProgressValue(value) {
  let numeric = null;
  if (typeof value === "number" && Number.isFinite(value))
    numeric = value;
  if (typeof value === "string") {
    const ratio = value.match(/(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)/);
    if (ratio) {
      const current = Number(ratio[1]);
      const max = Number(ratio[2]);
      if (Number.isFinite(current) && Number.isFinite(max) && max > 0)
        numeric = current / max * 100;
    } else {
      const match = value.match(/-?\d+(?:\.\d+)?/);
      if (match)
        numeric = Number(match[0]);
    }
  }
  if (numeric === null || !Number.isFinite(numeric))
    return null;
  const clamped = Math.max(0, Math.min(100, numeric));
  const rounded = Math.round(clamped);
  return { value: rounded, label: `${rounded}%` };
}
function formatDisplayValue(value) {
  if (Array.isArray(value))
    return value.map(formatDisplayValue).filter(Boolean).join(", ");
  if (value && typeof value === "object") {
    return Object.entries(value).filter(([, child]) => hasRenderableValue(child)).map(([key, child]) => `${humanizeTrackerKey(key)}: ${formatDisplayValue(child)}`).join(`
`);
  }
  return formatPrimitive(value);
}
function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function escapeAttr(value) {
  return escapeHtml(value);
}
function refreshSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 0 1-15.3 6.4"/><path d="M3 12A9 9 0 0 1 18.3 5.6"/><path d="M18 2v4h-4"/><path d="M6 22v-4h4"/></svg>`;
}
var styles = `
.scenemap-lv { height: 100%; min-height: 0; display: flex; flex-direction: column; overflow: hidden; color: var(--lumiverse-text); }
.scenemap-settings-root { color: var(--lumiverse-text); }
.scenemap-shell { flex: 1 1 auto; display: flex; flex-direction: column; gap: 12px; padding: 14px; min-height: 0; box-sizing: border-box; overflow: hidden; }
.scenemap-header { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 8px; }
.scenemap-header h2 { margin: 0; font-size: 18px; font-weight: 700; }
.scenemap-header p { margin: 3px 0 0; color: var(--lumiverse-text-muted); font-size: 12px; }
.scenemap-status { margin: -4px 0 0; color: var(--lumiverse-text-muted); font-size: 12px; text-align: center; }
.scenemap-status.is-generating { color: var(--lumiverse-success, var(--lumiverse-accent)); animation: scenemap-status-pulse 1.8s ease-in-out infinite; }
.scenemap-loading-dots span { display: inline-block; animation: scenemap-dot-fade 1.2s ease-in-out infinite; }
.scenemap-loading-dots span:nth-child(2) { animation-delay: .16s; }
.scenemap-loading-dots span:nth-child(3) { animation-delay: .32s; }
[data-spindle-mount="chat_toolbar"]:has(.scenemap-chat-toolbar-root) { display: flex; align-items: center; gap: 2px; }
.scenemap-chat-toolbar-root { display: inline-flex; align-items: center; }
.scenemap-chat-toolbar-btn { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 26px; padding: 0; border: 0; border-radius: var(--lcs-radius-xs, 6px); background: transparent; color: var(--lumiverse-text-dim, rgba(230, 230, 240, .4)); cursor: pointer; transition: color .12s ease, background .12s ease; }
.scenemap-chat-toolbar-btn:hover:not(:disabled) { color: var(--lumiverse-text, rgba(230, 230, 240, .92)); background: var(--lumiverse-fill, rgba(255, 255, 255, .06)); }
.scenemap-chat-toolbar-btn.is-attention { color: var(--lumiverse-primary, var(--lumiverse-accent)); background: color-mix(in srgb, var(--lumiverse-primary, var(--lumiverse-accent)) 10%, transparent); }
.scenemap-chat-toolbar-btn.is-generating { color: var(--lumiverse-success, var(--lumiverse-accent)); animation: scenemap-status-pulse 1.8s ease-in-out infinite; }
.scenemap-chat-toolbar-btn.is-generating svg { animation: scenemap-spin .9s linear infinite; }
.scenemap-chat-toolbar-btn:disabled { opacity: .45; cursor: default; }
.scenemap-chat-toolbar-btn svg { width: 14px; height: 14px; }
.scenemap-toolbar, .scenemap-row, .scenemap-modal-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.scenemap-modal-spacer { flex: 1 1 auto; }
.scenemap-card { border: 1px solid var(--lumiverse-border); background: var(--lumiverse-fill-subtle); border-radius: 8px; padding: 12px; }
.scenemap-board { flex: 1 1 auto; min-height: 0; overflow: auto; background: transparent; border-color: transparent; padding: 0 10px 0 0; }
.scenemap-empty { color: var(--lumiverse-text-muted); font-size: 13px; text-align: center; padding: 20px 4px; }
.scenemap-section { padding: 10px 0 12px; }
.scenemap-section--untitled { padding-top: 4px; }
.scenemap-section h3 { display: flex; align-items: center; gap: 10px; margin: 0 0 10px; color: var(--lumiverse-accent); font-size: 12px; text-align: center; text-transform: uppercase; font-weight: 800; white-space: pre-wrap; }
.scenemap-section h3::before, .scenemap-section h3::after { content: ""; height: 4px; flex: 1 1 auto; border-top: 1px solid color-mix(in srgb, var(--lumiverse-border) 72%, transparent); border-bottom: 1px solid color-mix(in srgb, var(--lumiverse-border) 72%, transparent); }
.scenemap-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
.scenemap-field span { color: var(--lumiverse-text-muted); font-size: 10px; font-weight: 700; text-transform: uppercase; }
.scenemap-field p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; line-height: 1.45; }
.scenemap-field p.subtle { color: var(--lumiverse-text-muted); }
.scenemap-field p.mono { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-style: italic; }
.scenemap-progress-field { gap: 6px; }
.scenemap-progress-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.scenemap-progress-head strong { color: var(--lumiverse-text); font-size: 11px; font-weight: 750; font-variant-numeric: tabular-nums; }
.scenemap-progress-track { height: 7px; border-radius: 999px; overflow: hidden; border: 1px solid color-mix(in srgb, var(--lumiverse-border) 72%, transparent); background: color-mix(in srgb, var(--lumiverse-fill) 72%, transparent); }
.scenemap-progress-track i { display: block; height: 100%; min-width: 2px; border-radius: inherit; background: var(--lumiverse-primary, var(--lumiverse-accent)); box-shadow: 0 0 10px color-mix(in srgb, var(--lumiverse-primary, var(--lumiverse-accent)) 35%, transparent); }
.scenemap-progress-field[data-progress-tone="success"] .scenemap-progress-track i { background: var(--lumiverse-success, var(--lumiverse-primary, var(--lumiverse-accent))); box-shadow: 0 0 10px color-mix(in srgb, var(--lumiverse-success, var(--lumiverse-primary, var(--lumiverse-accent))) 35%, transparent); }
.scenemap-progress-field[data-progress-tone="warning"] .scenemap-progress-track i { background: var(--lumiverse-warning, var(--lumiverse-primary, var(--lumiverse-accent))); box-shadow: 0 0 10px color-mix(in srgb, var(--lumiverse-warning, var(--lumiverse-primary, var(--lumiverse-accent))) 35%, transparent); }
.scenemap-progress-field[data-progress-tone="danger"] .scenemap-progress-track i { background: var(--lumiverse-danger, var(--lumiverse-primary, var(--lumiverse-accent))); box-shadow: 0 0 10px color-mix(in srgb, var(--lumiverse-danger, var(--lumiverse-primary, var(--lumiverse-accent))) 35%, transparent); }
.scenemap-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.scenemap-chips.is-centered { justify-content: center; }
.scenemap-chips b { border: 1px solid var(--lumiverse-primary-020, var(--lumiverse-border)); background: color-mix(in srgb, var(--lumiverse-fill) 82%, var(--lumiverse-primary, var(--lumiverse-accent)) 6%); border-radius: 999px; padding: 4px 8px; font-size: 12px; font-weight: 600; }
.scenemap-character-grid { display: flex; flex-direction: column; gap: 14px; }
.scenemap-character { border: 1px solid var(--lumiverse-primary-020, var(--lumiverse-border)); background: color-mix(in srgb, var(--lumiverse-fill) 82%, var(--lumiverse-primary, var(--lumiverse-accent)) 6%); border-radius: 8px; padding: 10px; }
.scenemap-character h4 { margin: 0 0 10px; color: color-mix(in srgb, var(--lumiverse-text) 72%, var(--lumiverse-primary, var(--lumiverse-accent)) 28%); font-size: 14px; font-weight: 760; }
.scenemap-settings-heading { margin-bottom: 12px; }
.scenemap-settings-heading h3 { margin: 0; font-size: 15px; font-weight: 800; }
.scenemap-settings { background: transparent; border-color: transparent; padding: 0; }
.scenemap-settings label { display: flex; flex-direction: column; gap: 5px; margin: 10px 0; font-size: 12px; color: var(--lumiverse-text-muted); }
.scenemap-auto-row { display: flex; flex-direction: column; gap: 9px; border-top: 1px solid var(--lumiverse-border); border-bottom: 1px solid var(--lumiverse-border); padding: 9px 0; margin: 10px 0; }
.scenemap-settings .scenemap-switch-row { flex-direction: row; align-items: center; justify-content: space-between; gap: 12px; color: var(--lumiverse-text); margin: 0; min-width: 0; }
.scenemap-interval-field { margin: 0 !important; min-width: 0; }
.scenemap-switch-row input { position: absolute; opacity: 0; pointer-events: none; }
.scenemap-switch { position: relative; width: 32px; height: 18px; flex: 0 0 auto; border-radius: 999px; background: var(--lumiverse-fill); border: 1px solid var(--lumiverse-border-hover); transition: background .16s ease, border-color .16s ease; }
.scenemap-switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: var(--lumiverse-text-muted); transition: transform .16s ease, background .16s ease; }
.scenemap-switch-row input:checked + .scenemap-switch { background: var(--lumiverse-primary, var(--lumiverse-accent)); border-color: var(--lumiverse-primary, var(--lumiverse-accent)); }
.scenemap-switch-row input:checked + .scenemap-switch::after { transform: translateX(14px); background: var(--lumiverse-primary-contrast, #fff); }
.scenemap-settings-preset-row { display: grid; grid-template-columns: minmax(220px, 1fr) repeat(5, auto); gap: 8px; align-items: end; }
.scenemap-settings-preset-row label { margin: 10px 0 0; min-width: 0; }
.scenemap-settings-preset-row .scenemap-pill-action { display: inline-flex; align-items: center; justify-content: center; gap: 6px; white-space: nowrap; min-width: 56px; padding: 6px 11px !important; min-height: 32px; }
.scenemap-settings-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; }
.scenemap-settings-actions-left, .scenemap-settings-actions-right { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.scenemap-settings-actions .scenemap-pill-action { padding: 6px 11px !important; min-height: 32px; }
.scenemap-settings input:not([type="checkbox"]), .scenemap-settings select, .scenemap-editor textarea, .scenemap-layout-editor input, .scenemap-layout-editor select, .scenemap-name-editor input {
  width: 100%; box-sizing: border-box; border: 1px solid var(--lumiverse-border); border-radius: 6px;
  background: var(--lumiverse-fill); color: var(--lumiverse-text); padding: 7px 9px; font: inherit;
}
.scenemap-editor { display: flex; flex-direction: column; gap: 10px; }
.scenemap-name-editor { display: flex; flex-direction: column; gap: 12px; color: var(--lumiverse-text); }
.scenemap-name-editor label { display: flex; flex-direction: column; gap: 5px; color: var(--lumiverse-text-muted); font-size: 12px; }
.scenemap-editor textarea { min-height: min(58vh, 520px); resize: vertical; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; }
.scenemap-layout-editor { display: flex; flex-direction: column; gap: 12px; color: var(--lumiverse-text); }
.scenemap-layout-intro { display: flex; align-items: center; gap: 12px; justify-content: space-between; }
.scenemap-layout-sections { display: flex; flex-direction: column; gap: 12px; max-height: min(58vh, 520px); overflow: auto; padding-right: 4px; }
.scenemap-layout-section { border: 1px solid var(--lumiverse-border); background: var(--lumiverse-fill-subtle); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.scenemap-layout-section-header { display: grid; grid-template-columns: minmax(180px, 1fr) auto; gap: 10px; align-items: end; }
.scenemap-layout-section label, .scenemap-layout-field label { display: flex; flex-direction: column; gap: 5px; color: var(--lumiverse-text-muted); font-size: 12px; }
.scenemap-layout-section label.scenemap-layout-check-row, .scenemap-layout-field label.scenemap-layout-check-row { display: inline-flex; flex-direction: row; align-items: center; gap: 7px; margin: 0; }
.scenemap-layout-check-row input { width: auto !important; margin: 0; }
.scenemap-layout-fields { display: flex; flex-direction: column; gap: 7px; }
.scenemap-layout-field { display: flex; flex-direction: column; gap: 8px; }
.scenemap-layout-field-row { display: grid; grid-template-columns: minmax(120px, 1fr) minmax(110px, .8fr) minmax(96px, .6fr) auto auto auto; gap: 6px; align-items: center; }
.scenemap-layout-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }
.scenemap-layout-actions button, .scenemap-layout-child-row button { padding: 5px 8px; font-size: 12px; }
.scenemap-layout-icon-btn { width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; padding: 0; }
.scenemap-layout-icon-btn svg { width: 18px; height: 18px; }
.scenemap-layout-add-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.scenemap-layout-child-box { border-top: 1px solid var(--lumiverse-border); padding-top: 9px; display: flex; flex-direction: column; gap: 7px; }
.scenemap-layout-child-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.scenemap-layout-child-header strong { font-size: 12px; color: var(--lumiverse-text-muted); text-transform: uppercase; }
.scenemap-layout-child-row { display: grid; grid-template-columns: minmax(120px, 1fr) minmax(110px, .8fr) minmax(96px, .6fr) auto auto auto; gap: 6px; align-items: center; }
.scenemap-lv button, .scenemap-settings-root button, .scenemap-editor button, .scenemap-layout-editor button, .scenemap-name-editor button { border: 1px solid var(--lumiverse-border); background: var(--lumiverse-fill); color: var(--lumiverse-text); border-radius: 6px; padding: 7px 10px; cursor: pointer; font: inherit; }
.scenemap-lv button:hover:not(:disabled), .scenemap-settings-root button:hover:not(:disabled), .scenemap-editor button:hover:not(:disabled), .scenemap-layout-editor button:hover:not(:disabled), .scenemap-name-editor button:hover:not(:disabled) { border-color: var(--lumiverse-border-hover); }
.scenemap-lv button:disabled, .scenemap-settings-root button:disabled, .scenemap-editor button:disabled, .scenemap-layout-editor button:disabled, .scenemap-name-editor button:disabled { opacity: 0.45; cursor: default; }
.scenemap-lv .scenemap-primary, .scenemap-settings-root .scenemap-primary, .scenemap-editor .scenemap-primary, .scenemap-layout-editor .scenemap-primary, .scenemap-name-editor .scenemap-primary { background: var(--lumiverse-primary-015, color-mix(in srgb, var(--lumiverse-primary, var(--lumiverse-accent)) 15%, transparent)); color: var(--lumiverse-primary-text, var(--lumiverse-primary, var(--lumiverse-accent))); border-color: var(--lumiverse-primary-050, var(--lumiverse-primary, var(--lumiverse-accent))); }
.scenemap-lv .scenemap-primary:hover:not(:disabled), .scenemap-settings-root .scenemap-primary:hover:not(:disabled), .scenemap-editor .scenemap-primary:hover:not(:disabled), .scenemap-layout-editor .scenemap-primary:hover:not(:disabled), .scenemap-name-editor .scenemap-primary:hover:not(:disabled) { background: var(--lumiverse-primary-020, color-mix(in srgb, var(--lumiverse-primary, var(--lumiverse-accent)) 22%, transparent)); border-color: var(--lumiverse-primary, var(--lumiverse-accent)); }
.scenemap-lv .scenemap-danger, .scenemap-settings-root .scenemap-danger, .scenemap-editor .scenemap-danger, .scenemap-layout-editor .scenemap-danger, .scenemap-name-editor .scenemap-danger { background: var(--lumiverse-danger-015, rgba(239, 68, 68, .15)); color: var(--lumiverse-danger, #ef4444); border-color: var(--lumiverse-danger-050, rgba(239, 68, 68, .5)); }
.scenemap-lv .scenemap-danger:hover:not(:disabled), .scenemap-settings-root .scenemap-danger:hover:not(:disabled), .scenemap-editor .scenemap-danger:hover:not(:disabled), .scenemap-layout-editor .scenemap-danger:hover:not(:disabled), .scenemap-name-editor .scenemap-danger:hover:not(:disabled) { background: var(--lumiverse-danger-020, rgba(239, 68, 68, .2)); border-color: var(--lumiverse-danger, #ef4444); }
.scenemap-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; }
.scenemap-pill-action { border-radius: 999px !important; padding: 7px 13px !important; min-height: 34px; }
.scenemap-pill-icon { width: 34px; min-width: 34px; padding: 0 !important; display: inline-flex; align-items: center; justify-content: center; }
.scenemap-pill-icon.is-refreshing svg { animation: scenemap-spin .9s linear infinite; }
.scenemap-runtime-error, .scenemap-inline-error { border: 1px solid rgba(255, 100, 100, 0.45); color: #ffb8b8; background: rgba(120, 0, 0, 0.18); border-radius: 8px; padding: 10px; font-size: 12px; }
@media (max-width: 760px) {
  .scenemap-layout-section-header { grid-template-columns: 1fr; align-items: stretch; }
  .scenemap-layout-field-row, .scenemap-layout-child-row { grid-template-columns: repeat(3, 36px) 1fr; align-items: center; }
  .scenemap-layout-field-row > select:nth-child(1),
  .scenemap-layout-field-row > input:nth-child(2),
  .scenemap-layout-field-row > select:nth-child(3),
  .scenemap-layout-child-row > select:nth-child(1),
  .scenemap-layout-child-row > input:nth-child(2),
  .scenemap-layout-child-row > select:nth-child(3) { grid-column: 1 / -1; }
  .scenemap-settings-preset-row { grid-template-columns: 1fr; align-items: stretch; }
  .scenemap-settings-actions { align-items: stretch; flex-direction: column; }
  .scenemap-settings-actions-left, .scenemap-settings-actions-right { justify-content: flex-start; }
  .scenemap-layout-actions { justify-content: flex-start; }
  .scenemap-layout-intro { align-items: stretch; flex-direction: column; }
}
@keyframes scenemap-status-pulse {
  0%, 100% { opacity: .72; }
  50% { opacity: 1; }
}
@keyframes scenemap-dot-fade {
  0%, 20% { opacity: .2; transform: translateY(0); }
  45% { opacity: 1; transform: translateY(-1px); }
  80%, 100% { opacity: .2; transform: translateY(0); }
}
@keyframes scenemap-spin {
  to { transform: rotate(360deg); }
}
`;
export {
  setup,
  createSchemaDefaultLayout
};
