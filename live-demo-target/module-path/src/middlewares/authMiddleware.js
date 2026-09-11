export function requireAuth(headers) {
  return {
    userId: headers["x-user-id"] || "demo-user"
  };
}
