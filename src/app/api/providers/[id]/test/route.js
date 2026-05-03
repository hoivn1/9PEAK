import { NextResponse } from "next/server";
import { testSingleConnection } from "./testUtils.js";

// POST /api/providers/[id]/test - Test connection
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const result = await testSingleConnection(id);

    if (result.error === "Connection not found") {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    return NextResponse.json({
      valid: result.valid,
      error: result.error,
      latencyMs: result.latencyMs || 0,
      statusCode: result.statusCode || null,
      testedAt: result.testedAt,
      refreshed: result.refreshed || false,
      healthCheck: result,
    });
  } catch (error) {
    console.log("Error testing connection:", error);
    return NextResponse.json({ error: "Test failed" }, { status: 500 });
  }
}
