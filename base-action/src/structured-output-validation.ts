import Ajv, { type AnySchema, type ValidateFunction } from "ajv";
import Ajv2019 from "ajv/dist/2019";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";

export type SchemaViolationPolicy = "fail" | "warn" | "ignore";

export function parseSchemaViolationPolicy(
  input: string | undefined,
): SchemaViolationPolicy {
  const value = input?.trim() || "fail";
  if (value === "fail" || value === "warn" || value === "ignore") return value;
  throw new Error("on_schema_violation must be fail, warn, or ignore");
}

export function compileOutputSchema(
  schemaText: string | null | undefined,
): ValidateFunction {
  if (!schemaText) {
    throw new Error("--json-schema requires an inline JSON Schema");
  }

  try {
    const schema: AnySchema = JSON.parse(schemaText);
    const dialect =
      typeof schema === "object" && schema ? schema.$schema : undefined;
    const options = { allErrors: true, strict: false, strictSchema: true };
    const validator =
      dialect === "https://json-schema.org/draft/2020-12/schema"
        ? new Ajv2020(options)
        : dialect === "https://json-schema.org/draft/2019-09/schema"
          ? new Ajv2019(options)
          : new Ajv(options);
    addFormats(validator);
    const validate = validator.compile(schema);
    if ("$async" in validate && validate.$async)
      throw new Error("Asynchronous schemas are unsupported");
    return validate;
  } catch {
    // A schema can contain sensitive values, including in enum entries.
    throw new Error(
      "Could not validate --json-schema. Provide a valid JSON Schema using draft-07, draft 2019-09, or draft 2020-12.",
    );
  }
}
