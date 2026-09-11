import { requireAuth } from "./middlewares/authMiddleware";

export function handleProfile(request) {
  const auth = requireAuth(request.headers);
  return {
    status: 200,
    body: {
      userId: auth.userId
    }
  };
}
