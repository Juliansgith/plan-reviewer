// Next.js "standalone" output leaves static assets out of the server folder
// on purpose (they are usually served by a CDN). We serve them ourselves, so
// copy them in, as the Next.js docs describe. Docker does the same copy.
import { cpSync, existsSync } from "node:fs";

cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
if (existsSync("public")) cpSync("public", ".next/standalone/public", { recursive: true });
