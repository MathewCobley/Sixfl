'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  loadNightBoardVeoPriorities,
  type NightBoardVeoPriorityItem,
} from './veo-priority-actions';

function londonDateInputValue() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

export default function NightBoardVeoPriority() {
  const [items, setItems] = useState<NightBoardVeoPriorityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const params = new URLSearchParams(window.location.search);
      const date = params.get('date') || londonDateInputValue();

      try {
        const rows = await loadNightBoardVeoPriorities({
          date,
          leagueId: params.get('leagueId') || undefined,
          venueId: params.get('venueId') || undefined,
        });
        if (!cancelled) setItems(rows);
      } catch (error) {
        console.error('Unable to load Night Board Veo priorities', error);
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || items.length === 0) return null;

  const grouped = new Map<string, NightBoardVeoPriorityItem[]>();
  for (const item of items) {
    grouped.set(item.fixtureId, [...(grouped.get(item.fixtureId) ?? []), item]);
  }

  return (
    <div className="w-full px-4 pt-4 sm:px-6 lg:px-8">
      <section className="rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/10 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-fuchsia-200/80">
              Veo Priority
            </div>
            <h2 className="mt-1 text-lg font-semibold text-white">
              Captain fixture requests
            </h2>
          </div>
          <div className="rounded-full border border-fuchsia-300/20 bg-fuchsia-400/10 px-3 py-1 text-xs font-semibold text-fuchsia-100">
            {items.length} request{items.length === 1 ? '' : 's'}
          </div>
        </div>

        <div className="mt-3 grid gap-2 xl:grid-cols-2">
          {Array.from(grouped.values()).map((requests) => {
            const fixture = requests[0];
            return (
              <div
                key={fixture.fixtureId}
                className="rounded-xl border border-white/10 bg-black/20 px-3 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-white">
                      {formatTime(fixture.kickoffAt)} · {fixture.homeName} v {fixture.awayName}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {requests.map((request) => (
                        <span
                          key={request.teamId}
                          className="rounded-full border border-fuchsia-300/25 bg-fuchsia-400/10 px-2.5 py-1 text-xs font-semibold text-fuchsia-100"
                        >
                          {request.teamName}: Veo Priority
                          {request.choice === 'ONGOING'
                            ? ' · remembered preference'
                            : ' · this fixture'}
                        </span>
                      ))}
                    </div>
                  </div>
                  <Link
                    href={`/admin/fixtures/${fixture.fixtureId}/edit`}
                    className="text-xs font-semibold text-fuchsia-100 underline decoration-fuchsia-300/40 underline-offset-2 hover:text-white"
                  >
                    Open fixture
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
