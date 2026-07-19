import {
  DEFAULT_TEAM_KIT_COLOUR,
  normaliseTeamKitColour,
} from "@/lib/teams/kit-colour-values";

type TeamShirtProps = {
  colour?: string | null;
  teamName?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizeClasses = {
  sm: "h-4 w-[18px]",
  md: "h-5 w-[22px]",
  lg: "h-8 w-9",
};

export default function TeamShirt({
  colour,
  teamName,
  size = "sm",
  className = "",
}: TeamShirtProps) {
  const resolvedColour = normaliseTeamKitColour(colour) ?? DEFAULT_TEAM_KIT_COLOUR;
  const isWhite = resolvedColour === "#FFFFFF";

  return (
    <span
      aria-hidden="true"
      title={teamName ? `${teamName} shirt colour` : undefined}
      className={`inline-block shrink-0 align-[-0.12em] drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)] ${sizeClasses[size]} ${className}`}
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
