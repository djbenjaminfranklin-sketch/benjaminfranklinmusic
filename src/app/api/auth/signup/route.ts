import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createUser, getUserByEmail, createSession } from "@/shared/lib/db";
import { hashPassword, createJWT, setAuthCookie, sanitizeUser } from "@/features/auth/lib/auth";

const signupSchema = z.object({
  email: z.email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(50, "Name is too long"),
  phone: z.string().trim().max(20).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = signupSchema.safeParse(body);

    if (!result.success) {
      const firstError = result.error.issues[0];
      return NextResponse.json(
        { error: firstError.message },
        { status: 400 }
      );
    }

    const { email: rawEmail, password, name, phone } = result.data;
    const email = rawEmail.toLowerCase();

    const existing = getUserByEmail(email);
    if (existing) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
    const role = adminEmails.includes(email.toLowerCase()) ? "admin" : "fan";
    const user = createUser(email, passwordHash, name, role, phone);
    const session = createSession(user.id);
    const token = createJWT({ userId: user.id, sessionId: session.id });

    const response = NextResponse.json(
      { user: sanitizeUser(user) },
      { status: 201 }
    );

    return setAuthCookie(response, token);
  } catch {
    return NextResponse.json(
      { error: "Failed to create account" },
      { status: 500 }
    );
  }
}
