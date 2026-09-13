import { requireCaptain } from '@/lib/requireCaptain';
import { prisma } from '@/lib/prisma';
import { readFixtureVeoOffer } from '@/lib/veo/fixture-bookings';
import FixtureVeoConfirmationForm from './FixtureVeoConfirmationForm';
export default async function CaptainFixtureConfirmation({teamId,fixtureId,confirmed}:{teamId:string;fixtureId:string;confirmed:boolean}) {
  const access=await requireCaptain(teamId);
  const [offer,fixture]=await Promise.all([readFixtureVeoOffer(fixtureId,teamId),prisma.fixture.findUnique({where:{id:fixtureId},select:{leagueId:true}})]);
  const canAct=!!access.user?.id && (access.isAdmin || (access.accessMode==='captain' && access.isCaptain));
  const preview=!canAct;
  return <FixtureVeoConfirmationForm key={fixtureId} teamId={teamId} fixtureId={fixtureId} leagueId={fixture?.leagueId??''} confirmed={confirmed} offer={offer} preview={preview}/>;
}
