import { describe, expect, test } from "bun:test";
import { createSchemaDefaultLayout } from "./frontend";
import { DEFAULT_DISPLAY_LAYOUT, DEFAULT_SCHEMA_VALUE } from "./shared";

describe("createSchemaDefaultLayout", () => {
  test("preserves the curated layout for the built-in schema", () => {
    expect(createSchemaDefaultLayout(DEFAULT_SCHEMA_VALUE)).toEqual(DEFAULT_DISPLAY_LAYOUT);
  });

  test("builds a complete layout from a custom schema", () => {
    const layout = createSchemaDefaultLayout({
      title: "Quest Tracker",
      type: "object",
      properties: {
        location: { type: "string" },
        currentQuest: { type: "string" },
        party: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              role: { type: "string" },
              health: { type: "number" },
              mana: { type: "number" },
              condition: { type: "string" },
            },
          },
        },
      },
    });

    expect(layout.sections[0].title).toBe("Quest Tracker");
    expect(layout.sections[0].fields.map((field) => field.path)).toEqual([
      "location",
      "currentQuest",
      "party",
    ]);
    expect(layout.sections[0].fields[2].fields?.map((field) => field.path)).toEqual([
      "name",
      "role",
      "health",
      "mana",
      "condition",
    ]);
  });

  test("resolves local refs and allOf compositions", () => {
    const layout = createSchemaDefaultLayout({
      title: "Referenced Tracker",
      allOf: [
        { $ref: "#/$defs/base" },
        {
          type: "object",
          properties: {
            objective: { type: "string" },
          },
        },
      ],
      $defs: {
        base: {
          type: "object",
          properties: {
            location: { type: "string" },
          },
        },
      },
    });

    expect(layout.sections[0].fields.map((field) => field.path)).toEqual([
      "location",
      "objective",
    ]);
  });

  test("stops expanding self-referential schemas", () => {
    const layout = createSchemaDefaultLayout({
      title: "Recursive Tracker",
      type: "object",
      properties: {
        node: { $ref: "#/$defs/node" },
      },
      $defs: {
        node: {
          type: "object",
          properties: {
            name: { type: "string" },
            child: { $ref: "#/$defs/node" },
          },
        },
      },
    });

    expect(layout.sections[0].fields.map((field) => field.path)).toEqual([
      "node.name",
      "node.child",
    ]);
  });

  test("stops expanding mutually recursive schemas", () => {
    const layout = createSchemaDefaultLayout({
      type: "object",
      properties: {
        first: { $ref: "#/$defs/first" },
      },
      $defs: {
        first: {
          type: "object",
          properties: { second: { $ref: "#/$defs/second" } },
        },
        second: {
          type: "object",
          properties: { first: { $ref: "#/$defs/first" } },
        },
      },
    });

    expect(layout.sections[0].fields.map((field) => field.path)).toEqual([
      "first.second.first",
    ]);
  });
});
