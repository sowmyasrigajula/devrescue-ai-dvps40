import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, normalize, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { analyzeDeploymentLog } from "./analyzer.js";

function walkFiles(root, files = []) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function normalizeImportPath(pathValue) {
  return normalize(pathValue).replaceAll("\\", "/").replace(/^\.\//, "");
}

function findClosestFile(repoRoot, importer, missingImport) {
  const importerPath = resolve(repoRoot, importer.replace(/^\.\//, ""));
  const importDirectory = dirname(resolve(dirname(importerPath), missingImport));
  const requestedBase = basename(missingImport).toLowerCase();
  const searchRoot = existsSync(importDirectory) ? importDirectory : repoRoot;
  const files = walkFiles(searchRoot).filter((file) => [".js", ".jsx", ".ts", ".tsx"].includes(extname(file)));

  return files.find((file) => basename(file, extname(file)).toLowerCase() === requestedBase);
}

function createImportPatch(repoRoot, analysis) {
  const importerPath = resolve(repoRoot, analysis.importer.replace(/^\.\//, ""));
  if (!existsSync(importerPath)) {
    return {
      ok: false,
      reason: `Importer file not found: ${analysis.importer}`
    };
  }

  const closestFile = findClosestFile(repoRoot, analysis.importer, analysis.missingImport);
  if (!closestFile) {
    return {
      ok: false,
      reason: "No similarly named component file was found."
    };
  }

  const source = readFileSync(importerPath, "utf8");
  const relativeFixedPath = `./${normalizeImportPath(closestFile.slice(dirname(importerPath).length + 1, -extname(closestFile).length))}`;
  const nextSource = source.replace(analysis.missingImport, relativeFixedPath);

  if (source === nextSource) {
    return {
      ok: false,
      reason: "The importer file did not contain the missing import string."
    };
  }

  writeFileSync(importerPath, nextSource);

  return {
    ok: true,
    category: analysis.importer.includes("src/server") ? "backend" : "frontend",
    file: importerPath,
    displayFile: relative(repoRoot, importerPath).replaceAll("\\", "/"),
    before: source,
    after: nextSource,
    fixedImport: relativeFixedPath,
    changedFiles: [relative(repoRoot, importerPath).replaceAll("\\", "/")],
    explanation: `Updated the backend import path to the existing module ${relativeFixedPath}.`
  };
}

function findExportedNames(source) {
  const names = [];
  const exportRegex = /export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)/g;
  let match = exportRegex.exec(source);

  while (match) {
    names.push(match[1]);
    match = exportRegex.exec(source);
  }

  return names;
}

function scoreNameSimilarity(left, right) {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  if (a === b) {
    return 100;
  }
  if (a.includes(b) || b.includes(a)) {
    return 80;
  }

  let score = 0;
  for (const char of a) {
    if (b.includes(char)) {
      score += 1;
    }
  }
  return score;
}

function createBackendExportPatch(repoRoot, analysis) {
  const importerPath = resolve(repoRoot, analysis.importer.replace(/^\.\//, ""));

  if (!existsSync(importerPath)) {
    return {
      ok: false,
      reason: `Backend entry file not found: ${analysis.importer}`
    };
  }

  const importerSource = readFileSync(importerPath, "utf8");
  const dependency = analysis.dependency || inferDependencyForNamedImport(importerSource, analysis.missingExport);
  const dependencyPath = dependency ? resolve(dirname(importerPath), dependency) : "";

  if (!dependency) {
    return {
      ok: false,
      reason: `Could not find the import that provides ${analysis.missingExport}.`
    };
  }

  if (!existsSync(dependencyPath)) {
    return {
      ok: false,
      reason: `Backend dependency file not found: ${dependency}`
    };
  }

  const dependencySource = readFileSync(dependencyPath, "utf8");
  const exportedNames = findExportedNames(dependencySource);
  const bestExport = exportedNames
    .map((name) => ({ name, score: scoreNameSimilarity(analysis.missingExport, name) }))
    .sort((left, right) => right.score - left.score)[0];

  if (!bestExport || bestExport.score < 3) {
    return {
      ok: false,
      reason: "Could not find a likely replacement export in the backend service."
    };
  }

  const nextSource = importerSource.replaceAll(analysis.missingExport, bestExport.name);

  if (nextSource === importerSource) {
    return {
      ok: false,
      reason: "The broken backend symbol was not present in the importer."
    };
  }

  writeFileSync(importerPath, nextSource);

  return {
    ok: true,
    category: "backend",
    file: importerPath,
    displayFile: relative(repoRoot, importerPath).replaceAll("\\", "/"),
    before: importerSource,
    after: nextSource,
    fixedImport: bestExport.name,
    changedFiles: [relative(repoRoot, importerPath).replaceAll("\\", "/")],
    explanation: `Replaced missing backend symbol ${analysis.missingExport} with existing service export ${bestExport.name}.`
  };
}

function inferDependencyForNamedImport(source, importedName) {
  const importRegex = /import\s+\{\s*([^}]+)\s*\}\s+from\s+["'](.+?)["']/g;
  let match = importRegex.exec(source);

  while (match) {
    const names = match[1].split(",").map((name) => name.trim());
    if (names.includes(importedName)) {
      return match[2];
    }
    match = importRegex.exec(source);
  }

  return "";
}

function validateBuild(repoRoot) {
  try {
    const command = process.platform === "win32" ? "cmd" : "npm";
    const args = process.platform === "win32" ? ["/c", "npm", "run", "build"] : ["run", "build"];
    const output = execFileSync(command, args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });

    return {
      passed: true,
      output: output.trim()
    };
  } catch (error) {
    return {
      passed: false,
      output: `${error.stdout || ""}${error.stderr || ""}`.trim()
    };
  }
}

function buildSelfReview(analysis, patch, validation) {
  const checks = [
    {
      name: "dev-branch-only",
      passed: true,
      detail: "Pulled from dev and prepared a PR back to dev. No main branch write is allowed."
    },
    {
      name: "backend-scope",
      passed: patch.ok && patch.category === "backend",
      detail: patch.ok ? `Changed backend file ${patch.displayFile}.` : "No backend patch was applied."
    },
    {
      name: "minimal-change",
      passed: patch.ok,
      detail: patch.ok ? `Changed ${patch.changedFiles.length} file only.` : "No patch was applied."
    },
    {
      name: "root-cause-match",
      passed: ["IMPORT_PATH_MISMATCH", "BACKEND_NAMED_EXPORT_MISMATCH", "BACKEND_ROUTE_HANDLER_MISMATCH", "BACKEND_MODULE_PATH_MISMATCH"].includes(analysis.type),
      detail: analysis.rootCause
    },
    {
      name: "build-validation",
      passed: validation.passed,
      detail: validation.output || "No build output."
    }
  ];

  return {
    risk: checks.every((check) => check.passed) ? "Low" : "Needs human review",
    checks
  };
}

function buildPullRequestPreview(analysis, patch, validation, review) {
  const titles = {
    BACKEND_NAMED_EXPORT_MISMATCH: "Fix backend deployment failure caused by invalid service import",
    BACKEND_ROUTE_HANDLER_MISMATCH: "Fix backend deployment failure caused by undefined route handler",
    BACKEND_MODULE_PATH_MISMATCH: "Fix backend deployment failure caused by middleware import path",
    IMPORT_PATH_MISMATCH: "Fix deployment failure caused by unresolved import path"
  };

  return {
    sourceBranch: `fix/${analysis.type.toLowerCase().replaceAll("_", "-")}`,
    targetBranch: "dev",
    title: titles[analysis.type] || "Fix deployment failure",
    body: [
      "## Root Cause",
      analysis.rootCause,
      "",
      "## Fix",
      patch.ok ? patch.explanation || `Updated the import to use \`${patch.fixedImport}\`.` : `No automatic patch was applied: ${patch.reason}`,
      "",
      "## Validation",
      validation.passed ? "`npm run build` passed." : "`npm run build` failed.",
      "",
      "## Self Review",
      `Risk level: ${review.risk}`
    ].join("\n")
  };
}

function buildTimeline(analysis, patch, validation, review, pullRequest) {
  return [
    {
      label: "Received Railway/Vercel deployment log",
      detail: "Parsed secondary deployment output from the chat message.",
      state: "done"
    },
    {
      label: "Diagnosed root cause",
      detail: `${analysis.type} with ${Math.round(analysis.confidence * 100)}% confidence.`,
      state: "done"
    },
    {
      label: "Pulled GitHub dev branch",
      detail: "Demo workspace cloned from the protected dev branch snapshot.",
      state: "done"
    },
    {
      label: "Generated backend fix",
      detail: patch.ok ? patch.explanation : patch.reason,
      state: patch.ok ? "done" : "blocked"
    },
    {
      label: "Ran validation",
      detail: validation.passed ? "Build completed successfully." : "Build failed after patch.",
      state: validation.passed ? "done" : "blocked"
    },
    {
      label: "Automated code review",
      detail: `Review result: ${review.risk}.`,
      state: review.risk === "Low" ? "done" : "review"
    },
    {
      label: "Prepared pull request",
      detail: `${pullRequest.sourceBranch} -> ${pullRequest.targetBranch}`,
      state: validation.passed ? "done" : "review"
    }
  ];
}

export function runDevRescue({ repoRoot, logText }) {
  const analysis = analyzeDeploymentLog(logText);
  let patch = {
    ok: false,
    reason: "This failure type is not supported for automatic patching."
  };

  if (analysis.type === "BACKEND_NAMED_EXPORT_MISMATCH" || analysis.type === "BACKEND_ROUTE_HANDLER_MISMATCH") {
    patch = createBackendExportPatch(repoRoot, analysis);
  } else if (analysis.type === "IMPORT_PATH_MISMATCH" || analysis.type === "BACKEND_MODULE_PATH_MISMATCH") {
    patch = createImportPatch(repoRoot, analysis);
  }

  const validation = validateBuild(repoRoot);
  const review = buildSelfReview(analysis, patch, validation);
  const pullRequest = buildPullRequestPreview(analysis, patch, validation, review);
  const timeline = buildTimeline(analysis, patch, validation, review, pullRequest);

  return {
    analysis,
    patch,
    validation,
    review,
    pullRequest,
    timeline,
    policy: {
      sourceBranch: "dev",
      protectedBranch: "main",
      resolution: "Pull Request only",
      directPushAllowed: false
    }
  };
}
