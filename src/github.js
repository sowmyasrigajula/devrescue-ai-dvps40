function readGitHubConfig() {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;

  return {
    token,
    owner,
    repo,
    ready: Boolean(token && owner && repo)
  };
}

async function githubRequest(config, path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...options.headers
    }
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(`GitHub API failed: ${body.message || response.statusText}`);
  }

  return body;
}

async function createOrResetBranch(config, branchName, baseBranch) {
  const baseRef = await githubRequest(config, `/repos/${config.owner}/${config.repo}/git/ref/heads/${baseBranch}`);
  const sha = baseRef.object.sha;

  try {
    await githubRequest(config, `/repos/${config.owner}/${config.repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha
      })
    });
  } catch (error) {
    if (!error.message.includes("Reference already exists")) {
      throw error;
    }

    await githubRequest(config, `/repos/${config.owner}/${config.repo}/git/refs/heads/${branchName}`, {
      method: "PATCH",
      body: JSON.stringify({
        sha,
        force: true
      })
    });
  }
}

async function getFileSha(config, filePath, branchName) {
  try {
    const file = await githubRequest(config, `/repos/${config.owner}/${config.repo}/contents/${filePath}?ref=${branchName}`);
    return file.sha;
  } catch (error) {
    if (error.message.includes("Not Found")) {
      return undefined;
    }
    throw error;
  }
}

async function upsertFile(config, branchName, filePath, content, message) {
  const sha = await getFileSha(config, filePath, branchName);
  const body = {
    message,
    content: Buffer.from(content, "utf8").toString("base64"),
    branch: branchName
  };

  if (sha) {
    body.sha = sha;
  }

  await githubRequest(config, `/repos/${config.owner}/${config.repo}/contents/${filePath}`, {
    method: "PUT",
    body: JSON.stringify(body)
  });
}

async function openPullRequest(config, result) {
  return githubRequest(config, `/repos/${config.owner}/${config.repo}/pulls`, {
    method: "POST",
    body: JSON.stringify({
      title: result.pullRequest.title,
      head: result.pullRequest.sourceBranch,
      base: result.pullRequest.targetBranch,
      body: result.pullRequest.body
    })
  });
}

export function getGitHubStatus() {
  const config = readGitHubConfig();

  return {
    ready: config.ready,
    owner: config.owner || "",
    repo: config.repo || "",
    requiredEnv: ["GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO"]
  };
}

export async function createLivePullRequest(result) {
  const config = readGitHubConfig();

  if (!config.ready) {
    throw new Error("Set GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO before creating a live PR.");
  }

  if (!result.patch?.ok || !result.patch.displayFile || !result.patch.after) {
    throw new Error("No validated code patch is available for a live PR.");
  }

  await createOrResetBranch(config, result.pullRequest.sourceBranch, result.pullRequest.targetBranch);
  await upsertFile(
    config,
    result.pullRequest.sourceBranch,
    result.patch.displayFile,
    result.patch.after,
    result.pullRequest.title
  );

  const pullRequest = await openPullRequest(config, result);

  return {
    number: pullRequest.number,
    url: pullRequest.html_url,
    title: pullRequest.title,
    branch: result.pullRequest.sourceBranch,
    target: result.pullRequest.targetBranch
  };
}
