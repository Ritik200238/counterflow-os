"use client";

import { clerkEnabled } from "@/lib/auth";
import { useUser, SignInButton, UserButton } from "@clerk/nextjs";

// Renders sign-in / account UI only when Clerk is configured. Without keys this
// is a no-op, so the public demo is unaffected.
export default function AuthButton() {
  if (!clerkEnabled) return null;
  return <AuthInner />;
}

function AuthInner() {
  const { isSignedIn, isLoaded } = useUser();
  if (!isLoaded) return null;
  if (isSignedIn) return <UserButton />;
  return (
    <SignInButton mode="modal">
      <button className="rounded-md border hairline bg-white/5 px-3 py-1.5 text-sm text-slate-200 hover:bg-white/10">
        Sign in
      </button>
    </SignInButton>
  );
}
