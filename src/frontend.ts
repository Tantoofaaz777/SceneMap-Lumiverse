import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import {
  DEFAULT_DISPLAY_LAYOUT,
  DEFAULT_PROMPT_JSON,
  DEFAULT_SCHEMA_VALUE,
  defaultSettings,
  formatPrimitive,
  humanizeTrackerKey,
  mergeSettings,
  type SceneMapSettings,
  type SceneMapState,
  type TrackerBoardDisplayLayout,
  type TrackerBoardField,
} from "./shared";

let state: SceneMapState = {
  settings: defaultSettings,
  chatId: null,
  latest: null,
  messagesBehind: 0,
  activeMessageId: null,
  generatingMessageId: null,
  connections: [],
};

let ctxRef: SpindleFrontendContext | null = null;
let rootRef: HTMLElement | null = null;
let tabHandle: ReturnType<SpindleFrontendContext["ui"]["registerDrawerTab"]> | null = null;

const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z"/><path d="M9 3v15"/><path d="M15 6v15"/></svg>`;

export function setup(ctx: SpindleFrontendContext) {
  ctxRef = ctx;
  const removeStyle = ctx.dom.addStyle(styles);
  const tab = ctx.ui.registerDrawerTab({
    id: "scenemap",
    title: "SceneMap",
    shortName: "Map",
    headerTitle: "SceneMap",
    description: "Track the current scene as structured JSON",
    keywords: ["tracker", "scene", "map", "json"],
    iconSvg,
  });
  tabHandle = tab;
  rootRef = tab.root;
  rootRef.className = "scenemap-lv";
  render();

  const action = ctx.ui.registerInputBarAction({
    id: "generate-latest",
    label: "Generate SceneMap",
    subtitle: "Track latest assistant message",
    iconSvg,
  });
  const offAction = action.onClick(() => {
    send({ type: "generate_tracker", messageId: state.activeMessageId });
    tab.activate();
  });

  let floatWidget: ReturnType<SpindleFrontendContext["ui"]["createFloatWidget"]> | null = null;
  try {
    floatWidget = ctx.ui.createFloatWidget({
      width: 44,
      height: 44,
      tooltip: "SceneMap",
      chromeless: true,
      snapToEdge: true,
      initialPosition: { x: window.innerWidth - 72, y: 110 },
    });
    floatWidget.root.className = "scenemap-float-root";
    floatWidget.root.innerHTML = `<button class="scenemap-float-button" type="button" title="SceneMap">${iconSvg}</button>`;
    floatWidget.root.querySelector("button")?.addEventListener("click", () => tab.activate());
  } catch {
    // ui_panels may not be granted yet; drawer tab and input action still work.
  }

  const offBackend = ctx.onBackendMessage((payload: any) => {
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
    ctx.events.on("GENERATION_ENDED", () => requestState()),
  ];

  rootRef.addEventListener("click", handleClick);
  rootRef.addEventListener("change", handleChange);
  rootRef.addEventListener("input", handleInput);
  requestState();

  return () => {
    offBackend();
    offAction();
    for (const off of offEvents) off();
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

function send(payload: Record<string, unknown>) {
  ctxRef?.sendToBackend(payload);
}

function requestState() {
  send({ type: "get_state" });
}

function render() {
  if (!rootRef) return;
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
            ${state.connections
              .map((conn) => `<option value="${escapeAttr(conn.id)}" ${settings.connectionId === conn.id ? "selected" : ""}>${escapeHtml(conn.name)} (${escapeHtml(conn.model || conn.provider)})${conn.is_default ? " - default" : ""}</option>`)
              .join("")}
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
            ${Array.from({ length: 20 }, (_, i) => i + 1)
              .map((count) => `<option value="${count}" ${settings.includeLastXMessages === count ? "selected" : ""}>Last ${count}</option>`)
              .join("")}
          </select>
        </label>
        <label>
          <span>Global preset</span>
          <select data-setting="schemaPreset">
            ${Object.entries(settings.schemaPresets)
              .map(([key, preset]) => `<option value="${escapeAttr(key)}" ${settings.schemaPreset === key ? "selected" : ""}>${escapeHtml(preset.name)}</option>`)
              .join("")}
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

function statusText(): string {
  if (!state.chatId) return "Open a chat to start tracking.";
  if (state.generatingMessageId) return "Generating tracker...";
  if (!state.latest) return "Ready to generate a tracker.";
  if (state.messagesBehind > 0) return `Tracker is ${state.messagesBehind} assistant message${state.messagesBehind === 1 ? "" : "s"} behind.`;
  return "Tracker is current.";
}

function handleClick(event: Event) {
  const target = event.target as HTMLElement;
  const button = target.closest<HTMLElement>("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "refresh") requestState();
  if (action === "generate") send({ type: "generate_tracker", messageId: state.activeMessageId });
  if (action === "edit" && state.latest) openJsonEditor("Edit Tracker JSON", state.latest.data, (data) => {
    send({ type: "edit_tracker", messageId: state.latest?.messageId, data });
  });
  if (action === "delete" && state.latest) send({ type: "delete_tracker", messageId: state.latest.messageId });
  if (action === "edit-schema") editActiveSchema();
  if (action === "edit-prompt") editPrompt();
  if (action === "edit-layout") editLayout();
  if (action === "reset-defaults") {
    state = { ...state, settings: mergeSettings(defaultSettings) };
    render();
  }
  if (action === "save-settings") {
    send({ type: "save_settings", settings: state.settings });
  }
}

function handleChange(event: Event) {
  const target = event.target as HTMLInputElement | HTMLSelectElement;
  const key = target.dataset.setting as keyof SceneMapSettings | undefined;
  if (!key) return;
  updateSettingFromControl(target, key);
}

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement;
  const key = target.dataset.setting as keyof SceneMapSettings | undefined;
  if (!key || target.type === "checkbox") return;
  updateSettingFromControl(target, key);
}

function updateSettingFromControl(target: HTMLInputElement | HTMLSelectElement, key: keyof SceneMapSettings) {
  const settings = mergeSettings(state.settings);
  if (key === "autoGenerateAiTrackers") {
    settings.autoGenerateAiTrackers = (target as HTMLInputElement).checked;
  } else if (key === "maxResponseTokens" || key === "includeLastXMessages") {
    (settings as any)[key] = Math.max(0, Math.floor(Number(target.value) || 0));
  } else {
    (settings as any)[key] = target.value;
  }
  state = { ...state, settings };
}

function editActiveSchema() {
  const settings = mergeSettings(state.settings);
  const preset = settings.schemaPresets[settings.schemaPreset] ?? settings.schemaPresets.default;
  openJsonEditor("SceneMap Schema", preset.value, (data) => {
    settings.schemaPresets[settings.schemaPreset] = { ...preset, value: data as Record<string, unknown> };
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
    const layout = data as TrackerBoardDisplayLayout;
    if (!Array.isArray(layout.sections)) throw new Error("Layout must contain a sections array.");
    state = { ...state, settings: { ...settings, displayLayout: layout } };
    render();
  });
}

function openJsonEditor(title: string, value: unknown, onSave: (data: unknown) => void) {
  openTextEditor(title, JSON.stringify(value, null, 2), (text) => {
    const data = JSON.parse(text);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("JSON must be an object.");
    onSave(data);
  }, "Save JSON");
}

function openTextEditor(title: string, value: string, onSave: (value: string) => void, submitLabel = "Save") {
  const ctx = ctxRef;
  if (!ctx) return;
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
  const textarea = modal.root.querySelector("textarea") as HTMLTextAreaElement;
  const error = modal.root.querySelector(".scenemap-inline-error") as HTMLElement;
  textarea.value = value;
  textarea.focus();
  modal.root.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-modal-action]");
    if (!button) return;
    if (button.dataset.modalAction === "cancel") {
      modal.dismiss();
      return;
    }
    try {
      onSave(textarea.value);
      modal.dismiss();
    } catch (err) {
      error.hidden = false;
      error.textContent = (err as Error).message;
    }
  });
}

function showInlineError(message: string) {
  if (!rootRef) return;
  const existing = rootRef.querySelector(".scenemap-runtime-error");
  existing?.remove();
  const node = document.createElement("div");
  node.className = "scenemap-runtime-error";
  node.textContent = message;
  rootRef.prepend(node);
}

function renderTracker(value: unknown, layout: TrackerBoardDisplayLayout): string {
  const record = getRecord(value);
  if (Object.keys(record).length === 0) return `<div class="scenemap-empty">Tracker data is empty.</div>`;
  const sections = layout?.sections?.length ? layout.sections : DEFAULT_DISPLAY_LAYOUT.sections;
  const html = sections
    .map((section) => {
      const fields = section.fields.map((field) => renderField(field, record)).filter(Boolean).join("");
      if (!fields) return "";
      return `<section class="scenemap-section"><h3>${escapeHtml(section.title)}</h3><div>${fields}</div></section>`;
    })
    .filter(Boolean)
    .join("");
  return html || `<div class="scenemap-empty">Tracker data is empty.</div>`;
}

function renderField(field: TrackerBoardField, tracker: unknown): string {
  const value = getValueByPath(tracker, field.path);
  if (!hasRenderableValue(value)) return "";
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

function renderCharacterCard(value: unknown, index: number, fields: TrackerBoardField[]): string {
  const record = getRecord(value);
  const name = formatDisplayValue(record.name) || `Character ${index + 1}`;
  const innerFields = fields.length > 0
    ? fields.map((field) => renderField(field, record)).join("")
    : Object.entries(record)
        .filter(([key]) => key !== "name")
        .map(([key, child]) => renderField({ path: key, label: humanizeTrackerKey(key), display: key === "postureAndInteraction" ? "mono" : "text" }, { [key]: child }))
        .join("");
  return `<article class="scenemap-character"><h4>${escapeHtml(name)}</h4>${innerFields}</article>`;
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getValueByPath(value: unknown, path: string): unknown {
  let current = value;
  for (const part of path.split(".").filter(Boolean)) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function hasRenderableValue(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.some(hasRenderableValue);
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).some(hasRenderableValue);
  return true;
}

function toChips(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(formatDisplayValue).filter(Boolean).slice(0, 32);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 32);
  return [];
}

function formatDisplayValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(formatDisplayValue).filter(Boolean).join(", ");
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => hasRenderableValue(child))
      .map(([key, child]) => `${humanizeTrackerKey(key)}: ${formatDisplayValue(child)}`)
      .join("\n");
  }
  return formatPrimitive(value);
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value: unknown): string {
  return escapeHtml(value);
}

function refreshSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 0 1-15.3 6.4"/><path d="M3 12A9 9 0 0 1 18.3 5.6"/><path d="M18 2v4h-4"/><path d="M6 22v-4h4"/></svg>`;
}

const styles = `
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
button { border: 1px solid var(--lumiverse-border); background: var(--lumiverse-fill); color: var(--lumiverse-text); border-radius: 6px; padding: 7px 10px; cursor: pointer; font: inherit; }
button:hover:not(:disabled) { border-color: var(--lumiverse-border-hover); }
button:disabled { opacity: 0.45; cursor: default; }
.scenemap-primary { background: var(--lumiverse-accent); color: var(--lumiverse-accent-fg); border-color: transparent; }
.scenemap-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; }
.scenemap-runtime-error, .scenemap-inline-error { border: 1px solid rgba(255, 100, 100, 0.45); color: #ffb8b8; background: rgba(120, 0, 0, 0.18); border-radius: 8px; padding: 10px; font-size: 12px; }
.scenemap-float-root { width: 100%; height: 100%; }
.scenemap-float-button { width: 100%; height: 100%; padding: 0; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; box-shadow: 0 8px 24px rgba(0,0,0,.28); }
`;
