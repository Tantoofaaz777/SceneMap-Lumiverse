import type { SpindleFrontendContext, SpindleSelectHandle, SpindleSelectOption } from "lumiverse-spindle-types";
import Sortable from "sortablejs";
import {
  DEFAULT_DISPLAY_LAYOUT,
  DEFAULT_PROMPT_JSON,
  DEFAULT_SCHEMA_VALUE,
  defaultSettings,
  formatPrimitive,
  getPresetLayout,
  getPresetPrompt,
  humanizeTrackerKey,
  jsonValuesEqual,
  mergeSettings,
  type SceneMapSettings,
  type SceneMapState,
  type TrackerBoardDisplayLayout,
  type TrackerBoardField,
  type TrackerFieldDisplay,
} from "./shared";
import { SettingsDraftTracker } from "./settings-draft";
import { AutomaticSettingsDraftTracker } from "./automatic-settings-draft";
import { validateSchemaDefinition } from "./schema-validator";

let state: SceneMapState = {
  settings: defaultSettings,
  chatId: null,
  effectivePresetKey: defaultSettings.schemaPreset,
  latest: null,
  messagesBehind: 0,
  autoGenerateMessagesRemaining: null,
  activeMessageId: null,
  activeSwipeId: null,
  generationActive: false,
  generatingMessageId: null,
  connections: [],
};

let ctxRef: SpindleFrontendContext | null = null;
let rootRef: HTMLElement | null = null;
let dockRootRef: HTMLElement | null = null;
let toolbarRootRef: Element | null = null;
let tabHandle: ReturnType<SpindleFrontendContext["ui"]["registerDrawerTab"]> | null = null;
let dockPanelHandle: ReturnType<SpindleFrontendContext["ui"]["requestDockPanel"]> | null = null;
let dockResizeObserver: MutationObserver | null = null;
let dockPanelSize = 380;
const decoratedDockResizeHandles = new Set<HTMLElement>();
let dockPanelCreatedAt = 0;
let dockPanelError: string | null = null;
let isGenerationRequestPending = false;
let editorRequestSeq = 0;
let settingsSaveRequestSeq = 0;
let automaticSaveRequestSeq = 0;
let drawerSelectHandles: SpindleSelectHandle[] = [];
let automaticSaveTimer: ReturnType<typeof setTimeout> | null = null;
let drawerView: "tracker" | "settings" = "settings";
let appliedTrackerPlacement: SceneMapSettings["trackerPlacement"] | null = null;

type AutomaticallySavedSetting =
  | "connectionId"
  | "autoGenerateAiTrackers"
  | "autoGenerateInterval"
  | "maxResponseTokens"
  | "temperature"
  | "topP"
  | "includeLastXMessages"
  | "showInputBarButton"
  | "trackerPlacement";

type PresetEditorDraft = {
  schemaText: string;
  promptText: string;
  schemaError: string | null;
};

const presetEditorDrafts = new Map<string, PresetEditorDraft>();

type PendingTextEditor = {
  title: string;
  onSave: (value: string) => void;
};

const pendingTextEditors = new Map<string, PendingTextEditor>();
const settingsDraft = new SettingsDraftTracker();
const automaticSettingsDraft = new AutomaticSettingsDraftTracker<SceneMapSettings>();

const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z"/><path d="M9 3v15"/><path d="M15 6v15"/></svg>`;

export function setup(ctx: SpindleFrontendContext) {
  settingsDraft.reset();
  automaticSettingsDraft.reset();
  pendingTextEditors.clear();
  if (automaticSaveTimer) clearTimeout(automaticSaveTimer);
  automaticSaveTimer = null;
  dockPanelSize = readStoredDockPanelSize();
  ctxRef = ctx;
  const removeStyle = ctx.dom.addStyle(styles);
  const tab = ctx.ui.registerDrawerTab({
    id: "scenemap",
    title: "SceneMap",
    shortName: "Map",
    headerTitle: "SceneMap",
    description: "View the SceneMap tracker and settings",
    keywords: ["tracker", "scene", "map", "json", "settings"],
    iconSvg,
  });
  tabHandle = tab;
  rootRef = tab.root;
  rootRef.classList.add("scenemap-lv", "scenemap-drawer-root");
  syncTrackerPlacement();
  const offTabActivate = tab.onActivate(() => {
    syncTrackerPlacement();
    renderDrawerContent();
  });
  const toolbarRoot = ctx.ui.mount("chat_toolbar");
  toolbarRootRef = toolbarRoot;
  toolbarRoot.classList.add("scenemap-chat-toolbar-root");
  render();

  const offBackend = ctx.onBackendMessage((payload: any) => {
    if (payload?.type === "state") {
      isGenerationRequestPending = false;
      const incomingState = payload.state as SceneMapState;
      if (typeof payload.automaticSettingsSaveRequestId === "string") {
        automaticSettingsDraft.acknowledge(payload.automaticSettingsSaveRequestId);
      }
      if (typeof payload.settingsSaveRequestId === "string") {
        const acknowledged = settingsDraft.acknowledge(payload.settingsSaveRequestId);
        if (acknowledged && !settingsDraft.dirty) presetEditorDrafts.clear();
      }
      const baseSettings = settingsDraft.dirty ? state.settings : incomingState.settings;
      state = {
        ...incomingState,
        settings: automaticSettingsDraft.overlay(baseSettings),
      };
      render();
      return;
    }
    if (payload?.type === "error") {
      isGenerationRequestPending = false;
      const saveFailed = typeof payload.requestId === "string" && settingsDraft.fail(payload.requestId);
      const automaticSaveFailed = typeof payload.requestId === "string" && automaticSettingsDraft.fail(payload.requestId);
      if (typeof payload.requestId === "string") takePendingTextEditor(payload.requestId);
      renderDrawerContent();
      renderDockPanel();
      renderChatToolbar();
      if (saveFailed || automaticSaveFailed) {
        tabHandle?.activate();
        showSettingsError(payload.message);
      } else {
        showInlineError(payload.message);
      }
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
    ctx.events.on("GENERATION_ENDED", (payload: any) => {
      if (state.settings.autoGenerateAiTrackers && payload?.messageId && !payload?.error) {
        send({ type: "maybe_auto_generate", messageId: payload.messageId });
        return;
      }
      requestState();
    }),
  ];

  rootRef.addEventListener("click", handleClick);
  rootRef.addEventListener("change", handleChange);
  rootRef.addEventListener("input", handleInput);
  toolbarRoot.addEventListener("click", handleClick);
  requestState();

  return () => {
    flushAutomaticSettingsSave();
    rootRef?.removeEventListener("click", handleClick);
    rootRef?.removeEventListener("change", handleChange);
    rootRef?.removeEventListener("input", handleInput);
    dockRootRef?.removeEventListener("click", handleClick);
    toolbarRoot.removeEventListener("click", handleClick);
    offBackend();
    for (const off of offEvents) off();
    offTabActivate();
    destroySelectHandles(drawerSelectHandles);
    drawerSelectHandles = [];
    tab.destroy();
    destroyDockPanel();
    removeStyle();
    ctx.dom.cleanup();
    ctxRef = null;
    rootRef = null;
    dockRootRef = null;
    toolbarRootRef = null;
    tabHandle = null;
    appliedTrackerPlacement = null;
    drawerView = "settings";
    isGenerationRequestPending = false;
    settingsDraft.reset();
    presetEditorDrafts.clear();
    automaticSettingsDraft.reset();
    pendingTextEditors.clear();
  };
}

function ensureDockPanel() {
  const ctx = ctxRef;
  if (!ctx || mergeSettings(state.settings).trackerPlacement !== "dock") return;
  if (dockRootRef && dockPanelHandle && (dockRootRef.isConnected || Date.now() - dockPanelCreatedAt < 1000)) return;
  dockRootRef?.removeEventListener("click", handleClick);
  cleanupDockResizeHandles();
  dockPanelHandle?.destroy();
  let panel: ReturnType<SpindleFrontendContext["ui"]["requestDockPanel"]>;
  try {
    panel = ctx.ui.requestDockPanel({
      edge: "right",
      title: "SceneMap",
      size: dockPanelSize,
      minSize: 300,
      maxSize: 620,
      resizable: true,
      startCollapsed: false,
    });
  } catch (error) {
    dockPanelHandle = null;
    dockRootRef = null;
    dockPanelError = `Could not open the SceneMap panel: ${(error as Error).message}`;
    return;
  }
  dockPanelHandle = panel;
  dockPanelCreatedAt = Date.now();
  dockPanelError = null;
  dockRootRef = panel.root;
  dockRootRef.classList.add("scenemap-lv", "scenemap-dock-root");
  dockRootRef.addEventListener("click", handleClick);
  renderDockPanel();
  watchDockResizeHandle();
}

function destroyDockPanel() {
  dockRootRef?.removeEventListener("click", handleClick);
  dockResizeObserver?.disconnect();
  cleanupDockResizeHandles();
  dockPanelHandle?.destroy();
  dockRootRef = null;
  dockPanelHandle = null;
  dockResizeObserver = null;
  dockPanelCreatedAt = 0;
  dockPanelError = null;
}

function syncTrackerPlacement() {
  const placement = mergeSettings(state.settings).trackerPlacement;
  if (placement !== appliedTrackerPlacement) {
    drawerView = placement === "drawer" ? "tracker" : "settings";
    appliedTrackerPlacement = placement;
  }
  if (placement === "drawer") destroyDockPanel();
  else ensureDockPanel();
}

function watchDockResizeHandle() {
  dockResizeObserver?.disconnect();
  cleanupDockResizeHandles();
  let observedHost: HTMLElement | null = null;

  const decorate = () => {
    const root = dockRootRef;
    if (!root?.isConnected) return null;
    const host = findDockPanelHost(root);
    if (!host) return null;

    for (let ancestor = root.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
      for (const child of ancestor.children) {
        if (!(child instanceof HTMLElement) || child.contains(root)) continue;
        const cursor = getComputedStyle(child).cursor;
        if (cursor !== "ew-resize" && cursor !== "ns-resize") continue;

        child.classList.add("scenemap-dock-resize-handle");
        child.classList.toggle("scenemap-dock-resize-horizontal", cursor === "ew-resize");
        child.classList.toggle("scenemap-dock-resize-vertical", cursor === "ns-resize");
        if (!decoratedDockResizeHandles.has(child)) {
          decoratedDockResizeHandles.add(child);
          child.addEventListener("pointerup", handleNativeDockResizeEnd);
        }
        return host;
      }
    }
    return host;
  };

  dockResizeObserver = new MutationObserver((records) => {
    const root = dockRootRef;
    if (root?.isConnected && records.every((record) => root.contains(record.target))) return;
    const host = decorate();
    if (host && host !== observedHost) {
      observedHost = host;
      dockResizeObserver?.disconnect();
      dockResizeObserver?.observe(host, { childList: true, subtree: true });
    }
  });
  dockResizeObserver.observe(document.documentElement, { childList: true, subtree: true });
  const host = decorate();
  if (host) {
    observedHost = host;
    dockResizeObserver.disconnect();
    dockResizeObserver.observe(host, { childList: true, subtree: true });
  }
}

function findDockPanelHost(element: HTMLElement): HTMLElement | null {
  for (let ancestor = element.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
    if (getComputedStyle(ancestor).position === "fixed") return ancestor;
  }
  return null;
}

function handleNativeDockResizeEnd(event: PointerEvent) {
  if (!(event.currentTarget instanceof HTMLElement)) return;
  const handle = event.currentTarget;
  const host = findDockPanelHost(handle);
  if (!host) return;
  const cursor = getComputedStyle(handle).cursor;
  const rect = host.getBoundingClientRect();
  const nextSize = cursor === "ns-resize" ? rect.height : rect.width;
  dockPanelSize = Math.max(300, Math.min(620, Math.round(nextSize)));
  storeDockPanelSize(dockPanelSize);
}

function cleanupDockResizeHandles() {
  for (const handle of decoratedDockResizeHandles) {
    handle.removeEventListener("pointerup", handleNativeDockResizeEnd);
    handle.classList.remove(
      "scenemap-dock-resize-handle",
      "scenemap-dock-resize-horizontal",
      "scenemap-dock-resize-vertical",
    );
  }
  decoratedDockResizeHandles.clear();
}

function readStoredDockPanelSize(): number {
  try {
    const value = Number(localStorage.getItem("scenemap:dock-panel-size"));
    if (Number.isFinite(value) && value >= 300 && value <= 620) return Math.round(value);
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
  return 380;
}

function storeDockPanelSize(size: number) {
  try {
    localStorage.setItem("scenemap:dock-panel-size", String(size));
  } catch {
    // Resizing still works for the current session when storage is unavailable.
  }
}

function send(payload: Record<string, unknown>) {
  ctxRef?.sendToBackend(payload);
}

function requestState() {
  send({ type: "get_state" });
}

function render() {
  syncTrackerPlacement();
  renderDockPanel();
  renderDrawerContent();
  renderChatToolbar();
  tabHandle?.setBadge(state.messagesBehind > 0 ? String(state.messagesBehind) : null);
}

function renderTrackerSurfaces() {
  renderDockPanel();
  if (mergeSettings(state.settings).trackerPlacement === "drawer" && drawerView === "tracker") {
    renderDrawerContent();
  }
}

function renderChatToolbar() {
  if (!toolbarRootRef) return;
  if (!state.settings.showInputBarButton) {
    toolbarRootRef.innerHTML = "";
    return;
  }
  const isGenerating = Boolean(state.generationActive || isGenerationRequestPending);
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

function renderDockPanel() {
  if (!dockRootRef) return;
  dockRootRef.innerHTML = trackerPanelMarkup();
}

function renderDrawerContent() {
  if (!rootRef) return;
  if (mergeSettings(state.settings).trackerPlacement === "drawer" && drawerView === "tracker") {
    destroySelectHandles(drawerSelectHandles);
    drawerSelectHandles = [];
    renderDrawerPage(trackerPanelMarkup());
    return;
  }
  renderDrawerSettings();
}

function renderDrawerPage(content: string) {
  if (!rootRef) return;
  let page = rootRef.firstElementChild;
  if (!(page instanceof HTMLElement) || !page.classList.contains("scenemap-drawer-scroll")) {
    rootRef.innerHTML = drawerPageMarkup("");
    page = rootRef.firstElementChild;
  }
  if (!(page instanceof HTMLElement)) return;
  const trackerActive = drawerView === "tracker";
  const trackerTab = page.querySelector<HTMLElement>("[data-action=\"show-tracker\"]");
  const settingsTab = page.querySelector<HTMLElement>("[data-action=\"show-settings\"]");
  trackerTab?.classList.toggle("is-active", trackerActive);
  trackerTab?.setAttribute("aria-selected", String(trackerActive));
  settingsTab?.classList.toggle("is-active", !trackerActive);
  settingsTab?.setAttribute("aria-selected", String(!trackerActive));
  const view = page.querySelector<HTMLElement>(".scenemap-drawer-view");
  if (view) view.innerHTML = content;
}

function drawerPageMarkup(content: string): string {
  const trackerActive = drawerView === "tracker";
  return `
    <div class="scenemap-drawer-scroll">
      <nav class="scenemap-view-tabs" role="tablist" aria-label="SceneMap sections">
        <button type="button" role="tab" data-action="show-tracker" aria-selected="${trackerActive}" class="${trackerActive ? "is-active" : ""}">Tracker</button>
        <button type="button" role="tab" data-action="show-settings" aria-selected="${!trackerActive}" class="${trackerActive ? "" : "is-active"}">Settings</button>
      </nav>
      <div class="scenemap-drawer-view" role="tabpanel">${content}</div>
    </div>
  `;
}

function trackerPanelMarkup(): string {
  const settings = mergeSettings(state.settings);
  const latest = state.latest;
  const trackerValue = latest?.displayData ?? latest?.data;
  const layout = latest && !latest.schemaMatchesCurrent
    ? createTrackerDataLayout(trackerValue)
    : getPresetLayout(settings, state.effectivePresetKey);
  return `
    <div class="scenemap-shell">
      <header class="scenemap-header">
        <button class="scenemap-pill-action scenemap-tracker-action scenemap-primary" data-action="generate" ${state.activeMessageId && !isGenerationRequestPending ? "" : "disabled"}>
          ${state.generationActive || isGenerationRequestPending ? "Cancel" : latest ? "Regenerate" : "Generate"}
        </button>
        <button class="scenemap-pill-action scenemap-tracker-action" data-action="edit" ${latest?.schemaMatchesCurrent ? "" : "disabled"}>Edit</button>
        <button class="scenemap-pill-action scenemap-tracker-action scenemap-danger" data-action="delete" ${latest ? "" : "disabled"}>Delete</button>
      </header>

      <p class="scenemap-status is-${statusTone()}" role="status" aria-live="polite">${statusMarkup()}</p>

      <section class="scenemap-card scenemap-board">
        ${latest ? renderTracker(trackerValue, layout) : `<div class="scenemap-empty">Generate a SceneMap for this swipe</div>`}
      </section>
    </div>
  `;
}

function renderDrawerSettings() {
  if (!rootRef) return;
  destroySelectHandles(drawerSelectHandles);
  drawerSelectHandles = [];
  const settings = mergeSettings(state.settings);
  const presetKeys = Object.keys(settings.schemaPresets);
  const canDeletePreset = settings.schemaPreset !== "default" && presetKeys.length > 1;
  const activePreset = settings.schemaPresets[settings.schemaPreset] ?? settings.schemaPresets.default;
  const presetDraft = getPresetEditorDraft(settings, settings.schemaPreset);
  const drawerTrackerMode = settings.trackerPlacement === "drawer";
  const settingsMarkup = `
    <div class="scenemap-shell scenemap-settings-shell">
      <p class="scenemap-settings-dirty" data-settings-dirty ${settingsDraft.dirty ? "" : "hidden"}>Unsaved preset changes</p>
      ${dockPanelError ? `<div class="scenemap-runtime-error">${escapeHtml(dockPanelError)}</div>` : ""}
      <section class="scenemap-settings-scroll">
        <div class="scenemap-settings-group">
          <h3>Generation</h3>
      <label>
        <span>Connection</span>
        <div class="scenemap-native-select" data-native-setting="connectionId"></div>
      </label>
      <div class="scenemap-auto-row">
        <label class="scenemap-switch-row">
          <span>Auto-generate after assistant replies</span>
          <input type="checkbox" data-setting="autoGenerateAiTrackers" ${settings.autoGenerateAiTrackers ? "checked" : ""}>
          <span class="scenemap-switch" aria-hidden="true"></span>
        </label>
        <label class="scenemap-interval-field" ${settings.autoGenerateAiTrackers ? "" : "hidden"}>
          <span>Interval</span>
          <input type="number" min="1" step="1" data-setting="autoGenerateInterval" value="${settings.autoGenerateInterval > 1 ? settings.autoGenerateInterval : ""}" placeholder="Empty = 1 = every assistant message">
        </label>
      </div>
      <label>
        <span>Max response tokens</span>
        <input type="number" min="1" step="1" data-setting="maxResponseTokens" value="${settings.maxResponseTokens}">
      </label>
      <div class="scenemap-sampler-row">
        <label>
          <span>Temperature</span>
          <input type="number" min="0" max="2" step="0.05" data-setting="temperature" value="${settings.temperature ?? ""}" placeholder="1">
        </label>
        <label>
          <span>Top P</span>
          <input type="number" min="0" max="1" step="0.05" data-setting="topP" value="${settings.topP ?? ""}" placeholder="1">
        </label>
      </div>
      <label>
        <span>Include last messages</span>
        <div class="scenemap-native-select" data-native-setting="includeLastXMessages"></div>
      </label>
        </div>
        <div class="scenemap-settings-group">
          <h3>Interface</h3>
          <label>
            <span>Tracker location</span>
            <div class="scenemap-native-select" data-native-setting="trackerPlacement"></div>
          </label>
          <label class="scenemap-switch-row">
            <span>Show input bar button</span>
            <input type="checkbox" data-setting="showInputBarButton" ${settings.showInputBarButton ? "checked" : ""}>
            <span class="scenemap-switch" aria-hidden="true"></span>
          </label>
        </div>
        <div class="scenemap-settings-group scenemap-settings-preset-row">
          <h3>Presets</h3>
          <div class="scenemap-preset-toolbar">
            <label class="scenemap-preset-select">
              <span>Global preset</span>
              <div class="scenemap-native-select" data-native-setting="schemaPreset"></div>
            </label>
            <div class="scenemap-settings-preset-actions">
              <button class="scenemap-pill-action" data-action="create-preset">New</button>
              <button class="scenemap-pill-action" data-action="rename-preset">Rename</button>
              <button class="scenemap-pill-action" data-action="import-preset">Import</button>
              <button class="scenemap-pill-action" data-action="export-preset">Export</button>
              <button class="scenemap-pill-action scenemap-danger" data-action="delete-preset" ${canDeletePreset ? "" : "disabled"}>Delete</button>
            </div>
          </div>
          <div class="scenemap-preset-editor">
            <label>
              <span>Schema (JSON)</span>
              <div class="scenemap-expandable-textarea">
                <textarea data-preset-editor="schema" spellcheck="false" aria-label="Schema JSON for ${escapeAttr(activePreset.name)}">${escapeHtml(presetDraft.schemaText)}</textarea>
                ${expandEditorButton("schema")}
              </div>
            </label>
            <div class="scenemap-inline-error scenemap-preset-schema-error" data-preset-schema-error ${presetDraft.schemaError ? "" : "hidden"}>${escapeHtml(presetDraft.schemaError ?? "")}</div>
            <label>
              <span>Prompt</span>
              <div class="scenemap-expandable-textarea">
                <textarea data-preset-editor="prompt" aria-label="Prompt for ${escapeAttr(activePreset.name)}" placeholder="Write the SceneMap generation prompt. Macros like {{schema}} are supported.">${escapeHtml(presetDraft.promptText)}</textarea>
                ${expandEditorButton("prompt")}
              </div>
            </label>
            <div class="scenemap-preset-layout-row">
              <button class="scenemap-pill-action" data-action="edit-layout">Layout</button>
              <button class="scenemap-pill-action scenemap-primary" data-action="save-preset" ${settingsDraft.saving ? "disabled" : ""}>${settingsDraft.saving ? "Saving..." : "Save preset"}</button>
            </div>
          </div>
        </div>
      </section>
    </div>
  `;
  if (drawerTrackerMode) renderDrawerPage(settingsMarkup);
  else rootRef.innerHTML = settingsMarkup;
  mountSettingsSelects(settings);
}

function mountSettingsSelects(settings: SceneMapSettings) {
  if (!ctxRef || !rootRef) return;
  const mount = (
    key: "connectionId" | "includeLastXMessages" | "schemaPreset" | "trackerPlacement",
    options: SpindleSelectOption[],
    value: string,
    extra: Partial<Parameters<SpindleFrontendContext["components"]["mountSelect"]>[1]> = {},
  ) => {
    const target = rootRef?.querySelector(`[data-native-setting="${key}"]`);
    if (!target || !ctxRef) return;
    drawerSelectHandles.push(ctxRef.components.mountSelect(target, {
      options,
      value,
      portal: true,
      triggerClassName: "scenemap-secondary-control",
      ariaLabel: key === "connectionId"
        ? "Connection"
        : key === "schemaPreset"
          ? "Global preset"
          : key === "trackerPlacement"
            ? "Tracker location"
            : "Include last messages",
      onChange: (nextValue) => updateNativeSetting(key, nextValue),
      ...extra,
    }));
  };

  mount(
    "connectionId",
    state.connections.map((connection) => ({
      value: connection.id,
      label: connection.name,
      sublabel: `${connection.model || connection.provider}${connection.is_default ? " · default" : ""}`,
    })),
    settings.connectionId,
    {
      placeholder: "Default active connection",
      clearable: true,
      clearLabel: "Default active connection",
      searchPlaceholder: "Search connections...",
    },
  );
  mount(
    "includeLastXMessages",
    [
      { value: "0", label: "All messages up to target" },
      ...Array.from({ length: 20 }, (_, index) => ({ value: String(index + 1), label: `Last ${index + 1}` })),
    ],
    String(settings.includeLastXMessages),
    { searchThreshold: Number.MAX_SAFE_INTEGER },
  );
  mount(
    "trackerPlacement",
    [
      { value: "dock", label: "Dock panel" },
      { value: "drawer", label: "Drawer" },
    ],
    settings.trackerPlacement,
    { searchThreshold: Number.MAX_SAFE_INTEGER },
  );
  mount(
    "schemaPreset",
    Object.entries(settings.schemaPresets).map(([key, preset]) => ({ value: key, label: preset.name })),
    settings.schemaPreset,
    { searchPlaceholder: "Search presets..." },
  );
}

function updateNativeSetting(
  key: "connectionId" | "includeLastXMessages" | "schemaPreset" | "trackerPlacement",
  value: string,
) {
  const settings = mergeSettings(state.settings);
  if (key === "includeLastXMessages") settings.includeLastXMessages = Math.max(0, Math.floor(Number(value) || 0));
  else if (key === "trackerPlacement") settings.trackerPlacement = value === "drawer" ? "drawer" : "dock";
  else settings[key] = value;
  if (key === "schemaPreset") {
    updateSettingsDraft(settings);
    queueMicrotask(() => render());
    return;
  }
  state = { ...state, settings };
  queueAutomaticSettingsSave(settings, key, true);
  if (key === "trackerPlacement") queueMicrotask(() => render());
}

function queueAutomaticSettingsSave(settings: SceneMapSettings, key: AutomaticallySavedSetting, immediate: boolean) {
  automaticSettingsDraft.queue(key, settings[key]);
  if (automaticSaveTimer) clearTimeout(automaticSaveTimer);
  automaticSaveTimer = null;
  if (immediate) {
    flushAutomaticSettingsSave();
    return;
  }
  automaticSaveTimer = setTimeout(flushAutomaticSettingsSave, 450);
}

function flushAutomaticSettingsSave() {
  if (automaticSaveTimer) clearTimeout(automaticSaveTimer);
  automaticSaveTimer = null;
  const requestId = `automatic-settings-${Date.now()}-${++automaticSaveRequestSeq}`;
  const settings = automaticSettingsDraft.begin(requestId);
  if (!settings) return;
  send({ type: "save_automatic_settings", requestId, settings });
}

function destroySelectHandles(handles: SpindleSelectHandle[]) {
  for (const handle of handles) handle.destroy();
}

function statusText(): string {
  if (!state.chatId) return "Open a chat to start tracking";
  if (isMappingScene()) return "Mapping this scene";
  if (state.latest && !state.latest.schemaMatchesCurrent) return "Schema changed — regenerate to update";
  const autoText = autoGenerateStatusText();
  if (autoText) return autoText;
  if (!state.latest) return "This scene is unmapped";
  if (state.messagesBehind > 0) return `SceneMap is ${state.messagesBehind} message${state.messagesBehind === 1 ? "" : "s"} behind`;
  return "SceneMap is updated";
}
function autoGenerateStatusText(): string | null {
  if (!state.settings.autoGenerateAiTrackers || state.autoGenerateMessagesRemaining == null) return null;
  if (state.autoGenerateMessagesRemaining <= 0) return "Auto-generation is due";
  if (state.autoGenerateMessagesRemaining === 1) return "Auto-generates on next assistant message";
  return `Auto-generates in ${state.autoGenerateMessagesRemaining} assistant messages`;
}

type SceneMapStatusTone = "neutral" | "info" | "warning" | "success" | "generating";

function isMappingScene(): boolean {
  return Boolean(state.generationActive || state.generatingMessageId || isGenerationRequestPending);
}

function statusTone(): SceneMapStatusTone {
  if (!state.chatId) return "neutral";
  if (isMappingScene()) return "generating";
  if (state.latest && !state.latest.schemaMatchesCurrent) return "warning";
  if (state.settings.autoGenerateAiTrackers && state.autoGenerateMessagesRemaining != null) {
    return state.autoGenerateMessagesRemaining <= 0 ? "warning" : "info";
  }
  if (!state.latest) return "neutral";
  if (state.messagesBehind > 0) return "warning";
  return "success";
}

function statusMarkup(): string {
  const indicator = `<span class="scenemap-status-indicator" aria-hidden="true"></span>`;
  if (!isMappingScene()) return `${indicator}<span>${escapeHtml(statusText())}</span>`;
  return `${indicator}<span>Mapping this scene<span class="scenemap-loading-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span></span>`;
}

function handleClick(event: Event) {
  const target = event.target as HTMLElement;
  const button = target.closest<HTMLElement>("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "show-tracker" && mergeSettings(state.settings).trackerPlacement === "drawer") {
    drawerView = "tracker";
    renderDrawerContent();
  }
  if (action === "show-settings" && mergeSettings(state.settings).trackerPlacement === "drawer") {
    drawerView = "settings";
    renderDrawerContent();
  }
  if (action === "expand-preset-editor") {
    event.preventDefault();
    const editor = button.dataset.editor;
    if (editor === "schema" || editor === "prompt") openPresetExpandedEditor(editor);
  }
  if (action === "generate") {
    if (isGenerationRequestPending) return;
    isGenerationRequestPending = true;
    renderTrackerSurfaces();
    renderChatToolbar();
    send({ type: "generate_tracker" });
  }
  if (action === "edit" && state.latest?.schemaMatchesCurrent && state.chatId) {
    const { messageId, swipeId, data: trackerData } = state.latest;
    const chatId = state.chatId;
    openJsonEditor("Edit Tracker JSON", trackerData, (data) => {
      send({ type: "edit_tracker", chatId, messageId, swipeId, data });
    });
  }
  if (action === "delete" && state.latest) send({ type: "delete_tracker", messageId: state.latest.messageId });
  if (action === "create-preset" && ensureActivePresetEditorValid()) createPreset();
  if (action === "rename-preset") renamePreset();
  if (action === "import-preset") void importPreset();
  if (action === "export-preset" && ensureActivePresetEditorValid()) exportPreset();
  if (action === "delete-preset") deletePreset();
  if (action === "edit-layout" && ensureActivePresetEditorValid()) editLayout();
  if (action === "save-preset") {
    flushAutomaticSettingsSave();
    if (!preparePresetDraftsForSave()) return;
    const requestId = `settings-${Date.now()}-${++settingsSaveRequestSeq}`;
    if (!settingsDraft.beginSave(requestId)) return;
    renderDrawerSettings();
    send({ type: "save_preset_settings", requestId, settings: state.settings });
  }
}

function updateSettingsDraft(settings: SceneMapSettings) {
  settingsDraft.markChanged();
  state = { ...state, settings };
  revealUnsavedSettings();
}

function revealUnsavedSettings() {
  const indicator = rootRef?.querySelector<HTMLElement>("[data-settings-dirty]");
  if (indicator) indicator.hidden = false;
}

function getPresetEditorDraft(settings: SceneMapSettings, key: string): PresetEditorDraft {
  const existing = presetEditorDrafts.get(key);
  if (existing) return existing;
  const preset = settings.schemaPresets[key] ?? settings.schemaPresets.default;
  const draft: PresetEditorDraft = {
    schemaText: JSON.stringify(preset.value, null, 2),
    promptText: getPresetPrompt(settings, key),
    schemaError: null,
  };
  presetEditorDrafts.set(key, draft);
  return draft;
}

function parseSchemaEditorText(text: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON: ${(error as Error).message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Schema JSON must be an object.");
  }
  const schema = parsed as Record<string, unknown>;
  validateSchemaDefinition(schema);
  return schema;
}

function updatePresetEditorControl(target: HTMLInputElement | HTMLTextAreaElement) {
  const editor = target.dataset.presetEditor;
  if (editor !== "schema" && editor !== "prompt") return;
  updatePresetEditorValue(editor, target.value);
}

function updatePresetEditorValue(editor: "schema" | "prompt", value: string) {
  const settings = mergeSettings(state.settings);
  const key = settings.schemaPreset;
  const preset = settings.schemaPresets[key] ?? settings.schemaPresets.default;
  const draft = getPresetEditorDraft(settings, key);
  if (editor === "prompt") {
    draft.promptText = value;
    const nextPrompt = value || DEFAULT_PROMPT_JSON;
    if (nextPrompt !== getPresetPrompt(settings, key)) {
      settings.schemaPresets[key] = { ...preset, promptJson: nextPrompt };
      updateSettingsDraft(settings);
    }
    return;
  }

  draft.schemaText = value;
  try {
    const schema = parseSchemaEditorText(value);
    setPresetSchemaError(draft, null);
    if (!jsonValuesEqual(schema, preset.value)) {
      settings.schemaPresets[key] = { ...preset, value: schema };
      updateSettingsDraft(settings);
    }
  } catch (error) {
    settingsDraft.markChanged();
    revealUnsavedSettings();
    setPresetSchemaError(draft, (error as Error).message);
  }
}

function expandEditorButton(editor: "schema" | "prompt"): string {
  return `
    <button
      type="button"
      class="scenemap-expand-editor-btn"
      data-action="expand-preset-editor"
      data-editor="${editor}"
      title="Expand editor"
      aria-label="Expand ${editor === "schema" ? "Schema JSON" : "Prompt"} editor"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M15 3h6v6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/><path d="M9 21H3v-6"/>
      </svg>
    </button>
  `;
}

function openPresetExpandedEditor(editor: "schema" | "prompt") {
  const settings = mergeSettings(state.settings);
  const draft = getPresetEditorDraft(settings, settings.schemaPreset);
  const title = editor === "schema" ? "SceneMap Schema JSON" : "SceneMap Prompt";
  const value = editor === "schema" ? draft.schemaText : draft.promptText;
  openTextEditor(title, value, (nextValue) => {
    updatePresetEditorValue(editor, nextValue);
    renderDrawerSettings();
  });
}

function setPresetSchemaError(draft: PresetEditorDraft, message: string | null) {
  draft.schemaError = message;
  const error = rootRef?.querySelector<HTMLElement>("[data-preset-schema-error]");
  if (!error) return;
  error.hidden = !message;
  error.textContent = message ?? "";
}

function applyPresetEditorDraft(settings: SceneMapSettings, key: string): void {
  const draft = presetEditorDrafts.get(key);
  const preset = settings.schemaPresets[key];
  if (!draft || !preset) return;
  try {
    const schema = parseSchemaEditorText(draft.schemaText);
    draft.schemaError = null;
    settings.schemaPresets[key] = {
      ...preset,
      value: schema,
      promptJson: draft.promptText || DEFAULT_PROMPT_JSON,
    };
  } catch (error) {
    draft.schemaError = (error as Error).message;
    throw error;
  }
}

function ensureActivePresetEditorValid(): boolean {
  const settings = mergeSettings(state.settings);
  const key = settings.schemaPreset;
  try {
    applyPresetEditorDraft(settings, key);
    state = { ...state, settings };
    const draft = presetEditorDrafts.get(key);
    if (draft) setPresetSchemaError(draft, null);
    return true;
  } catch {
    const draft = presetEditorDrafts.get(key);
    if (draft) setPresetSchemaError(draft, draft.schemaError);
    return false;
  }
}

function preparePresetDraftsForSave(): boolean {
  const settings = mergeSettings(state.settings);
  for (const key of presetEditorDrafts.keys()) {
    if (!settings.schemaPresets[key]) continue;
    try {
      applyPresetEditorDraft(settings, key);
    } catch {
      settings.schemaPreset = key;
      state = { ...state, settings };
      renderDrawerSettings();
      return false;
    }
  }
  state = { ...state, settings };
  return true;
}

function handleChange(event: Event) {
  const target = event.target as HTMLInputElement | HTMLSelectElement;
  const key = target.dataset.setting;
  if (!isAutomaticallySavedSetting(key)) return;
  updateSettingFromControl(target, key, true);
}

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement | HTMLTextAreaElement;
  if (target.dataset.presetEditor) {
    updatePresetEditorControl(target);
    return;
  }
  const key = target.dataset.setting;
  if (!isAutomaticallySavedSetting(key) || target.type === "checkbox") return;
  updateSettingFromControl(target as HTMLInputElement, key, false);
}

function isAutomaticallySavedSetting(key: string | undefined): key is AutomaticallySavedSetting {
  return key === "connectionId"
    || key === "autoGenerateAiTrackers"
    || key === "autoGenerateInterval"
    || key === "maxResponseTokens"
    || key === "temperature"
    || key === "topP"
    || key === "includeLastXMessages"
    || key === "showInputBarButton"
    || key === "trackerPlacement";
}

function updateSettingFromControl(
  target: HTMLInputElement | HTMLSelectElement,
  key: AutomaticallySavedSetting,
  immediate: boolean,
) {
  const settings = mergeSettings(state.settings);
  if (key === "autoGenerateAiTrackers") {
    settings.autoGenerateAiTrackers = (target as HTMLInputElement).checked;
  } else if (key === "showInputBarButton") {
    settings.showInputBarButton = (target as HTMLInputElement).checked;
  } else if (key === "trackerPlacement") {
    settings.trackerPlacement = target.value === "drawer" ? "drawer" : "dock";
  } else if (key === "autoGenerateInterval") {
    settings.autoGenerateInterval = Math.max(1, Math.floor(Number(target.value) || 1));
  } else if (key === "temperature" || key === "topP") {
    const value = target.value.trim();
    const parsed = Number(value);
    settings[key] = value === "" || !Number.isFinite(parsed) ? null : parsed;
  } else if (key === "maxResponseTokens" || key === "includeLastXMessages") {
    (settings as any)[key] = Math.max(0, Math.floor(Number(target.value) || 0));
  } else {
    (settings as any)[key] = target.value;
  }
  state = { ...state, settings };
  queueAutomaticSettingsSave(settings, key, immediate);
  if (key === "autoGenerateAiTrackers") {
    const intervalField = rootRef?.querySelector<HTMLElement>(".scenemap-interval-field");
    if (intervalField) intervalField.hidden = !settings.autoGenerateAiTrackers;
  }
  if (key === "showInputBarButton") renderChatToolbar();
  if (key === "trackerPlacement") render();
}

function createPreset() {
  const settings = mergeSettings(state.settings);
  const activePreset = settings.schemaPresets[settings.schemaPreset] ?? settings.schemaPresets.default;
  openNameEditor("New Preset", "", "Create preset", (name) => {
    const key = uniquePresetKey(slugifyPresetName(name), settings.schemaPresets);
    settings.schemaPresets[key] = {
      name,
      value: JSON.parse(JSON.stringify(activePreset.value)) as Record<string, unknown>,
      promptJson: getPresetPrompt(settings),
      displayLayout: cloneLayout(getPresetLayout(settings)),
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
    if (name === preset.name) return;
    settings.schemaPresets[key] = { ...preset, name };
    updateSettingsDraft(settings);
    render();
  });
}

async function deletePreset() {
  const settings = mergeSettings(state.settings);
  const key = settings.schemaPreset;
  if (key === "default") return;
  const preset = settings.schemaPresets[key];
  if (!preset || Object.keys(settings.schemaPresets).length <= 1) return;
  const result = await ctxRef?.ui.showConfirm({
    title: "Delete Preset",
    message: `Delete "${preset.name}"?`,
    variant: "danger",
    confirmLabel: "Delete",
  });
  if (!result?.confirmed) return;
  delete settings.schemaPresets[key];
  presetEditorDrafts.delete(key);
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
    layout: getPresetLayout(settings),
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
  const ctx = ctxRef as (SpindleFrontendContext & { uploads?: { pickFile?: (options: Record<string, unknown>) => Promise<Array<{ name: string; bytes: Uint8Array }>> } }) | null;
  if (!ctx?.uploads?.pickFile) {
    showSettingsError("File import is not available in this Lumiverse build.");
    return;
  }
  try {
    const files = await ctx.uploads.pickFile({
      accept: [".json", "application/json"],
      multiple: false,
      maxSizeBytes: 512_000,
    });
    const file = files?.[0];
    if (!file) return;
    const text = new TextDecoder().decode(file.bytes);
    const imported = parsePresetImport(JSON.parse(text), file.name);
    openNameEditor("Import Preset", imported.name, "Import", (name) => {
      const settings = mergeSettings(state.settings);
      const key = uniquePresetKey(slugifyPresetName(name), settings.schemaPresets);
      settings.schemaPresets[key] = {
        name,
        value: imported.schema,
        promptJson: imported.prompt,
        displayLayout: imported.layout,
      };
      settings.schemaPreset = key;
      updateSettingsDraft(settings);
      render();
    });
  } catch (err) {
    showSettingsError((err as Error).message || "Could not import preset.");
  }
}

function parsePresetImport(value: unknown, filename: string): { name: string; schema: Record<string, unknown>; prompt: string; layout: TrackerBoardDisplayLayout } {
  const record = getRecord(value);
  if (record.type !== "scenemap-preset") throw new Error("This is not a SceneMap preset file.");
  const schema = getRecord(record.schema);
  if (Object.keys(schema).length === 0) throw new Error("Preset file is missing a schema object.");
  validateSchemaDefinition(schema);
  if (typeof record.prompt !== "string") throw new Error("Preset file is missing a prompt string.");
  const layout = normalizeImportedLayout(record.layout);
  validateLayout(layout);
  return {
    name: typeof record.name === "string" && record.name.trim() ? record.name.trim() : filename.replace(/\.json$/i, "").replace(/\.scenemap-preset$/i, ""),
    schema,
    prompt: record.prompt,
    layout,
  };
}

function normalizeImportedLayout(value: unknown): TrackerBoardDisplayLayout {
  const record = getRecord(value);
  if (!Array.isArray(record.sections)) throw new Error("Preset file is missing a layout sections array.");
  return {
    sections: record.sections.map((section) => {
      const sectionRecord = getRecord(section);
      if (!Array.isArray(sectionRecord.fields)) throw new Error("Every layout section must include a fields array.");
      return {
        title: typeof sectionRecord.title === "string" ? sectionRecord.title : "",
        fields: sectionRecord.fields.map(normalizeImportedField),
      };
    }),
  };
}

function normalizeImportedField(value: unknown): TrackerBoardField {
  const record = getRecord(value);
  const display = typeof record.display === "string" && isTrackerFieldDisplay(record.display) ? record.display : "text";
  return {
    path: typeof record.path === "string" ? record.path : "",
    label: typeof record.label === "string" ? record.label : undefined,
    display,
    center: record.center === true,
    fields: Array.isArray(record.fields) ? record.fields.map(normalizeImportedField) : undefined,
  };
}

function isTrackerFieldDisplay(value: string): value is TrackerFieldDisplay {
  return ["text", "subtle", "mono", "chips", "progress", "character_cards"].includes(value);
}

function openNameEditor(title: string, initialValue: string, submitLabel: string, onSave: (name: string) => void) {
  const ctx = ctxRef;
  if (!ctx) return;
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
  const input = modal.root.querySelector("[data-name-input]") as HTMLInputElement;
  const error = modal.root.querySelector(".scenemap-inline-error") as HTMLElement;
  input.focus();
  input.select();
  const save = () => {
    const name = input.value.trim();
    if (!name) throw new Error("Preset name is required.");
    onSave(name);
    modal.dismiss();
  };
  modal.root.addEventListener("keydown", (event) => {
    if ((event as KeyboardEvent).key !== "Enter") return;
    try {
      save();
    } catch (err) {
      error.hidden = false;
      error.textContent = (err as Error).message;
    }
  });
  modal.root.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-modal-action]");
    if (!button) return;
    if (button.dataset.modalAction === "cancel") {
      modal.dismiss();
      return;
    }
    try {
      save();
    } catch (err) {
      error.hidden = false;
      error.textContent = (err as Error).message;
    }
  });
}

function slugifyPresetName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "preset";
}

function uniquePresetKey(base: string, presets: Record<string, unknown>): string {
  let key = base;
  let index = 2;
  while (Object.prototype.hasOwnProperty.call(presets, key)) {
    key = `${base}_${index}`;
    index += 1;
  }
  return key;
}

function editLayout() {
  const settings = mergeSettings(state.settings);
  const key = settings.schemaPreset;
  const preset = settings.schemaPresets[key] ?? settings.schemaPresets.default;
  const fieldOptions = extractSchemaFieldOptions(preset.value);
  const originalLayout = cloneLayout(getPresetLayout(settings, key));
  const workingLayout = cloneLayout(originalLayout);
  const ctx = ctxRef;
  if (!ctx) return;

  const modal = ctx.ui.showModal({ title: "SceneMap Layout", width: 860, maxHeight: 760 });
  let layoutSelectHandles: SpindleSelectHandle[] = [];
  let layoutSortables: Sortable[] = [];
  const draw = (preserveScroll = true) => {
    const scroller = modal.root.querySelector(".scenemap-layout-sections") as HTMLElement | null;
    const scrollTop = preserveScroll ? scroller?.scrollTop ?? 0 : 0;
    destroyLayoutSortables(layoutSortables);
    layoutSortables = [];
    destroySelectHandles(layoutSelectHandles);
    layoutSelectHandles = [];
    modal.root.innerHTML = renderLayoutEditor(workingLayout, fieldOptions);
    const nextScroller = modal.root.querySelector(".scenemap-layout-sections") as HTMLElement | null;
    if (nextScroller) nextScroller.scrollTop = scrollTop;
    layoutSelectHandles = mountLayoutSelects(modal.root, workingLayout, fieldOptions, draw);
    layoutSortables = mountLayoutSortables(modal.root, workingLayout, draw);
  };
  modal.onDismiss(() => {
    destroyLayoutSortables(layoutSortables);
    layoutSortables = [];
    destroySelectHandles(layoutSelectHandles);
    layoutSelectHandles = [];
  });
  draw(false);
  modal.root.addEventListener("input", (event) => {
    const target = event.target as HTMLInputElement;
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
      if (field.fields?.[childIndex]) field.fields[childIndex].label = target.value;
    }
  });
  modal.root.addEventListener("change", (event) => {
    const target = event.target as HTMLInputElement;
    const sectionIndex = readIndex(target.dataset.section);
    const fieldIndex = readIndex(target.dataset.field);
    const childIndex = readIndex(target.dataset.child);
    if (sectionIndex === null || fieldIndex === null) return;
    const field = workingLayout.sections[sectionIndex].fields[fieldIndex];
    if (target.dataset.layoutInput === "field-center") {
      field.center = target.checked;
    }
    if (target.dataset.layoutInput === "child-center" && childIndex !== null && field.fields?.[childIndex]) {
      field.fields[childIndex].center = target.checked;
    }
  });
  modal.root.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const handle = (event.target as HTMLElement).closest<HTMLElement>("[data-layout-drag]");
    if (!handle) return;
    const kind = handle.dataset.layoutDrag as LayoutDragKind | undefined;
    if (!kind) return;
    const sectionIndex = readIndex(handle.dataset.section);
    const fieldIndex = readIndex(handle.dataset.field);
    const childIndex = readIndex(handle.dataset.child);
    const currentIndex = kind === "section" ? sectionIndex : kind === "field" ? fieldIndex : childIndex;
    if (currentIndex === null) return;
    const nextIndex = currentIndex + (event.key === "ArrowUp" ? -1 : 1);
    if (!reorderLayoutItem(workingLayout, kind, currentIndex, nextIndex, sectionIndex, fieldIndex)) return;
    event.preventDefault();
    draw();
    focusLayoutDragHandle(modal.root, kind, nextIndex, sectionIndex, fieldIndex);
  });
  modal.root.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-layout-action]");
    if (!button) return;
    const sectionIndex = readIndex(button.dataset.section);
    const fieldIndex = readIndex(button.dataset.field);
    const childIndex = readIndex(button.dataset.child);
    const action = button.dataset.layoutAction;
    try {
      if (action === "add-section") workingLayout.sections.push({ title: "New Section", fields: [] });
      if (action === "remove-section" && sectionIndex !== null) workingLayout.sections.splice(sectionIndex, 1);
      if (action === "add-field" && sectionIndex !== null) {
        workingLayout.sections[sectionIndex].fields.push(createFieldFromOption(getAvailableFieldOptions(workingLayout, fieldOptions)[0]));
      }
      if (action === "remove-field" && sectionIndex !== null && fieldIndex !== null) {
        workingLayout.sections[sectionIndex].fields.splice(fieldIndex, 1);
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
      if (action === "cancel") {
        modal.dismiss();
        return;
      }
      if (action === "save-layout") {
        validateLayout(workingLayout);
        if (jsonValuesEqual(workingLayout, originalLayout)) {
          modal.dismiss();
          return;
        }
        settings.schemaPresets[key] = { ...preset, displayLayout: cloneLayout(workingLayout) };
        updateSettingsDraft(settings);
        render();
        modal.dismiss();
        return;
      }
      draw();
    } catch (err) {
      const error = modal.root.querySelector(".scenemap-inline-error") as HTMLElement | null;
      if (error) {
        error.hidden = false;
        error.textContent = (err as Error).message;
      }
    }
  });
}

type SchemaFieldOption = {
  path: string;
  label: string;
  display: TrackerFieldDisplay;
  children?: SchemaFieldOption[];
};

function renderLayoutEditor(layout: TrackerBoardDisplayLayout, options: SchemaFieldOption[]): string {
  const hasAvailableFields = getAvailableFieldOptions(layout, options).length > 0;
  return `
    <div class="scenemap-layout-editor">
      <div class="scenemap-layout-intro">
        <button type="button" class="scenemap-layout-add-btn" data-layout-action="add-section" ${hasAvailableFields ? "" : "disabled"}>${layoutIcon("plus")}<span>Add section</span></button>
      </div>
      <div class="scenemap-layout-sections" data-layout-sortable="section">
        ${layout.sections.map((section, sectionIndex) => renderLayoutSection(section, sectionIndex, layout, options)).join("")}
      </div>
      <div class="scenemap-modal-actions">
        <span class="scenemap-modal-spacer"></span>
        <button type="button" class="scenemap-pill-action" data-layout-action="cancel">Cancel</button>
        <button type="button" class="scenemap-pill-action scenemap-primary" data-layout-action="save-layout">Save</button>
      </div>
      <div class="scenemap-inline-error" hidden></div>
    </div>
  `;
}

function renderLayoutSection(section: TrackerBoardDisplayLayout["sections"][number], sectionIndex: number, layout: TrackerBoardDisplayLayout, options: SchemaFieldOption[]): string {
  const hasAvailableFields = getAvailableFieldOptions(layout, options).length > 0;
  return `
    <section class="scenemap-layout-section" data-layout-section-item>
      <header class="scenemap-layout-section-header">
        ${layoutDragHandle("section", "Drag to reorder section", { section: sectionIndex })}
        <label>
          <span>Section name</span>
          <input data-layout-input="section-title" data-section="${sectionIndex}" value="${escapeAttr(section.title)}">
        </label>
        <div class="scenemap-layout-actions">
          ${iconButton("remove-section", "Remove section", "trash", { section: sectionIndex })}
        </div>
      </header>
      <div class="scenemap-layout-fields" data-layout-sortable="field" data-section="${sectionIndex}">
        ${section.fields.map((field, fieldIndex) => renderLayoutField(field, sectionIndex, fieldIndex, options)).join("")}
      </div>
      <button type="button" class="scenemap-layout-add-btn" data-layout-action="add-field" data-section="${sectionIndex}" ${hasAvailableFields ? "" : "disabled"}>${layoutIcon("plus")}<span>Add field</span></button>
    </section>
  `;
}

function renderLayoutField(field: TrackerBoardField, sectionIndex: number, fieldIndex: number, options: SchemaFieldOption[]): string {
  const option = findFieldOption(options, field.path);
  const childEditor = field.display === "character_cards"
    ? renderChildFieldEditor(field, option?.children ?? [], sectionIndex, fieldIndex)
    : "";
  return `
    <article class="scenemap-layout-field" data-layout-field-item>
      <div class="scenemap-layout-field-row">
        ${layoutDragHandle("field", "Drag to reorder field", { section: sectionIndex, field: fieldIndex })}
        <div class="scenemap-native-select" data-layout-select="field-path" data-section="${sectionIndex}" data-field="${fieldIndex}"></div>
        <input aria-label="Label" data-layout-input="field-label" data-section="${sectionIndex}" data-field="${fieldIndex}" value="${escapeAttr(field.label ?? option?.label ?? "")}" placeholder="Label">
        <div class="scenemap-native-select" data-layout-select="field-display" data-section="${sectionIndex}" data-field="${fieldIndex}"></div>
        ${iconButton("remove-field", "Remove field", "trash", { section: sectionIndex, field: fieldIndex })}
      </div>
      ${renderChipCenterToggle("field-center", field.center === true, { section: sectionIndex, field: fieldIndex }, field.display === "chips")}
      ${childEditor}
    </article>
  `;
}

function renderChildFieldEditor(field: TrackerBoardField, options: SchemaFieldOption[], sectionIndex: number, fieldIndex: number): string {
  const children = field.fields ?? [];
  const hasAvailableChildren = getAvailableChildOptions(field, options).length > 0;
  return `
    <div class="scenemap-layout-child-box">
      <div class="scenemap-layout-child-header">
        <strong>Card fields</strong>
        <button type="button" class="scenemap-layout-add-btn" data-layout-action="add-child" data-section="${sectionIndex}" data-field="${fieldIndex}" ${hasAvailableChildren ? "" : "disabled"}>${layoutIcon("plus")}<span>Add card field</span></button>
      </div>
      <div class="scenemap-layout-child-list" data-layout-sortable="child" data-section="${sectionIndex}" data-field="${fieldIndex}">
        ${children.map((child, childIndex) => renderChildField(child, childIndex, sectionIndex, fieldIndex)).join("")}
      </div>
    </div>
  `;
}

function renderChildField(child: TrackerBoardField, childIndex: number, sectionIndex: number, fieldIndex: number): string {
  return `
    <div class="scenemap-layout-child" data-layout-child-item>
      <div class="scenemap-layout-child-row">
        ${layoutDragHandle("child", "Drag to reorder card field", { section: sectionIndex, field: fieldIndex, child: childIndex })}
        <div class="scenemap-native-select" data-layout-select="child-path" data-section="${sectionIndex}" data-field="${fieldIndex}" data-child="${childIndex}"></div>
        <input data-layout-input="child-label" data-section="${sectionIndex}" data-field="${fieldIndex}" data-child="${childIndex}" value="${escapeAttr(child.label ?? "")}" placeholder="Label">
        <div class="scenemap-native-select" data-layout-select="child-display" data-section="${sectionIndex}" data-field="${fieldIndex}" data-child="${childIndex}"></div>
        ${iconButton("remove-child", "Remove card field", "trash", { section: sectionIndex, field: fieldIndex, child: childIndex })}
      </div>
      ${renderChipCenterToggle("child-center", child.center === true, { section: sectionIndex, field: fieldIndex, child: childIndex }, child.display === "chips")}
    </div>
  `;
}

function renderChipCenterToggle(input: string, checked: boolean, indexes: { section: number; field: number; child?: number }, visible: boolean): string {
  if (!visible) return "";
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

function getDisplayOptions(allowCards: boolean): Array<{ value: TrackerFieldDisplay; label: string }> {
  const displays: Array<{ value: TrackerFieldDisplay; label: string }> = [
    { value: "text", label: "Text" },
    { value: "subtle", label: "Subtle" },
    { value: "mono", label: "Mono" },
    { value: "chips", label: "Chips" },
    { value: "progress", label: "Progress" },
  ];
  if (allowCards) displays.push({ value: "character_cards", label: "Cards" });
  return displays;
}

function mountLayoutSelects(
  root: HTMLElement,
  layout: TrackerBoardDisplayLayout,
  options: SchemaFieldOption[],
  redraw: (preserveScroll?: boolean) => void,
): SpindleSelectHandle[] {
  const ctx = ctxRef;
  if (!ctx) return [];
  const handles: SpindleSelectHandle[] = [];
  for (const target of root.querySelectorAll<HTMLElement>("[data-layout-select]")) {
    const kind = target.dataset.layoutSelect;
    const sectionIndex = readIndex(target.dataset.section);
    const fieldIndex = readIndex(target.dataset.field);
    const childIndex = readIndex(target.dataset.child);
    if (sectionIndex === null || fieldIndex === null) continue;
    const field = layout.sections[sectionIndex]?.fields[fieldIndex];
    if (!field) continue;

    let value = "";
    let selectOptions: SpindleSelectOption[] = [];
    let ariaLabel = "Layout option";
    let searchable = false;
    if (kind === "field-path") {
      value = field.path;
      ariaLabel = "Field";
      searchable = true;
      selectOptions = getAvailableFieldOptions(layout, options, field.path).map((option) => ({
        value: option.path,
        label: option.label,
        sublabel: option.path,
      }));
    } else if (kind === "field-display") {
      const option = findFieldOption(options, field.path);
      value = field.display ?? option?.display ?? "text";
      ariaLabel = "Display";
      selectOptions = getDisplayOptions(!!option?.children?.length);
    } else if (kind === "child-path" && childIndex !== null) {
      const child = field.fields?.[childIndex];
      if (!child) continue;
      const parentOption = findFieldOption(options, field.path);
      value = child.path;
      ariaLabel = "Card field";
      searchable = true;
      selectOptions = getAvailableChildOptions(field, parentOption?.children ?? [], child.path).map((option) => ({
        value: option.path,
        label: option.label,
        sublabel: option.path,
      }));
    } else if (kind === "child-display" && childIndex !== null) {
      const child = field.fields?.[childIndex];
      if (!child) continue;
      value = child.display ?? "text";
      ariaLabel = "Card field display";
      selectOptions = getDisplayOptions(false);
    } else {
      continue;
    }

    handles.push(ctx.components.mountSelect(target, {
      options: selectOptions,
      value,
      portal: true,
      triggerClassName: "scenemap-secondary-control",
      ariaLabel,
      searchThreshold: searchable ? 8 : Number.MAX_SAFE_INTEGER,
      searchPlaceholder: searchable ? "Search fields..." : undefined,
      onChange: (nextValue) => {
        if (kind === "field-path") {
          const option = findFieldOption(options, nextValue);
          field.path = nextValue;
          field.label = option?.label ?? humanizeTrackerKey(nextValue.split(".").pop() || nextValue);
          field.display = option?.display ?? "text";
          field.fields = option?.children?.slice(0, 4).map((child) => ({
            path: child.path,
            label: child.label,
            display: child.display === "character_cards" ? "text" : child.display,
          }));
        } else if (kind === "field-display") {
          field.display = nextValue as TrackerFieldDisplay;
        } else if (kind === "child-path" && childIndex !== null && field.fields?.[childIndex]) {
          const parentOption = findFieldOption(options, field.path);
          const option = parentOption?.children?.find((child) => child.path === nextValue);
          field.fields[childIndex].path = nextValue;
          field.fields[childIndex].label = option?.label ?? humanizeTrackerKey(nextValue.split(".").pop() || nextValue);
          field.fields[childIndex].display = option?.display === "character_cards" ? "text" : option?.display ?? "text";
        } else if (kind === "child-display" && childIndex !== null && field.fields?.[childIndex]) {
          field.fields[childIndex].display = nextValue as TrackerFieldDisplay;
        }
        queueMicrotask(() => redraw());
      },
    }));
  }
  return handles;
}

type LayoutDragKind = "section" | "field" | "child";

function mountLayoutSortables(
  root: HTMLElement,
  layout: TrackerBoardDisplayLayout,
  redraw: (preserveScroll?: boolean) => void,
): Sortable[] {
  const instances: Sortable[] = [];
  for (const container of root.querySelectorAll<HTMLElement>("[data-layout-sortable]")) {
    const kind = container.dataset.layoutSortable as LayoutDragKind | undefined;
    if (!kind) continue;
    const sectionIndex = readIndex(container.dataset.section);
    const fieldIndex = readIndex(container.dataset.field);
    const draggable = kind === "section"
      ? "> [data-layout-section-item]"
      : kind === "field"
        ? "> [data-layout-field-item]"
        : "> [data-layout-child-item]";
    instances.push(Sortable.create(container, {
      draggable,
      handle: `.scenemap-layout-drag-handle[data-layout-drag="${kind}"]`,
      direction: "vertical",
      animation: 170,
      easing: "cubic-bezier(0.2, 0, 0, 1)",
      delay: 200,
      delayOnTouchOnly: true,
      touchStartThreshold: 5,
      fallbackTolerance: 4,
      forceFallback: true,
      fallbackOnBody: true,
      scroll: true,
      bubbleScroll: true,
      scrollSensitivity: 48,
      scrollSpeed: 12,
      ghostClass: "scenemap-layout-drag-ghost",
      chosenClass: "scenemap-layout-drag-chosen",
      dragClass: "scenemap-layout-drag-active",
      fallbackClass: "scenemap-layout-drag-fallback",
      onStart: (event) => {
        document.body.classList.add("scenemap-layout-is-dragging");
        event.item.querySelector<HTMLElement>(".scenemap-layout-drag-handle")?.setAttribute("aria-grabbed", "true");
      },
      onEnd: (event) => {
        document.body.classList.remove("scenemap-layout-is-dragging");
        event.item.querySelector<HTMLElement>(".scenemap-layout-drag-handle")?.setAttribute("aria-grabbed", "false");
        if (event.oldIndex === undefined || event.newIndex === undefined || event.oldIndex === event.newIndex) return;
        if (!reorderLayoutItem(layout, kind, event.oldIndex, event.newIndex, sectionIndex, fieldIndex)) {
          queueMicrotask(() => redraw());
          return;
        }
        queueMicrotask(() => redraw());
      },
      onUnchoose: () => {
        document.body.classList.remove("scenemap-layout-is-dragging");
      },
    }));
  }
  return instances;
}

function destroyLayoutSortables(instances: Sortable[]) {
  document.body.classList.remove("scenemap-layout-is-dragging");
  for (const instance of instances) instance.destroy();
}

function reorderLayoutItem(
  layout: TrackerBoardDisplayLayout,
  kind: LayoutDragKind,
  from: number,
  to: number,
  sectionIndex: number | null,
  fieldIndex: number | null,
): boolean {
  if (kind === "section") return moveItem(layout.sections, from, to);
  if (sectionIndex === null) return false;
  const section = layout.sections[sectionIndex];
  if (!section) return false;
  if (kind === "field") return moveItem(section.fields, from, to);
  if (fieldIndex === null) return false;
  const children = section.fields[fieldIndex]?.fields;
  return children ? moveItem(children, from, to) : false;
}

function focusLayoutDragHandle(
  root: HTMLElement,
  kind: LayoutDragKind,
  itemIndex: number,
  sectionIndex: number | null,
  fieldIndex: number | null,
) {
  const selector = kind === "section"
    ? `[data-layout-drag="section"][data-section="${itemIndex}"]`
    : kind === "field" && sectionIndex !== null
      ? `[data-layout-drag="field"][data-section="${sectionIndex}"][data-field="${itemIndex}"]`
      : kind === "child" && sectionIndex !== null && fieldIndex !== null
        ? `[data-layout-drag="child"][data-section="${sectionIndex}"][data-field="${fieldIndex}"][data-child="${itemIndex}"]`
        : "";
  if (selector) queueMicrotask(() => root.querySelector<HTMLElement>(selector)?.focus());
}

function extractSchemaFieldOptions(schema: Record<string, unknown>): SchemaFieldOption[] {
  const normalized = normalizeSchemaForLayout(schema, schema);
  const properties = getSchemaProperties(normalized);
  if (!properties) return [];
  return Object.entries(properties).flatMap(([key, value]) => schemaToOptions(value, key, key, schema));
}

const MAX_LAYOUT_SCHEMA_DEPTH = 20;

function schemaToOptions(
  schema: unknown,
  path: string,
  labelSeed: string,
  rootSchema: Record<string, unknown>,
  seenRefs = new Set<string>(),
  depth = 0,
): SchemaFieldOption[] {
  const source = getRecord(schema);
  const ref = typeof source.$ref === "string" && source.$ref.startsWith("#/") ? source.$ref : null;
  if (depth >= MAX_LAYOUT_SCHEMA_DEPTH || (ref && seenRefs.has(ref))) {
    return [{ path, label: schemaLabel(source, labelSeed), display: defaultDisplayForSchema(source, path) }];
  }
  const nextSeenRefs = ref ? new Set(seenRefs).add(ref) : seenRefs;
  const record = normalizeSchemaForLayout(schema, rootSchema, seenRefs);
  const type = record.type;
  if (type === "array") {
    const itemSource = getRecord(record.items);
    const itemRef = typeof itemSource.$ref === "string" && itemSource.$ref.startsWith("#/") ? itemSource.$ref : null;
    if (itemRef && nextSeenRefs.has(itemRef)) {
      return [{ path, label: schemaLabel(record, labelSeed), display: "chips" }];
    }
    const itemSeenRefs = itemRef ? new Set(nextSeenRefs).add(itemRef) : nextSeenRefs;
    const items = normalizeSchemaForLayout(record.items, rootSchema, nextSeenRefs);
    const itemProperties = getSchemaProperties(items);
    if (itemProperties) {
      return [{
        path,
        label: schemaLabel(record, labelSeed),
        display: "character_cards",
        children: Object.entries(itemProperties).flatMap(([key, value]) => schemaToOptions(
          value,
          key,
          key,
          rootSchema,
          itemSeenRefs,
          depth + 1,
        )),
      }];
    }
    return [{ path, label: schemaLabel(record, labelSeed), display: "chips" }];
  }
  const properties = getSchemaProperties(record);
  if (properties) {
    return Object.entries(properties).flatMap(([key, value]) => schemaToOptions(
      value,
      `${path}.${key}`,
      key,
      rootSchema,
      nextSeenRefs,
      depth + 1,
    ));
  }
  return [{ path, label: schemaLabel(record, labelSeed), display: defaultDisplayForSchema(record, path) }];
}

function normalizeSchemaForLayout(
  schema: unknown,
  rootSchema: Record<string, unknown>,
  seenRefs = new Set<string>(),
): Record<string, unknown> {
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

  for (const keyword of ["allOf", "oneOf", "anyOf"] as const) {
    const variants = source[keyword];
    if (!Array.isArray(variants)) continue;
    for (const variant of variants) {
      normalized = mergeLayoutSchemas(normalized, normalizeSchemaForLayout(variant, rootSchema, seenRefs));
    }
  }
  return normalized;
}

function mergeLayoutSchemas(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): Record<string, unknown> {
  const leftProperties = getSchemaProperties(left);
  const rightProperties = getSchemaProperties(right);
  return {
    ...left,
    ...right,
    ...(leftProperties || rightProperties
      ? { properties: { ...(leftProperties ?? {}), ...(rightProperties ?? {}) } }
      : {}),
  };
}

function resolveLocalLayoutRef(rootSchema: Record<string, unknown>, ref: string): unknown {
  let current: unknown = rootSchema;
  for (const token of ref.slice(2).split("/")) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return null;
    const key = token.replaceAll("~1", "/").replaceAll("~0", "~");
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function getSchemaProperties(schema: unknown): Record<string, unknown> | null {
  const record = getRecord(schema);
  return record.properties && typeof record.properties === "object" && !Array.isArray(record.properties)
    ? record.properties as Record<string, unknown>
    : null;
}

function schemaLabel(schema: Record<string, unknown>, fallback: string): string {
  return typeof schema.title === "string" && schema.title.trim()
    ? schema.title.trim()
    : humanizeTrackerKey(fallback.split(".").pop() || fallback);
}

function defaultDisplayForSchema(schema: Record<string, unknown>, path: string): TrackerFieldDisplay {
  if (schema.type === "array") return "chips";
  if (/posture|interaction|notes?|description/i.test(path)) return "mono";
  if (/tone|time|state|hair|makeup/i.test(path)) return "subtle";
  return "text";
}

function findFieldOption(options: SchemaFieldOption[], path: string): SchemaFieldOption | undefined {
  return options.find((option) => option.path === path);
}

function getAvailableFieldOptions(layout: TrackerBoardDisplayLayout, options: SchemaFieldOption[], currentPath?: string): SchemaFieldOption[] {
  const used = new Set<string>();
  for (const section of layout.sections) {
    for (const field of section.fields) {
      if (field.path && field.path !== currentPath) used.add(field.path);
    }
  }
  const available = options.filter((option) => !used.has(option.path));
  if (currentPath && !available.some((option) => option.path === currentPath)) {
    available.unshift({ path: currentPath, label: humanizeTrackerKey(currentPath.split(".").pop() || currentPath), display: "text" });
  }
  return available;
}

function getAvailableChildOptions(parent: TrackerBoardField, options: SchemaFieldOption[], currentPath?: string): SchemaFieldOption[] {
  const used = new Set((parent.fields ?? [])
    .map((field) => field.path)
    .filter((path) => path && path !== currentPath));
  const available = options.filter((option) => !used.has(option.path));
  if (currentPath && !available.some((option) => option.path === currentPath)) {
    available.unshift({ path: currentPath, label: humanizeTrackerKey(currentPath.split(".").pop() || currentPath), display: "text" });
  }
  return available;
}

function createFieldFromOption(option: SchemaFieldOption | undefined, maxChildren = 4): TrackerBoardField {
  if (!option) return { path: "", label: "", display: "text" };
  return {
    path: option.path,
    label: option.label,
    display: option.display,
    fields: option.display === "character_cards"
      ? option.children?.slice(0, maxChildren).map((child) => ({ path: child.path, label: child.label, display: child.display === "character_cards" ? "text" : child.display }))
      : undefined,
  };
}

export function createSchemaDefaultLayout(schema: Record<string, unknown>): TrackerBoardDisplayLayout {
  if (JSON.stringify(schema) === JSON.stringify(DEFAULT_SCHEMA_VALUE)) return cloneLayout(DEFAULT_DISPLAY_LAYOUT);
  const options = extractSchemaFieldOptions(schema);
  const title = typeof schema.title === "string" && schema.title.trim() ? schema.title.trim() : "Scene";
  return {
    sections: [{
      title,
      fields: options.map((option) => createFieldFromOption(option, Number.POSITIVE_INFINITY)),
    }],
  };
}

function cloneLayout(layout: TrackerBoardDisplayLayout): TrackerBoardDisplayLayout {
  return JSON.parse(JSON.stringify(layout)) as TrackerBoardDisplayLayout;
}

function moveItem<T>(items: T[], from: number, to: number): boolean {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) return false;
  const [item] = items.splice(from, 1);
  items.splice(to, 0, item);
  return true;
}

function readIndex(value: string | undefined): number | null {
  if (value === undefined) return null;
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 ? index : null;
}

function validateLayout(layout: TrackerBoardDisplayLayout) {
  if (!layout.sections.length) throw new Error("Add at least one section.");
  for (const section of layout.sections) {
    section.title = section.title.trim();
    section.fields = section.fields.filter((field) => field.path.trim());
    for (const field of section.fields) {
      field.path = field.path.trim();
      if (Object.prototype.hasOwnProperty.call(field, "label")) field.label = field.label?.trim() ?? "";
      field.fields = field.fields?.filter((child) => child.path.trim()).map((child) => ({
        ...child,
        path: child.path.trim(),
        label: Object.prototype.hasOwnProperty.call(child, "label") ? child.label?.trim() ?? "" : undefined,
        center: child.display === "chips" ? child.center === true : undefined,
      }));
      field.center = field.display === "chips" ? field.center === true : undefined;
    }
  }
}

function layoutDragHandle(
  kind: LayoutDragKind,
  label: string,
  indexes: { section: number; field?: number; child?: number },
): string {
  const data = [
    `data-layout-drag="${kind}"`,
    `data-section="${indexes.section}"`,
    indexes.field !== undefined ? `data-field="${indexes.field}"` : "",
    indexes.child !== undefined ? `data-child="${indexes.child}"` : "",
  ].filter(Boolean).join(" ");
  return `<button type="button" class="scenemap-layout-drag-handle" title="${escapeAttr(label)}" aria-label="${escapeAttr(`${label}. Use arrow keys to reorder.`)}" aria-grabbed="false" ${data}>${layoutIcon("grip")}</button>`;
}

function iconButton(action: string, label: string, icon: "trash", options: { section?: number; field?: number; child?: number }): string {
  const data = [
    `data-layout-action="${action}"`,
    options.section !== undefined ? `data-section="${options.section}"` : "",
    options.field !== undefined ? `data-field="${options.field}"` : "",
    options.child !== undefined ? `data-child="${options.child}"` : "",
  ].filter(Boolean).join(" ");
  return `<button type="button" class="scenemap-layout-icon-btn" title="${escapeAttr(label)}" aria-label="${escapeAttr(label)}" ${data}>${layoutIcon(icon)}</button>`;
}

function layoutIcon(name: "plus" | "grip" | "trash"): string {
  const paths: Record<"plus" | "grip" | "trash", string> = {
    plus: `<path d="M12 5v14"/><path d="M5 12h14"/>`,
    grip: `<circle cx="9" cy="5" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="5" r="1" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="9" cy="19" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="19" r="1" fill="currentColor" stroke="none"/>`,
    trash: `<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/><path d="M10 11v5"/><path d="M14 11v5"/>`,
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}

function openJsonEditor(title: string, value: unknown, onSave: (data: unknown) => void) {
  openTextEditor(title, JSON.stringify(value, null, 2), (text) => {
    const data = JSON.parse(text);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("JSON must be an object.");
    onSave(data);
  });
}

function openTextEditor(title: string, value: string, onSave: (value: string) => void) {
  if (Array.from(pendingTextEditors.values()).some((pending) => pending.title === title)) {
    const message = `${title} is already open.`;
    showInlineError(message);
    return;
  }
  const requestId = `editor-${Date.now()}-${++editorRequestSeq}`;
  pendingTextEditors.set(requestId, {
    title,
    onSave,
  });
  send({
    type: "open_text_editor",
    requestId,
    title,
    value,
    placeholder: "",
  });
}

function handleTextEditorResult(payload: any) {
  const requestId = typeof payload.requestId === "string" ? payload.requestId : "";
  const pending = takePendingTextEditor(requestId);
  if (!pending) return;
  if (payload.cancelled) return;
  const text = typeof payload.text === "string" ? payload.text : "";
  try {
    pending.onSave(text);
  } catch (err) {
    showInlineError((err as Error).message);
    openTextEditor(pending.title, text, pending.onSave);
  }
}

function showInlineError(message: string) {
  const trackerRoot = mergeSettings(state.settings).trackerPlacement === "drawer" ? rootRef : dockRootRef;
  prependRuntimeError(trackerRoot, message);
}

function takePendingTextEditor(requestId: string): PendingTextEditor | null {
  const pending = pendingTextEditors.get(requestId) ?? null;
  if (pending) pendingTextEditors.delete(requestId);
  return pending;
}

function prependRuntimeError(root: HTMLElement | null, message: string) {
  if (!root) return;
  const existing = root.querySelector(".scenemap-runtime-error");
  existing?.remove();
  const node = document.createElement("div");
  node.className = "scenemap-runtime-error";
  node.textContent = message;
  root.prepend(node);
}

function showSettingsError(message: string) {
  drawerView = "settings";
  tabHandle?.activate();
  renderDrawerSettings();
  prependRuntimeError(rootRef, message);
}

function renderTracker(value: unknown, layout: TrackerBoardDisplayLayout): string {
  const record = getRecord(value);
  if (Object.keys(record).length === 0) return `<div class="scenemap-empty">Tracker data is empty.</div>`;
  const sections = layout?.sections?.length ? layout.sections : DEFAULT_DISPLAY_LAYOUT.sections;
  const html = sections
    .map((section) => {
      const fields = section.fields.map((field) => renderField(field, record)).filter(Boolean).join("");
      if (!fields) return "";
      const title = section.title?.trim();
      return `<section class="scenemap-section ${title ? "" : "scenemap-section--untitled"}">${title ? `<h3>${escapeHtml(title)}</h3>` : ""}<div>${fields}</div></section>`;
    })
    .filter(Boolean)
    .join("");
  return html || `<div class="scenemap-empty">Tracker data is empty.</div>`;
}

function createTrackerDataLayout(value: unknown): TrackerBoardDisplayLayout {
  const record = getRecord(value);
  return {
    sections: [{
      title: "Tracker",
      fields: Object.entries(record).map(([key, child]) => {
        if (Array.isArray(child) && child.some((item) => item && typeof item === "object" && !Array.isArray(item))) {
          const childKeys = new Set<string>();
          for (const item of child) {
            for (const childKey of Object.keys(getRecord(item))) {
              if (childKey !== "name") childKeys.add(childKey);
            }
          }
          return {
            path: key,
            label: humanizeTrackerKey(key),
            display: "character_cards",
            fields: Array.from(childKeys).map((childKey) => ({
              path: childKey,
              label: humanizeTrackerKey(childKey),
              display: defaultDisplayForSchema({}, childKey),
            })),
          };
        }
        return {
          path: key,
          label: humanizeTrackerKey(key),
          display: Array.isArray(child) ? "chips" : defaultDisplayForSchema({}, key),
        };
      }),
    }],
  };
}

function renderField(field: TrackerBoardField, tracker: unknown): string {
  const value = getValueByPath(tracker, field.path);
  if (!hasRenderableValue(value)) return "";
  const label = getFieldLabel(field);
  const labelMarkup = label ? `<span>${escapeHtml(label)}</span>` : "";
  const display = field.display || "text";
  if (display === "chips") {
    return `<div class="scenemap-field">${labelMarkup}<div class="scenemap-chips ${field.center ? "is-centered" : ""}">${toChips(value).map((item) => `<b>${escapeHtml(item)}</b>`).join("")}</div></div>`;
  }
  if (display === "progress") return renderProgressField(label, field.path, value);
  if (display === "character_cards" && Array.isArray(value)) {
    return `<div class="scenemap-character-grid">${value.map((item, index) => renderCharacterCard(item, index, field.fields ?? [])).join("")}</div>`;
  }
  return `<div class="scenemap-field">${labelMarkup}<p class="${display === "subtle" ? "subtle" : ""} ${display === "mono" ? "mono" : ""}">${escapeHtml(formatDisplayValue(value))}</p></div>`;
}

function getFieldLabel(field: TrackerBoardField): string | null {
  if (Object.prototype.hasOwnProperty.call(field, "label")) {
    const label = field.label?.trim() ?? "";
    return label ? label : null;
  }
  return humanizeTrackerKey(field.path.split(".").pop() || field.path);
}

function renderProgressField(label: string | null, path: string, value: unknown): string {
  const progress = parseProgressValue(value);
  const labelMarkup = label ? `<span>${escapeHtml(label)}</span>` : "";
  if (!progress) return `<div class="scenemap-field">${labelMarkup}<p>${escapeHtml(formatDisplayValue(value))}</p></div>`;
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

function parseProgressValue(value: unknown): { value: number; label: string } | null {
  let numeric: number | null = null;
  if (typeof value === "number" && Number.isFinite(value)) numeric = value;
  if (typeof value === "string") {
    const ratio = value.match(/(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)/);
    if (ratio) {
      const current = Number(ratio[1]);
      const max = Number(ratio[2]);
      if (Number.isFinite(current) && Number.isFinite(max) && max > 0) numeric = (current / max) * 100;
    } else {
      const match = value.match(/-?\d+(?:\.\d+)?/);
      if (match) numeric = Number(match[0]);
    }
  }
  if (numeric === null || !Number.isFinite(numeric)) return null;
  const clamped = Math.max(0, Math.min(100, numeric));
  const rounded = Math.round(clamped);
  return { value: rounded, label: `${rounded}%` };
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
.scenemap-lv { height: 100%; min-height: 0; display: flex; flex-direction: column; overflow: hidden; color: var(--lumiverse-text); }
.scenemap-drawer-root { height: auto; min-height: 100%; overflow: visible; }
.scenemap-dock-resize-handle { background: var(--lumiverse-primary, var(--lumiverse-accent, #8ab4f8)) !important; opacity: .45; z-index: 4 !important; transition: opacity .15s ease; }
.scenemap-dock-resize-handle:hover { opacity: .9; }
.scenemap-dock-resize-horizontal { width: 6px !important; }
.scenemap-dock-resize-vertical { height: 6px !important; }
@media (max-width: 600px) {
  .scenemap-dock-resize-horizontal { width: auto !important; height: 6px !important; }
}
.scenemap-shell { flex: 1 1 auto; display: flex; flex-direction: column; gap: 12px; padding: 14px; min-height: 0; box-sizing: border-box; overflow: hidden; }
.scenemap-header { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 8px; }
.scenemap-header h2 { margin: 0; font-size: 18px; font-weight: 700; }
.scenemap-header p { margin: 3px 0 0; color: var(--lumiverse-text-muted); font-size: 12px; }
.scenemap-status { align-self: center; display: inline-flex; align-items: center; gap: 7px; width: fit-content; max-width: 100%; box-sizing: border-box; margin: -2px 0 0; padding: 6px 10px; border: 1px solid var(--lumiverse-secondary-border, var(--lumiverse-border)); border-radius: var(--lumiverse-radius, 8px); background: var(--lumiverse-secondary, rgba(128, 128, 128, .15)); color: var(--lumiverse-text-muted); font-size: calc(11px * var(--lumiverse-font-scale, 1)); line-height: 1.35; text-align: left; }
.scenemap-status > span:last-child { min-width: 0; overflow-wrap: anywhere; }
.scenemap-status-indicator { width: 6px; height: 6px; flex: 0 0 auto; border-radius: 50%; background: currentColor; box-shadow: 0 0 0 2px color-mix(in srgb, currentColor 14%, transparent); }
.scenemap-status.is-info, .scenemap-status.is-generating { color: var(--lumiverse-primary-text, var(--lumiverse-primary)); border-color: var(--lumiverse-primary-050, var(--lumiverse-primary)); background: var(--lumiverse-primary-010, color-mix(in srgb, var(--lumiverse-primary) 10%, transparent)); }
.scenemap-status.is-warning { color: var(--lumiverse-warning, #f59e0b); border-color: var(--lumiverse-warning-050, color-mix(in srgb, var(--lumiverse-warning) 50%, transparent)); background: var(--lumiverse-warning-015, color-mix(in srgb, var(--lumiverse-warning) 15%, transparent)); }
.scenemap-status.is-success { color: var(--lumiverse-success, #22c55e); border-color: var(--lumiverse-success-050, color-mix(in srgb, var(--lumiverse-success) 50%, transparent)); background: var(--lumiverse-success-015, color-mix(in srgb, var(--lumiverse-success) 15%, transparent)); }
.scenemap-status.is-generating .scenemap-status-indicator { animation: scenemap-status-pulse 1.2s ease-in-out infinite; }
.scenemap-loading-dots span { display: inline-block; animation: scenemap-dot-fade 1.2s ease-in-out infinite; }
.scenemap-loading-dots span:nth-child(2) { animation-delay: .16s; }
.scenemap-loading-dots span:nth-child(3) { animation-delay: .32s; }
[data-spindle-mount="chat_toolbar"]:has(.scenemap-chat-toolbar-root) { display: flex; align-items: center; gap: 2px; }
.scenemap-chat-toolbar-root { display: inline-flex; align-items: center; }
.scenemap-chat-toolbar-btn { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 26px; padding: 0; border: 0; border-radius: var(--lumiverse-radius-sm, 5px); background: transparent; color: var(--lumiverse-text-dim, rgba(230, 230, 240, .4)); cursor: pointer; transition: color .12s ease, background .12s ease; }
.scenemap-chat-toolbar-btn:hover:not(:disabled) { color: var(--lumiverse-text, rgba(230, 230, 240, .92)); background: var(--lumiverse-fill, rgba(255, 255, 255, .06)); }
.scenemap-chat-toolbar-btn.is-attention { color: var(--lumiverse-primary, var(--lumiverse-accent)); background: color-mix(in srgb, var(--lumiverse-primary, var(--lumiverse-accent)) 10%, transparent); }
.scenemap-chat-toolbar-btn.is-generating { color: var(--lumiverse-success, var(--lumiverse-accent)); animation: scenemap-status-pulse 1.8s ease-in-out infinite; }
.scenemap-chat-toolbar-btn.is-generating svg { animation: scenemap-spin .9s linear infinite; }
.scenemap-chat-toolbar-btn:disabled { opacity: .45; cursor: default; }
.scenemap-chat-toolbar-btn svg { width: 14px; height: 14px; }
.scenemap-toolbar, .scenemap-row, .scenemap-modal-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.scenemap-modal-spacer { flex: 1 1 auto; }
.scenemap-card { border: 1px solid var(--lumiverse-border); background: var(--lumiverse-fill-subtle); border-radius: var(--lumiverse-radius, 8px); padding: 12px; }
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
.scenemap-progress-track { height: 7px; border-radius: var(--lumiverse-radius-sm, 5px); overflow: hidden; border: 1px solid color-mix(in srgb, var(--lumiverse-border) 72%, transparent); background: color-mix(in srgb, var(--lumiverse-fill) 72%, transparent); }
.scenemap-progress-track i { display: block; height: 100%; min-width: 2px; border-radius: inherit; background: var(--lumiverse-primary, var(--lumiverse-accent)); box-shadow: 0 0 10px color-mix(in srgb, var(--lumiverse-primary, var(--lumiverse-accent)) 35%, transparent); }
.scenemap-progress-field[data-progress-tone="success"] .scenemap-progress-track i { background: var(--lumiverse-success, var(--lumiverse-primary, var(--lumiverse-accent))); box-shadow: 0 0 10px color-mix(in srgb, var(--lumiverse-success, var(--lumiverse-primary, var(--lumiverse-accent))) 35%, transparent); }
.scenemap-progress-field[data-progress-tone="warning"] .scenemap-progress-track i { background: var(--lumiverse-warning, var(--lumiverse-primary, var(--lumiverse-accent))); box-shadow: 0 0 10px color-mix(in srgb, var(--lumiverse-warning, var(--lumiverse-primary, var(--lumiverse-accent))) 35%, transparent); }
.scenemap-progress-field[data-progress-tone="danger"] .scenemap-progress-track i { background: var(--lumiverse-danger, var(--lumiverse-primary, var(--lumiverse-accent))); box-shadow: 0 0 10px color-mix(in srgb, var(--lumiverse-danger, var(--lumiverse-primary, var(--lumiverse-accent))) 35%, transparent); }
.scenemap-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.scenemap-chips.is-centered { justify-content: center; }
.scenemap-chips b { border: 1px solid var(--lumiverse-primary-020, var(--lumiverse-border)); background: color-mix(in srgb, var(--lumiverse-fill) 82%, var(--lumiverse-primary, var(--lumiverse-accent)) 6%); border-radius: var(--lumiverse-radius, 8px); padding: 4px 8px; font-size: 12px; font-weight: 600; }
.scenemap-character-grid { display: flex; flex-direction: column; gap: 14px; }
.scenemap-character { border: 1px solid var(--lumiverse-primary-020, var(--lumiverse-border)); background: color-mix(in srgb, var(--lumiverse-fill) 82%, var(--lumiverse-primary, var(--lumiverse-accent)) 6%); border-radius: var(--lumiverse-radius, 8px); padding: 10px; }
.scenemap-character h4 { margin: 0 0 10px; color: color-mix(in srgb, var(--lumiverse-text) 72%, var(--lumiverse-primary, var(--lumiverse-accent)) 28%); font-size: 14px; font-weight: 760; }
.scenemap-drawer-scroll { flex: 0 0 auto; min-height: 0; overflow: visible; box-sizing: border-box; padding: 14px; }
.scenemap-drawer-view { min-height: 0; }
.scenemap-drawer-view > .scenemap-shell { flex: none; min-height: 0; overflow: visible; padding: 14px 0 0; }
.scenemap-drawer-view .scenemap-board, .scenemap-drawer-view .scenemap-settings-scroll { flex: none; overflow: visible; }
.scenemap-drawer-view .scenemap-settings-scroll { padding-right: 0; padding-bottom: 0; }
.scenemap-drawer-root > .scenemap-settings-shell { flex: none; overflow: visible; }
.scenemap-drawer-root > .scenemap-settings-shell .scenemap-settings-scroll { flex: none; overflow: visible; }
.scenemap-view-tabs { display: flex; gap: 2px; width: min(100%, 380px); box-sizing: border-box; margin: 0 auto; padding: 3px; border: 1px solid var(--lumiverse-border); border-radius: var(--lumiverse-radius-md, 10px); background: var(--lumiverse-fill-subtle); }
.scenemap-lv .scenemap-view-tabs button { flex: 1 1 0; min-width: 0; padding: 7px 10px; border: 1px solid transparent; border-radius: var(--lumiverse-radius, 8px); background: transparent; color: var(--lumiverse-text-dim); font-size: calc(12px * var(--lumiverse-font-scale, 1)); font-weight: 500; text-align: center; transition: color var(--lumiverse-transition-fast, .15s ease), border-color var(--lumiverse-transition-fast, .15s ease); }
.scenemap-lv .scenemap-view-tabs button:hover:not(:disabled):not(.is-active) { color: var(--lumiverse-text-muted); background: var(--lumiverse-fill-subtle); border-color: transparent; }
.scenemap-lv .scenemap-view-tabs button.is-active, .scenemap-lv .scenemap-view-tabs button.is-active:hover:not(:disabled) { color: var(--lumiverse-primary-text, var(--lumiverse-primary)); background: var(--lumiverse-primary-015, color-mix(in srgb, var(--lumiverse-primary) 15%, transparent)); border-color: var(--lumiverse-primary-050, var(--lumiverse-primary)); box-shadow: var(--lumiverse-shadow-sm); }
.scenemap-settings-shell { gap: 0; }
.scenemap-settings-dirty { flex: 0 0 auto; margin: 0; padding: 0 0 10px; border-bottom: 1px solid var(--lumiverse-border); color: var(--lumiverse-warning, var(--lumiverse-accent)); font-size: 11px; }
.scenemap-settings-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 12px; padding: 12px 8px 12px 0; }
.scenemap-settings-group { border: 1px solid var(--lumiverse-border); background: var(--lumiverse-fill-subtle); border-radius: var(--lumiverse-radius, 8px); padding: 12px; }
.scenemap-settings-group h3 { margin: 0 0 10px; color: var(--lumiverse-accent); font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
.scenemap-settings-shell label { display: flex; flex-direction: column; gap: 5px; margin: 10px 0; font-size: 12px; color: var(--lumiverse-text-muted); }
.scenemap-auto-row { display: flex; flex-direction: column; gap: 9px; border-top: 1px solid var(--lumiverse-border); border-bottom: 1px solid var(--lumiverse-border); padding: 9px 0; margin: 10px 0; }
.scenemap-interval-field[hidden] { display: none; }
.scenemap-sampler-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.scenemap-sampler-row label { margin-top: 0; }
.scenemap-settings-shell .scenemap-switch-row { flex-direction: row; align-items: center; justify-content: space-between; gap: 12px; color: var(--lumiverse-text); margin: 0; min-width: 0; }
.scenemap-interval-field { margin: 0 !important; min-width: 0; }
.scenemap-switch-row input { position: absolute; opacity: 0; pointer-events: none; }
.scenemap-switch { position: relative; width: 32px; height: 18px; flex: 0 0 auto; border-radius: var(--lumiverse-radius-md, 10px); background: var(--lumiverse-fill); border: 1px solid var(--lumiverse-border-hover); transition: background .16s ease, border-color .16s ease; }
.scenemap-switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: var(--lumiverse-text-muted); transition: transform .16s ease, background .16s ease; }
.scenemap-switch-row input:checked + .scenemap-switch { background: var(--lumiverse-primary, var(--lumiverse-accent)); border-color: var(--lumiverse-primary, var(--lumiverse-accent)); }
.scenemap-switch-row input:checked + .scenemap-switch::after { transform: translateX(14px); background: var(--lumiverse-primary-contrast, #fff); }
.scenemap-settings-preset-row label { margin: 0; min-width: 0; }
.scenemap-preset-toolbar { display: flex; align-items: end; gap: 8px; flex-wrap: wrap; }
.scenemap-preset-select { flex: 1 1 220px; }
.scenemap-settings-preset-actions, .scenemap-settings-actions-left { display: flex; flex: 0 1 auto; flex-wrap: wrap; gap: 6px; align-items: center; }
.scenemap-settings-preset-actions .scenemap-pill-action, .scenemap-settings-actions-left .scenemap-pill-action { display: inline-flex; align-items: center; justify-content: center; white-space: nowrap; padding: 5px 9px !important; min-height: 30px; }
.scenemap-preset-editor { display: flex; flex-direction: column; gap: 10px; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--lumiverse-border); }
.scenemap-preset-editor label { display: flex; flex-direction: column; gap: 6px; color: var(--lumiverse-text-muted); font-size: 12px; }
.scenemap-expandable-textarea { position: relative; width: 100%; }
.scenemap-expandable-textarea > textarea { width: 100%; box-sizing: border-box; }
.scenemap-lv .scenemap-expand-editor-btn { position: absolute; top: 5px; right: 5px; z-index: 1; display: flex; align-items: center; justify-content: center; width: var(--lumiverse-btn-icon-sm, 28px); height: var(--lumiverse-btn-icon-sm, 28px); padding: 0; border: 1px solid var(--lumiverse-border); border-radius: var(--lumiverse-radius-sm, 5px); background: var(--lumiverse-bg, #0f0d15); color: var(--lumiverse-text-dim); cursor: pointer; opacity: 0; transition: all var(--lumiverse-transition-fast, .15s ease); }
.scenemap-expandable-textarea:hover .scenemap-expand-editor-btn, .scenemap-expandable-textarea:focus-within .scenemap-expand-editor-btn { opacity: 1; }
.scenemap-lv .scenemap-expand-editor-btn:hover:not(:disabled) { color: var(--lumiverse-primary); border-color: var(--lumiverse-primary); background: var(--lumiverse-bg, #0f0d15); }
.scenemap-preset-editor textarea { width: 100%; min-height: 180px; box-sizing: border-box; resize: vertical; border: 1px solid var(--lumiverse-border); border-radius: var(--lumiverse-radius, 8px); background: var(--lumiverse-secondary, rgba(128, 128, 128, .15)); color: var(--lumiverse-text); padding: 10px 11px; font: 12px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; }
.scenemap-preset-editor textarea[data-preset-editor="prompt"] { min-height: 150px; font-family: inherit; }
.scenemap-preset-editor textarea:focus { outline: none; border-color: var(--lumiverse-primary, var(--lumiverse-accent)); box-shadow: 0 0 0 1px var(--lumiverse-primary-020, transparent); }
.scenemap-preset-schema-error { margin-top: -4px; }
.scenemap-preset-layout-row { display: flex; justify-content: flex-end; gap: 8px; }
.scenemap-preset-layout-row .scenemap-primary { min-width: 112px; }
.scenemap-settings-shell input:not([type="checkbox"]), .scenemap-editor textarea, .scenemap-layout-editor input, .scenemap-name-editor input {
  width: 100%; box-sizing: border-box; border: 1px solid var(--lumiverse-border); border-radius: var(--lumiverse-radius-sm, 5px);
  background: var(--lumiverse-secondary, rgba(128, 128, 128, .15)); color: var(--lumiverse-text); padding: 7px 9px; font: inherit;
}
.scenemap-native-select { width: 100%; min-width: 0; }
.scenemap-secondary-control { background: var(--lumiverse-secondary, rgba(128, 128, 128, .15)) !important; }
body:has(.scenemap-secondary-control[aria-expanded="true"]) > [role="listbox"] {
  background:
    linear-gradient(var(--lumiverse-secondary, rgba(128, 128, 128, .15)), var(--lumiverse-secondary, rgba(128, 128, 128, .15))),
    linear-gradient(var(--lumiverse-bg, rgba(28, 24, 38, .95)), var(--lumiverse-bg, rgba(28, 24, 38, .95))),
    var(--lumiverse-bg-deep, #0a0812) !important;
}
body:has([data-spindle-modal] .scenemap-layout-editor) > [role="listbox"] { z-index: 10004 !important; }
.scenemap-editor { display: flex; flex-direction: column; gap: 10px; }
.scenemap-name-editor { display: flex; flex-direction: column; gap: 12px; color: var(--lumiverse-text); }
.scenemap-name-editor label { display: flex; flex-direction: column; gap: 5px; color: var(--lumiverse-text-muted); font-size: 12px; }
.scenemap-editor textarea { min-height: min(58vh, 520px); resize: vertical; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; }
.scenemap-layout-editor { display: flex; flex-direction: column; gap: 12px; color: var(--lumiverse-text); }
.scenemap-layout-intro { display: flex; align-items: center; gap: 12px; justify-content: space-between; }
.scenemap-layout-sections { display: flex; flex-direction: column; gap: 12px; max-height: min(58vh, 520px); overflow: auto; padding-right: 4px; }
.scenemap-layout-section { border: 1px solid var(--lumiverse-border); background: var(--lumiverse-fill-subtle); border-radius: var(--lumiverse-radius, 8px); padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.scenemap-layout-section-header { display: grid; grid-template-columns: auto minmax(180px, 1fr) auto; gap: 8px; align-items: end; }
.scenemap-layout-section label, .scenemap-layout-field label { display: flex; flex-direction: column; gap: 5px; color: var(--lumiverse-text-muted); font-size: 12px; }
.scenemap-layout-section label.scenemap-layout-check-row, .scenemap-layout-field label.scenemap-layout-check-row { display: inline-flex; flex-direction: row; align-items: center; gap: 7px; margin: 0; }
.scenemap-layout-check-row input { width: auto !important; margin: 0; }
.scenemap-layout-fields { display: flex; flex-direction: column; gap: 7px; }
.scenemap-layout-field { display: flex; flex-direction: column; gap: 8px; }
.scenemap-layout-field-row { display: grid; grid-template-columns: auto minmax(120px, 1fr) minmax(110px, .8fr) minmax(96px, .6fr) auto; gap: 6px; align-items: center; }
.scenemap-layout-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }
.scenemap-layout-actions button, .scenemap-layout-child-row button { padding: 5px 8px; font-size: 12px; }
.scenemap-layout-icon-btn { width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; padding: 0; }
.scenemap-layout-icon-btn svg { width: 18px; height: 18px; }
.scenemap-layout-add-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.scenemap-layout-child-box { border-top: 1px solid var(--lumiverse-border); padding-top: 9px; display: flex; flex-direction: column; gap: 7px; }
.scenemap-layout-child-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.scenemap-layout-child-header strong { font-size: 12px; color: var(--lumiverse-text-muted); text-transform: uppercase; }
.scenemap-layout-child-list { display: flex; flex-direction: column; gap: 7px; }
.scenemap-layout-child { display: flex; flex-direction: column; gap: 7px; }
.scenemap-layout-child-row { display: grid; grid-template-columns: auto minmax(120px, 1fr) minmax(110px, .8fr) minmax(96px, .6fr) auto; gap: 6px; align-items: center; }
.scenemap-layout-editor .scenemap-layout-drag-handle, .scenemap-layout-drag-fallback .scenemap-layout-drag-handle { width: 36px; height: 36px; min-width: 36px; display: inline-flex; align-items: center; justify-content: center; align-self: end; padding: 0; color: var(--lumiverse-text-dim); cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none; }
.scenemap-layout-drag-handle svg { width: 18px; height: 18px; pointer-events: none; }
.scenemap-layout-editor .scenemap-layout-drag-handle:hover, .scenemap-layout-editor .scenemap-layout-drag-handle:focus-visible { color: var(--lumiverse-primary, var(--lumiverse-accent)); border-color: var(--lumiverse-primary, var(--lumiverse-accent)); }
.scenemap-layout-editor .scenemap-layout-drag-handle[aria-grabbed="true"] { cursor: grabbing; color: var(--lumiverse-primary, var(--lumiverse-accent)); border-color: var(--lumiverse-primary, var(--lumiverse-accent)); }
.scenemap-layout-drag-ghost { opacity: .24 !important; }
.scenemap-layout-drag-chosen { border-color: var(--lumiverse-primary-050, var(--lumiverse-primary, var(--lumiverse-accent))) !important; }
.scenemap-layout-drag-active, .scenemap-layout-drag-fallback { opacity: .96 !important; box-shadow: 0 12px 30px rgba(0, 0, 0, .28); }
.scenemap-layout-drag-fallback { pointer-events: none !important; z-index: 10020 !important; }
.scenemap-layout-drag-fallback input:not([type="checkbox"]) { width: 100%; box-sizing: border-box; border: 1px solid var(--lumiverse-border); border-radius: var(--lumiverse-radius-sm, 5px); background: var(--lumiverse-secondary, rgba(128, 128, 128, .15)); color: var(--lumiverse-text); padding: 7px 9px; font: inherit; }
.scenemap-layout-drag-fallback button { border: 1px solid var(--lumiverse-border); background: var(--lumiverse-fill); color: var(--lumiverse-text); border-radius: var(--lumiverse-radius-sm, 5px); font: inherit; }
body.scenemap-layout-is-dragging, body.scenemap-layout-is-dragging * { cursor: grabbing !important; user-select: none !important; -webkit-user-select: none !important; }
.scenemap-lv button, .scenemap-editor button, .scenemap-layout-editor button, .scenemap-name-editor button { border: 1px solid var(--lumiverse-border); background: var(--lumiverse-fill); color: var(--lumiverse-text); border-radius: var(--lumiverse-radius-sm, 5px); padding: 7px 10px; cursor: pointer; font: inherit; }
.scenemap-lv button:hover:not(:disabled), .scenemap-editor button:hover:not(:disabled), .scenemap-layout-editor button:hover:not(:disabled), .scenemap-name-editor button:hover:not(:disabled) { border-color: var(--lumiverse-border-hover); }
.scenemap-lv button:disabled, .scenemap-editor button:disabled, .scenemap-layout-editor button:disabled, .scenemap-name-editor button:disabled { opacity: 0.45; cursor: default; }
.scenemap-lv .scenemap-primary, .scenemap-editor .scenemap-primary, .scenemap-layout-editor .scenemap-primary, .scenemap-name-editor .scenemap-primary { background: var(--lumiverse-primary-015, color-mix(in srgb, var(--lumiverse-primary, var(--lumiverse-accent)) 15%, transparent)); color: var(--lumiverse-primary-text, var(--lumiverse-primary, var(--lumiverse-accent))); border-color: var(--lumiverse-primary-050, var(--lumiverse-primary, var(--lumiverse-accent))); }
.scenemap-lv .scenemap-primary:hover:not(:disabled), .scenemap-editor .scenemap-primary:hover:not(:disabled), .scenemap-layout-editor .scenemap-primary:hover:not(:disabled), .scenemap-name-editor .scenemap-primary:hover:not(:disabled) { background: var(--lumiverse-primary-020, color-mix(in srgb, var(--lumiverse-primary, var(--lumiverse-accent)) 22%, transparent)); border-color: var(--lumiverse-primary, var(--lumiverse-accent)); }
.scenemap-lv .scenemap-danger, .scenemap-editor .scenemap-danger, .scenemap-layout-editor .scenemap-danger, .scenemap-name-editor .scenemap-danger { background: var(--lumiverse-danger-015, rgba(239, 68, 68, .15)); color: var(--lumiverse-danger, #ef4444); border-color: var(--lumiverse-danger-050, rgba(239, 68, 68, .5)); }
.scenemap-lv .scenemap-danger:hover:not(:disabled), .scenemap-editor .scenemap-danger:hover:not(:disabled), .scenemap-layout-editor .scenemap-danger:hover:not(:disabled), .scenemap-name-editor .scenemap-danger:hover:not(:disabled) { background: var(--lumiverse-danger-020, rgba(239, 68, 68, .2)); border-color: var(--lumiverse-danger, #ef4444); }
.scenemap-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; }
.scenemap-pill-action { border-radius: var(--lumiverse-radius, 8px) !important; padding: 7px 13px !important; min-height: 34px; }
.scenemap-tracker-action { min-height: 30px; padding: 5px 10px !important; font-size: calc(12px * var(--lumiverse-font-scale, 1)); }
.scenemap-runtime-error, .scenemap-inline-error { border: 1px solid rgba(255, 100, 100, 0.45); color: #ffb8b8; background: rgba(120, 0, 0, 0.18); border-radius: var(--lumiverse-radius, 8px); padding: 10px; font-size: 12px; }
@media (max-width: 760px) {
  .scenemap-layout-section-header { grid-template-columns: 44px minmax(0, 1fr) 44px; align-items: end; }
  .scenemap-layout-section-header .scenemap-layout-actions { grid-column: 3; }
  .scenemap-layout-field-row, .scenemap-layout-child-row { grid-template-columns: 44px minmax(0, 1fr) 44px; align-items: center; }
  .scenemap-layout-editor .scenemap-layout-drag-handle { width: 44px; height: 44px; min-width: 44px; grid-column: 1; grid-row: 1; }
  .scenemap-layout-field-row > [data-layout-select="field-path"],
  .scenemap-layout-child-row > [data-layout-select="child-path"] { grid-column: 2; grid-row: 1; }
  .scenemap-layout-field-row > .scenemap-layout-icon-btn,
  .scenemap-layout-child-row > .scenemap-layout-icon-btn { grid-column: 3; grid-row: 1; width: 44px; height: 44px; }
  .scenemap-layout-field-row > input,
  .scenemap-layout-child-row > input { grid-column: 1 / -1; grid-row: 2; }
  .scenemap-layout-field-row > [data-layout-select="field-display"],
  .scenemap-layout-child-row > [data-layout-select="child-display"] { grid-column: 1 / -1; grid-row: 3; }
  .scenemap-settings-actions-left { justify-content: flex-start; }
  .scenemap-layout-actions { justify-content: flex-end; }
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
