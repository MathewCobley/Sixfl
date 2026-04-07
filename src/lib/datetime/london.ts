// ========================================
// File: src/lib/datetime/london.ts
// ========================================

export const LONDON_TZ = "Europe/London";

type LondonParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const londonFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toDate(value: Date | string) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date.");
  }

  return date;
}

function getLondonParts(value: Date | string): LondonParts {
  const date = toDate(value);
  const out: Partial<Record<keyof LondonParts, number>> = {};

  for (const part of londonFormatter.formatToParts(date)) {
    if (part.type === "literal") continue;
    out[part.type as keyof LondonParts] = Number(part.value);
  }

  return {
    year: out.year ?? 0,
    month: out.month ?? 0,
    day: out.day ?? 0,
    hour: out.hour ?? 0,
    minute: out.minute ?? 0,
    second: out.second ?? 0,
  };
}

function getLondonOffsetMs(value: Date | string) {
  const parts = getLondonParts(value);

  return (
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      0,
    ) - toDate(value).getTime()
  );
}

export function parseLondonDateTime(dateStr: string, timeStr: string) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeStr.trim());

  if (!dateMatch || !timeMatch) {
    throw new Error("Kickoff date/time is invalid.");
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  const localTs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  let candidate = new Date(localTs);

  for (let i = 0; i < 2; i += 1) {
    candidate = new Date(localTs - getLondonOffsetMs(candidate));
  }

  return candidate;
}

export function getLondonMinutesSinceMidnight(value: Date | string) {
  const parts = getLondonParts(value);
  return parts.hour * 60 + parts.minute;
}

export function toLondonDateInputValue(value: Date | string | null) {
  if (!value) return "";

  const parts = getLondonParts(value);

  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function toLondonTimeInputValue(value: Date | string | null) {
  if (!value) return "";

  const parts = getLondonParts(value);

  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function formatTimeInLondon(value: Date | string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(toDate(value));
}

export function formatDateTimeInLondon(
  value: Date | string,
  options: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON_TZ,
    hourCycle: "h23",
    ...options,
  }).format(toDate(value));
}
