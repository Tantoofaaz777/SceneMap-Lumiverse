import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import { parseModelJson, schemaToExample } from "./shared";

const schemaValidator = new Ajv({
  allErrors: true,
  strict: false,
  validateFormats: true,
});
addFormats(schemaValidator);

export function createValidatedSchemaExample(schema: Record<string, unknown>): unknown | null {
  const example = schemaToExample(schema);
  try {
    const validate = schemaValidator.compile(schema);
    return validate(example) ? example : null;
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
  let validate: ReturnType<Ajv["compile"]>;
  try {
    validate = schemaValidator.compile(schema);
  } catch (error) {
    throw new Error(`SceneMap schema is invalid: ${(error as Error).message}`);
  }

  if (!validate(data)) {
    const details = formatSchemaErrors(validate.errors ?? []);
    throw new Error(`${source} does not match the SceneMap schema: ${details}`);
  }

  return data as object;
}

function formatSchemaErrors(errors: ErrorObject[]): string {
  const messages = errors.slice(0, 6).map((error) => {
    const missingProperty = error.keyword === "required"
      ? (error.params as { missingProperty?: unknown }).missingProperty
      : null;
    const missingPath = typeof missingProperty === "string"
      ? `${error.instancePath}/${escapeJsonPointerToken(missingProperty)}`
      : error.instancePath;
    const path = missingPath || "/";
    return `${path} ${error.message ?? "is invalid"}`;
  });
  if (errors.length > messages.length) messages.push(`and ${errors.length - messages.length} more`);
  return messages.join("; ");
}

function escapeJsonPointerToken(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}
