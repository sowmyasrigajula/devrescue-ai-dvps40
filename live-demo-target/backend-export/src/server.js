import { createUserAccount } from "./services/userService.js";

export function handleSignup(requestBody) {
  if (!requestBody.email) {
    return {
      status: 400,
      body: { error: "Email is required" }
    };
  }

  const user = createUserAccount(requestBody.email);

  return {
    status: 201,
    body: { user }
  };
}
