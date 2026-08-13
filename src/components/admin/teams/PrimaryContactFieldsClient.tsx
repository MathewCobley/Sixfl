"use client";

import { useMemo, useState } from "react";

type ContactOption = {
  value: string;
  label: string;
  name: string;
  email: string;
  phone: string;
};

type Props = {
  options: ContactOption[];
  defaultName: string;
  defaultEmail: string;
  defaultPhone: string;
};

export default function PrimaryContactFieldsClient({
  options,
  defaultName,
  defaultEmail,
  defaultPhone,
}: Props) {
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [phone, setPhone] = useState(defaultPhone);

  const selected = useMemo(
    () => options.find((option) => option.value === selectedMemberId) ?? null,
    [options, selectedMemberId],
  );

  function handleMemberChange(value: string) {
    setSelectedMemberId(value);
    const option = options.find((item) => item.value === value) ?? null;
    if (!option) return;

    setName(option.name);
    setEmail(option.email);
    setPhone(option.phone);
  }

  return (
    <>
      <div className="lg:col-span-2 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.06] p-4">
        <label htmlFor="primaryContactMemberId" className="text-sm font-semibold text-emerald-100">
          Change primary contact
        </label>
        <p className="mt-1 text-xs leading-5 text-white/50">
          Choose an existing user from this team. Their saved contact details will fill the fields below, and you can still edit them before saving.
        </p>
        <select
          id="primaryContactMemberId"
          value={selectedMemberId}
          onChange={(event) => handleMemberChange(event.target.value)}
          className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60"
        >
          <option value="">Keep current / enter manually</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {selected ? (
          <p className="mt-2 text-xs text-emerald-100/70">
            Selected: {selected.label}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label htmlFor="contactName" className="text-sm text-white/60">
          Primary contact name
        </label>
        <input
          id="contactName"
          name="contactName"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="John Smith"
          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white placeholder:text-white/35 outline-none transition focus:border-emerald-500/60"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="contactEmail" className="text-sm text-white/60">
          Primary contact email
        </label>
        <input
          id="contactEmail"
          name="contactEmail"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="captain@team.com"
          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white placeholder:text-white/35 outline-none transition focus:border-emerald-500/60"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="contactPhone" className="text-sm text-white/60">
          Primary contact mobile
        </label>
        <input
          id="contactPhone"
          name="contactPhone"
          type="text"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="07700 900123"
          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white placeholder:text-white/35 outline-none transition focus:border-emerald-500/60"
        />
      </div>
    </>
  );
}
