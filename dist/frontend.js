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

EXAMPLE OF A PERFECT RESPONSE:
\`\`\`json
{{example_response}}
\`\`\``;
var defaultSettings = {
  version: "0.1.0",
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

// src/frontend.ts
var state = {
  settings: defaultSettings,
  chatId: null,
  latest: null,
  messagesBehind: 0,
  activeMessageId: null,
  generatingMessageId: null,
  connections: []
};
var ctxRef = null;
var rootRef = null;
var tabHandle = null;
var iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z"/><path d="M9 3v15"/><path d="M15 6v15"/></svg>`;
function setup(ctx) {
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
  rootRef.className = "scenemap-lv";
  render();
  const action = ctx.ui.registerInputBarAction({
    id: "generate-latest",
    label: "Generate SceneMap",
    subtitle: "Track latest assistant message",
    iconSvg
  });
  const offAction = action.onClick(() => {
    send({ type: "generate_tracker", messageId: state.activeMessageId });
    tab.activate();
  });
  let floatWidget = null;
  try {
    floatWidget = ctx.ui.createFloatWidget({
      width: 44,
      height: 44,
      tooltip: "SceneMap",
      chromeless: true,
      snapToEdge: true,
      initialPosition: { x: window.innerWidth - 72, y: 110 }
    });
    floatWidget.root.className = "scenemap-float-root";
    floatWidget.root.innerHTML = `<button class="scenemap-float-button" type="button" title="SceneMap">${iconSvg}</button>`;
    floatWidget.root.querySelector("button")?.addEventListener("click", () => tab.activate());
  } catch {}
  const offBackend = ctx.onBackendMessage((payload) => {
    if (payload?.type === "state") {
      state = payload.state;
      render();
      return;
    }
    if (payload?.type === "error") {
      showInlineError(payload.message);
    }
  });
  const offEvents = [
    ctx.events.on("CHAT_SWITCHED", () => requestState()),
    ctx.events.on("MESSAGE_EDITED", () => requestState()),
    ctx.events.on("MESSAGE_DELETED", () => requestState()),
    ctx.events.on("MESSAGE_SWIPED", () => requestState()),
    ctx.events.on("GENERATION_ENDED", (payload) => {
      if (state.settings.autoGenerateAiTrackers && payload?.messageId && !payload?.error) {
        send({ type: "generate_tracker", messageId: payload.messageId });
        return;
      }
      requestState();
    })
  ];
  rootRef.addEventListener("click", handleClick);
  rootRef.addEventListener("change", handleChange);
  rootRef.addEventListener("input", handleInput);
  requestState();
  return () => {
    offBackend();
    offAction();
    for (const off of offEvents)
      off();
    action.destroy();
    floatWidget?.destroy();
    tab.destroy();
    removeStyle();
    ctx.dom.cleanup();
    ctxRef = null;
    rootRef = null;
    tabHandle = null;
  };
}
function send(payload) {
  ctxRef?.sendToBackend(payload);
}
function requestState() {
  send({ type: "get_state" });
}
function render() {
  if (!rootRef)
    return;
  const settings = mergeSettings(state.settings);
  const latest = state.latest;
  rootRef.innerHTML = `
    <div class="scenemap-shell">
      <header class="scenemap-header">
        <div>
          <h2>SceneMap</h2>
          <p>${statusText()}</p>
        </div>
        <button class="scenemap-icon-btn" data-action="refresh" title="Refresh">${refreshSvg()}</button>
      </header>

      <section class="scenemap-toolbar">
        <button class="scenemap-primary" data-action="generate" ${state.activeMessageId ? "" : "disabled"}>
          ${state.generatingMessageId ? "Cancel" : latest ? "Regenerate" : "Generate"}
        </button>
        <button data-action="edit" ${latest ? "" : "disabled"}>Edit JSON</button>
        <button data-action="delete" ${latest ? "" : "disabled"}>Delete</button>
      </section>

      <section class="scenemap-card scenemap-board">
        ${latest ? renderTracker(latest.data, settings.displayLayout) : `<div class="scenemap-empty">No tracker found for this chat yet.</div>`}
      </section>

      <details class="scenemap-card scenemap-settings" open>
        <summary>Settings</summary>
        <label>
          <span>Connection</span>
          <select data-setting="connectionId">
            <option value="">Default active connection</option>
            ${state.connections.map((conn) => `<option value="${escapeAttr(conn.id)}" ${settings.connectionId === conn.id ? "selected" : ""}>${escapeHtml(conn.name)} (${escapeHtml(conn.model || conn.provider)})${conn.is_default ? " - default" : ""}</option>`).join("")}
          </select>
        </label>
        <label class="scenemap-check">
          <input type="checkbox" data-setting="autoGenerateAiTrackers" ${settings.autoGenerateAiTrackers ? "checked" : ""}>
          <span>Auto-generate after assistant replies</span>
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
        <label>
          <span>Global preset</span>
          <select data-setting="schemaPreset">
            ${Object.entries(settings.schemaPresets).map(([key, preset]) => `<option value="${escapeAttr(key)}" ${settings.schemaPreset === key ? "selected" : ""}>${escapeHtml(preset.name)}</option>`).join("")}
          </select>
        </label>
        <div class="scenemap-row">
          <button data-action="edit-schema">Schema</button>
          <button data-action="edit-prompt">Prompt</button>
          <button data-action="edit-layout">Layout</button>
          <button data-action="reset-defaults">Reset</button>
        </div>
        <button class="scenemap-primary" data-action="save-settings">Save settings</button>
      </details>
    </div>
  `;
  tabHandle?.setBadge(state.messagesBehind > 0 ? String(state.messagesBehind) : null);
}
function statusText() {
  if (!state.chatId)
    return "Open a chat to start tracking.";
  if (state.generatingMessageId)
    return "Generating tracker...";
  if (!state.latest)
    return "Ready to generate a tracker.";
  if (state.messagesBehind > 0)
    return `Tracker is ${state.messagesBehind} assistant message${state.messagesBehind === 1 ? "" : "s"} behind.`;
  return "Tracker is current.";
}
function handleClick(event) {
  const target = event.target;
  const button = target.closest("[data-action]");
  if (!button)
    return;
  const action = button.dataset.action;
  if (action === "refresh")
    requestState();
  if (action === "generate")
    send({ type: "generate_tracker", messageId: state.activeMessageId });
  if (action === "edit" && state.latest)
    openJsonEditor("Edit Tracker JSON", state.latest.data, (data) => {
      send({ type: "edit_tracker", messageId: state.latest?.messageId, data });
    });
  if (action === "delete" && state.latest)
    send({ type: "delete_tracker", messageId: state.latest.messageId });
  if (action === "edit-schema")
    editActiveSchema();
  if (action === "edit-prompt")
    editPrompt();
  if (action === "edit-layout")
    editLayout();
  if (action === "reset-defaults") {
    state = { ...state, settings: mergeSettings(defaultSettings) };
    render();
  }
  if (action === "save-settings") {
    send({ type: "save_settings", settings: state.settings });
  }
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
  } else if (key === "maxResponseTokens" || key === "includeLastXMessages") {
    settings[key] = Math.max(0, Math.floor(Number(target.value) || 0));
  } else {
    settings[key] = target.value;
  }
  state = { ...state, settings };
}
function editActiveSchema() {
  const settings = mergeSettings(state.settings);
  const preset = settings.schemaPresets[settings.schemaPreset] ?? settings.schemaPresets.default;
  openJsonEditor("SceneMap Schema", preset.value, (data) => {
    settings.schemaPresets[settings.schemaPreset] = { ...preset, value: data };
    state = { ...state, settings };
    render();
  });
}
function editPrompt() {
  const settings = mergeSettings(state.settings);
  openTextEditor("SceneMap Prompt", settings.promptJson, (text) => {
    state = { ...state, settings: { ...settings, promptJson: text || DEFAULT_PROMPT_JSON } };
    render();
  });
}
function editLayout() {
  const settings = mergeSettings(state.settings);
  openJsonEditor("SceneMap Display Layout", settings.displayLayout, (data) => {
    const layout = data;
    if (!Array.isArray(layout.sections))
      throw new Error("Layout must contain a sections array.");
    state = { ...state, settings: { ...settings, displayLayout: layout } };
    render();
  });
}
function openJsonEditor(title, value, onSave) {
  openTextEditor(title, JSON.stringify(value, null, 2), (text) => {
    const data = JSON.parse(text);
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error("JSON must be an object.");
    onSave(data);
  }, "Save JSON");
}
function openTextEditor(title, value, onSave, submitLabel = "Save") {
  const ctx = ctxRef;
  if (!ctx)
    return;
  const modal = ctx.ui.showModal({ title, width: 720, maxHeight: 720 });
  modal.root.innerHTML = `
    <div class="scenemap-editor">
      <textarea spellcheck="false"></textarea>
      <div class="scenemap-modal-actions">
        <button data-modal-action="cancel">Cancel</button>
        <button class="scenemap-primary" data-modal-action="save">${escapeHtml(submitLabel)}</button>
      </div>
      <div class="scenemap-inline-error" hidden></div>
    </div>
  `;
  const textarea = modal.root.querySelector("textarea");
  const error = modal.root.querySelector(".scenemap-inline-error");
  textarea.value = value;
  textarea.focus();
  modal.root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-modal-action]");
    if (!button)
      return;
    if (button.dataset.modalAction === "cancel") {
      modal.dismiss();
      return;
    }
    try {
      onSave(textarea.value);
      modal.dismiss();
    } catch (err) {
      error.hidden = false;
      error.textContent = err.message;
    }
  });
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
function renderTracker(value, layout) {
  const record = getRecord(value);
  if (Object.keys(record).length === 0)
    return `<div class="scenemap-empty">Tracker data is empty.</div>`;
  const sections = layout?.sections?.length ? layout.sections : DEFAULT_DISPLAY_LAYOUT.sections;
  const html = sections.map((section) => {
    const fields = section.fields.map((field) => renderField(field, record)).filter(Boolean).join("");
    if (!fields)
      return "";
    return `<section class="scenemap-section"><h3>${escapeHtml(section.title)}</h3><div>${fields}</div></section>`;
  }).filter(Boolean).join("");
  return html || `<div class="scenemap-empty">Tracker data is empty.</div>`;
}
function renderField(field, tracker) {
  const value = getValueByPath(tracker, field.path);
  if (!hasRenderableValue(value))
    return "";
  const label = escapeHtml(field.label || humanizeTrackerKey(field.path.split(".").pop() || field.path));
  const display = field.display || "text";
  if (display === "chips") {
    return `<div class="scenemap-field"><span>${label}</span><div class="scenemap-chips">${toChips(value).map((item) => `<b>${escapeHtml(item)}</b>`).join("")}</div></div>`;
  }
  if (display === "character_cards" && Array.isArray(value)) {
    return `<div class="scenemap-character-grid">${value.map((item, index) => renderCharacterCard(item, index, field.fields ?? [])).join("")}</div>`;
  }
  return `<div class="scenemap-field"><span>${label}</span><p class="${display === "subtle" ? "subtle" : ""} ${display === "mono" ? "mono" : ""}">${escapeHtml(formatDisplayValue(value))}</p></div>`;
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
.scenemap-lv { height: 100%; color: var(--lumiverse-text); }
.scenemap-shell { display: flex; flex-direction: column; gap: 12px; padding: 14px; min-height: 100%; box-sizing: border-box; }
.scenemap-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.scenemap-header h2 { margin: 0; font-size: 18px; font-weight: 700; }
.scenemap-header p { margin: 3px 0 0; color: var(--lumiverse-text-muted); font-size: 12px; }
.scenemap-toolbar, .scenemap-row, .scenemap-modal-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.scenemap-card { border: 1px solid var(--lumiverse-border); background: var(--lumiverse-fill-subtle); border-radius: 8px; padding: 12px; }
.scenemap-board { overflow: auto; }
.scenemap-empty { color: var(--lumiverse-text-muted); font-size: 13px; text-align: center; padding: 20px 4px; }
.scenemap-section { padding: 10px 0 12px; border-bottom: 1px solid var(--lumiverse-border); }
.scenemap-section:last-child { border-bottom: 0; }
.scenemap-section h3 { margin: 0 0 10px; color: var(--lumiverse-accent); font-size: 12px; text-transform: uppercase; font-weight: 800; }
.scenemap-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
.scenemap-field span { color: var(--lumiverse-text-dim); font-size: 10px; font-weight: 800; text-transform: uppercase; }
.scenemap-field p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; line-height: 1.45; }
.scenemap-field p.subtle { color: var(--lumiverse-text-muted); }
.scenemap-field p.mono { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-style: italic; }
.scenemap-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.scenemap-chips b { border: 1px solid var(--lumiverse-border); background: var(--lumiverse-fill); border-radius: 999px; padding: 4px 8px; font-size: 12px; font-weight: 650; }
.scenemap-character-grid { display: flex; flex-direction: column; gap: 10px; }
.scenemap-character { border: 1px solid var(--lumiverse-border); background: var(--lumiverse-fill); border-radius: 8px; padding: 10px; }
.scenemap-character h4 { margin: 0 0 10px; font-size: 13px; }
.scenemap-settings summary { cursor: pointer; font-weight: 700; margin-bottom: 10px; }
.scenemap-settings label { display: flex; flex-direction: column; gap: 5px; margin: 10px 0; font-size: 12px; color: var(--lumiverse-text-muted); }
.scenemap-settings .scenemap-check { flex-direction: row; align-items: center; color: var(--lumiverse-text); }
.scenemap-settings input:not([type="checkbox"]), .scenemap-settings select, .scenemap-editor textarea {
  width: 100%; box-sizing: border-box; border: 1px solid var(--lumiverse-border); border-radius: 6px;
  background: var(--lumiverse-fill); color: var(--lumiverse-text); padding: 7px 9px; font: inherit;
}
.scenemap-editor { display: flex; flex-direction: column; gap: 10px; }
.scenemap-editor textarea { min-height: min(58vh, 520px); resize: vertical; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; }
.scenemap-lv button, .scenemap-editor button, .scenemap-float-button { border: 1px solid var(--lumiverse-border); background: var(--lumiverse-fill); color: var(--lumiverse-text); border-radius: 6px; padding: 7px 10px; cursor: pointer; font: inherit; }
.scenemap-lv button:hover:not(:disabled), .scenemap-editor button:hover:not(:disabled), .scenemap-float-button:hover:not(:disabled) { border-color: var(--lumiverse-border-hover); }
.scenemap-lv button:disabled, .scenemap-editor button:disabled, .scenemap-float-button:disabled { opacity: 0.45; cursor: default; }
.scenemap-primary { background: var(--lumiverse-accent); color: var(--lumiverse-accent-fg); border-color: transparent; }
.scenemap-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; }
.scenemap-runtime-error, .scenemap-inline-error { border: 1px solid rgba(255, 100, 100, 0.45); color: #ffb8b8; background: rgba(120, 0, 0, 0.18); border-radius: 8px; padding: 10px; font-size: 12px; }
.scenemap-float-root { width: 100%; height: 100%; }
.scenemap-float-button { width: 100%; height: 100%; padding: 0; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; box-shadow: 0 8px 24px rgba(0,0,0,.28); }
`;
export {
  setup
};
