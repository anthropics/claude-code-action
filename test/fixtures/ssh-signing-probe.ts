// Runs setupSshSigning and cleanupSshSigning against the git repo in the
// current directory, one argument per step.
//
// `src/github/operations/git-config.ts` resolves the signing key path from HOME
// at module load time, so the companion test spawns this file with HOME set to
// a temp dir to keep the real ~/.ssh untouched.
import {
  cleanupSshSigning,
  setupSshSigning,
} from "../../src/github/operations/git-config";

const TEST_KEY =
  "-----BEGIN OPENSSH PRIVATE KEY-----\ntest-key-content\n-----END OPENSSH PRIVATE KEY-----";

for (const step of process.argv.slice(2)) {
  if (step === "setup") {
    await setupSshSigning(TEST_KEY);
  } else if (step === "cleanup") {
    await cleanupSshSigning();
  } else {
    throw new Error(`Unknown step: ${step}`);
  }
}
