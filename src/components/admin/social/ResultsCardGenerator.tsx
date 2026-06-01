// ========================================
// File: src/components/admin/social/ResultsCardGenerator.tsx
// ========================================

"use client";

import { useEffect, useRef, useState } from "react";

type ResultCardFixture = {
  id: string;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamLogoUrl: string | null;
  awayTeamLogoUrl: string | null;
  homeScore: number;
  awayScore: number;
};

type ResultsCardGeneratorProps = {
  templateUrl: string;
  leagueName: string;
  matchweekLabel: string;
  dateLabel: string;
  fixtures: ResultCardFixture[];
};

type ResultsCardLayout = {
  rowYValues: number[];
  badgeSize: number;
  teamNameFontSize: number;
  scoreFontSize: number;
  homeNameCentreX: number;
  awayNameCentreX: number;
  homeNameMaxWidth: number;
  awayNameMaxWidth: number;
};

const CANVAS_SIZE = 1080;
const HOME_BADGE_X = 76;
const HOME_SCORE_X = 438;
const AWAY_SCORE_X = 640;
const AWAY_BADGE_X = 1010;

const THREE_FIXTURE_LAYOUT: ResultsCardLayout = {
  rowYValues: [445, 570, 695],
  badgeSize: 68,
  teamNameFontSize: 22,
  scoreFontSize: 58,
  homeNameCentreX: 272,
  awayNameCentreX: 846,
  homeNameMaxWidth: 270,
  awayNameMaxWidth: 270,
};

const FOUR_FIXTURE_LAYOUT: ResultsCardLayout = {
  // Evenly spaced against the 4-result template slots. Keeping this as one
  // layout object avoids the lower rows drifting away from the top rows when
  // future card tweaks are made.
  rowYValues: [408, 523, 638, 753],
  badgeSize: 58,
  teamNameFontSize: 20,
  scoreFontSize: 50,
  homeNameCentreX: 272,
  awayNameCentreX: 846,
  homeNameMaxWidth: 285,
  awayNameMaxWidth: 285,
};

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

function normaliseLogoUrl(value: string | null) {
  if (!value?.trim()) return null;
  const trimmed = value.trim();

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("/")) {
    return trimmed;
  }

  return `/${trimmed}`;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load image: ${src}`));
    image.src = src;
  });
}

function getFittedText(input: {
  ctx: CanvasRenderingContext2D;
  text: string;
  maxWidth: number;
}) {
  if (input.ctx.measureText(input.text).width <= input.maxWidth) {
    return input.text;
  }

  const ellipsis = "…";
  let output = input.text;

  while (output.length > 1 && input.ctx.measureText(`${output}${ellipsis}`).width > input.maxWidth) {
    output = output.slice(0, -1);
  }

  return `${output.trimEnd()}${ellipsis}`;
}

function drawBadge(input: {
  ctx: CanvasRenderingContext2D;
  image: HTMLImageElement | null;
  teamName: string;
  x: number;
  y: number;
  size: number;
}) {
  const { ctx, image, teamName, x, y, size } = input;
  const radius = size / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = "rgba(8, 18, 14, 0.62)";
  ctx.fill();

  if (image) {
    const imageRatio = image.width / image.height;
    let drawWidth = size;
    let drawHeight = size;

    if (imageRatio > 1) {
      drawHeight = size / imageRatio;
    } else {
      drawWidth = size * imageRatio;
    }

    ctx.drawImage(image, x - drawWidth / 2, y - drawHeight / 2, drawWidth, drawHeight);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.font = `900 ${Math.round(size * 0.32)}px Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(getInitials(teamName), x, y + 1);
  }

  ctx.restore();
}

function drawTeamName(input: {
  ctx: CanvasRenderingContext2D;
  name: string;
  x: number;
  y: number;
  maxWidth: number;
  fontSize: number;
}) {
  const { ctx, name, x, y, maxWidth, fontSize } = input;
  const uppercaseName = name.toUpperCase();

  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${fontSize}px Arial Narrow, Impact, Arial, sans-serif`;
  ctx.fillText(getFittedText({ ctx, text: uppercaseName, maxWidth }), x, y + 1);
  ctx.restore();
}

function drawScore(input: {
  ctx: CanvasRenderingContext2D;
  score: number;
  x: number;
  y: number;
  fontSize: number;
}) {
  const { ctx, score, x, y, fontSize } = input;
  ctx.save();
  ctx.fillStyle = "#000000";
  ctx.font = `900 ${fontSize}px Impact, Arial Black, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(score), x, y + 1);
  ctx.restore();
}

function drawFooter(input: {
  ctx: CanvasRenderingContext2D;
  matchweekLabel: string;
  dateLabel: string;
}) {
  const { ctx, matchweekLabel, dateLabel } = input;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#000000";
  ctx.font = "900 23px Arial Narrow, Impact, Arial, sans-serif";
  ctx.fillText(matchweekLabel.toUpperCase(), 540, 971);
  ctx.font = "900 30px Arial Narrow, Impact, Arial, sans-serif";
  ctx.fillText(dateLabel.toUpperCase(), 540, 1007);
  ctx.restore();
}

export default function ResultsCardGenerator({
  templateUrl,
  matchweekLabel,
  dateLabel,
  fixtures,
}: ResultsCardGeneratorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      setError(null);
      setDownloadUrl(null);

      try {
        const isFourFixtureCard = fixtures.length >= 4;
        const layout = isFourFixtureCard ? FOUR_FIXTURE_LAYOUT : THREE_FIXTURE_LAYOUT;
        const visibleFixtures = fixtures.slice(0, layout.rowYValues.length);
        const template = await loadImage(templateUrl);
        const badgeEntries = await Promise.all(
          visibleFixtures.flatMap((fixture) => [
            normaliseLogoUrl(fixture.homeTeamLogoUrl),
            normaliseLogoUrl(fixture.awayTeamLogoUrl),
          ]).map(async (url) => {
            if (!url) return null;
            try {
              return await loadImage(url);
            } catch {
              return null;
            }
          }),
        );

        if (cancelled) return;

        ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        ctx.drawImage(template, 0, 0, CANVAS_SIZE, CANVAS_SIZE);

        visibleFixtures.forEach((fixture, index) => {
          const y = layout.rowYValues[index];
          const homeBadge = badgeEntries[index * 2] ?? null;
          const awayBadge = badgeEntries[index * 2 + 1] ?? null;

          // The centre separator/dots are part of the Canva template. Do not
          // paint over them here; masking them caused the odd dark blocks/marks
          // on the 4-fixture result card.
          drawBadge({ ctx, image: homeBadge, teamName: fixture.homeTeamName, x: HOME_BADGE_X, y, size: layout.badgeSize });
          drawTeamName({ ctx, name: fixture.homeTeamName, x: layout.homeNameCentreX, y, maxWidth: layout.homeNameMaxWidth, fontSize: layout.teamNameFontSize });
          drawScore({ ctx, score: fixture.homeScore, x: HOME_SCORE_X, y, fontSize: layout.scoreFontSize });

          drawScore({ ctx, score: fixture.awayScore, x: AWAY_SCORE_X, y, fontSize: layout.scoreFontSize });
          drawTeamName({ ctx, name: fixture.awayTeamName, x: layout.awayNameCentreX, y, maxWidth: layout.awayNameMaxWidth, fontSize: layout.teamNameFontSize });
          drawBadge({ ctx, image: awayBadge, teamName: fixture.awayTeamName, x: AWAY_BADGE_X, y, size: layout.badgeSize });
        });

        drawFooter({ ctx, matchweekLabel, dateLabel });

        setDownloadUrl(canvas.toDataURL("image/png"));
      } catch (renderError) {
        setError(renderError instanceof Error ? renderError.message : "Could not render card.");
      }
    }

    void render();

    return () => {
      cancelled = true;
    };
  }, [templateUrl, fixtures, matchweekLabel, dateLabel]);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/30 p-3">
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          className="aspect-square w-full rounded-2xl bg-black object-contain"
        />
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {downloadUrl ? (
          <a
            href={downloadUrl}
            download={`sixfl-results-${dateLabel.toLowerCase().replaceAll(" ", "-")}.png`}
            className="inline-flex items-center rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-5 py-3 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-500/20"
          >
            Download PNG
          </a>
        ) : (
          <span className="inline-flex items-center rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm text-white/55">
            Rendering preview…
          </span>
        )}
      </div>
    </div>
  );
}
