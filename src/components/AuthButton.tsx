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
      <button className="rounded-md border hairline bg-[#F7F7F5] px-3 py-1.5 text-sm text-ink hover:bg-[#EFEEE9]">
        Sign in
      </button>
    </SignInButton>
  );
}
