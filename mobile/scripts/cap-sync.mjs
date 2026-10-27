import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(scriptsDir, "..", "node_modules", "@capacitor", "cli", "bin", "capacitor");
const shim = path.join(scriptsDir, "node-userinfo-shim.cjs");
const env = { ...process.env };

try {
  os.userInfo();
} catch {
  env.NODE_OPTIONS = [env.NODE_OPTIONS, `--require=${shim}`].filter(Boolean).join(" ");
}

const child = spawn(process.execPath, [cli, "sync", "android"], {
  cwd: path.resolve(scriptsDir, ".."),
  env,
  stdio: "inherit",
  windowsHide: true,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
