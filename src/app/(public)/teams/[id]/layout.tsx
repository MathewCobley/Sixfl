import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { isFixturePlaceholderTeam } from "@/lib/teams/fixture-placeholders";

export default async function PublicTeamLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (await isFixturePlaceholderTeam(id)) {
    notFound();
  }

  return children;
}
