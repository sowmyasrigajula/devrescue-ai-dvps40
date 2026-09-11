export function createUserAccount(email) {
  return {
    id: `usr_${email.split("@")[0]}`,
    email,
    plan: "starter"
  };
}
