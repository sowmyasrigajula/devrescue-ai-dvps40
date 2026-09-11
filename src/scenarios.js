import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const scenarios = [
  {
    id: "backend-export",
    name: "Backend service export mismatch",
    platform: "Railway",
    log: `Railway deployment failed

Running "npm run build"

src/server.js
SyntaxError: The requested module './services/userService.js' does not provide an export named 'createUser'

Error: Command "npm run build" exited with 1`,
    files: {
      "package.json": JSON.stringify({ name: "devrescue-backend-export", version: "1.0.0", type: "module", scripts: { build: "node build-check.js" } }, null, 2),
      "build-check.js": `import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(__dirname, "src/server.js");
const serverSource = readFileSync(serverPath, "utf8");
const importMatch = serverSource.match(/import\\s+\\{\\s*(\\w+)\\s*\\}\\s+from\\s+["'](.+?)["']/);

if (!importMatch) {
  console.error("No named backend import found in src/server.js");
  process.exit(1);
}

const importedName = importMatch[1];
const importedPath = resolve(dirname(serverPath), importMatch[2]);

if (!existsSync(importedPath)) {
  console.error(\`Cannot find module '\${importMatch[2]}' imported from './src/server.js'\`);
  process.exit(1);
}

const dependencySource = readFileSync(importedPath, "utf8");
const exportPattern = new RegExp(\`export\\\\s+(?:async\\\\s+)?(?:function|const|class)\\\\s+\${importedName}\\\\b\`);

if (!exportPattern.test(dependencySource)) {
  console.error(\`SyntaxError: The requested module '\${importMatch[2]}' does not provide an export named '\${importedName}'\`);
  process.exit(1);
}

console.log("Build passed");
`,
      "src/server.js": `import { createUser } from "./services/userService.js";

export function handleSignup(requestBody) {
  if (!requestBody.email) {
    return {
      status: 400,
      body: { error: "Email is required" }
    };
  }

  const user = createUser(requestBody.email);

  return {
    status: 201,
    body: { user }
  };
}
`,
      "src/services/userService.js": `export function createUserAccount(email) {
  return {
    id: \`usr_\${email.split("@")[0]}\`,
    email,
    plan: "starter"
  };
}
`
    }
  },
  {
    id: "route-handler",
    name: "Undefined backend route handler",
    platform: "Vercel",
    log: `Vercel deployment failed

Running "npm run build"

src/routes/orderRoutes.js
TypeError: Route handler 'createOrder' is undefined in src/routes/orderRoutes.js

Error: Command "npm run build" exited with 1`,
    files: {
      "package.json": JSON.stringify({ name: "devrescue-route-handler", version: "1.0.0", type: "module", scripts: { build: "node build-check.js" } }, null, 2),
      "build-check.js": `import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const routePath = resolve(__dirname, "src/routes/orderRoutes.js");
const routeSource = readFileSync(routePath, "utf8");
const importMatch = routeSource.match(/import\\s+\\{\\s*(\\w+)\\s*\\}\\s+from\\s+["'](.+?)["']/);

if (!importMatch) {
  console.error("No route handler import found");
  process.exit(1);
}

const handlerName = importMatch[1];
const controllerPath = resolve(dirname(routePath), importMatch[2]);

if (!existsSync(controllerPath)) {
  console.error(\`Cannot find controller '\${importMatch[2]}' imported from './src/routes/orderRoutes.js'\`);
  process.exit(1);
}

const controllerSource = readFileSync(controllerPath, "utf8");
const exportPattern = new RegExp(\`export\\\\s+(?:async\\\\s+)?(?:function|const|class)\\\\s+\${handlerName}\\\\b\`);

if (!exportPattern.test(controllerSource)) {
  console.error(\`TypeError: Route handler '\${handlerName}' is undefined in src/routes/orderRoutes.js\`);
  process.exit(1);
}

console.log("Build passed");
`,
      "src/routes/orderRoutes.js": `import { createOrder } from "../controllers/orderController.js";

export const orderRoutes = [
  {
    method: "POST",
    path: "/orders",
    handler: createOrder
  }
];
`,
      "src/controllers/orderController.js": `export function createOrderHandler(requestBody) {
  return {
    status: 201,
    body: {
      orderId: "ord_1001",
      total: requestBody.total
    }
  };
}
`
    }
  },
  {
    id: "module-path",
    name: "Backend middleware path mismatch",
    platform: "Railway",
    log: `Railway deployment failed

Running "npm run build"

src/server.js
Module not found: Can't resolve './middleware/authMiddleware' in './src/server.js'

Error: Command "npm run build" exited with 1`,
    files: {
      "package.json": JSON.stringify({ name: "devrescue-module-path", version: "1.0.0", type: "module", scripts: { build: "node build-check.js" } }, null, 2),
      "build-check.js": `import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(__dirname, "src/server.js");
const serverSource = readFileSync(serverPath, "utf8");
const importMatch = serverSource.match(/from\\s+["'](.+?)["']/);

if (!importMatch) {
  console.error("No middleware import found in src/server.js");
  process.exit(1);
}

const importedPath = resolve(dirname(serverPath), \`\${importMatch[1]}.js\`);

if (!existsSync(importedPath)) {
  console.error(\`Module not found: Can't resolve '\${importMatch[1]}' in './src/server.js'\`);
  process.exit(1);
}

console.log("Build passed");
`,
      "src/server.js": `import { requireAuth } from "./middleware/authMiddleware";

export function handleProfile(request) {
  const auth = requireAuth(request.headers);
  return {
    status: 200,
    body: {
      userId: auth.userId
    }
  };
}
`,
      "src/middlewares/authMiddleware.js": `export function requireAuth(headers) {
  return {
    userId: headers["x-user-id"] || "demo-user"
  };
}
`
    }
  }
];

export function getScenario(id) {
  return scenarios.find((scenario) => scenario.id === id) || scenarios[0];
}

export function resetScenarioRepo(targetRoot, scenarioId) {
  const scenario = getScenario(scenarioId);

  rmSync(targetRoot, { recursive: true, force: true });

  for (const [filePath, contents] of Object.entries(scenario.files)) {
    const fullPath = join(targetRoot, filePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents);
  }

  return scenario;
}
