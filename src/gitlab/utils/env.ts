import { z } from "zod";

const envSchema = z.object({
  GITLAB_BASE_URL: z
    .string({
      required_error: "GITLAB_BASE_URL must be provided",
    })
    .url("GITLAB_BASE_URL must be a valid URL"),
  GITLAB_PROJECT_ID: z
    .string({
      required_error: "GITLAB_PROJECT_ID must be provided",
    })
    .min(1, "GITLAB_PROJECT_ID must not be empty"),
  GITLAB_ACCESS_TOKEN: z
    .string({
      required_error: "GITLAB_ACCESS_TOKEN must be provided",
    })
    .min(1, "GITLAB_ACCESS_TOKEN must not be empty"),
  CI_MERGE_REQUEST_IID: z
    .string({
      required_error: "CI_MERGE_REQUEST_IID is required in merge request pipelines",
    })
    .min(1, "CI_MERGE_REQUEST_IID must not be empty"),
  ANTHROPIC_API_KEY: z
    .string({
      required_error: "ANTHROPIC_API_KEY must be provided",
    })
    .startsWith("sk-ant-", "ANTHROPIC_API_KEY must start with sk-ant-"),
  CLAUDE_MODEL: z
    .string()
    .default("claude-3-5-sonnet-20241022"),
  CLAUDE_MAX_TOKENS: z
    .string()
    .default("4096"),
  CLAUDE_TEMPERATURE: z
    .string()
    .default("0"),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function loadEnv(): EnvConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.errors
      .map((err) => `${err.path.join(".")}: ${err.message}`)
      .join("\n");

    throw new Error(`Environment validation failed:\n${formatted}`);
  }

  return result.data;
}

