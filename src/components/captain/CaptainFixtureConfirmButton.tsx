"use client";

import { useFormStatus } from "react-dom";

export default function CaptainFixtureConfirmButton({
  className,
}: {
  className: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={`${className} disabled:cursor-wait disabled:opacity-70`}
    >
      {pending ? "Confirming fixture…" : "Confirm fixture"}
    </button>
  );
}
