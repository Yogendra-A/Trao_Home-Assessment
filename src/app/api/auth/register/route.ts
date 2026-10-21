import { type NextRequest } from "next/server";
import { z } from "zod";
import { hashPassword } from "../../../../../server/src/auth/password";
import {
  createSessionToken,
  getSessionCookieHeader,
} from "../../../../../server/src/auth/session";
import {
  createUser,
  RepositoryError,
} from "../../../../../server/src/db/repository";

const RegisterSchema = z.object({
  email: z.string().email("Please provide a valid email address."),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters long.")
    .max(100, "Password is too long."),
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

  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return Response.json(
      { error: first?.message ?? "Invalid registration data.", code: "VALIDATION_ERROR" },
      { status: 422 },
    );
  }

  const { email, password } = parsed.data;

  try {
    const passwordHash = await hashPassword(password);
    const user = await createUser(email, passwordHash);
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
        status: 201,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": getSessionCookieHeader(token),
        },
      },
    );
  } catch (error) {
    if (error instanceof RepositoryError) {
      if (error.code === "USER_EXISTS") {
        return Response.json(
          { error: error.message, code: "USER_EXISTS" },
          { status: 409 },
        );
      }
      if (error.code === "DATABASE_UNAVAILABLE") {
        return Response.json(
          {
            error: "Registration service is temporarily unavailable. Please try again shortly.",
            code: "SERVICE_UNAVAILABLE",
          },
          { status: 503 },
        );
      }
    }

    return Response.json(
      { error: "Failed to register user. Please try again.", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
