import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(__dirname, "src/server.js");
const serverSource = readFileSync(serverPath, "utf8");
const importMatch = serverSource.match(/from\s+["'](.+?)["']/);

if (!importMatch) {
  console.error("No middleware import found in src/server.js");
  process.exit(1);
}

const importedPath = resolve(dirname(serverPath), `${importMatch[1]}.js`);

if (!existsSync(importedPath)) {
  console.error(`Module not found: Can't resolve '${importMatch[1]}' in './src/server.js'`);
  process.exit(1);
}

console.log("Build passed");
