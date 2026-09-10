import { getTeamLogoExportChoices } from "@/lib/exports/team-logo-catalogue";
import { logoFileSegment, MAX_LOGO_EXPORT_BYTES, parseLogoTeamIds, type TeamLogoExportChoice } from "@/lib/team-logo-export-contract";
import { createStoreZip, type ZipEntry } from "./store-zip";
import { readTeamLogo } from "./team-logo-assets";

export async function buildTeamLogoExport(ids: unknown, signal: AbortSignal) {
  const selectedIds = parseLogoTeamIds(ids);
  const catalogue = await getTeamLogoExportChoices();
  const byId = new Map(catalogue.map(team => [team.id, team]));
  const teams = selectedIds.map(id => byId.get(id));
  if (teams.some(team => !team)) throw new Error("A selected team is no longer available. Refresh the list and select again.");
  const chosen = (teams as TeamLogoExportChoice[]).sort((a,b) => a.leagueKey.localeCompare(b.leagueKey) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(60_000)]);
  const loaded: Array<{ data: Buffer; extension: string } | { error: string }> = new Array(chosen.length);
  let cursor = 0;
  let bytes = 0;
  let tooLarge = false;
  await Promise.all(Array.from({ length: Math.min(4, chosen.length) }, async () => {
    while (cursor < chosen.length) {
      const index = cursor++, team = chosen[index];
      if (deadline.aborted) { loaded[index] = { error: "Export time limit reached. Retry this team separately." }; continue; }
      if (tooLarge) { loaded[index] = { error: "Pack size limit reached." }; continue; }
      if (!team.logoUrl?.trim()) { loaded[index] = { error: "No logo assigned." }; continue; }
      try {
        const image = await readTeamLogo(team.logoUrl, deadline);
        bytes += image.data.length;
        if (bytes > MAX_LOGO_EXPORT_BYTES) { tooLarge = true; loaded[index] = { error: "Pack size limit reached." }; }
        else loaded[index] = image;
      } catch (error) { loaded[index] = { error: error instanceof Error ? error.message : "Logo unavailable." }; }
    }
  }));
  if (tooLarge) throw new Error("The logo pack exceeds 64 MB. Select fewer teams and download in batches.");
  signal.throwIfAborted();
  const files: ZipEntry[] = [];
  const report: string[] = ["SIXFL TEAM LOGOS", `Created: ${new Date().toISOString()}`, `Selected teams: ${chosen.length}`, "",
    "Available artwork is exported unchanged from each team's currently assigned logo.",
    "Uploaded badges use the stored full-size image, not the thumbnail. Higher-resolution source files may need to be supplied separately.",
    "No contact details, player records or payments are included.", ""];
  const usedFolders = new Set<string>(), usedFiles = new Set<string>(), folders = new Map<string,string>();
  let missing = 0;
  function unique(base: string, extension: string, used: Set<string>) {
    let suffix = 1, candidate = base + extension;
    while (used.has(candidate.toLowerCase())) candidate = `${base} (${++suffix})${extension}`;
    used.add(candidate.toLowerCase()); return candidate;
  }
  for (let index = 0; index < chosen.length; index++) {
    const team = chosen[index], image = loaded[index];
    let folder = folders.get(team.leagueKey);
    if (!folder) { folder = unique(logoFileSegment(team.leagueName,"Unassigned teams"), "", usedFolders); folders.set(team.leagueKey,folder); }
    const name = logoFileSegment(team.name);
    if ("error" in image) { missing++; report.push(`NOT INCLUDED: ${folder} / ${name} - ${image.error}`); continue; }
    const filename = unique(`${folder}/${name}`, `.${image.extension}`, usedFiles);
    files.push({ name: filename, data: image.data });
    report.push(`INCLUDED: ${filename}`);
  }
  if (!files.length) throw new Error("None of the selected logos could be exported. " + report.filter(line => line.startsWith("NOT INCLUDED:")).slice(0,8).join(" "));
  const exported = files.length;
  report.splice(3,0,`Included logos: ${exported}`,`Missing or unavailable logos: ${missing}`);
  files.push({ name: "SIXFL-export-report.txt", data: Buffer.from(report.join("\r\n"),"utf8") });
  return { data: createStoreZip(files), selected: chosen.length, exported, missing };
}
