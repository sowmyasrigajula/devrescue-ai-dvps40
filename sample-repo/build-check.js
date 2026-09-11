import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(__dirname, "src/server.js");
const serverSource = readFileSync(serverPath, "utf8");
const importMatch = serverSource.match(/import\s+\{\s*(\w+)\s*\}\s+from\s+["'](.+?)["']/);

if (!importMatch) {
  console.error("No named backend import found in src/server.js");
  process.exit(1);
}

const importedName = importMatch[1];
const importedPath = resolve(dirname(serverPath), importMatch[2]);

if (!existsSync(importedPath)) {
  console.error(`Cannot find module '${importMatch[2]}' imported from './src/server.js'`);
  process.exit(1);
}

const dependencySource = readFileSync(importedPath, "utf8");
const exportPattern = new RegExp(`export\\s+(?:async\\s+)?(?:function|const|class)\\s+${importedName}\\b`);

if (!exportPattern.test(dependencySource)) {
  console.error(`SyntaxError: The requested module '${importMatch[2]}' does not provide an export named '${importedName}'`);
  process.exit(1);
}

console.log("Build passed");
