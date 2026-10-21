import { type NextRequest } from "next/server";
import { z } from "zod";
import { comparePassword } from "../../../../../server/src/auth/password";
import {
  createSessionToken,
  getSessionCookieHeader,
} from "../../../../../server/src/auth/session";
import {
  findUserByEmail,
  RepositoryError,
} from "../../../../../server/src/db/repository";

const LoginSchema = z.object({
  email: z.string().email("Please provide a valid email address."),
  password: z.string().min(1, "Password is required."),
});

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid JSON body.", code: "BAD_REQUEST" },
      { status: 400 },
    );
  }

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return Response.json(
      { error: first?.message ?? "Invalid login data.", code: "VALIDATION_ERROR" },
      { status: 422 },
    );
  }

  const { email, password } = parsed.data;

  try {
    const user = await findUserByEmail(email);
    if (!user) {
      return Response.json(
        { error: "Invalid email or password.", code: "INVALID_CREDENTIALS" },
        { status: 401 },
      );
    }

    const validPassword = await comparePassword(password, user.passwordHash);
    if (!validPassword) {
      return Response.json(
        { error: "Invalid email or password.", code: "INVALID_CREDENTIALS" },
        { status: 401 },
      );
    }

    const token = createSessionToken(user.id);

    return new Response(
      JSON.stringify({
        user: {
          id: user.id,
          email: user.email,
          createdAt: user.createdAt,
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": getSessionCookieHeader(token),
        },
      },
    );
  } catch (error) {
    if (error instanceof RepositoryError && error.code === "DATABASE_UNAVAILABLE") {
      return Response.json(
        {
          error: "Authentication service is temporarily unavailable. Please try again shortly.",
          code: "SERVICE_UNAVAILABLE",
        },
        { status: 503 },
      );
    }

    return Response.json(
      { error: "Login failed. Please try again.", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
