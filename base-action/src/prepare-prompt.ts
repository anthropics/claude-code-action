import { existsSync, statSync } from "fs";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

export type PreparePromptInput = {
  prompt: string;
  promptFile: string;
};

export type PreparePromptConfig = {
  type: "file" | "inline";
  path: string;
};

export async function preparePrompt(
  input: PreparePromptInput,
): Promise<PreparePromptConfig> {
  // Validate inputs
  if (!input.prompt && !input.promptFile) {
    throw new Error(
      "Neither 'prompt' nor 'prompt_file' was provided. At least one is required.",
    );
  }

  if (input.prompt && input.promptFile) {
    throw new Error(
      "Both 'prompt' and 'prompt_file' were provided. Please specify only one.",
    );
  }

  // Handle prompt file
  if (input.promptFile) {
    if (!existsSync(input.promptFile)) {
      throw new Error(`Prompt file '${input.promptFile}' does not exist.`);
    }

    // Validate that the file is not empty
    const stats = statSync(input.promptFile);
    if (stats.size === 0) {
      throw new Error(
        "Prompt file is empty. Please provide a non-empty prompt.",
      );
    }

    return {
      type: "file",
      path: input.promptFile,
    };
  }

  // Handle inline prompt
  if (!input.prompt || input.prompt.trim().length === 0) {
    throw new Error("Prompt is empty. Please provide a non-empty prompt.");
  }

  const directory = await mkdtemp(
    join(process.env.RUNNER_TEMP || tmpdir(), "claude-prompt-"),
  );
  const path = join(directory, "prompt.txt");
  try {
    await writeFile(path, input.prompt);
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
  return { type: "inline", path };
}
