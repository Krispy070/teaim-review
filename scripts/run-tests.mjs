import { spawn } from "node:child_process";

const forwardedArgs = process.argv.slice(2).filter((arg) => arg !== "--run");

const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const child = spawn(command, [
  "exec",
  "playwright",
  "test",
  "--config=playwright.smoke.config.ts",
  ...forwardedArgs,
], {
  stdio: "inherit",
});

child.on("close", (code) => {
  process.exit(code ?? 1);
});
