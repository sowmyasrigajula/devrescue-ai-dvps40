export function analyzeDeploymentLog(logText) {
  const text = String(logText || "");
  const namedExportError = text.match(/(?:requested module|module)\s+['"](.+?)['"]\s+does not provide an export named\s+['"](.+?)['"]/i);
  const serverFileMatch = text.match(/(?:^|\n)(src\/[\w./-]+\.js)/i);
  const routeHandlerError = text.match(/Route handler ['"](.+?)['"] is undefined in (src\/[\w./-]+\.js)/i);

  if (routeHandlerError) {
    const importer = `./${routeHandlerError[2]}`;

    return {
      type: "BACKEND_ROUTE_HANDLER_MISMATCH",
      severity: "high",
      confidence: 0.89,
      missingExport: routeHandlerError[1],
      importer,
      rootCause: `The backend deployment failed because route file ${importer} registers ${routeHandlerError[1]}, but that handler is not exported by its controller.`,
      fixStrategy: "Pull the dev branch, inspect the route import and controller exports, replace the undefined handler with the existing exported controller, then validate before preparing a PR."
    };
  }

  if (namedExportError) {
    const importer = serverFileMatch ? `./${serverFileMatch[1]}` : "./src/server.js";

    return {
      type: "BACKEND_NAMED_EXPORT_MISMATCH",
      severity: "high",
      confidence: 0.92,
      missingExport: namedExportError[2],
      dependency: namedExportError[1],
      importer,
      rootCause: `The backend deployment failed because ${importer} imports ${namedExportError[2]} from ${namedExportError[1]}, but that service exports a differently named function.`,
      fixStrategy: "Pull the dev branch, inspect the backend service exports, replace the broken import and matching call site, then validate the build before preparing a PR."
    };
  }

  const importError = text.match(/Module not found:\s+Can't resolve ['"](.+?)['"] in ['"](.+?)['"]/i);

  if (importError) {
    const isBackendImport = importError[2].includes("src/server");

    return {
      type: isBackendImport ? "BACKEND_MODULE_PATH_MISMATCH" : "IMPORT_PATH_MISMATCH",
      severity: "high",
      confidence: 0.94,
      missingImport: importError[1],
      importer: importError[2],
      rootCause: isBackendImport
        ? `The backend deployment failed because ${importError[2]} imports ${importError[1]}, but that middleware/module path cannot be resolved during build.`
        : `The deployment failed because ${importError[2]} imports ${importError[1]}, but that module path cannot be resolved during build.`,
      fixStrategy: isBackendImport
        ? "Pull the dev branch, search backend modules for the matching file, update the import path, validate the build, and prepare a PR back to dev."
        : "Search for a similarly named module file and update the import path with the exact filename casing."
    };
  }

  const envError = text.match(/(?:missing|required|not found).*(?:env|environment variable|process\.env)\.?([A-Z0-9_]+)?/i);

  if (envError) {
    return {
      type: "MISSING_ENVIRONMENT_VARIABLE",
      severity: "medium",
      confidence: 0.78,
      rootCause: "The deployment appears to be missing a required environment variable.",
      fixStrategy: "Add the missing environment variable in the deployment platform and document it in the project env template."
    };
  }

  return {
    type: "UNKNOWN_DEPLOYMENT_FAILURE",
    severity: "medium",
    confidence: 0.35,
    rootCause: "The log does not match a supported automatic-fix pattern yet.",
    fixStrategy: "Escalate with a human-readable explanation and request the relevant source files."
  };
}
