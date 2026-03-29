// ========================================
// File: src/app/register-team/page.tsx
// ========================================

import RegisterTeamClient from "./RegisterTeamClient";

export default async function RegisterTeamPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const sp = (await searchParams) ?? {};

  return <RegisterTeamClient errorParam={sp.error ?? null} />;
}