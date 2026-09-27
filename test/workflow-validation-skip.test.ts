import { describe, expect, spyOn, test } from "bun:test";
import * as core from "@actions/core";
import { handleWorkflowValidationSkip } from "../src/entrypoints/run";

describe("handleWorkflowValidationSkip", () => {
  test("reports a neutral conclusion so a skip is not mistaken for a passing review", () => {
    const setOutputSpy = spyOn(core, "setOutput").mockImplementation(() => {});
    const consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    try {
      handleWorkflowValidationSkip();

      expect(setOutputSpy).toHaveBeenCalledWith(
        "skipped_due_to_workflow_validation_mismatch",
        "true",
      );
      expect(setOutputSpy).toHaveBeenCalledWith("conclusion", "neutral");
      // The skip must never report success: a skipped review is not a pass.
      expect(setOutputSpy).not.toHaveBeenCalledWith("conclusion", "success");
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Exiting due to workflow validation skip",
      );
    } finally {
      setOutputSpy.mockRestore();
      consoleLogSpy.mockRestore();
    }
  });
});
