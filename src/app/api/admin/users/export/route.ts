import { NextRequest, NextResponse } from "next/server";
import { getAllUsers } from "@/shared/lib/db";
import { requireAdmin } from "@/features/auth/lib/auth";

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const users = getAllUsers();

  const header = "email,name,phone,role,created_at";
  const rows = users.map((u) => {
    const name = u.name.replace(/"/g, '""');
    return `${u.email},"${name}",${u.phone || ""},${u.role},${u.created_at}`;
  });
  const csv = [header, ...rows].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="users.csv"',
    },
  });
}
