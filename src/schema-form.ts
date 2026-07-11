export type VisualSchemaType = "string" | "integer" | "number" | "boolean" | "object" | "array";

export interface VisualSchemaNode {
  id: string;
  type: VisualSchemaType;
  originalType: VisualSchemaType;
  description: string;
  minimum: number | null;
  maximum: number | null;
  strict: boolean;
  fields: VisualSchemaField[];
  item: VisualSchemaNode | null;
  raw: Record<string, unknown>;
}

export interface VisualSchemaField extends VisualSchemaNode {
  name: string;
  required: boolean;
}

export interface VisualSchemaModel {
  title: string;
  description: string;
  strict: boolean;
  fields: VisualSchemaField[];
  raw: Record<string, unknown>;
}

const SUPPORTED_TYPES = new Set<VisualSchemaType>(["string", "integer", "number", "boolean", "object", "array"]);
const STRUCTURAL_KEYWORDS = [
  "$ref", "allOf", "anyOf", "oneOf", "not", "if", "then", "else",
  "patternProperties", "prefixItems", "dependencies", "dependentRequired", "dependentSchemas",
];
const TYPE_SPECIFIC_KEYWORDS = [
  "minLength", "maxLength", "pattern", "format",
  "multipleOf", "exclusiveMinimum", "exclusiveMaximum",
  "minItems", "maxItems", "uniqueItems", "contains",
  "minProperties", "maxProperties", "propertyNames", "dependencies", "dependentRequired", "dependentSchemas",
];
let nextVisualSchemaId = 0;

export function createVisualSchemaModel(schema: Record<string, unknown>): VisualSchemaModel {
  assertRecord(schema, "Schema");
  const rootType = inferType(schema);
  if (rootType !== "object") throw new Error("Visual editing requires an object schema at the root.");
  assertVisualStructure(schema, "Schema");
  return {
    title: typeof schema.title === "string" ? schema.title : "",
    description: typeof schema.description === "string" ? schema.description : "",
    strict: schema.additionalProperties === false,
    fields: readFields(schema, "Schema"),
    raw: cloneRecord(schema),
  };
}

export function visualSchemaToJson(model: VisualSchemaModel): Record<string, unknown> {
  const schema = cloneRecord(model.raw);
  delete schema.title;
  delete schema.description;
  delete schema.type;
  delete schema.properties;
  delete schema.required;
  delete schema.additionalProperties;
  schema.type = "object";
  if (model.title.trim()) schema.title = model.title.trim();
  if (model.description.trim()) schema.description = model.description.trim();
  writeFields(schema, model.fields, "Schema");
  if (model.strict) schema.additionalProperties = false;
  return schema;
}

export function createVisualSchemaField(existingNames: string[]): VisualSchemaField {
  const names = new Set(existingNames);
  let name = "newField";
  let suffix = 2;
  while (names.has(name)) name = `newField${suffix++}`;
  return {
    ...createVisualSchemaNode("string"),
    name,
    required: true,
  };
}

export function setVisualSchemaNodeType(node: VisualSchemaNode, type: VisualSchemaType): void {
  node.type = type;
  if (type === "object" && node.fields.length === 0) node.fields = [];
  if (type === "array" && !node.item) node.item = createVisualSchemaNode("string");
  if (type !== "array") node.item = null;
  if (type !== "object") node.fields = [];
  if (type !== "number" && type !== "integer") {
    node.minimum = null;
    node.maximum = null;
  }
}

export function schemaNodeHasAdvancedRules(node: VisualSchemaNode): boolean {
  const baseKeys = new Set(["type", "description", "properties", "required", "items", "minimum", "maximum", "additionalProperties"]);
  return Object.keys(node.raw).some((key) => !baseKeys.has(key));
}

function readFields(schema: Record<string, unknown>, path: string): VisualSchemaField[] {
  const properties = schema.properties;
  if (properties === undefined) return [];
  assertRecord(properties, `${path} properties`);
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((value): value is string => typeof value === "string") : []);
  return Object.entries(properties).map(([name, value]) => {
    assertRecord(value, `${path}.${name}`);
    const node = readNode(value, `${path}.${name}`);
    return { ...node, name, required: required.has(name) };
  });
}

function readNode(schema: Record<string, unknown>, path: string): VisualSchemaNode {
  assertVisualStructure(schema, path);
  const type = inferType(schema);
  const node = createVisualSchemaNode(type, schema);
  node.description = typeof schema.description === "string" ? schema.description : "";
  node.minimum = finiteNumberOrNull(schema.minimum);
  node.maximum = finiteNumberOrNull(schema.maximum);
  node.strict = schema.additionalProperties === false;
  if (type === "object") node.fields = readFields(schema, path);
  if (type === "array") {
    const items = schema.items ?? { type: "string" };
    if (!items || typeof items !== "object" || Array.isArray(items)) {
      throw new Error(`${path} uses array items that the visual editor cannot represent. Use Advanced JSON.`);
    }
    node.item = readNode(items as Record<string, unknown>, `${path} items`);
  }
  return node;
}

function writeFields(schema: Record<string, unknown>, fields: VisualSchemaField[], path: string): void {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const field of fields) {
    const name = field.name.trim();
    if (!name) throw new Error(`${path} contains a field without a name.`);
    if (name.includes(".")) throw new Error(`Field "${name}" cannot contain a period because periods separate nested fields.`);
    if (Object.prototype.hasOwnProperty.call(properties, name)) throw new Error(`${path} contains more than one field named "${name}".`);
    properties[name] = writeNode(field, `${path}.${name}`);
    if (field.required) required.push(name);
  }
  schema.properties = properties;
  if (required.length > 0) schema.required = required;
}

function writeNode(node: VisualSchemaNode, path: string): Record<string, unknown> {
  const schema = cloneRecord(node.raw);
  for (const key of ["type", "description", "properties", "required", "items", "minimum", "maximum", "additionalProperties"]) delete schema[key];
  if (node.type !== node.originalType) for (const key of TYPE_SPECIFIC_KEYWORDS) delete schema[key];
  schema.type = node.type;
  if (node.description.trim()) schema.description = node.description.trim();
  if (node.type === "number" || node.type === "integer") {
    if (node.minimum !== null && node.maximum !== null && node.minimum > node.maximum) {
      throw new Error(`${path} has a minimum greater than its maximum.`);
    }
    if (node.minimum !== null) schema.minimum = node.minimum;
    if (node.maximum !== null) schema.maximum = node.maximum;
  }
  if (node.type === "object") {
    writeFields(schema, node.fields, path);
    if (node.strict) schema.additionalProperties = false;
  }
  if (node.type === "array") schema.items = writeNode(node.item ?? createVisualSchemaNode("string"), `${path} items`);
  return schema;
}

function createVisualSchemaNode(type: VisualSchemaType, raw: Record<string, unknown> = {}): VisualSchemaNode {
  return {
    id: `schema-node-${++nextVisualSchemaId}`,
    type,
    originalType: type,
    description: "",
    minimum: null,
    maximum: null,
    strict: false,
    fields: [],
    item: null,
    raw: cloneRecord(raw),
  };
}

function assertVisualStructure(schema: Record<string, unknown>, path: string): void {
  const keyword = STRUCTURAL_KEYWORDS.find((key) => key in schema);
  if (keyword) throw new Error(`${path} uses ${keyword}, which must be edited with Advanced JSON.`);
  if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== "boolean") {
    throw new Error(`${path} uses an additionalProperties schema, which must be edited with Advanced JSON.`);
  }
  inferType(schema);
}

function inferType(schema: Record<string, unknown>): VisualSchemaType {
  const declared = schema.type;
  if (typeof declared === "string" && SUPPORTED_TYPES.has(declared as VisualSchemaType)) return declared as VisualSchemaType;
  if (Array.isArray(declared)) throw new Error("Schemas with multiple types must be edited with Advanced JSON.");
  if (schema.properties && typeof schema.properties === "object") return "object";
  if (schema.items !== undefined) return "array";
  if (declared === undefined) return "string";
  throw new Error(`Schema type "${String(declared)}" is not supported by the visual editor.`);
}

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
}

function finiteNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
