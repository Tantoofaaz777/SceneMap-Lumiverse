import { describe, expect, test } from "bun:test";
import {
  DEFAULT_SCHEMA_VALUE,
  mergeSettings,
  resolveSamplingParameter,
  schemaToExample,
  trackerToText,
} from "./shared";
import { createValidatedSchemaExample, parseAndValidateModelJson, validateTrackerData } from "./schema-validator";

describe("parseAndValidateModelJson", () => {
  test("accepts a fenced response that matches the configured schema", () => {
    const tracker = schemaToExample(DEFAULT_SCHEMA_VALUE) as object;
    const response = `\`\`\`json\n${JSON.stringify(tracker)}\n\`\`\``;

    expect(parseAndValidateModelJson(response, DEFAULT_SCHEMA_VALUE)).toEqual(tracker);
  });

  test("rejects missing required properties", () => {
    expect(() => parseAndValidateModelJson("{}", DEFAULT_SCHEMA_VALUE)).toThrow(
      "Model response does not match the SceneMap schema",
    );
    expect(() => parseAndValidateModelJson("{}", DEFAULT_SCHEMA_VALUE)).toThrow("/time");
  });

  test("rejects properties with the wrong type", () => {
    const tracker = schemaToExample(DEFAULT_SCHEMA_VALUE) as Record<string, unknown>;
    tracker.characters = "Alice";

    expect(() => parseAndValidateModelJson(JSON.stringify(tracker), DEFAULT_SCHEMA_VALUE)).toThrow(
      "/characters must be array",
    );
  });

  test("keeps malformed JSON errors distinct from schema errors", () => {
    expect(() => parseAndValidateModelJson("{", DEFAULT_SCHEMA_VALUE)).toThrow(
      "Model response is not valid JSON",
    );
  });

  test("reports an invalid configured schema", () => {
    expect(() => parseAndValidateModelJson("{}", { type: "not-a-json-schema-type" })).toThrow(
      "SceneMap schema is invalid",
    );
  });

  test("rejects values that do not match a standard JSON Schema format", () => {
    const schema = {
      type: "object",
      properties: {
        timestamp: { type: "string", format: "date-time" },
      },
      required: ["timestamp"],
    };

    expect(() => parseAndValidateModelJson('{"timestamp":"tomorrow afternoon"}', schema)).toThrow(
      '/timestamp must match format "date-time"',
    );
  });

  test("accepts values that match a standard JSON Schema format", () => {
    const schema = {
      type: "object",
      properties: {
        timestamp: { type: "string", format: "date-time" },
      },
      required: ["timestamp"],
    };

    expect(parseAndValidateModelJson('{"timestamp":"2026-07-11T12:30:00Z"}', schema)).toEqual({
      timestamp: "2026-07-11T12:30:00Z",
    });
  });
});

describe("validateTrackerData", () => {
  test("rejects a manual edit that violates the configured schema", () => {
    expect(() => validateTrackerData({}, DEFAULT_SCHEMA_VALUE)).toThrow(
      "Tracker data does not match the SceneMap schema",
    );
  });

  test("accepts a manual edit that satisfies the configured schema", () => {
    const tracker = schemaToExample(DEFAULT_SCHEMA_VALUE);

    expect(validateTrackerData(tracker, DEFAULT_SCHEMA_VALUE)).toEqual(tracker as object);
  });
});

describe("mergeSettings", () => {
  test("drops the removed message-button setting from legacy settings", () => {
    const legacySettings = { showMessageButtons: true } as unknown as Parameters<typeof mergeSettings>[0];
    const settings = mergeSettings(legacySettings);

    expect(Object.hasOwn(settings, "showMessageButtons")).toBe(false);
  });

  test("adds empty sampling overrides to existing settings", () => {
    const settings = mergeSettings({ maxResponseTokens: 4096 });

    expect(settings.temperature).toBeNull();
    expect(settings.topP).toBeNull();
  });
});

describe("resolveSamplingParameter", () => {
  test("uses the hint value when a sampling setting is empty", () => {
    expect(resolveSamplingParameter(null, 0, 2)).toBe(1);
    expect(resolveSamplingParameter(undefined, 0, 1)).toBe(1);
  });

  test("keeps valid values and clamps invalid ranges", () => {
    expect(resolveSamplingParameter(0.25, 0, 2)).toBe(0.25);
    expect(resolveSamplingParameter(3, 0, 2)).toBe(2);
    expect(resolveSamplingParameter(-0.5, 0, 1)).toBe(0);
  });
});

describe("trackerToText", () => {
  test("keeps custom fields alongside the standard scene summary", () => {
    const text = trackerToText({
      location: "Tavern",
      currentQuest: "Find the mage",
      dangerLevel: 8,
    });

    expect(text).toContain("Location: Tavern");
    expect(text).toContain("Current Quest: Find the mage");
    expect(text).toContain("Danger Level: 8");
  });

  test("keeps custom fields nested inside topics", () => {
    const text = trackerToText({
      location: "Tavern",
      topics: {
        primaryTopic: "Investigation",
        objective: "Find the hidden door",
      },
    });

    expect(text).toContain("Scene tone: Investigation.");
    expect(text).toContain("Objective: Find the hidden door");
  });

  test("keeps reserved field names when a custom schema gives them another shape", () => {
    const text = trackerToText({
      location: "Dock",
      characters: ["Alice", "Bob"],
      topics: "Custom topic",
    });

    expect(text).toContain("Location: Dock");
    expect(text).toContain("Characters:");
    expect(text).toContain("- Alice");
    expect(text).toContain("Topics: Custom topic");
  });
});

describe("schemaToExample", () => {
  test.each([
    {
      name: "enum",
      schema: {
        type: "object",
        properties: { mood: { type: "string", enum: ["happy", "sad"] } },
        required: ["mood"],
      },
    },
    {
      name: "minimum",
      schema: {
        type: "object",
        properties: { level: { type: "integer", minimum: 1 } },
        required: ["level"],
      },
    },
    {
      name: "minItems",
      schema: {
        type: "object",
        properties: { party: { type: "array", minItems: 2, items: { type: "string" } } },
        required: ["party"],
      },
    },
    {
      name: "local ref",
      schema: {
        type: "object",
        properties: { status: { $ref: "#/$defs/status" } },
        required: ["status"],
        $defs: { status: { type: "string", const: "active" } },
      },
    },
  ])("creates a valid example for $name constraints", ({ schema }) => {
    const example = schemaToExample(schema);

    expect(parseAndValidateModelJson(JSON.stringify(example), schema)).toEqual(example as object);
  });

  test("omits an automatically generated example when it cannot satisfy the schema", () => {
    const schema = {
      type: "object",
      properties: {
        code: { type: "string", pattern: "^Z{8}$" },
      },
      required: ["code"],
    };

    expect(createValidatedSchemaExample(schema)).toBeNull();
  });
});
