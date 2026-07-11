import { describe, expect, test } from "bun:test";
import { DEFAULT_SCHEMA_VALUE, jsonValuesEqual } from "./shared";
import {
  createVisualSchemaField,
  createVisualSchemaModel,
  setVisualSchemaNodeType,
  visualSchemaToJson,
} from "./schema-form";

describe("visual schema model", () => {
  test("round-trips the default schema without changes", () => {
    const result = visualSchemaToJson(createVisualSchemaModel(DEFAULT_SCHEMA_VALUE));

    expect(jsonValuesEqual(result, DEFAULT_SCHEMA_VALUE)).toBe(true);
  });

  test("edits nested array object fields", () => {
    const model = createVisualSchemaModel(DEFAULT_SCHEMA_VALUE);
    const characters = model.fields.find((field) => field.name === "characters")!;
    const outfit = characters.item!.fields.find((field) => field.name === "outfit")!;
    outfit.name = "clothing";
    outfit.description = "Current clothing";
    outfit.required = false;

    const result = visualSchemaToJson(model);
    const characterSchema = ((result.properties as any).characters.items as any);
    expect(characterSchema.properties.clothing.description).toBe("Current clothing");
    expect(characterSchema.properties.outfit).toBeUndefined();
    expect(characterSchema.required).not.toContain("clothing");
  });

  test("adds fields and numeric limits", () => {
    const model = createVisualSchemaModel(DEFAULT_SCHEMA_VALUE);
    const field = createVisualSchemaField(model.fields.map((item) => item.name));
    field.name = "health";
    setVisualSchemaNodeType(field, "integer");
    field.minimum = 0;
    field.maximum = 100;
    model.fields.push(field);

    const result = visualSchemaToJson(model);
    expect((result.properties as any).health).toEqual({ type: "integer", minimum: 0, maximum: 100 });
    expect(result.required).toContain("health");
  });

  test("preserves advanced non-structural rules", () => {
    const schema = {
      type: "object",
      properties: {
        names: { type: "array", uniqueItems: true, items: { type: "string", minLength: 2 } },
      },
    };

    expect(visualSchemaToJson(createVisualSchemaModel(schema))).toEqual(schema);
  });

  test("routes structural compositions to Advanced JSON", () => {
    expect(() => createVisualSchemaModel({ type: "object", allOf: [{ type: "object" }] })).toThrow("Advanced JSON");
    expect(() => createVisualSchemaModel({ type: "object", additionalProperties: { type: "string" } })).toThrow("Advanced JSON");
  });

  test("rejects duplicate names and invalid numeric ranges", () => {
    const duplicateModel = createVisualSchemaModel(DEFAULT_SCHEMA_VALUE);
    duplicateModel.fields[1].name = duplicateModel.fields[0].name;
    expect(() => visualSchemaToJson(duplicateModel)).toThrow("more than one field");

    const rangeModel = createVisualSchemaModel(DEFAULT_SCHEMA_VALUE);
    const field = createVisualSchemaField(rangeModel.fields.map((item) => item.name));
    field.name = "health";
    setVisualSchemaNodeType(field, "integer");
    field.minimum = 100;
    field.maximum = 0;
    rangeModel.fields.push(field);
    expect(() => visualSchemaToJson(rangeModel)).toThrow("minimum greater than its maximum");
  });
});
