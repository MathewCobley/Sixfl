import Link from "next/link";

export type LeadSmsStatusLine = {
  text: string; tone: "muted" | "info" | "success" | "warning" | "danger";
  title?: string | null; href?: string; linkText?: string;
};
function toneClass(tone: LeadSmsStatusLine["tone"]) {
  if (tone === "success") return "text-emerald-200/90";
  if (tone === "danger") return "text-rose-200/90";
  if (tone === "warning") return "text-amber-200/90";
  if (tone === "info") return "text-sky-200/85";
  return "text-white/45";
}
export default function LeadSmsStatusLines({ lines }: { lines: LeadSmsStatusLine[] }) {
  return <div className="mt-1 space-y-1 text-[11px] leading-4">{lines.map((line, index) => (
    <div key={`${line.text}-${index}`} className={toneClass(line.tone)} title={line.title || undefined}>
      <div>{line.text}</div>
      {line.href?.startsWith("/admin/leads/") ? <Link href={line.href} className="mt-1 inline-flex rounded px-1 py-1 font-semibold underline underline-offset-4 hover:bg-white/10">{line.linkText || "View reply"}</Link> : null}
    </div>
  ))}</div>;
}
