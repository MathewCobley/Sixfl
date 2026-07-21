"use client";

import type { FormEvent, ReactNode } from "react";

type MatchdaySquadSelectionFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  children: ReactNode;
  className?: string;
};

export default function MatchdaySquadSelectionForm({
  action,
  children,
  className,
}: MatchdaySquadSelectionFormProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const paidPlayersBeingRemoved = Array.from(
      event.currentTarget.querySelectorAll<HTMLInputElement>(
        'input[type="checkbox"][data-paid-selected="true"]:not(:checked)',
      ),
    )
      .map((input) => input.dataset.playerName?.trim())
      .filter((name): name is string => Boolean(name));

    if (paidPlayersBeingRemoved.length === 0) return;

    const playerList = paidPlayersBeingRemoved.join(", ");
    const confirmed = window.confirm(
      `${playerList} ${paidPlayersBeingRemoved.length === 1 ? "has" : "have"} already paid. Removing ${paidPlayersBeingRemoved.length === 1 ? "this player" : "these players"} will cancel the fixture fee, keep the payment for audit and create player credit. Continue?`,
    );

    if (!confirmed) {
      event.preventDefault();
    }
  }

  return (
    <form action={action} onSubmit={handleSubmit} className={className}>
      {children}
    </form>
  );
}
