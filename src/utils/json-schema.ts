/**
 * Appends JSON schema CLI argument if json_schema is provided
 * Escapes schema for safe shell passing
 */
export function appendJsonSchemaArg(
  claudeArgs: string,
  jsonSchemaStr?: string,
): string {
  const schema = jsonSchemaStr || process.env.JSON_SCHEMA || "";
  if (!schema) {
    return claudeArgs;
  }

  // CLI validates schema - just escape for safe shell passing
  const escapedSchema = schema.replace(/'/g, "'\\''");
  return `${claudeArgs} --json-schema '${escapedSchema}'`;
}
