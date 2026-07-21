"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

type MatchdaySquadSelectionFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  children: ReactNode;
  className?: string;
};

type AvailabilityState = "MAYBE" | "UNAVAILABLE" | "NO_RESPONSE" | null;

function getAvailabilityState(input: HTMLInputElement): AvailabilityState {
  const labelText = input.closest("label")?.textContent ?? "";

  if (/\bunavailable\b/i.test(labelText)) return "UNAVAILABLE";
  if (/\bno response\b/i.test(labelText)) return "NO_RESPONSE";
  if (/\bmaybe\b/i.test(labelText)) return "MAYBE";
  return null;
}

function getAvailabilityLabel(state: AvailabilityState) {
  switch (state) {
    case "UNAVAILABLE":
      return "Unavailable";
    case "NO_RESPONSE":
      return "No response";
    case "MAYBE":
      return "Maybe";
    default:
      return "Available";
  }
}

function getPlayerName(input: HTMLInputElement) {
  return input.dataset.playerName?.trim() || "Player";
}

export default function MatchdaySquadSelectionForm({
  action,
  children,
  className,
}: MatchdaySquadSelectionFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [autoRemovedPlayers, setAutoRemovedPlayers] = useState<string[]>([]);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    const removed: string[] = [];
    const checkboxes = Array.from(
      form.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name="player"]'),
    );

    for (const checkbox of checkboxes) {
      const availability = getAvailabilityState(checkbox);
      const isPaid = checkbox.dataset.paidSelected === "true";

      if (!availability) {
        checkbox.disabled = false;
        checkbox.removeAttribute("title");
        continue;
      }

      if (checkbox.checked && !isPaid) {
        checkbox.checked = false;
        removed.push(`${getPlayerName(checkbox)} (${getAvailabilityLabel(availability)})`);
      }

      // A paid player remains visible for review so removing them can create the
      // correct credit, but no unconfirmed player can be newly selected.
      if (!isPaid) {
        checkbox.disabled = true;
        checkbox.title = `Change ${getPlayerName(checkbox)} to Available before selecting them.`;
        checkbox.setAttribute("aria-label", `${getPlayerName(checkbox)} cannot be selected while ${getAvailabilityLabel(availability)}`);
      }
    }

    setAutoRemovedPlayers(removed);
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const selectedUnconfirmedPlayers = Array.from(
      event.currentTarget.querySelectorAll<HTMLInputElement>(
        'input[type="checkbox"][name="player"]:checked',
      ),
    )
      .map((input) => ({
        name: getPlayerName(input),
        availability: getAvailabilityState(input),
      }))
      .filter(
        (
          player,
        ): player is { name: string; availability: Exclude<AvailabilityState, null> } =>
          Boolean(player.availability),
      );

    if (selectedUnconfirmedPlayers.length > 0) {
      const playerList = selectedUnconfirmedPlayers
        .map(
          (player) =>
            `${player.name} (${getAvailabilityLabel(player.availability)})`,
        )
        .join(", ");

      window.alert(
        `${playerList} cannot remain in the confirmed matchday squad. Change their availability to Available first, or remove them before saving.`,
      );
      event.preventDefault();
      return;
    }

    const paidPlayersBeingRemoved = Array.from(
      event.currentTarget.querySelectorAll<HTMLInputElement>(
        'input[type="checkbox"][data-paid-selected="true"]:not(:checked)',
      ),
    )
      .map((input) => getPlayerName(input))
      .filter(Boolean);

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
    <form
      ref={formRef}
      action={action}
      onSubmit={handleSubmit}
      className={className}
    >
      <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm leading-6 text-emerald-50">
        <span className="font-semibold">Selection rule:</span> only players marked
        Available can be selected. Maybe, Unavailable and No response players are
        locked until their availability is resolved.
      </div>

      {autoRemovedPlayers.length > 0 ? (
        <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-50">
          <span className="font-semibold">Unconfirmed players unticked:</span>{" "}
          {autoRemovedPlayers.join(", ")}. Save the squad to cancel any unpaid open
          fees. Change a player to Available before selecting them again.
        </div>
      ) : null}
      {children}
    </form>
  );
}
