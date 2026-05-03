import { NextResponse } from "next/server";
import { createCodexBulkLoginJob, getCodexBulkLoginJob } from "@/lib/codexBulkLogin/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json();
    const job = createCodexBulkLoginJob(body?.credentials || body?.text || "", {
      proxies: body?.proxies || "",
    });
    return NextResponse.json({ job });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to start bulk login" }, { status: 400 });
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
  }
  const job = getCodexBulkLoginJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  return NextResponse.json({ job });
}
