import { spawn } from "node:child_process";

const forwardedArgs = process.argv.slice(2).filter((arg) => arg !== "--run");
const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit" });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
      }
    });
  });
}

try {
  await run(command, ["exec", "tsx", "--test", "server/memory/api.test.ts"]);
  await run(command, [
    "exec",
    "playwright",
    "test",
    "--config=playwright.smoke.config.ts",
    ...forwardedArgs,
  ]);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
