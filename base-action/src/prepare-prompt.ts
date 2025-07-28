import { existsSync, statSync } from "fs";
import { mkdir, writeFile } from "fs/promises";

export type PreparePromptInput = {
  prompt: string;
  promptFile: string;
};

export type PreparePromptConfig = {
  type: "file" | "inline";
  path: string;
};

async function validateAndPreparePrompt(
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

  const inlinePath = "/tmp/claude-action/prompt.txt";
  return {
    type: "inline",
    path: inlinePath,
  };
}

async function createTemporaryPromptFile(
  prompt: string,
  promptPath: string,
): Promise<void> {
  // Create the directory path
  const dirPath = promptPath.substring(0, promptPath.lastIndexOf("/"));
  await mkdir(dirPath, { recursive: true });
  await writeFile(promptPath, prompt);
}

export async function preparePrompt(
  input: PreparePromptInput,
): Promise<PreparePromptConfig> {
  const config = await validateAndPreparePrompt(input);

  if (config.type === "inline") {
    await createTemporaryPromptFile(input.prompt, config.path);
  }

  return config;
}
