import http from "node:http";
import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { runDevRescue } from "./agent.js";
import { createLivePullRequest, getGitHubStatus } from "./github.js";
import { resetScenarioRepo, scenarios } from "./scenarios.js";

const port = Number(process.env.PORT || 8080);
const serverRepoRoot = resolve(".server-run", "repo");

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body, null, 2));
}

function readRequestBody(request) {
  return new Promise((resolveBody, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => resolveBody(body));
    request.on("error", reject);
  });
}

function sendFile(response, filePath) {
  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8"
  };
  response.writeHead(200, { "Content-Type": contentTypes[extname(filePath)] || "text/plain; charset=utf-8" });
  response.end(readFileSync(filePath));
}

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/") {
    sendFile(response, resolve("public/index.html"));
    return;
  }

  if (request.method === "GET" && ["/styles.css", "/app.js"].includes(request.url)) {
    sendFile(response, resolve(`public${request.url}`));
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, { ok: true, service: "devrescue-ai" });
    return;
  }

  if (request.method === "GET" && request.url === "/api/scenarios") {
    sendJson(response, 200, {
      scenarios: scenarios.map(({ id, name, platform, log }) => ({ id, name, platform, log }))
    });
    return;
  }

  if (request.method === "GET" && request.url === "/api/github/status") {
    sendJson(response, 200, getGitHubStatus());
    return;
  }

  if (request.method === "POST" && request.url === "/telegram/webhook") {
    const body = await readRequestBody(request);
    const update = JSON.parse(body || "{}");
    const scenario = resetScenarioRepo(serverRepoRoot, update.scenarioId);
    const logText = update.message?.text || scenario.log || readFileSync(resolve("sample-logs/vercel-import-error.log"), "utf8");

    const result = runDevRescue({ repoRoot: serverRepoRoot, logText });
    const stepLines = result.timeline.map((step, index) => `${index + 1}. ${step.label}: ${step.detail}`);

    sendJson(response, 200, {
      chat_id: update.message?.chat?.id || "demo",
      text: [
        "DevRescue AI incident response",
        `Scenario: ${scenario.name}`,
        `Root cause: ${result.analysis.rootCause}`,
        "",
        "Steps completed:",
        ...stepLines,
        "",
        `Validation: ${result.validation.passed ? "passed" : "failed"}`,
        `PR title: ${result.pullRequest.title}`,
        `PR target: ${result.pullRequest.targetBranch}`,
        "Direct push to main: blocked"
      ].join("\n"),
      result
    });
    return;
  }

  if (request.method === "POST" && request.url === "/api/github/pr") {
    try {
      const body = await readRequestBody(request);
      const update = JSON.parse(body || "{}");
      const scenario = resetScenarioRepo(serverRepoRoot, update.scenarioId);
      const logText = update.logText || scenario.log;
      const result = runDevRescue({ repoRoot: serverRepoRoot, logText });
      const pullRequest = await createLivePullRequest(result, scenario.id);

      sendJson(response, 200, {
        ok: true,
        pullRequest,
        result
      });
    } catch (error) {
      sendJson(response, 400, {
        ok: false,
        error: error.message
      });
    }
    return;
  }

  sendJson(response, 404, { error: "Not found" });
});

server.listen(port, () => {
  console.log(`DevRescue AI server running on http://localhost:${port}`);
  console.log("POST /telegram/webhook with a Telegram-style update body.");
});
