import * as core from "@actions/core";
import { writeFileSync } from "fs";
import { join } from "path";
import { readFileSync } from "fs";

export async function preparePrompt({
  prompt,
  promptFile,
}: {
  prompt: string;
  promptFile: string;
}) {
  if (prompt && promptFile) {
    throw new Error("Cannot specify both prompt and prompt_file");
  }

  if (!prompt && !promptFile) {
    throw new Error("Must specify either prompt or prompt_file");
  }

  let finalPrompt: string;

  if (promptFile) {
    try {
      finalPrompt = readFileSync(promptFile, "utf-8");
    } catch (error) {
      throw new Error(`Failed to read prompt file ${promptFile}: ${error}`);
    }
  } else {
    finalPrompt = prompt;
  }

  // Write prompt to a temporary file
  const tempFile = join(process.cwd(), `claude-prompt-${Date.now()}.txt`);
  writeFileSync(tempFile, finalPrompt);

  return { path: tempFile };
}
