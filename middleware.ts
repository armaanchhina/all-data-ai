import { NextResponse, type NextRequest } from "next/server";

// The tunnel makes the app reachable from the internet, but only Meta's webhook should be:
// the inbox, review screen and draft creation stay on the shop computer (localhost).
export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").split(":")[0];
  if (host === "localhost" || host === "127.0.0.1" || req.nextUrl.pathname === "/api/whatsapp") return NextResponse.next();
  return new NextResponse("Not found", { status: 404 });
}
