"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addDaysToDateString, getTodayDateString } from "@productivity/shared";
import { createClient } from "@/lib/supabase/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Rolls the selected unfinished tasks forward by updating ONLY scheduled_date
 * (Tomorrow or Next week). No duplication, no new rows, no status change — so
 * the recurring respawn trigger (completion-only) never fires. RLS scopes the
 * write to the user; still-completed tasks are skipped via the status filter.
 */
export async function rolloverTasks(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const ids = formData
    .getAll("ids")
    .map(String)
    .filter((id) => UUID_RE.test(id));
  const target = formData.get("target")?.toString();

  if (ids.length === 0 || (target !== "tomorrow" && target !== "next_week")) {
    // Nothing selected / bad target -> quietly refresh, no error.
    revalidatePath("/review");
    return;
  }

  const today = getTodayDateString();
  const scheduled_date = addDaysToDateString(today, target === "next_week" ? 7 : 1);

  // Only move tasks that are still unfinished; completed ones are skipped
  // calmly (0 rows affected, no error). One scoped update for all selections.
  await supabase
    .from("tasks")
    .update({ scheduled_date })
    .in("id", ids)
    .neq("status", "completed");

  revalidatePath("/review");
  revalidatePath("/");
  revalidatePath("/upcoming");
}
