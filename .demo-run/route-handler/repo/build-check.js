import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const routePath = resolve(__dirname, "src/routes/orderRoutes.js");
const routeSource = readFileSync(routePath, "utf8");
const importMatch = routeSource.match(/import\s+\{\s*(\w+)\s*\}\s+from\s+["'](.+?)["']/);

if (!importMatch) {
  console.error("No route handler import found");
  process.exit(1);
}

const handlerName = importMatch[1];
const controllerPath = resolve(dirname(routePath), importMatch[2]);

if (!existsSync(controllerPath)) {
  console.error(`Cannot find controller '${importMatch[2]}' imported from './src/routes/orderRoutes.js'`);
  process.exit(1);
}

const controllerSource = readFileSync(controllerPath, "utf8");
const exportPattern = new RegExp(`export\\s+(?:async\\s+)?(?:function|const|class)\\s+${handlerName}\\b`);

if (!exportPattern.test(controllerSource)) {
  console.error(`TypeError: Route handler '${handlerName}' is undefined in src/routes/orderRoutes.js`);
  process.exit(1);
}

console.log("Build passed");
