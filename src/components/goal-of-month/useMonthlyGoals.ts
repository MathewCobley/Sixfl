"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { getMonthlyPageData } from "@/lib/goal-of-month/community";

export type MonthlyGoalsPayload = Awaited<ReturnType<typeof getMonthlyPageData>> & {
  viewer: { signedIn: boolean; eligible: boolean };
};

export function useMonthlyGoals() {
  const [data, setData] = useState<MonthlyGoalsPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const active = useRef(true);
  const request = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch("/api/goal-of-month/community", { cache: "no-store", signal: controller.signal });
      const result = await response.json();
      if (!response.ok || !result || !Array.isArray(result.nominations) || !result.viewer) throw new Error(result?.error || "Could not load the monthly competition.");
      if (active.current && request.current === controller) { setData(result); setError(""); }
    } catch (failure) {
      if (active.current && request.current === controller) setError(failure instanceof Error && failure.name !== "AbortError" ? failure.message : "The competition took too long to load. Please try again.");
    } finally {
      clearTimeout(timeout);
      if (active.current && request.current === controller) setLoading(false);
    }
  }, []);
  useEffect(() => {
    active.current = true;
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => { active.current = false; request.current?.abort(); window.removeEventListener("focus", onFocus); };
  }, [refresh]);
  return { data, error, loading, refresh };
}
