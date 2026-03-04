import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserByEmail, createSession, promoteToAdmin } from "@/shared/lib/db";
import { verifyPassword, createJWT, setAuthCookie, sanitizeUser } from "@/features/auth/lib/auth";

const loginSchema = z.object({
  email: z.email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = loginSchema.safeParse(body);

    if (!result.success) {
      const firstError = result.error.issues[0];
      return NextResponse.json(
        { error: firstError.message },
        { status: 400 }
      );
    }

    const { email: rawEmail, password } = result.data;
    const email = rawEmail.toLowerCase();

    const user = getUserByEmail(email);
    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // OAuth-only accounts have no password — direct to OAuth button
    if (user.password_hash === "" && user.auth_provider !== "email") {
      const provider = user.auth_provider === "google" ? "Google" : "Apple";
      return NextResponse.json(
        { error: `This account uses ${provider} Sign-In. Please use the "${provider}" button.` },
        { status: 400 }
      );
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    if (user.banned === 1) {
      return NextResponse.json(
        { error: "Account suspended" },
        { status: 403 }
      );
    }

    // Auto-promote admin emails on login
    const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (adminEmails.includes(email.toLowerCase()) && user.role !== "admin") {
      promoteToAdmin(user.id);
      user.role = "admin";
    }

    const session = createSession(user.id);
    const token = createJWT({ userId: user.id, sessionId: session.id });

    const response = NextResponse.json({ user: sanitizeUser(user) });
    return setAuthCookie(response, token);
  } catch {
    return NextResponse.json(
      { error: "Failed to login" },
      { status: 500 }
    );
  }
}
