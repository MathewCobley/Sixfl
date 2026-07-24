"use client";

import { usePathname } from "next/navigation";

export default function TeamDetailRouteLayout({ teamId }: { teamId: string }) {
  const pathname = usePathname();

  if (pathname !== `/admin/teams/${teamId}/communications`) {
    return null;
  }

  return (
    <style>{`
      [data-team-detail-shell] {
        width: 100%;
        min-width: 0;
        overflow-x: clip;
      }

      [data-team-detail-shell] > div.max-w-7xl {
        width: 100%;
        min-width: 0;
        max-width: 80rem;
      }

      [data-team-detail-shell] > div.max-w-7xl > div:first-child {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) auto !important;
        align-items: start !important;
        gap: 1rem !important;
        height: auto !important;
        min-height: 0 !important;
      }

      [data-team-detail-shell] > div.max-w-7xl > div:first-child > div:last-child {
        display: grid !important;
        grid-template-columns: repeat(3, minmax(0, auto)) !important;
        align-items: start !important;
        align-content: start !important;
        justify-content: end !important;
        align-self: start !important;
        height: auto !important;
        min-height: 0 !important;
      }

      [data-team-detail-shell] > div.max-w-7xl > div:first-child > div:last-child > a {
        height: 2.75rem !important;
        min-height: 2.75rem !important;
        max-height: 2.75rem !important;
        align-self: start !important;
        white-space: nowrap;
      }

      @media (max-width: 900px) {
        [data-team-detail-shell] > div.max-w-7xl > div:first-child {
          grid-template-columns: minmax(0, 1fr) !important;
        }

        [data-team-detail-shell] > div.max-w-7xl > div:first-child > div:last-child {
          justify-content: start !important;
        }
      }

      @media (max-width: 560px) {
        [data-team-detail-shell] > div.max-w-7xl > div:first-child > div:last-child {
          grid-template-columns: minmax(0, 1fr) !important;
          width: 100%;
        }

        [data-team-detail-shell] > div.max-w-7xl > div:first-child > div:last-child > a {
          width: 100%;
        }
      }
    `}</style>
  );
}
