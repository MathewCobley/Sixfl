type TeamShirtProps = {
  colour?: string | null;
  teamName?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const DEFAULT_COLOUR = "#64748B";
const SIZE_CLASSES = {
  sm: "h-4 w-[18px]",
  md: "h-5 w-[22px]",
  lg: "h-8 w-9",
};

function normaliseColour(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return /^#[0-9a-f]{6}$/i.test(trimmed)
    ? trimmed.toUpperCase()
    : DEFAULT_COLOUR;
}

export default function TeamShirt({
  colour,
  teamName,
  size = "sm",
  className = "",
}: TeamShirtProps) {
  const resolvedColour = normaliseColour(colour);
  const isWhite = resolvedColour === "#FFFFFF";

  return (
    <span
      aria-hidden="true"
      title={teamName ? `${teamName} shirt colour` : undefined}
      className={`inline-block shrink-0 align-[-0.12em] drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)] ${SIZE_CLASSES[size]} ${className}`}
      style={{
        backgroundColor: resolvedColour,
        clipPath:
          "polygon(20% 0,34% 0,40% 13%,60% 13%,66% 0,80% 0,100% 24%,84% 42%,77% 33%,77% 100%,23% 100%,23% 33%,16% 42%,0 24%)",
        outline: isWhite ? "1px solid rgba(148,163,184,0.85)" : undefined,
        outlineOffset: isWhite ? "-1px" : undefined,
      }}
    />
  );
}
