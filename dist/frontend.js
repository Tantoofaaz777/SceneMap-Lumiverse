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
  temperature: null,
  topP: null,
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
    temperature: typeof currentValue.temperature === "number" && Number.isFinite(currentValue.temperature) ? currentValue.temperature : base.temperature,
    topP: typeof currentValue.topP === "number" && Number.isFinite(currentValue.topP) ? currentValue.topP : base.topP,
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
function jsonValuesEqual(left, right) {
  if (Object.is(left, right))
    return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => jsonValuesEqual(value, right[index]));
  }
  if (!left || !right || typeof left !== "object" || typeof right !== "object")
    return false;
  const leftRecord = left;
  const rightRecord = right;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => Object.prototype.hasOwnProperty.call(rightRecord, key) && jsonValuesEqual(leftRecord[key], rightRecord[key]));
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

// src/schema-form.ts
var SUPPORTED_TYPES = new Set(["string", "integer", "number", "boolean", "object", "array"]);

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
var dockRootRef = null;
var toolbarRootRef = null;
var tabHandle = null;
var dockPanelHandle = null;
var dockResizeObserver = null;
var dockPanelSize = 380;
var dockResizeDrag = null;
var dockPanelCreatedAt = 0;
var dockPanelError = null;
var isRefreshingState = false;
var isGenerationRequestPending = false;
var editorRequestSeq = 0;
var settingsSaveRequestSeq = 0;
var drawerSelectHandles = [];
var automaticSaveTimer = null;
var pendingAutomaticSettings = {};
var presetEditorDrafts = new Map;
var pendingTextEditors = new Map;
var settingsDraft = new SettingsDraftTracker;
var iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z"/><path d="M9 3v15"/><path d="M15 6v15"/></svg>`;
var settingsSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`;
function setup(ctx) {
  settingsDraft.reset();
  pendingAutomaticSettings = {};
  if (automaticSaveTimer)
    clearTimeout(automaticSaveTimer);
  automaticSaveTimer = null;
  dockPanelSize = readStoredDockPanelSize();
  ctxRef = ctx;
  const removeStyle = ctx.dom.addStyle(styles);
  const tab = ctx.ui.registerDrawerTab({
    id: "scenemap",
    title: "SceneMap Settings",
    shortName: "Map",
    headerTitle: "SceneMap Settings",
    description: "Configure the SceneMap dock panel",
    keywords: ["tracker", "scene", "map", "json", "settings"],
    iconSvg
  });
  tabHandle = tab;
  rootRef = tab.root;
  rootRef.classList.add("scenemap-lv");
  ensureDockPanel();
  const offTabActivate = tab.onActivate(() => {
    ensureDockPanel();
    renderDrawerSettings();
  });
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
        const acknowledged = settingsDraft.acknowledge(payload.settingsSaveRequestId);
        if (acknowledged && !settingsDraft.dirty)
          presetEditorDrafts.clear();
      }
      state = settingsDraft.dirty ? { ...incomingState, settings: state.settings } : incomingState;
      render();
      return;
    }
    if (payload?.type === "error") {
      isRefreshingState = false;
      isGenerationRequestPending = false;
      const saveFailed = typeof payload.requestId === "string" && settingsDraft.fail(payload.requestId);
      renderDrawerSettings();
      renderDockPanel();
      renderChatToolbar();
      if (saveFailed) {
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
  toolbarRoot.addEventListener("click", handleClick);
  requestState();
  return () => {
    flushAutomaticSettingsSave();
    rootRef?.removeEventListener("click", handleClick);
    rootRef?.removeEventListener("change", handleChange);
    rootRef?.removeEventListener("input", handleInput);
    dockRootRef?.removeEventListener("click", handleClick);
    removeDockResizeListeners(dockRootRef);
    toolbarRoot.removeEventListener("click", handleClick);
    offBackend();
    for (const off of offEvents)
      off();
    offTabActivate();
    destroySelectHandles(drawerSelectHandles);
    drawerSelectHandles = [];
    tab.destroy();
    dockPanelHandle?.destroy();
    dockResizeObserver?.disconnect();
    removeStyle();
    ctx.dom.cleanup();
    ctxRef = null;
    rootRef = null;
    dockRootRef = null;
    toolbarRootRef = null;
    tabHandle = null;
    dockPanelHandle = null;
    dockResizeObserver = null;
    dockResizeDrag = null;
    dockPanelCreatedAt = 0;
    dockPanelError = null;
    isGenerationRequestPending = false;
    settingsDraft.reset();
    presetEditorDrafts.clear();
    pendingAutomaticSettings = {};
  };
}
function ensureDockPanel() {
  const ctx = ctxRef;
  if (!ctx)
    return;
  if (dockRootRef && dockPanelHandle && (dockRootRef.isConnected || Date.now() - dockPanelCreatedAt < 1000))
    return;
  dockRootRef?.removeEventListener("click", handleClick);
  removeDockResizeListeners(dockRootRef);
  dockPanelHandle?.destroy();
  let panel;
  try {
    panel = ctx.ui.requestDockPanel({
      edge: "right",
      title: "SceneMap",
      size: dockPanelSize,
      minSize: 300,
      maxSize: 620,
      resizable: true,
      startCollapsed: false
    });
  } catch (error) {
    dockPanelHandle = null;
    dockRootRef = null;
    dockPanelError = `Could not open the SceneMap panel: ${error.message}`;
    return;
  }
  dockPanelHandle = panel;
  dockPanelCreatedAt = Date.now();
  dockPanelError = null;
  dockRootRef = panel.root;
  dockRootRef.classList.add("scenemap-lv", "scenemap-dock-root");
  dockRootRef.addEventListener("click", handleClick);
  addDockResizeListeners(dockRootRef);
  renderDockPanel();
  watchDockResizeHandle();
}
function watchDockResizeHandle() {
  dockResizeObserver?.disconnect();
  let observedHost = null;
  const decorate = () => {
    const root = dockRootRef;
    if (!root?.isConnected)
      return null;
    const host2 = findDockPanelHost(root);
    if (!host2)
      return null;
    const rootRect = root.getBoundingClientRect();
    const isSideDock = rootRect.height >= window.innerHeight * 0.6;
    const fallbackEdge = isSideDock ? rootRect.left < window.innerWidth - rootRect.right ? "right" : "left" : rootRect.top < window.innerHeight - rootRect.bottom ? "bottom" : "top";
    setDockResizeIndicatorEdge(root, fallbackEdge);
    applyDockPanelSize(root, fallbackEdge, dockPanelSize, host2);
    for (let ancestor = root.parentElement;ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
      for (const child of ancestor.children) {
        if (!(child instanceof HTMLElement) || child.contains(root))
          continue;
        const cursor = getComputedStyle(child).cursor;
        if (cursor !== "ew-resize" && cursor !== "ns-resize")
          continue;
        child.classList.add("scenemap-dock-resize-handle");
        child.classList.toggle("scenemap-dock-resize-horizontal", cursor === "ew-resize");
        child.classList.toggle("scenemap-dock-resize-vertical", cursor === "ns-resize");
        const handleRect = child.getBoundingClientRect();
        const edge = cursor === "ew-resize" ? handleRect.left + handleRect.width / 2 < rootRect.left + rootRect.width / 2 ? "left" : "right" : handleRect.top + handleRect.height / 2 < rootRect.top + rootRect.height / 2 ? "top" : "bottom";
        setDockResizeIndicatorEdge(root, edge);
        applyDockPanelSize(root, edge, dockPanelSize, host2);
        return host2;
      }
    }
    return host2;
  };
  dockResizeObserver = new MutationObserver((records) => {
    const root = dockRootRef;
    if (root?.isConnected && records.every((record) => root.contains(record.target)))
      return;
    const host2 = decorate();
    if (host2 && host2 !== observedHost) {
      observedHost = host2;
      dockResizeObserver?.disconnect();
      dockResizeObserver?.observe(host2, { childList: true, subtree: true });
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
function setDockResizeIndicatorEdge(root, edge) {
  root.classList.remove("scenemap-dock-resize-edge-left", "scenemap-dock-resize-edge-right", "scenemap-dock-resize-edge-top", "scenemap-dock-resize-edge-bottom");
  root.classList.add(`scenemap-dock-resize-edge-${edge}`);
}
function getDockResizeIndicatorEdge(root) {
  if (root.classList.contains("scenemap-dock-resize-edge-left"))
    return "left";
  if (root.classList.contains("scenemap-dock-resize-edge-right"))
    return "right";
  if (root.classList.contains("scenemap-dock-resize-edge-top"))
    return "top";
  if (root.classList.contains("scenemap-dock-resize-edge-bottom"))
    return "bottom";
  return null;
}
function findDockPanelHost(root) {
  for (let ancestor = root.parentElement;ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
    if (getComputedStyle(ancestor).position === "fixed")
      return ancestor;
  }
  return null;
}
function applyDockPanelSize(root, edge, size, host = findDockPanelHost(root), appRoot = root.closest("[data-app-root]")) {
  if (!host)
    return;
  if (edge === "left" || edge === "right")
    host.style.width = `${size}px`;
  else
    host.style.height = `${size}px`;
  if (!appRoot)
    return;
  const insetProperty = edge === "right" ? "--spindle-dock-left" : edge === "left" ? "--spindle-dock-right" : edge === "bottom" ? "--spindle-dock-top" : "--spindle-dock-bottom";
  appRoot.style.setProperty(insetProperty, `${size}px`);
}
function addDockResizeListeners(root) {
  root.addEventListener("pointerdown", handleDockResizePointerDown);
  root.addEventListener("pointermove", handleDockResizePointerMove);
  root.addEventListener("pointerup", handleDockResizePointerEnd);
  root.addEventListener("pointercancel", handleDockResizePointerEnd);
}
function removeDockResizeListeners(root) {
  if (!root)
    return;
  const drag = dockResizeDrag;
  if (drag?.root === root) {
    if (drag.animationFrame !== null)
      cancelAnimationFrame(drag.animationFrame);
    drag.host.style.transition = drag.previousTransition;
    dockResizeDrag = null;
  }
  root.removeEventListener("pointerdown", handleDockResizePointerDown);
  root.removeEventListener("pointermove", handleDockResizePointerMove);
  root.removeEventListener("pointerup", handleDockResizePointerEnd);
  root.removeEventListener("pointercancel", handleDockResizePointerEnd);
}
function handleDockResizePointerDown(event) {
  if (event.button !== 0 || !(event.currentTarget instanceof HTMLElement))
    return;
  const root = event.currentTarget;
  const edge = getDockResizeIndicatorEdge(root);
  if (!edge)
    return;
  const rect = root.getBoundingClientRect();
  const distance = edge === "left" ? Math.abs(event.clientX - rect.left) : edge === "right" ? Math.abs(event.clientX - rect.right) : edge === "top" ? Math.abs(event.clientY - rect.top) : Math.abs(event.clientY - rect.bottom);
  if (distance > 8)
    return;
  const host = findDockPanelHost(root);
  if (!host)
    return;
  const hostRect = host.getBoundingClientRect();
  dockResizeDrag = {
    root,
    host,
    edge,
    pointerId: event.pointerId,
    startPosition: edge === "left" || edge === "right" ? event.clientX : event.clientY,
    startSize: edge === "left" || edge === "right" ? hostRect.width : hostRect.height,
    latestPosition: edge === "left" || edge === "right" ? event.clientX : event.clientY,
    animationFrame: null,
    appRoot: root.closest("[data-app-root]"),
    previousTransition: host.style.transition
  };
  host.style.transition = "none";
  root.setPointerCapture(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
}
function handleDockResizePointerMove(event) {
  const drag = dockResizeDrag;
  if (!drag || event.pointerId !== drag.pointerId)
    return;
  drag.latestPosition = drag.edge === "left" || drag.edge === "right" ? event.clientX : event.clientY;
  if (drag.animationFrame === null) {
    drag.animationFrame = requestAnimationFrame(() => {
      if (dockResizeDrag !== drag)
        return;
      drag.animationFrame = null;
      applyDockResizePosition(drag);
    });
  }
  event.preventDefault();
}
function applyDockResizePosition(drag) {
  const position = drag.latestPosition;
  const delta = position - drag.startPosition;
  const directionalDelta = drag.edge === "left" || drag.edge === "top" ? -delta : delta;
  dockPanelSize = Math.max(300, Math.min(620, Math.round(drag.startSize + directionalDelta)));
  applyDockPanelSize(drag.root, drag.edge, dockPanelSize, drag.host, drag.appRoot);
}
function handleDockResizePointerEnd(event) {
  const drag = dockResizeDrag;
  if (!drag || event.pointerId !== drag.pointerId)
    return;
  drag.latestPosition = drag.edge === "left" || drag.edge === "right" ? event.clientX : event.clientY;
  if (drag.animationFrame !== null)
    cancelAnimationFrame(drag.animationFrame);
  applyDockResizePosition(drag);
  dockResizeDrag = null;
  drag.host.style.transition = drag.previousTransition;
  if (drag.root.hasPointerCapture(event.pointerId))
    drag.root.releasePointerCapture(event.pointerId);
  storeDockPanelSize(dockPanelSize);
  event.preventDefault();
}
function readStoredDockPanelSize() {
  try {
    const value = Number(localStorage.getItem("scenemap:dock-panel-size"));
    if (Number.isFinite(value) && value >= 300 && value <= 620)
      return Math.round(value);
  } catch {}
  return 380;
}
function storeDockPanelSize(size) {
  try {
    localStorage.setItem("scenemap:dock-panel-size", String(size));
  } catch {}
}
function send(payload) {
  ctxRef?.sendToBackend(payload);
}
function requestState(showRefresh = false) {
  if (showRefresh) {
    isRefreshingState = true;
    renderDockPanel();
  }
  send({ type: "get_state" });
}
function render() {
  renderDockPanel();
  renderDrawerSettings();
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
function renderDockPanel() {
  if (!dockRootRef)
    return;
  const settings = mergeSettings(state.settings);
  const layout = getPresetLayout(settings, state.effectivePresetKey);
  const latest = state.latest;
  dockRootRef.innerHTML = `
    <div class="scenemap-shell">
      <header class="scenemap-header">
        <button class="scenemap-pill-action scenemap-primary" data-action="generate" ${state.activeMessageId && !isGenerationRequestPending ? "" : "disabled"}>
          ${state.generatingMessageId || isGenerationRequestPending ? "Cancel" : latest ? "Regenerate" : "Generate"}
        </button>
        <button class="scenemap-pill-action" data-action="edit" ${latest ? "" : "disabled"}>Edit</button>
        <button class="scenemap-pill-action scenemap-danger" data-action="delete" ${latest ? "" : "disabled"}>Delete</button>
        <button class="scenemap-pill-action scenemap-pill-icon ${isRefreshingState ? "is-refreshing" : ""}" data-action="refresh" title="Refresh">${refreshSvg()}</button>
        <button class="scenemap-pill-action scenemap-pill-icon ${settingsDraft.dirty ? "has-unsaved-settings" : ""}" data-action="open-settings" title="Settings" aria-label="Open SceneMap settings">${settingsSvg}</button>
      </header>

      <p class="scenemap-status ${state.generatingMessageId ? "is-generating" : ""}">${statusMarkup()}</p>

      <section class="scenemap-card scenemap-board">
        ${latest ? renderTracker(latest.displayData ?? latest.data, layout) : `<div class="scenemap-empty">Generate a SceneMap for this swipe</div>`}
      </section>
    </div>
  `;
}
function renderDrawerSettings() {
  if (!rootRef)
    return;
  destroySelectHandles(drawerSelectHandles);
  drawerSelectHandles = [];
  const settings = mergeSettings(state.settings);
  const presetKeys = Object.keys(settings.schemaPresets);
  const canDeletePreset = settings.schemaPreset !== "default" && presetKeys.length > 1;
  const activePreset = settings.schemaPresets[settings.schemaPreset] ?? settings.schemaPresets.default;
  const presetDraft = getPresetEditorDraft(settings, settings.schemaPreset);
  rootRef.innerHTML = `
    <div class="scenemap-shell scenemap-settings-shell">
      <p class="scenemap-settings-dirty" data-settings-dirty ${settingsDraft.dirty ? "" : "hidden"}>Unsaved preset changes</p>
      ${dockPanelError ? `<div class="scenemap-runtime-error">${escapeHtml(dockPanelError)}</div>` : ""}
      <section class="scenemap-settings-scroll">
        <div class="scenemap-settings-group">
          <h3>Generation <span class="scenemap-settings-save-mode">Auto-save</span></h3>
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
        <label class="scenemap-interval-field">
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
          <h3>Interface <span class="scenemap-settings-save-mode">Auto-save</span></h3>
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
              <textarea data-preset-editor="schema" spellcheck="false" aria-label="Schema JSON for ${escapeAttr(activePreset.name)}">${escapeHtml(presetDraft.schemaText)}</textarea>
            </label>
            <div class="scenemap-inline-error scenemap-preset-schema-error" data-preset-schema-error ${presetDraft.schemaError ? "" : "hidden"}>${escapeHtml(presetDraft.schemaError ?? "")}</div>
            <label>
              <span>Prompt</span>
              <textarea data-preset-editor="prompt" aria-label="Prompt for ${escapeAttr(activePreset.name)}" placeholder="Write the SceneMap generation prompt. Macros like {{schema}} are supported.">${escapeHtml(presetDraft.promptText)}</textarea>
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
  mountSettingsSelects(settings);
}
function mountSettingsSelects(settings) {
  if (!ctxRef || !rootRef)
    return;
  const mount = (key, options, value, extra = {}) => {
    const target = rootRef?.querySelector(`[data-native-setting="${key}"]`);
    if (!target || !ctxRef)
      return;
    drawerSelectHandles.push(ctxRef.components.mountSelect(target, {
      options,
      value,
      portal: true,
      ariaLabel: key === "connectionId" ? "Connection" : key === "schemaPreset" ? "Global preset" : "Include last messages",
      onChange: (nextValue) => updateNativeSetting(key, nextValue),
      ...extra
    }));
  };
  mount("connectionId", state.connections.map((connection) => ({
    value: connection.id,
    label: connection.name,
    sublabel: `${connection.model || connection.provider}${connection.is_default ? " · default" : ""}`
  })), settings.connectionId, {
    placeholder: "Default active connection",
    clearable: true,
    clearLabel: "Default active connection",
    searchPlaceholder: "Search connections..."
  });
  mount("includeLastXMessages", [
    { value: "0", label: "All messages up to target" },
    ...Array.from({ length: 20 }, (_, index) => ({ value: String(index + 1), label: `Last ${index + 1}` }))
  ], String(settings.includeLastXMessages), { searchThreshold: Number.MAX_SAFE_INTEGER });
  mount("schemaPreset", Object.entries(settings.schemaPresets).map(([key, preset]) => ({ value: key, label: preset.name })), settings.schemaPreset, { searchPlaceholder: "Search presets..." });
}
function updateNativeSetting(key, value) {
  const settings = mergeSettings(state.settings);
  if (key === "includeLastXMessages")
    settings.includeLastXMessages = Math.max(0, Math.floor(Number(value) || 0));
  else
    settings[key] = value;
  if (key === "schemaPreset") {
    updateSettingsDraft(settings);
    queueMicrotask(() => render());
    return;
  }
  state = { ...state, settings };
  queueAutomaticSettingsSave(settings, key, true);
}
function queueAutomaticSettingsSave(settings, key, immediate) {
  pendingAutomaticSettings[key] = settings[key];
  if (automaticSaveTimer)
    clearTimeout(automaticSaveTimer);
  automaticSaveTimer = null;
  if (immediate) {
    flushAutomaticSettingsSave();
    return;
  }
  automaticSaveTimer = setTimeout(flushAutomaticSettingsSave, 450);
}
function flushAutomaticSettingsSave() {
  if (automaticSaveTimer)
    clearTimeout(automaticSaveTimer);
  automaticSaveTimer = null;
  if (Object.keys(pendingAutomaticSettings).length === 0)
    return;
  const settings = pendingAutomaticSettings;
  pendingAutomaticSettings = {};
  send({ type: "save_automatic_settings", settings });
}
function destroySelectHandles(handles) {
  for (const handle of handles)
    handle.destroy();
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
  if (action === "open-settings") {
    tabHandle?.activate();
    renderDrawerSettings();
  }
  if (action === "refresh")
    requestState(true);
  if (action === "generate") {
    if (isGenerationRequestPending)
      return;
    ensureDockPanel();
    dockPanelHandle?.expand();
    isGenerationRequestPending = true;
    renderDockPanel();
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
  if (action === "create-preset" && ensureActivePresetEditorValid())
    createPreset();
  if (action === "rename-preset")
    renamePreset();
  if (action === "import-preset")
    importPreset();
  if (action === "export-preset" && ensureActivePresetEditorValid())
    exportPreset();
  if (action === "delete-preset")
    deletePreset();
  if (action === "edit-layout" && ensureActivePresetEditorValid())
    editLayout();
  if (action === "save-preset") {
    flushAutomaticSettingsSave();
    if (!preparePresetDraftsForSave())
      return;
    const requestId = `settings-${Date.now()}-${++settingsSaveRequestSeq}`;
    if (!settingsDraft.beginSave(requestId))
      return;
    renderDrawerSettings();
    send({ type: "save_preset_settings", requestId, settings: state.settings });
  }
}
function updateSettingsDraft(settings) {
  settingsDraft.markChanged();
  state = { ...state, settings };
  revealUnsavedSettings();
}
function revealUnsavedSettings() {
  const indicator = rootRef?.querySelector("[data-settings-dirty]");
  if (indicator)
    indicator.hidden = false;
  dockRootRef?.querySelector('[data-action="open-settings"]')?.classList.add("has-unsaved-settings");
}
function getPresetEditorDraft(settings, key) {
  const existing = presetEditorDrafts.get(key);
  if (existing)
    return existing;
  const preset = settings.schemaPresets[key] ?? settings.schemaPresets.default;
  const draft = {
    schemaText: JSON.stringify(preset.value, null, 2),
    promptText: getPresetPrompt(settings, key),
    schemaError: null
  };
  presetEditorDrafts.set(key, draft);
  return draft;
}
function parseSchemaEditorText(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON: ${error.message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Schema JSON must be an object.");
  }
  return parsed;
}
function updatePresetEditorControl(target) {
  const settings = mergeSettings(state.settings);
  const key = settings.schemaPreset;
  const preset = settings.schemaPresets[key] ?? settings.schemaPresets.default;
  const draft = getPresetEditorDraft(settings, key);
  if (target.dataset.presetEditor === "prompt") {
    draft.promptText = target.value;
    const nextPrompt = target.value || DEFAULT_PROMPT_JSON;
    if (nextPrompt !== getPresetPrompt(settings, key)) {
      settings.schemaPresets[key] = { ...preset, promptJson: nextPrompt };
      updateSettingsDraft(settings);
    }
    return;
  }
  draft.schemaText = target.value;
  try {
    const schema = parseSchemaEditorText(target.value);
    setPresetSchemaError(draft, null);
    if (!jsonValuesEqual(schema, preset.value)) {
      settings.schemaPresets[key] = { ...preset, value: schema };
      updateSettingsDraft(settings);
    }
  } catch (error) {
    settingsDraft.markChanged();
    revealUnsavedSettings();
    setPresetSchemaError(draft, error.message);
  }
}
function setPresetSchemaError(draft, message) {
  draft.schemaError = message;
  const error = rootRef?.querySelector("[data-preset-schema-error]");
  if (!error)
    return;
  error.hidden = !message;
  error.textContent = message ?? "";
}
function applyPresetEditorDraft(settings, key) {
  const draft = presetEditorDrafts.get(key);
  const preset = settings.schemaPresets[key];
  if (!draft || !preset)
    return;
  try {
    const schema = parseSchemaEditorText(draft.schemaText);
    draft.schemaError = null;
    settings.schemaPresets[key] = {
      ...preset,
      value: schema,
      promptJson: draft.promptText || DEFAULT_PROMPT_JSON
    };
  } catch (error) {
    draft.schemaError = error.message;
    throw error;
  }
}
function ensureActivePresetEditorValid() {
  const settings = mergeSettings(state.settings);
  const key = settings.schemaPreset;
  try {
    applyPresetEditorDraft(settings, key);
    state = { ...state, settings };
    const draft = presetEditorDrafts.get(key);
    if (draft)
      setPresetSchemaError(draft, null);
    return true;
  } catch {
    const draft = presetEditorDrafts.get(key);
    if (draft)
      setPresetSchemaError(draft, draft.schemaError);
    return false;
  }
}
function preparePresetDraftsForSave() {
  const settings = mergeSettings(state.settings);
  for (const key of presetEditorDrafts.keys()) {
    if (!settings.schemaPresets[key])
      continue;
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
function handleChange(event) {
  const target = event.target;
  const key = target.dataset.setting;
  if (!isAutomaticallySavedSetting(key))
    return;
  updateSettingFromControl(target, key, true);
}
function handleInput(event) {
  const target = event.target;
  if (target.dataset.presetEditor) {
    updatePresetEditorControl(target);
    return;
  }
  const key = target.dataset.setting;
  if (!isAutomaticallySavedSetting(key) || target.type === "checkbox")
    return;
  updateSettingFromControl(target, key, false);
}
function isAutomaticallySavedSetting(key) {
  return key === "connectionId" || key === "autoGenerateAiTrackers" || key === "autoGenerateInterval" || key === "maxResponseTokens" || key === "temperature" || key === "topP" || key === "includeLastXMessages" || key === "showInputBarButton";
}
function updateSettingFromControl(target, key, immediate) {
  const settings = mergeSettings(state.settings);
  if (key === "autoGenerateAiTrackers") {
    settings.autoGenerateAiTrackers = target.checked;
  } else if (key === "showInputBarButton") {
    settings.showInputBarButton = target.checked;
  } else if (key === "autoGenerateInterval") {
    settings.autoGenerateInterval = Math.max(1, Math.floor(Number(target.value) || 1));
  } else if (key === "temperature" || key === "topP") {
    const value = target.value.trim();
    const parsed = Number(value);
    settings[key] = value === "" || !Number.isFinite(parsed) ? null : parsed;
  } else if (key === "maxResponseTokens" || key === "includeLastXMessages") {
    settings[key] = Math.max(0, Math.floor(Number(target.value) || 0));
  } else {
    settings[key] = target.value;
  }
  state = { ...state, settings };
  queueAutomaticSettingsSave(settings, key, immediate);
  if (key === "showInputBarButton")
    renderChatToolbar();
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
    if (name === preset.name)
      return;
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
function editLayout() {
  const settings = mergeSettings(state.settings);
  const key = settings.schemaPreset;
  const preset = settings.schemaPresets[key] ?? settings.schemaPresets.default;
  const fieldOptions = extractSchemaFieldOptions(preset.value);
  const originalLayout = cloneLayout(getPresetLayout(settings, key));
  const workingLayout = cloneLayout(originalLayout);
  const ctx = ctxRef;
  if (!ctx)
    return;
  const modal = ctx.ui.showModal({ title: "SceneMap Layout", width: 860, maxHeight: 760 });
  let layoutSelectHandles = [];
  const draw = (preserveScroll = true) => {
    const scroller = modal.root.querySelector(".scenemap-layout-sections");
    const scrollTop = preserveScroll ? scroller?.scrollTop ?? 0 : 0;
    destroySelectHandles(layoutSelectHandles);
    layoutSelectHandles = [];
    modal.root.innerHTML = renderLayoutEditor(workingLayout, fieldOptions);
    const nextScroller = modal.root.querySelector(".scenemap-layout-sections");
    if (nextScroller)
      nextScroller.scrollTop = scrollTop;
    layoutSelectHandles = mountLayoutSelects(modal.root, workingLayout, fieldOptions, draw);
  };
  modal.onDismiss(() => {
    destroySelectHandles(layoutSelectHandles);
    layoutSelectHandles = [];
  });
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
    if (target.dataset.layoutInput === "field-center") {
      field.center = target.checked;
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
  const childEditor = field.display === "character_cards" ? renderChildFieldEditor(field, option?.children ?? [], sectionIndex, fieldIndex) : "";
  return `
    <article class="scenemap-layout-field">
      <div class="scenemap-layout-field-row">
        <div class="scenemap-native-select" data-layout-select="field-path" data-section="${sectionIndex}" data-field="${fieldIndex}"></div>
        <input aria-label="Label" data-layout-input="field-label" data-section="${sectionIndex}" data-field="${fieldIndex}" value="${escapeAttr(field.label ?? option?.label ?? "")}" placeholder="Label">
        <div class="scenemap-native-select" data-layout-select="field-display" data-section="${sectionIndex}" data-field="${fieldIndex}"></div>
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
  return `
    <div class="scenemap-layout-child-row">
      <div class="scenemap-native-select" data-layout-select="child-path" data-section="${sectionIndex}" data-field="${fieldIndex}" data-child="${childIndex}"></div>
      <input data-layout-input="child-label" data-section="${sectionIndex}" data-field="${fieldIndex}" data-child="${childIndex}" value="${escapeAttr(child.label ?? "")}" placeholder="Label">
      <div class="scenemap-native-select" data-layout-select="child-display" data-section="${sectionIndex}" data-field="${fieldIndex}" data-child="${childIndex}"></div>
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
function getDisplayOptions(allowCards) {
  const displays = [
    { value: "text", label: "Text" },
    { value: "subtle", label: "Subtle" },
    { value: "mono", label: "Mono" },
    { value: "chips", label: "Chips" },
    { value: "progress", label: "Progress" }
  ];
  if (allowCards)
    displays.push({ value: "character_cards", label: "Cards" });
  return displays;
}
function mountLayoutSelects(root, layout, options, redraw) {
  const ctx = ctxRef;
  if (!ctx)
    return [];
  const handles = [];
  for (const target of root.querySelectorAll("[data-layout-select]")) {
    const kind = target.dataset.layoutSelect;
    const sectionIndex = readIndex(target.dataset.section);
    const fieldIndex = readIndex(target.dataset.field);
    const childIndex = readIndex(target.dataset.child);
    if (sectionIndex === null || fieldIndex === null)
      continue;
    const field = layout.sections[sectionIndex]?.fields[fieldIndex];
    if (!field)
      continue;
    let value = "";
    let selectOptions = [];
    let ariaLabel = "Layout option";
    let searchable = false;
    if (kind === "field-path") {
      value = field.path;
      ariaLabel = "Field";
      searchable = true;
      selectOptions = getAvailableFieldOptions(layout, options, field.path).map((option) => ({
        value: option.path,
        label: option.label,
        sublabel: option.path
      }));
    } else if (kind === "field-display") {
      const option = findFieldOption(options, field.path);
      value = field.display ?? option?.display ?? "text";
      ariaLabel = "Display";
      selectOptions = getDisplayOptions(!!option?.children?.length);
    } else if (kind === "child-path" && childIndex !== null) {
      const child = field.fields?.[childIndex];
      if (!child)
        continue;
      const parentOption = findFieldOption(options, field.path);
      value = child.path;
      ariaLabel = "Card field";
      searchable = true;
      selectOptions = getAvailableChildOptions(field, parentOption?.children ?? [], child.path).map((option) => ({
        value: option.path,
        label: option.label,
        sublabel: option.path
      }));
    } else if (kind === "child-display" && childIndex !== null) {
      const child = field.fields?.[childIndex];
      if (!child)
        continue;
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
            display: child.display === "character_cards" ? "text" : child.display
          }));
        } else if (kind === "field-display") {
          field.display = nextValue;
        } else if (kind === "child-path" && childIndex !== null && field.fields?.[childIndex]) {
          const parentOption = findFieldOption(options, field.path);
          const option = parentOption?.children?.find((child) => child.path === nextValue);
          field.fields[childIndex].path = nextValue;
          field.fields[childIndex].label = option?.label ?? humanizeTrackerKey(nextValue.split(".").pop() || nextValue);
          field.fields[childIndex].display = option?.display === "character_cards" ? "text" : option?.display ?? "text";
        } else if (kind === "child-display" && childIndex !== null && field.fields?.[childIndex]) {
          field.fields[childIndex].display = nextValue;
        }
        queueMicrotask(() => redraw());
      }
    }));
  }
  return handles;
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
  prependRuntimeError(dockRootRef, message);
}
function prependRuntimeError(root, message) {
  if (!root)
    return;
  const existing = root.querySelector(".scenemap-runtime-error");
  existing?.remove();
  const node = document.createElement("div");
  node.className = "scenemap-runtime-error";
  node.textContent = message;
  root.prepend(node);
}
function showSettingsError(message) {
  tabHandle?.activate();
  renderDrawerSettings();
  prependRuntimeError(rootRef, message);
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
.scenemap-dock-root { position: relative; }
.scenemap-dock-root::after { content: ""; position: absolute; z-index: 5; pointer-events: auto; touch-action: none; box-sizing: border-box; opacity: .62; transition: opacity .15s ease; }
.scenemap-dock-root::after:hover { opacity: 1; }
.scenemap-dock-resize-edge-left::after, .scenemap-dock-resize-edge-right::after { top: 0; bottom: 0; width: 6px; cursor: ew-resize; }
.scenemap-dock-resize-edge-left::after { left: 0; border-left: 2px solid var(--lumiverse-primary, var(--lumiverse-accent, #8ab4f8)); }
.scenemap-dock-resize-edge-right::after { right: 0; border-right: 2px solid var(--lumiverse-primary, var(--lumiverse-accent, #8ab4f8)); }
.scenemap-dock-resize-edge-top::after, .scenemap-dock-resize-edge-bottom::after { left: 0; right: 0; height: 6px; cursor: ns-resize; }
.scenemap-dock-resize-edge-top::after { top: 0; border-top: 2px solid var(--lumiverse-primary, var(--lumiverse-accent, #8ab4f8)); }
.scenemap-dock-resize-edge-bottom::after { bottom: 0; border-bottom: 2px solid var(--lumiverse-primary, var(--lumiverse-accent, #8ab4f8)); }
.scenemap-dock-resize-handle { background: transparent !important; z-index: 4 !important; }
.scenemap-dock-resize-horizontal { width: 4px !important; }
.scenemap-dock-resize-vertical { height: 4px !important; }
@media (max-width: 600px) {
  .scenemap-dock-resize-horizontal { width: auto !important; height: 4px !important; }
}
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
.scenemap-settings-shell { gap: 0; }
.scenemap-settings-dirty { flex: 0 0 auto; margin: 0; padding: 0 0 10px; border-bottom: 1px solid var(--lumiverse-border); color: var(--lumiverse-warning, var(--lumiverse-accent)); font-size: 11px; }
.scenemap-settings-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 12px; padding: 12px 8px 12px 0; }
.scenemap-settings-group { border: 1px solid var(--lumiverse-border); background: var(--lumiverse-fill-subtle); border-radius: 8px; padding: 12px; }
.scenemap-settings-group h3 { margin: 0 0 10px; color: var(--lumiverse-accent); font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
.scenemap-settings-save-mode { margin-left: 6px; color: var(--lumiverse-text-muted); font-size: 9px; font-weight: 650; letter-spacing: .04em; }
.scenemap-settings-shell label { display: flex; flex-direction: column; gap: 5px; margin: 10px 0; font-size: 12px; color: var(--lumiverse-text-muted); }
.scenemap-auto-row { display: flex; flex-direction: column; gap: 9px; border-top: 1px solid var(--lumiverse-border); border-bottom: 1px solid var(--lumiverse-border); padding: 9px 0; margin: 10px 0; }
.scenemap-sampler-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.scenemap-sampler-row label { margin-top: 0; }
.scenemap-settings-shell .scenemap-switch-row { flex-direction: row; align-items: center; justify-content: space-between; gap: 12px; color: var(--lumiverse-text); margin: 0; min-width: 0; }
.scenemap-interval-field { margin: 0 !important; min-width: 0; }
.scenemap-switch-row input { position: absolute; opacity: 0; pointer-events: none; }
.scenemap-switch { position: relative; width: 32px; height: 18px; flex: 0 0 auto; border-radius: 999px; background: var(--lumiverse-fill); border: 1px solid var(--lumiverse-border-hover); transition: background .16s ease, border-color .16s ease; }
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
.scenemap-preset-editor textarea { width: 100%; min-height: 180px; box-sizing: border-box; resize: vertical; border: 1px solid var(--lumiverse-border); border-radius: 8px; background: var(--lumiverse-fill); color: var(--lumiverse-text); padding: 10px 11px; font: 12px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; }
.scenemap-preset-editor textarea[data-preset-editor="prompt"] { min-height: 150px; font-family: inherit; }
.scenemap-preset-editor textarea:focus { outline: none; border-color: var(--lumiverse-primary, var(--lumiverse-accent)); box-shadow: 0 0 0 1px var(--lumiverse-primary-020, transparent); }
.scenemap-preset-schema-error { margin-top: -4px; }
.scenemap-preset-layout-row { display: flex; justify-content: flex-end; gap: 8px; }
.scenemap-preset-layout-row .scenemap-primary { min-width: 112px; }
.scenemap-settings-shell input:not([type="checkbox"]), .scenemap-editor textarea, .scenemap-layout-editor input, .scenemap-name-editor input, .scenemap-schema-editor input:not([type="checkbox"]), .scenemap-schema-editor textarea {
  width: 100%; box-sizing: border-box; border: 1px solid var(--lumiverse-border); border-radius: 6px;
  background: var(--lumiverse-fill); color: var(--lumiverse-text); padding: 7px 9px; font: inherit;
}
.scenemap-native-select { width: 100%; min-width: 0; }
body:has([data-spindle-modal] .scenemap-layout-editor) > [role="listbox"] { z-index: 10004 !important; }
body:has([data-spindle-modal] .scenemap-schema-editor) > [role="listbox"] { z-index: 10004 !important; }
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
.scenemap-schema-editor { display: flex; flex-direction: column; gap: 12px; color: var(--lumiverse-text); min-height: 0; }
.scenemap-schema-topbar, .scenemap-schema-fields-heading, .scenemap-schema-subheading { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.scenemap-schema-topbar p, .scenemap-schema-unsupported p { margin: 0; color: var(--lumiverse-text-muted); font-size: 12px; }
.scenemap-schema-meta { display: grid; grid-template-columns: minmax(160px, .7fr) minmax(240px, 1.3fr); gap: 8px 12px; padding: 12px; border: 1px solid var(--lumiverse-border); border-radius: 8px; background: var(--lumiverse-fill-subtle); }
.scenemap-schema-editor label { display: flex; flex-direction: column; gap: 5px; min-width: 0; color: var(--lumiverse-text-muted); font-size: 11px; }
.scenemap-schema-meta .scenemap-schema-check { grid-column: 1 / -1; }
.scenemap-schema-fields { display: flex; flex-direction: column; gap: 10px; max-height: min(58vh, 560px); overflow: auto; padding-right: 6px; }
.scenemap-schema-fields-heading { position: sticky; top: 0; z-index: 2; padding: 6px 0; background: var(--lumiverse-bg); }
.scenemap-schema-fields-heading strong, .scenemap-schema-subheading strong { font-size: 11px; color: var(--lumiverse-accent); letter-spacing: .08em; text-transform: uppercase; }
.scenemap-schema-field { display: flex; flex-direction: column; gap: 9px; padding: 11px; border: 1px solid var(--lumiverse-border); border-radius: 8px; background: color-mix(in srgb, var(--lumiverse-fill-subtle) 88%, var(--lumiverse-primary, var(--lumiverse-accent)) 3%); }
.scenemap-schema-field-head { display: grid; grid-template-columns: minmax(130px, 1fr) minmax(140px, .7fr) auto; align-items: end; gap: 8px; }
.scenemap-schema-field-actions { display: flex; gap: 5px; align-items: center; }
.scenemap-schema-field textarea { resize: vertical; min-height: 48px; }
.scenemap-schema-flags { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.scenemap-schema-check { display: inline-flex !important; flex-direction: row !important; align-items: center; gap: 7px !important; color: var(--lumiverse-text) !important; cursor: pointer; }
.scenemap-schema-check input { width: auto; margin: 0; accent-color: var(--lumiverse-primary, var(--lumiverse-accent)); }
.scenemap-schema-advanced-badge { padding: 3px 7px; border: 1px solid var(--lumiverse-border); border-radius: 999px; color: var(--lumiverse-text-muted); font-size: 10px; }
.scenemap-schema-number-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.scenemap-schema-object, .scenemap-schema-array { display: flex; flex-direction: column; gap: 8px; padding: 9px; border-left: 2px solid var(--lumiverse-primary-020, var(--lumiverse-border)); background: color-mix(in srgb, var(--lumiverse-fill) 60%, transparent); border-radius: 0 7px 7px 0; }
.scenemap-schema-subheading > .scenemap-native-select { max-width: 220px; }
.scenemap-schema-children { display: flex; flex-direction: column; gap: 8px; }
.scenemap-schema-warning { padding: 10px; border: 1px solid color-mix(in srgb, var(--lumiverse-warning, #f59e0b) 45%, transparent); border-radius: 8px; color: var(--lumiverse-warning, #f59e0b); background: color-mix(in srgb, var(--lumiverse-warning, #f59e0b) 8%, transparent); font-size: 12px; }
.scenemap-lv button, .scenemap-editor button, .scenemap-layout-editor button, .scenemap-name-editor button, .scenemap-schema-editor button { border: 1px solid var(--lumiverse-border); background: var(--lumiverse-fill); color: var(--lumiverse-text); border-radius: 6px; padding: 7px 10px; cursor: pointer; font: inherit; }
.scenemap-lv button:hover:not(:disabled), .scenemap-editor button:hover:not(:disabled), .scenemap-layout-editor button:hover:not(:disabled), .scenemap-name-editor button:hover:not(:disabled), .scenemap-schema-editor button:hover:not(:disabled) { border-color: var(--lumiverse-border-hover); }
.scenemap-lv button:disabled, .scenemap-editor button:disabled, .scenemap-layout-editor button:disabled, .scenemap-name-editor button:disabled, .scenemap-schema-editor button:disabled { opacity: 0.45; cursor: default; }
.scenemap-lv .scenemap-primary, .scenemap-editor .scenemap-primary, .scenemap-layout-editor .scenemap-primary, .scenemap-name-editor .scenemap-primary, .scenemap-schema-editor .scenemap-primary { background: var(--lumiverse-primary-015, color-mix(in srgb, var(--lumiverse-primary, var(--lumiverse-accent)) 15%, transparent)); color: var(--lumiverse-primary-text, var(--lumiverse-primary, var(--lumiverse-accent))); border-color: var(--lumiverse-primary-050, var(--lumiverse-primary, var(--lumiverse-accent))); }
.scenemap-lv .scenemap-primary:hover:not(:disabled), .scenemap-editor .scenemap-primary:hover:not(:disabled), .scenemap-layout-editor .scenemap-primary:hover:not(:disabled), .scenemap-name-editor .scenemap-primary:hover:not(:disabled), .scenemap-schema-editor .scenemap-primary:hover:not(:disabled) { background: var(--lumiverse-primary-020, color-mix(in srgb, var(--lumiverse-primary, var(--lumiverse-accent)) 22%, transparent)); border-color: var(--lumiverse-primary, var(--lumiverse-accent)); }
.scenemap-lv .scenemap-danger, .scenemap-editor .scenemap-danger, .scenemap-layout-editor .scenemap-danger, .scenemap-name-editor .scenemap-danger, .scenemap-schema-editor .scenemap-danger { background: var(--lumiverse-danger-015, rgba(239, 68, 68, .15)); color: var(--lumiverse-danger, #ef4444); border-color: var(--lumiverse-danger-050, rgba(239, 68, 68, .5)); }
.scenemap-lv .scenemap-danger:hover:not(:disabled), .scenemap-editor .scenemap-danger:hover:not(:disabled), .scenemap-layout-editor .scenemap-danger:hover:not(:disabled), .scenemap-name-editor .scenemap-danger:hover:not(:disabled), .scenemap-schema-editor .scenemap-danger:hover:not(:disabled) { background: var(--lumiverse-danger-020, rgba(239, 68, 68, .2)); border-color: var(--lumiverse-danger, #ef4444); }
.scenemap-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; }
.scenemap-pill-action { border-radius: 999px !important; padding: 7px 13px !important; min-height: 34px; }
.scenemap-pill-icon { width: 34px; min-width: 34px; padding: 0 !important; display: inline-flex; align-items: center; justify-content: center; }
.scenemap-pill-icon.is-refreshing svg { animation: scenemap-spin .9s linear infinite; }
.scenemap-pill-icon.has-unsaved-settings { position: relative; }
.scenemap-pill-icon.has-unsaved-settings::after { content: ""; position: absolute; top: 2px; right: 2px; width: 6px; height: 6px; border-radius: 50%; background: var(--lumiverse-warning, var(--lumiverse-accent)); box-shadow: 0 0 0 2px var(--lumiverse-bg, #11131d); }
.scenemap-runtime-error, .scenemap-inline-error { border: 1px solid rgba(255, 100, 100, 0.45); color: #ffb8b8; background: rgba(120, 0, 0, 0.18); border-radius: 8px; padding: 10px; font-size: 12px; }
@media (max-width: 760px) {
  .scenemap-schema-meta, .scenemap-schema-field-head { grid-template-columns: 1fr; }
  .scenemap-schema-field-actions { justify-content: flex-start; }
  .scenemap-schema-topbar, .scenemap-schema-subheading { align-items: stretch; flex-direction: column; }
  .scenemap-schema-subheading > .scenemap-native-select { max-width: none; }
  .scenemap-layout-section-header { grid-template-columns: 1fr; align-items: stretch; }
  .scenemap-layout-field-row, .scenemap-layout-child-row { grid-template-columns: repeat(3, 36px) 1fr; align-items: center; }
  .scenemap-layout-field-row > [data-layout-select]:nth-child(1),
  .scenemap-layout-field-row > input:nth-child(2),
  .scenemap-layout-field-row > [data-layout-select]:nth-child(3),
  .scenemap-layout-child-row > [data-layout-select]:nth-child(1),
  .scenemap-layout-child-row > input:nth-child(2),
  .scenemap-layout-child-row > [data-layout-select]:nth-child(3) { grid-column: 1 / -1; }
  .scenemap-settings-actions-left { justify-content: flex-start; }
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
