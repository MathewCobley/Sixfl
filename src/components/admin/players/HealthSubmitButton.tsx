"use client";
import { useFormStatus } from "react-dom";
export default function HealthSubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-bold text-black disabled:opacity-50">{pending ? "Checking current records…" : children}</button>;
}
