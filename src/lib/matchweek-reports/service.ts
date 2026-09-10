import { createHash } from "node:crypto";
import { requireAdmin } from "@/lib/requireAdmin";
import { getReportSource, sourceHash } from "./facts";
import { reportConfigured, reportModel, writeOpenAiReport } from "./openai";
import { readStoredReport, claimGeneration, finishGeneration, failGeneration, storeEditedReport } from "./store";
import { ReportError, validDate, validateContent, type ReportView } from "./types";

async function actor() {
  const { user, session } = await requireAdmin();
  const identity = user?.id || session?.user?.email?.toLowerCase().trim();
  if (!identity) throw new ReportError("Sign in as an administrator to generate or save reports.", 401);
  return createHash("sha256").update(identity).digest("hex");
}
function operation(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ReportError("Invalid report request.");
  const v = value as Record<string, unknown>;
  if (typeof v.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(v.requestId)) throw new ReportError("Invalid request reference. Reload the page.");
  if (!Number.isSafeInteger(v.baseVersion) || (v.baseVersion as number) < 0) throw new ReportError("Invalid draft version.");
  return { requestId: v.requestId, baseVersion: v.baseVersion as number, matchDate: validDate(v.matchDate), sourceHash: v.sourceHash, content: v.content };
}
// Every exported entry point authenticates. No provider calls or writes on GET.
export async function getReportView(slug: string, date?: string): Promise<ReportView | null> {
  await requireAdmin();
  const source = await getReportSource(slug, date);
  if (!source) return null;
  const stored = await readStoredReport(source.leagueId, source.matchDate);
  const hash = sourceHash(source);
  return { source, sourceHash: hash, ...stored, configured: reportConfigured(), model: reportModel(), stale: Boolean(stored.draft?.content && stored.draft.sourceHash !== hash) };
}
export async function generateReport(slug: string, value: unknown) {
  const actorId = await actor();
  const v = operation(value);
  const source = await getReportSource(slug, v.matchDate);
  if (!source) throw new ReportError("League not found.", 404);
  if (!source.matches.length) throw new ReportError("No eligible completed matches on this date.");
  if (!reportConfigured()) throw new ReportError("OpenAI is not configured. Add OPENAI_API_KEY to the SIXFL Railway service.", 503);
  const hash = sourceHash(source);
  if (v.sourceHash !== hash) throw new ReportError("The match data changed. Check saved status to load the latest results before generating.", 409);
  const input = { actorId, requestId: v.requestId, baseVersion: v.baseVersion, source, sourceHash: hash, model: reportModel() };
  const claim = await claimGeneration(input);
  if (!claim.cached) {
    try { await finishGeneration(input, claim.draftId, await writeOpenAiReport(source, input.model)); }
    catch (error) {
      const message = error instanceof ReportError ? error.message : "The generation outcome could not be confirmed. Check saved status before retrying.";
      await failGeneration(v.requestId, message).catch(() => undefined);
      if (error instanceof ReportError) throw error;
      throw new ReportError(message, 500);
    }
  }
  return getReportView(slug, v.matchDate);
}
export async function saveReport(slug: string, value: unknown) {
  const actorId = await actor();
  const v = operation(value);
  const source = await getReportSource(slug, v.matchDate);
  if (!source) throw new ReportError("League not found.", 404);
  const stored = await readStoredReport(source.leagueId, source.matchDate);
  if (!stored.draft?.source) throw new ReportError("Generate a report before saving edits.");
  const content = validateContent(v.content, stored.draft.source);
  await storeEditedReport({ actorId, requestId: v.requestId, leagueId: source.leagueId, matchDate: v.matchDate, baseVersion: v.baseVersion, content });
  return getReportView(slug, v.matchDate);
}
