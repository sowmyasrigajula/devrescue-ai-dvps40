import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeDeploymentLog } from "./analyzer.js";
import { runDevRescue } from "./agent.js";
import { resetScenarioRepo, scenarios } from "./scenarios.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const testRoot = resolve(projectRoot, ".test-run");

if (existsSync(testRoot)) {
  rmSync(testRoot, { recursive: true, force: true });
}

const expected = {
  "backend-export": {
    type: "BACKEND_NAMED_EXPORT_MISMATCH",
    file: "src/server.js",
    text: /createUserAccount/
  },
  "route-handler": {
    type: "BACKEND_ROUTE_HANDLER_MISMATCH",
    file: "src/routes/orderRoutes.js",
    text: /createOrderHandler/
  },
  "module-path": {
    type: "BACKEND_MODULE_PATH_MISMATCH",
    file: "src/server.js",
    text: /middlewares\/authMiddleware/
  }
};

for (const scenario of scenarios) {
  const testRepo = resolve(testRoot, scenario.id, "repo");
  mkdirSync(dirname(testRepo), { recursive: true });
  resetScenarioRepo(testRepo, scenario.id);

  const analysis = analyzeDeploymentLog(scenario.log);
  assert.equal(analysis.type, expected[scenario.id].type);

  const result = runDevRescue({ repoRoot: testRepo, logText: scenario.log });
  const fixedFile = readFileSync(resolve(testRepo, expected[scenario.id].file), "utf8");

  assert.equal(result.patch.ok, true);
  assert.equal(result.validation.passed, true);
  assert.match(fixedFile, expected[scenario.id].text);
  assert.equal(result.pullRequest.targetBranch, "dev");
  assert.equal(result.policy.directPushAllowed, false);
}

console.log("All tests passed");
