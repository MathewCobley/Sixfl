import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function FootageFixturesCompatibilityPage() {
  await requireAdmin();
  redirect("/admin/sixfl-tv/fixtures");
}
