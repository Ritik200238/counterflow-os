import { NextResponse } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";

// Next 16 "proxy" convention (formerly middleware). Clerk auth runs only when
// configured; otherwise this is a pass-through so the public app is unaffected.
const enabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default enabled ? clerkMiddleware() : () => NextResponse.next();

export const config = {
  matcher: ["/((?!_next|.*\\.[^/]*$).*)", "/(api|trpc)(.*)"],
};
