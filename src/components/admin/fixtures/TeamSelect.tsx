// ========================================
// File: src/components/admin/fixtures/TeamSelect.tsx
// ========================================

"use client";

import { Combobox } from "@headlessui/react";
import { useMemo, useState } from "react";

type TeamOption = {
  id: string;
  name: string;
};

type TeamSelectProps = {
  teams: TeamOption[];
  value: TeamOption | null;
  onChange: (team: TeamOption | null) => void;
};

export default function TeamSelect({
  teams,
  value,
  onChange,
}: TeamSelectProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (query.trim() === "") {
      return teams;
    }

    const normalisedQuery = query.toLowerCase();

    return teams.filter((team) =>
      team.name.toLowerCase().includes(normalisedQuery)
    );
  }, [teams, query]);

  return (
    <Combobox value={value} onChange={onChange} nullable>
      <div className="relative">
        <Combobox.Input
          onChange={(e) => setQuery(e.target.value)}
          displayValue={(team: TeamOption | null) => team?.name ?? ""}
          className="w-full rounded-xl bg-black px-3 py-2 text-white"
        />

        <Combobox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-white/10 bg-[#111]">
          {filtered.map((team) => (
            <Combobox.Option
              key={team.id}
              value={team}
              className="cursor-pointer px-3 py-2 text-white hover:bg-white/10"
            >
              {team.name}
            </Combobox.Option>
          ))}
        </Combobox.Options>
      </div>
    </Combobox>
  );
}