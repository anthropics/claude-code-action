/**
 * Test utilities for assistant branding tests
 */
import { getReportHeader, getWorkingMessage, getSignatureTemplate } from "../src/utils/assistant-branding";

/**
 * Set up test environment with a specific assistant name
 */
export function setTestAssistantName(name: string) {
  process.env.ASSISTANT_NAME = name;
}

/**
 * Clean up test environment
 */
export function cleanupTestAssistantName() {
  delete process.env.ASSISTANT_NAME;
}

/**
 * Get the expected values for the current test environment
 */
export function getTestBrandingValues() {
  return {
    reportHeader: getReportHeader(),
    workingMessage: getWorkingMessage(),
    signatureTemplate: getSignatureTemplate(),
  };
}

/**
 * Set up a test environment with default Claude branding for backward compatibility
 */
export function setupDefaultTestBranding() {
  process.env.ASSISTANT_NAME = "Claude";
}

/**
 * Get the working message pattern for testing (handles both with and without trailing dots/ellipsis)
 */
export function getTestWorkingPattern() {
  const assistantName = process.env.ASSISTANT_NAME || "Claude";
  return new RegExp(`${assistantName} Code is working[…\\.]{0,3}`, 'i');
}