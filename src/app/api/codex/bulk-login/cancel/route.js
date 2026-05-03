import { NextResponse } from "next/server";
import { cancelCodexBulkLoginJob } from "@/lib/codexBulkLogin/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json();
    const job = cancelCodexBulkLoginJob(body?.jobId);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    return NextResponse.json({ job });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to cancel job" }, { status: 400 });
  }
}
