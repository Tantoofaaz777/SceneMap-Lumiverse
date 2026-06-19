export const EXTENSION_KEY = "SceneMap";
export const SETTINGS_PATH = "settings.json";
export const CHAT_METADATA_KEY = "scenemap";
export const MESSAGE_METADATA_KEY = "scenemap";

export type TrackerFieldDisplay = "text" | "subtle" | "mono" | "chips" | "character_cards";

export interface TrackerBoardField {
  path: string;
  label?: string;
  display?: TrackerFieldDisplay;
  fields?: TrackerBoardField[];
}

export interface TrackerBoardSection {
  title: string;
  fields: TrackerBoardField[];
}

export interface TrackerBoardDisplayLayout {
  sections: TrackerBoardSection[];
}

export interface SceneMapPreset {
  name: string;
  value: Record<string, unknown>;
}

export interface SceneMapSettings {
  version: string;
  formatVersion: string;
  connectionId: string;
  maxResponseTokens: number;
  autoGenerateAiTrackers: boolean;
  schemaPreset: string;
  schemaPresets: Record<string, SceneMapPreset>;
  includeLastXMessages: number;
  promptJson: string;
  displayLayout: TrackerBoardDisplayLayout;
}

export interface TrackerEntry {
  messageId: string;
  swipeId: number;
  data: unknown;
  displayData?: unknown;
}

export interface SceneMapState {
  settings: SceneMapSettings;
  chatId: string | null;
  latest: TrackerEntry | null;
  messagesBehind: number;
  activeMessageId: string | null;
  activeSwipeId: number | null;
  generatingMessageId: string | null;
  connections: Array<{ id: string; name: string; provider: string; model: string; is_default?: boolean }>;
}

export const DEFAULT_SCHEMA_VALUE: Record<string, unknown> = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "SceneTracker",
  description: "Schema for tracking roleplay scene details",
  type: "object",
  properties: {
    time: {
      type: "string",
      description: "Format: HH:MM:SS; MM/DD/YYYY (Day Name)",
    },
    location: {
      type: "string",
      description: "Specific scene location with increasing specificity",
    },
    weather: {
      type: "string",
      description: "Current weather conditions and temperature",
    },
    topics: {
      type: "object",
      properties: {
        primaryTopic: {
          type: "string",
          description: "1-2 word main topic of interaction",
        },
        emotionalTone: {
          type: "string",
          description: "Dominant emotional tone of scene",
        },
        interactionTheme: {
          type: "string",
          description: "Type of character interaction",
        },
      },
      required: ["primaryTopic", "emotionalTone", "interactionTheme"],
    },
    charactersPresent: {
      type: "array",
      items: {
        type: "string",
        description: "Character name",
      },
      description: "List of character names present in scene",
    },
    characters: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Character name",
          },
          hair: {
            type: "string",
            description: "Hairstyle and condition",
          },
          makeup: {
            type: "string",
            description: "Makeup description or 'None'",
          },
          outfit: {
            type: "string",
            description: "Complete outfit including underwear",
          },
          stateOfDress: {
            type: "string",
            description: "How put-together/disheveled character appears",
          },
          postureAndInteraction: {
            type: "string",
            description: "Character's physical positioning and interaction",
          },
        },
        required: ["name", "hair", "makeup", "outfit", "stateOfDress", "postureAndInteraction"],
      },
      description: "Array of character objects",
    },
  },
  required: ["time", "location", "weather", "topics", "charactersPresent", "characters"],
};

export const DEFAULT_DISPLAY_LAYOUT: TrackerBoardDisplayLayout = {
  sections: [
    {
      title: "Scene",
      fields: [
        { path: "location", label: "Location", display: "text" },
        { path: "time", label: "Time", display: "subtle" },
        { path: "weather", label: "Weather", display: "text" },
      ],
    },
    {
      title: "Topics",
      fields: [
        { path: "topics.primaryTopic", label: "Primary Topic", display: "text" },
        { path: "topics.emotionalTone", label: "Emotional Tone", display: "subtle" },
        { path: "topics.interactionTheme", label: "Interaction Theme", display: "subtle" },
      ],
    },
    {
      title: "Present",
      fields: [{ path: "charactersPresent", label: "Characters", display: "chips" }],
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
            { path: "makeup", label: "Makeup", display: "subtle" },
          ],
        },
      ],
    },
  ],
};

export const DEFAULT_PROMPT_JSON = `You are a highly specialized AI assistant. Your SOLE purpose is to generate a single, valid JSON object that strictly adheres to the provided JSON schema.

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

export const defaultSettings: SceneMapSettings = {
  version: "1.0.0",
  formatVersion: "F_1.0",
  connectionId: "",
  maxResponseTokens: 16000,
  autoGenerateAiTrackers: false,
  schemaPreset: "default",
  schemaPresets: {
    default: {
      name: "Default",
      value: DEFAULT_SCHEMA_VALUE,
    },
  },
  includeLastXMessages: 0,
  promptJson: DEFAULT_PROMPT_JSON,
  displayLayout: DEFAULT_DISPLAY_LAYOUT,
};

export function cloneDefaultSettings(): SceneMapSettings {
  return JSON.parse(JSON.stringify(defaultSettings)) as SceneMapSettings;
}

export function mergeSettings(value: Partial<SceneMapSettings> | null | undefined): SceneMapSettings {
  const base = cloneDefaultSettings();
  if (!value || typeof value !== "object") return base;
  return {
    ...base,
    ...value,
    schemaPresets: {
      ...base.schemaPresets,
      ...(value.schemaPresets ?? {}),
    },
    displayLayout: value.displayLayout?.sections?.length ? value.displayLayout : base.displayLayout,
  };
}

export function schemaToExample(schema: any): unknown {
  if (!schema || typeof schema !== "object") return null;
  if (schema.example !== undefined) return schema.example;
  switch (schema.type) {
    case "object": {
      const obj: Record<string, unknown> = {};
      const properties = schema.properties && typeof schema.properties === "object" ? schema.properties : {};
      for (const [key, child] of Object.entries(properties)) obj[key] = schemaToExample(child);
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

export function parseModelJson(content: string): object {
  const match = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const cleaned = (match ? match[1] : content).trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Model response must be a JSON object.");
    }
    return parsed;
  } catch (error) {
    throw new Error(`Model response is not valid JSON: ${(error as Error).message}`);
  }
}

export function renderPrompt(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*(schema|previous_tracker|example_response)\s*\}\}/g, (_match, key) => values[key] ?? "");
}

export function humanizeTrackerKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}

export function formatPrimitive(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function trackerToText(tracker: unknown): string {
  if (!tracker || typeof tracker !== "object" || Array.isArray(tracker)) return "";
  const record = tracker as Record<string, unknown>;
  const sceneLines = renderSceneMapSummary(record);
  if (sceneLines.length > 0) return sceneLines.join("\n");

  const lines: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    const child = trackerValueToText(key, value);
    if (child.length === 0) continue;
    if (lines.length > 0) lines.push("");
    lines.push(...child);
  }
  return lines.join("\n");
}

function renderSceneMapSummary(tracker: Record<string, unknown>): string[] {
  const lines: string[] = [];
  pushPrimitiveLine(lines, "Time", tracker.time);
  pushPrimitiveLine(lines, "Location", tracker.location);
  pushPrimitiveLine(lines, "Weather", tracker.weather);

  const topics = tracker.topics && typeof tracker.topics === "object" && !Array.isArray(tracker.topics)
    ? tracker.topics as Record<string, unknown>
    : null;
  if (topics) {
    const tone = [
      formatPrimitive(topics.primaryTopic),
      formatPrimitive(topics.emotionalTone),
      formatPrimitive(topics.interactionTheme),
    ].filter(Boolean);
    if (tone.length > 0) {
      if (lines.length > 0) lines.push("");
      lines.push(`Scene tone: ${tone.join("; ")}.`);
    }
  }

  if (Array.isArray(tracker.charactersPresent) && tracker.charactersPresent.length > 0) {
    const present = tracker.charactersPresent.map(formatPrimitive).filter(Boolean);
    if (present.length > 0) lines.push(`Present: ${present.join(", ")}.`);
  }

  if (Array.isArray(tracker.characters) && tracker.characters.length > 0) {
    for (const character of tracker.characters) {
      if (!character || typeof character !== "object" || Array.isArray(character)) continue;
      const characterLines = renderCharacterSummary(character as Record<string, unknown>);
      if (characterLines.length === 0) continue;
      if (lines.length > 0) lines.push("");
      lines.push(...characterLines);
    }
  }

  return lines;
}

function pushPrimitiveLine(lines: string[], label: string, value: unknown) {
  const text = formatPrimitive(value);
  if (text) lines.push(`${label}: ${text}`);
}

function renderCharacterSummary(character: Record<string, unknown>): string[] {
  const name = formatPrimitive(character.name) || "Character";
  const lines = [`${name}:`];
  for (const [key, value] of Object.entries(character)) {
    if (key === "name") continue;
    const text = formatPrimitive(value);
    if (!text) continue;
    lines.push(`- ${humanizeTrackerKey(key)}: ${text}`);
  }
  return lines.length > 1 ? lines : [];
}

function trackerValueToText(key: string, value: unknown, depth = 0): string[] {
  const indent = "  ".repeat(depth);
  const label = humanizeTrackerKey(key);
  if (value === null || value === undefined || value === "") return [];
  if (Array.isArray(value)) {
    if (value.length === 0) return [];
    const lines = [`${indent}${label}:`];
    for (const item of value) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const entries = Object.entries(item as Record<string, unknown>).filter(([, child]) => child !== null && child !== undefined && child !== "");
        if (entries.length === 0) continue;
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
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      lines.push(...trackerValueToText(childKey, childValue, depth));
    }
    return lines.length > 1 ? lines : [];
  }
  return [`${indent}${label}: ${formatPrimitive(value)}`];
}
