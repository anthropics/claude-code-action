import * as core from "@actions/core";
import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";

export async function mergeExecutionFiles(
  filePaths: string[],
  outputPath: string,
): Promise<void> {
  const allMessages: unknown[] = [];

  for (const filePath of filePaths) {
    if (!existsSync(filePath)) continue;

    try {
      const content = await readFile(filePath, "utf-8");
      const messages = JSON.parse(content) as unknown[];
      allMessages.push(...messages);
    } catch (error) {
      core.warning(`Failed to read execution file ${filePath}: ${error}`);
    }
  }

  await writeFile(outputPath, JSON.stringify(allMessages, null, 2));
}
