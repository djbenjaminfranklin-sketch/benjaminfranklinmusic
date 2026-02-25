"use client";

import { useSearchParams } from "next/navigation";
import CoHostPanel from "@/components/live/CoHostPanel";

export default function CoHostPage() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code") || "";

  return <CoHostPanel code={code} />;
}
