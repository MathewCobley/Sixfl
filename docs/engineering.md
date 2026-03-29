# ========================================
# SIXFL Engineering Standards
# ========================================

> 6-a-side football. Done properly.

This document defines how all code in SIXFL should be written.
All work must follow these standards by default.

---

# 🧠 Core Principles

- Production-ready > prototypes
- Consistency > cleverness
- Reusable > duplicated
- Clean UX > functional only
- Explicit > implicit

This is a live system, not a demo.

---

# 📁 File Structure

All code lives under `/src`.

Key areas:

- `/src/app/admin` → admin pages (protected)
- `/src/components/admin` → admin UI components
- `/src/lib` → shared logic (email, prisma, helpers)
- `/prisma` → schema + migrations
- `/docs` → engineering + product documentation

---

# 🔐 Admin Pattern (MANDATORY)

ALL admin routes must:

- Use `requireAdmin()`
- Live under `/src/app/admin/...`

Example:

```ts
// ========================================
// File: src/app/admin/example/page.tsx
// ========================================

import { requireAdmin } from "@/lib/requireAdmin";

export default async function Page() {
  await requireAdmin();

  return <div>Admin Page</div>;
}---

# 🚀 Deployment & Hosting

SIXFL production runs on Railway.

Rules:
- Railway is the production app host unless explicitly changed
- Railway Postgres is the production database unless explicitly changed
- Do not assume Vercel is live
- Treat Vercel as non-production unless the domain has been intentionally moved

Before making deployment decisions:
- confirm the live domain target
- confirm the latest successful Railway deployment
- confirm production environment variables in Railway

---

# 🗄️ Database Safety (MANDATORY)

The production/live database must never be deleted, reset, or wiped.

Never run destructive commands against live production, including:
- `prisma migrate reset`
- `prisma db push --force-reset`
- manual SQL that drops or truncates production data

If schema changes are needed:
- use safe Prisma migrations
- review production impact first
- protect existing live data at all times

---

# 🌍 Public Pages & Data Fetching

Any public page that reads from Prisma/Postgres must be reviewed for deployment-safe rendering.

If a page depends on live database data and should not be statically built, use:

```ts
export const dynamic = "force-dynamic";
export const revalidate = 0;