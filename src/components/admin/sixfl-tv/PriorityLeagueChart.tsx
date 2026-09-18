type TeamSeries = {
  teamId: string;
  teamName: string;
  points: Array<{ weekStart: string; score: number }>;
};

type AveragePoint = { weekStart: string; score: number };

const palette = [
  "#60a5fa", "#f472b6", "#fbbf24", "#a78bfa", "#22d3ee", "#fb7185",
  "#c084fc", "#f97316", "#2dd4bf", "#e879f9", "#84cc16", "#38bdf8",
];

function weekLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function splitSegments(points: Array<{ weekStart: string; score: number }>, weekIndex: Map<string, number>) {
  const segments: Array<Array<{ weekStart: string; score: number }>> = [];
  for (const point of points) {
    const current = segments.at(-1);
    if (!current?.length) {
      segments.push([point]);
      continue;
    }
    const previousIndex = weekIndex.get(current.at(-1)!.weekStart);
    const currentIndex = weekIndex.get(point.weekStart);
    if (previousIndex == null || currentIndex == null || currentIndex !== previousIndex + 1) segments.push([point]);
    else current.push(point);
  }
  return segments;
}

export default function PriorityLeagueChart({
  weeks,
  teams,
  averages,
}: {
  weeks: string[];
  teams: TeamSeries[];
  averages: AveragePoint[];
}) {
  const width = 1080;
  const height = 390;
  const left = 54;
  const right = 24;
  const top = 22;
  const bottom = 58;
  const innerWidth = width - left - right;
  const innerHeight = height - top - bottom;
  const weekIndex = new Map(weeks.map((week, index) => [week, index]));
  const x = (week: string) => {
    const index = weekIndex.get(week) ?? 0;
    return weeks.length <= 1 ? left + innerWidth / 2 : left + index * (innerWidth / (weeks.length - 1));
  };
  const y = (score: number) => top + (100 - Math.max(0, Math.min(100, score))) / 100 * innerHeight;
  const labelEvery = Math.max(1, Math.ceil(weeks.length / 8));

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/20 p-3 sm:p-4">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Weekly SIXFL TV Priority scores" className="min-w-[760px] w-full">
        <title>Weekly SIXFL TV Priority scores with league average</title>
        {[0, 20, 40, 60, 80, 100].map((tick) => (
          <g key={tick}>
            <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
            <text x={left - 10} y={y(tick) + 4} textAnchor="end" fontSize="13" fill="rgba(255,255,255,0.48)">{tick}</text>
          </g>
        ))}
        {weeks.map((week, index) => index % labelEvery === 0 || index === weeks.length - 1 ? (
          <g key={week}>
            <line x1={x(week)} x2={x(week)} y1={top} y2={height - bottom} stroke="rgba(255,255,255,0.05)" />
            <text x={x(week)} y={height - 25} textAnchor="middle" fontSize="13" fill="rgba(255,255,255,0.48)">{weekLabel(week)}</text>
          </g>
        ) : null)}

        {teams.map((team, teamIndex) => {
          const colour = palette[teamIndex % palette.length];
          return splitSegments(team.points, weekIndex).map((segment, segmentIndex) => {
            const points = segment.map((point) => `${x(point.weekStart)},${y(point.score)}`).join(" ");
            return (
              <g key={`${team.teamId}-${segmentIndex}`}>
                {segment.length > 1 ? <polyline points={points} fill="none" stroke={colour} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" opacity="0.82" /> : null}
                {segment.map((point) => <circle key={point.weekStart} cx={x(point.weekStart)} cy={y(point.score)} r="3.5" fill={colour} />)}
              </g>
            );
          });
        })}

        {averages.length > 1 ? (
          <polyline
            points={averages.map((point) => `${x(point.weekStart)},${y(point.score)}`).join(" ")}
            fill="none"
            stroke="#34d399"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        {averages.map((point) => <circle key={`avg-${point.weekStart}`} cx={x(point.weekStart)} cy={y(point.score)} r="5" fill="#34d399" stroke="#052e24" strokeWidth="2" />)}
      </svg>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/65">
        {teams.map((team, index) => (
          <span key={team.teamId} className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: palette[index % palette.length] }} />
            {team.teamName}
          </span>
        ))}
        <span className="inline-flex items-center gap-2 font-bold text-emerald-200">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          League average
        </span>
      </div>
    </div>
  );
}
