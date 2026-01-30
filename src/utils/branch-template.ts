#!/usr/bin/env bun

/**
 * Branch name template parsing and variable substitution utilities
 */

const NUM_DESCRIPTION_WORDS = 5;

/**
 * Extracts the first 5 words from a title and converts them to kebab-case
 */
function extractDescription(
  title: string,
  numWords: number = NUM_DESCRIPTION_WORDS,
): string {
  if (!title || title.trim() === "") {
    return "";
  }

  return title
    .trim()
    .split(/\s+/)
    .slice(0, numWords) // Only first `numWords` words
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "") // Remove non-alphanumeric except hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single
    .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
}

export interface BranchTemplateVariables {
  prefix: string;
  entityType: string;
  entityNumber: number;
  timestamp: string;
  sha?: string;
  label?: string;
  description?: string;
}

/**
 * Replaces template variables in a branch name template
 * Template format: {{variableName}}
 */
export function applyBranchTemplate(
  template: string,
  variables: BranchTemplateVariables,
): string {
  let result = template;

  // Replace each variable
  Object.entries(variables).forEach(([key, value]) => {
    const placeholder = `{{${key}}}`;
    const replacement = value ? String(value) : "";
    result = result.replaceAll(placeholder, replacement);
  });

  return result;
}

/**
 * Generates a branch name from the provided `template` and set of `variables`. Uses a default format if the template is empty or produces an empty result.
 */
export function generateBranchName(
  template: string | undefined,
  branchPrefix: string,
  entityType: string,
  entityNumber: number,
  sha?: string,
  label?: string,
  title?: string,
): string {
  const now = new Date();

  const variables: BranchTemplateVariables = {
    prefix: branchPrefix,
    entityType,
    entityNumber,
    timestamp: `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`,
    sha: sha?.substring(0, 8), // First 8 characters of SHA
    label: label || entityType, // Fall back to entityType if no label
    description: title ? extractDescription(title) : undefined,
  };

  if (template?.trim()) {
    const branchName = applyBranchTemplate(template, variables);

    // Some templates could produce empty results- validate
    if (branchName.trim().length > 0) return branchName;

    console.log(
      `Branch template '${template}' generated empty result, falling back to default format`,
    );
  }

  const branchName = `${branchPrefix}${entityType}-${entityNumber}-${variables.timestamp}`;
  // Kubernetes compatible: lowercase, max 50 chars, alphanumeric and hyphens only
  return branchName.toLowerCase().substring(0, 50);
}
