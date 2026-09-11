import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runDevRescue } from "./agent.js";
import { resetScenarioRepo, scenarios } from "./scenarios.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const demoRoot = resolve(projectRoot, ".demo-run");

if (existsSync(demoRoot)) {
  rmSync(demoRoot, { recursive: true, force: true });
}

console.log("\nDEVRESCUE AI TELEGRAM DEMO");
console.log("==========================\n");

for (const scenario of scenarios) {
  const demoRepo = resolve(demoRoot, scenario.id, "repo");
  mkdirSync(dirname(demoRepo), { recursive: true });
  resetScenarioRepo(demoRepo, scenario.id);

  const result = runDevRescue({ repoRoot: demoRepo, logText: scenario.log });

  console.log(`Scenario: ${scenario.name}`);
  console.log(`Platform: ${scenario.platform}`);
  console.log("Bot: Deployment failed. Analyzing logs...\n");
  console.log(`Root cause: ${result.analysis.rootCause}`);
  console.log(`Confidence: ${Math.round(result.analysis.confidence * 100)}%`);
  console.log(`Fix strategy: ${result.analysis.fixStrategy}\n`);
  console.log("Step-by-step bot instructions:");
  for (const step of result.timeline) {
    console.log(`- ${step.label}: ${step.detail}`);
  }
  console.log("");

  if (result.patch.ok) {
    console.log(`Backend patch applied: ${result.patch.file}`);
    console.log(`Fix: ${result.patch.explanation}\n`);
  } else {
    console.log(`Patch skipped: ${result.patch.reason}\n`);
  }

  console.log(`Validation: ${result.validation.passed ? "PASSED" : "FAILED"}`);
  console.log(result.validation.output);
  console.log("");

  console.log("Self Review:");
  for (const check of result.review.checks) {
    console.log(`- ${check.passed ? "PASS" : "FAIL"} ${check.name}: ${check.detail}`);
  }
  console.log(`Risk level: ${result.review.risk}\n`);

  console.log("Pull Request Preview:");
  console.log(`Branch: ${result.pullRequest.sourceBranch} -> ${result.pullRequest.targetBranch}`);
  console.log(`Title: ${result.pullRequest.title}`);
  console.log(result.pullRequest.body);
  console.log("\nTelegram final message:");
  console.log("Fix completed. PR is ready for review on the dev branch.");
  console.log("\n--------------------------\n");
}
