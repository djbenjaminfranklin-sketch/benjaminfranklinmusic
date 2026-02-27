import { NextResponse } from "next/server";
import { getAuthUser, clearAuthCookie } from "@/lib/auth";
import { deleteUser } from "@/lib/db";

export async function DELETE() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  deleteUser(user.id);

  const response = NextResponse.json({ success: true });
  clearAuthCookie(response);
  return response;
}
