import { getClearSessionCookieHeader } from "../../../../../server/src/auth/session";

export async function POST() {
  return new Response(
    JSON.stringify({ success: true }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": getClearSessionCookieHeader(),
      },
    },
  );
}
