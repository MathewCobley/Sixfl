// ========================================
// File: src/app/(public)/wetherby/page.tsx
// ========================================

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function WetherbyCampaignRedirectPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {};
  const params = new URLSearchParams({
    type: firstParam(sp.type) || "team",
    area: "Wetherby",
    night: "Wednesday",
  });

  const fbclid = firstParam(sp.fbclid);
  const utmSource = firstParam(sp.utm_source);
  const utmMedium = firstParam(sp.utm_medium);
  const utmCampaign = firstParam(sp.utm_campaign);
  const utmContent = firstParam(sp.utm_content);

  if (fbclid) params.set("fbclid", fbclid);
  if (utmSource) params.set("utm_source", utmSource);
  if (utmMedium) params.set("utm_medium", utmMedium);
  if (utmCampaign) params.set("utm_campaign", utmCampaign);
  if (utmContent) params.set("utm_content", utmContent);

  redirect(`/register-interest?${params.toString()}`);
}
