import { NextRequest } from "next/server";

export function isTool19Authorized(request: NextRequest): boolean {
  const adminKey = process.env["TOOL19_ADMIN_KEY"];

  // Allow local development when no key is configured.
  if (!adminKey) {
    return process.env["NODE_ENV"] !== "production";
  }

  const providedKey = request.headers.get("x-tool-admin-key") || "";
  return providedKey === adminKey;
}

export function makeErrorId(): string {
  return `t19_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
