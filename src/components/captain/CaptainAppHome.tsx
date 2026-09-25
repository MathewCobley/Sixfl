import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import CaptainAppHomeView, { type CaptainAppHomeData } from "./CaptainAppHomeView";

/** Keep the overview's existing fixture, ledger and reporting calculations.
 * Only resolve the display identity here; no financial or fixture writes. */
export default async function CaptainAppHome(props: CaptainAppHomeData) {
  await requireCaptain(props.teamId);
  const team = await prisma.team.findUnique({
    where: { id: props.teamId },
    select: { name: true, logoUrl: true },
  });
  if (!team) notFound();
  return <CaptainAppHomeView {...props} teamName={team.name} teamLogoUrl={team.logoUrl} />;
}
