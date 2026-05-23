import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const forgeArgs = process.argv.slice(2);
const localSolcPath =
  process.env.LOCAL_SOLC_PATH ?? join(homedir(), ".solc-select", "artifacts", "solc-0.7.4", "solc-0.7.4");

if (!existsSync(localSolcPath)) {
  console.error(
    `Unable to find a local solc binary at ${localSolcPath}. Set LOCAL_SOLC_PATH or install solc 0.7.4 via solc-select.`
  );
  process.exit(1);
}

const child = spawn("forge", [...forgeArgs, "--use", localSolcPath, "--offline"], {
  stdio: "inherit",
  shell: false
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
