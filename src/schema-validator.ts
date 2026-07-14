import {
  Validator,
  type OutputUnit,
  type Schema,
  type SchemaDraft,
} from "@cfworker/json-schema";
import { parseModelJson, schemaToExample } from "./shared";

const validTypes = new Set(["array", "boolean", "integer", "null", "number", "object", "string"]);

export function validateSchemaDefinition(schema: Record<string, unknown>): void {
  try {
    createValidator(schema).validate({});
  } catch (error) {
    throw new Error(`SceneMap schema is invalid: ${(error as Error).message}`);
  }
}

export function createValidatedSchemaExample(schema: Record<string, unknown>): unknown | null {
  const example = schemaToExample(schema);
  try {
    // Example construction is best-effort. Omitting an invalid example is safer
    // than teaching the model a response that contradicts the user's schema.
    return createValidator(schema).validate(example).valid ? example : null;
  } catch {
    return null;
  }
}

export function parseAndValidateModelJson(content: string, schema: Record<string, unknown>): object {
  const parsed = parseModelJson(content);
  return validateTrackerData(parsed, schema, "Model response");
}

export function validateTrackerData(
  data: unknown,
  schema: Record<string, unknown>,
  source = "Tracker data",
): object {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${source} must be a JSON object.`);
  }

  let result: ReturnType<Validator["validate"]>;
  try {
    result = createValidator(schema).validate(data);
  } catch (error) {
    throw new Error(`SceneMap schema is invalid: ${(error as Error).message}`);
  }

  if (!result.valid) {
    throw new Error(`${source} does not match the SceneMap schema: ${formatSchemaErrors(result.errors)}`);
  }
  return data as object;
}

function createValidator(schema: Record<string, unknown>): Validator {
  // The validator primarily validates instances. This preflight catches malformed
  // keyword shapes consistently before a generation is allowed to start.
  assertSchemaWellFormed(schema);
  return new Validator(schema as Schema, detectDraft(schema), false);
}

function detectDraft(schema: Record<string, unknown>): SchemaDraft {
  const declaration = typeof schema.$schema === "string" ? schema.$schema : "";
  if (/draft-?0?4/i.test(declaration)) return "4";
  if (/2019-09/i.test(declaration)) return "2019-09";
  if (/2020-12/i.test(declaration)) return "2020-12";
  // Draft-07 remains the compatibility default for schemas without a declaration.
  return "7";
}

function assertSchemaWellFormed(schema: unknown, path = "#", seen = new WeakSet<object>()): void {
  if (typeof schema === "boolean") return;
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    throw new Error(`${path} must be a schema object or boolean.`);
  }
  if (seen.has(schema)) return;
  seen.add(schema);
  const record = schema as Record<string, unknown>;
  const types = Array.isArray(record.type) ? record.type : record.type === undefined ? [] : [record.type];
  if (types.some((type) => typeof type !== "string" || !validTypes.has(type))) {
    throw new Error(`${path}/type contains an unsupported JSON Schema type.`);
  }
  if (record.required !== undefined && (!Array.isArray(record.required) || record.required.some((key) => typeof key !== "string"))) {
    throw new Error(`${path}/required must be an array of strings.`);
  }
  if (record.enum !== undefined && (!Array.isArray(record.enum) || record.enum.length === 0)) {
    throw new Error(`${path}/enum must be a non-empty array.`);
  }
  if (record.pattern !== undefined) {
    if (typeof record.pattern !== "string") throw new Error(`${path}/pattern must be a string.`);
    try {
      new RegExp(record.pattern);
    } catch {
      throw new Error(`${path}/pattern is not a valid regular expression.`);
    }
  }
  for (const keyword of ["properties", "patternProperties", "$defs", "definitions", "dependentSchemas"] as const) {
    const children = record[keyword];
    if (children === undefined) continue;
    if (!children || typeof children !== "object" || Array.isArray(children)) {
      throw new Error(`${path}/${keyword} must be an object.`);
    }
    for (const [key, child] of Object.entries(children as Record<string, unknown>)) {
      assertSchemaWellFormed(child, `${path}/${keyword}/${escapeJsonPointerToken(key)}`, seen);
    }
  }
  for (const keyword of ["allOf", "anyOf", "oneOf"] as const) {
    const children = record[keyword];
    if (children === undefined) continue;
    if (!Array.isArray(children) || children.length === 0) throw new Error(`${path}/${keyword} must be a non-empty array.`);
    children.forEach((child, index) => assertSchemaWellFormed(child, `${path}/${keyword}/${index}`, seen));
  }
  for (const keyword of ["items", "additionalItems", "contains", "additionalProperties", "propertyNames", "not", "if", "then", "else"] as const) {
    const child = record[keyword];
    if (child === undefined) continue;
    if (keyword === "items" && Array.isArray(child)) {
      child.forEach((item, index) => assertSchemaWellFormed(item, `${path}/items/${index}`, seen));
    } else {
      assertSchemaWellFormed(child, `${path}/${keyword}`, seen);
    }
  }
}

function formatSchemaErrors(errors: OutputUnit[]): string {
  // Parent `properties`/`items` errors usually duplicate a more useful leaf error.
  const meaningful = errors.filter((error) => !["properties", "items"].includes(error.keyword));
  const selected = (meaningful.length > 0 ? meaningful : errors).slice(0, 6);
  const messages = selected.map((error) => {
    let path = error.instanceLocation === "#" ? "" : error.instanceLocation.replace(/^#/, "");
    let message = error.error;
    if (error.keyword === "required") {
      const match = message.match(/required property "([^"]+)"/i);
      if (match) path = `${path}/${escapeJsonPointerToken(match[1])}`;
    }
    if (error.keyword === "type") {
      const match = message.match(/Expected "([^"]+)"/i);
      if (match) message = `must be ${match[1]}`;
    }
    if (error.keyword === "format") {
      const match = message.match(/format "([^"]+)"/i);
      if (match) message = `must match format "${match[1]}"`;
    }
    return `${path || "/"} ${message}`;
  });
  if (errors.length > selected.length) messages.push(`and ${errors.length - selected.length} more`);
  return messages.join("; ");
}

function escapeJsonPointerToken(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}
