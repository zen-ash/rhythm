"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function deleteAccount() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  // The Edge Function re-verifies this JWT and derives the user id from it.
  const { error } = await supabase.functions.invoke("delete-account", {
    method: "POST",
    headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
  });

  if (error) {
    redirect(
      `/settings?error=${encodeURIComponent(
        "Could not delete account. Please try again.",
      )}`,
    );
  }

  await supabase.auth.signOut();
  redirect("/login");
}
