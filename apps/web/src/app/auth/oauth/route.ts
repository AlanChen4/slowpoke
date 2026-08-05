import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const provider = requestUrl.searchParams.get("provider");

  if (provider !== "github" && provider !== "google") {
    return NextResponse.redirect(new URL("/login?error=oauth", requestUrl.origin));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: new URL("/auth/confirm", requestUrl.origin).toString(),
    },
  });

  if (error) {
    return NextResponse.redirect(new URL("/login?error=oauth", requestUrl.origin));
  }

  return NextResponse.redirect(data.url);
}
