// ========================================
// File: src/components/admin/fixtures/TeamSelect.tsx
// ========================================

"use client";

import { Combobox } from "@headlessui/react";
import { useState } from "react";

export default function TeamSelect({ teams, value, onChange }) {
  const [query, setQuery] = useState("");

  const filtered =
    query === ""
      ? teams
      : teams.filter((t) =>
          t.name.toLowerCase().includes(query.toLowerCase())
        );

  return (
    <Combobox value={value} onChange={onChange}>
      <div className="relative">
        <Combobox.Input
          onChange={(e) => setQuery(e.target.value)}
          displayValue={(t: any) => t?.name}
          className="w-full rounded-xl bg-black px-3 py-2 text-white"
        />

        <Combobox.Options className="absolute z-10 mt-1 w-full rounded-xl bg-[#111] border border-white/10 max-h-60 overflow-auto">
          {filtered.map((team) => (
            <Combobox.Option
              key={team.id}
              value={team}
              className="cursor-pointer px-3 py-2 hover:bg-white/10 text-white"
            >
              {team.name}
            </Combobox.Option>
          ))}
        </Combobox.Options>
      </div>
    </Combobox>
  );
}