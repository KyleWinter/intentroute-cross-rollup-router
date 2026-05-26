import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");

const forgeArgs = process.argv.slice(2);

// Resolve solc 0.7.4 from (in order): env override, in-repo data/solc/ (where
// `npm run install-solc` parks the binary), solc-select, and finally the
// hardhat-nodejs compiler cache used on macOS / Linux dev boxes.
const SOLC_CANDIDATES = [
  process.env.LOCAL_SOLC_PATH,
  join(ROOT, "data", "solc", "solc-0.7.4"),
  join(homedir(), ".solc-select", "artifacts", "solc-0.7.4", "solc-0.7.4"),
  join(
    homedir(),
    "Library/Caches/hardhat-nodejs/compilers-v2/macosx-amd64/solc-macosx-amd64-v0.7.4+commit.3f05b770"
  ),
  join(
    homedir(),
    "Library/Caches/hardhat-nodejs/compilers-v2/linux-amd64/solc-linux-amd64-v0.7.4+commit.3f05b770"
  )
].filter(Boolean);

const localSolcPath = SOLC_CANDIDATES.find((candidate) => existsSync(candidate));

if (!localSolcPath) {
  console.error(
    "Unable to find solc 0.7.4. Tried in order:\n" +
      SOLC_CANDIDATES.map((p) => `  - ${p}`).join("\n") +
      "\nRun `npm run install-solc` to download it, or set LOCAL_SOLC_PATH."
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
