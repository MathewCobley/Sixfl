// ========================================
// File: src/components/admin/TeamBadge.tsx
// ========================================

type TeamBadgeProps = {
  name: string;
  logoUrl?: string | null;
  size?: "sm" | "md" | "lg";
};

function getInitials(name: string) {
  const words = name
    .replace(/fc$/i, "")
    .replace(/afc$/i, "")
    .trim()
    .split(" ")
    .filter(Boolean);

  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

function getSizeClasses(size: TeamBadgeProps["size"] = "md") {
  switch (size) {
    case "sm":
      return {
        outer: "h-10 w-10",
        inner: "text-[10px]",
      };
    case "lg":
      return {
        outer: "h-16 w-16",
        inner: "text-base",
      };
    case "md":
    default:
      return {
        outer: "h-12 w-12",
        inner: "text-xs",
      };
  }
}

function getTeamStyle(name: string) {
  const styles = [
    {
      outer:
        "border-emerald-500/30 bg-gradient-to-b from-emerald-400/20 to-emerald-700/20",
      inner:
        "border-emerald-300/20 bg-emerald-500/15 text-emerald-200",
    },
    {
      outer:
        "border-sky-500/30 bg-gradient-to-b from-sky-400/20 to-sky-700/20",
      inner: "border-sky-300/20 bg-sky-500/15 text-sky-200",
    },
    {
      outer:
        "border-amber-500/30 bg-gradient-to-b from-amber-400/20 to-amber-700/20",
      inner:
        "border-amber-300/20 bg-amber-500/15 text-amber-200",
    },
    {
      outer:
        "border-rose-500/30 bg-gradient-to-b from-rose-400/20 to-rose-700/20",
      inner: "border-rose-300/20 bg-rose-500/15 text-rose-200",
    },
    {
      outer:
        "border-violet-500/30 bg-gradient-to-b from-violet-400/20 to-violet-700/20",
      inner:
        "border-violet-300/20 bg-violet-500/15 text-violet-200",
    },
  ];

  const hash = Array.from(name).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return styles[hash % styles.length];
}

export default function TeamBadge({
  name,
  logoUrl,
  size = "md",
}: TeamBadgeProps) {
  const initials = getInitials(name);
  const sizeClasses = getSizeClasses(size);
  const style = getTeamStyle(name);

  if (logoUrl) {
    return (
      <div
        className={`overflow-hidden rounded-[30%] border border-white/10 bg-white/5 shadow-sm ${sizeClasses.outer}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt={`${name} badge`}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={`relative flex items-center justify-center rounded-[30%] border shadow-sm ${style.outer} ${sizeClasses.outer}`}
      title={`${name} badge`}
      aria-label={`${name} badge`}
    >
      <div
        className={`flex h-[72%] w-[72%] items-center justify-center rounded-[24%] border font-bold tracking-wide ${style.inner} ${sizeClasses.inner}`}
      >
        {initials}
      </div>
    </div>
  );
}