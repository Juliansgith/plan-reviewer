// npm start: runs the production build the same way the Docker image does,
// with the standalone server, and points it at ./data.
//
//   PORT       port to listen on (default 3000; `make run` uses 8000)
//   BIND_HOST  address to bind (default 0.0.0.0). Not HOSTNAME: shells often
//              set HOSTNAME to the machine name, which Next.js would bind to.
//   DATA_DIR   folder with plans/ and reviews/ (default ./data)
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const server = resolve(".next/standalone/server.js");
if (!existsSync(server)) {
  console.error("No production build found. Run `npm run build` first.");
  process.exit(2);
}

const child = spawn(process.execPath, [server], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: process.env.PORT ?? "3000",
    HOSTNAME: process.env.BIND_HOST ?? "0.0.0.0",
    // Absolute, because the standalone server changes its working directory
    // to .next/standalone when it starts.
    DATA_DIR: resolve(process.env.DATA_DIR ?? "data"),
  },
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
