import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { listPublishedNews } from '@/lib/league-news/read';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
const headers = { 'Cache-Control': 'no-store, max-age=0' };
/** Anonymous read-only discovery. Drafts and publication settings are never read. */
export async function GET(request: NextRequest, context: { params: Promise<{ scope: string; id: string }> }) {
  const { scope, id } = await context.params;
  if (!['league', 'team'].includes(scope) || !id || id.length > 180) return NextResponse.json({ error: 'Not found.' }, { status: 404, headers });
  try {
    const limit = request.nextUrl.searchParams.get('limit') === '1' ? 1 : 2;
    if (scope === 'league') {
      const league = await prisma.league.findFirst({ where: { slug: id }, select: { id: true } });
      if (!league) return NextResponse.json({ error: 'Not found.' }, { status: 404, headers });
      return NextResponse.json({ items: (await listPublishedNews({ leagueId: league.id, limit })).items }, { headers });
    }
    return NextResponse.json({ items: (await listPublishedNews({ teamId: id, limit })).items }, { headers });
  } catch { return NextResponse.json({ error: 'League News is temporarily unavailable.' }, { status: 503, headers }); }
}
