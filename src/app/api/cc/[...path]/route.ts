import { NextRequest } from "next/server";
import { proxyToBackend } from "@/server/bff/cc-proxy";

/*
 * Every Control Center API call the browser makes goes through the BFF, which attaches the operator
 * token from the httpOnly session cookie server-side. See src/server/bff/cc-proxy.ts.
 *
 * The path after /api/cc is the backend's own, so the API client keeps its `/api/v1/...` paths and
 * only its base URL changed.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ path: string[] }> };

async function handle(req: NextRequest, { params }: Params) {
  const { path } = await params;
  return proxyToBackend(req, path);
}

export const GET = handle;
export const HEAD = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
