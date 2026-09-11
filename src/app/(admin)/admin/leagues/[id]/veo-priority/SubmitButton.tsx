'use client';
import { useFormStatus } from 'react-dom';
export default function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="min-h-11 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20 disabled:cursor-wait disabled:opacity-50">{pending ? 'Saving…' : children}</button>;
}
