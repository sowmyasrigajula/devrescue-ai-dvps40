const runButton = document.querySelector("#runButton");
const livePrButton = document.querySelector("#livePrButton");
const logInput = document.querySelector("#logInput");
const scenarioSelect = document.querySelector("#scenarioSelect");
const statusLabel = document.querySelector("#status");
const botReply = document.querySelector("#botReply");
const rootCause = document.querySelector("#rootCause");
const scenarioName = document.querySelector("#scenarioName");
const validation = document.querySelector("#validation");
const risk = document.querySelector("#risk");
const branch = document.querySelector("#branch");
const diff = document.querySelector("#diff");
const prPreview = document.querySelector("#prPreview");
const timeline = document.querySelector("#timeline");
const reviewChecks = document.querySelector("#reviewChecks");
let scenarios = [];
let githubReady = false;
let lastResult = null;

function makeDiff(patch) {
  if (!patch?.ok) {
    return patch?.reason || "No patch applied.";
  }

  return [
    `--- before ${patch.displayFile || "backend file"}`,
    patch.before.trim(),
    "",
    `+++ after ${patch.displayFile || "backend file"}`,
    patch.after.trim()
  ].join("\n");
}

function renderTimeline(steps) {
  timeline.innerHTML = steps
    .map((step) => `<li class="${step.state}"><strong>${step.label}</strong><span>${step.detail}</span></li>`)
    .join("");
}

function renderReview(checks) {
  reviewChecks.innerHTML = checks
    .map((check) => {
      const state = check.passed ? "pass" : "fail";
      return `<article class="${state}"><strong>${check.passed ? "PASS" : "FAIL"} ${check.name}</strong><span>${check.detail}</span></article>`;
    })
    .join("");
}

async function loadScenarios() {
  const [scenarioResponse, githubResponse] = await Promise.all([
    fetch("/api/scenarios"),
    fetch("/api/github/status")
  ]);
  const scenarioPayload = await scenarioResponse.json();
  const githubPayload = await githubResponse.json();
  scenarios = scenarioPayload.scenarios;
  githubReady = githubPayload.ready;
  livePrButton.title = githubReady
    ? `Create PR in ${githubPayload.owner}/${githubPayload.repo}`
    : "Set GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO to enable live PR creation.";

  const selected = scenarios.find((scenario) => scenario.id === scenarioSelect.value) || scenarios[0];
  if (selected) {
    logInput.value = selected.log;
    scenarioName.textContent = selected.name;
  }
}

scenarioSelect.addEventListener("change", () => {
  const selected = scenarios.find((scenario) => scenario.id === scenarioSelect.value);
  if (!selected) {
    return;
  }

  logInput.value = selected.log;
  scenarioName.textContent = selected.name;
  statusLabel.textContent = "Ready";
  botReply.textContent = `Loaded ${selected.platform} failure: ${selected.name}. Click Run Auto-Fix to start.`;
  rootCause.textContent = "Waiting for analysis.";
  validation.textContent = "Not run yet.";
  risk.textContent = "Not reviewed yet.";
  branch.textContent = "dev";
  diff.textContent = "No patch yet.";
  prPreview.textContent = "No PR preview yet.";
  lastResult = null;
  livePrButton.disabled = true;
  timeline.innerHTML = "<li><strong>Waiting</strong><span>Ready to parse a deployment failure.</span></li>";
  reviewChecks.innerHTML = "<p>No review yet.</p>";
});

runButton.addEventListener("click", async () => {
  runButton.disabled = true;
  statusLabel.textContent = "Running";
  botReply.textContent = "Parsing deployment logs, pulling dev branch, and locating the backend failure...";
  renderTimeline([
    {
      label: "Running",
      detail: "DevRescue is analyzing the incident.",
      state: "review"
    }
  ]);

  try {
    const response = await fetch("/telegram/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        scenarioId: scenarioSelect.value,
        message: {
          chat: { id: "browser-demo" },
          text: logInput.value
        }
      })
    });

    const payload = await response.json();
    const result = payload.result;
    const selected = scenarios.find((scenario) => scenario.id === scenarioSelect.value);
    lastResult = result;

    statusLabel.textContent = result.validation.passed ? "Fixed" : "Review";
    botReply.textContent = payload.text;
    scenarioName.textContent = selected?.name || "Custom failure";
    rootCause.textContent = result.analysis.rootCause;
    validation.textContent = result.validation.passed ? "Build passed" : "Build failed";
    risk.textContent = result.review.risk;
    branch.textContent = `${result.pullRequest.sourceBranch} -> ${result.pullRequest.targetBranch}`;
    diff.textContent = makeDiff(result.patch);
    prPreview.textContent = `Title: ${result.pullRequest.title}\n\n${result.pullRequest.body}`;
    renderTimeline(result.timeline);
    renderReview(result.review.checks);
    livePrButton.disabled = !githubReady || !result.patch.ok || !result.validation.passed;
  } catch (error) {
    statusLabel.textContent = "Error";
    botReply.textContent = error.message;
  } finally {
    runButton.disabled = false;
  }
});

livePrButton.addEventListener("click", async () => {
  if (!lastResult || !githubReady) {
    return;
  }

  livePrButton.disabled = true;
  statusLabel.textContent = "PR";
  botReply.textContent = "Creating a live GitHub branch and pull request from dev...";

  try {
    const response = await fetch("/api/github/pr", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        scenarioId: scenarioSelect.value,
        logText: logInput.value
      })
    });
    const payload = await response.json();

    if (!payload.ok) {
      throw new Error(payload.error);
    }

    botReply.textContent = `Live GitHub PR created: ${payload.pullRequest.url}`;
    prPreview.textContent = `${prPreview.textContent}\n\nLive PR: ${payload.pullRequest.url}`;
    window.open(payload.pullRequest.url, "_blank", "noopener,noreferrer");
  } catch (error) {
    statusLabel.textContent = "Review";
    botReply.textContent = error.message;
    livePrButton.disabled = false;
  }
});

loadScenarios().catch((error) => {
  botReply.textContent = error.message;
});
