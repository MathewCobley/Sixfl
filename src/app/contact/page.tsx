// ========================================
// File: src/app/contact/page.tsx
// ========================================

"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type FormState = {
  name: string;
  email: string;
  phone: string;
  enquiryType: string;
  message: string;
  website: string;
};

const initialForm: FormState = {
  name: "",
  email: "",
  phone: "",
  enquiryType: "General enquiry",
  message: "",
  website: "",
};

export default function ContactPage() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  function updateField<K extends keyof FormState>(
    field: K,
    value: FormState[K]
  ) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setSubmitting(true);
    setSuccessMessage("");
    setErrorMessage("");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data = (await res.json()) as { error?: string; message?: string };

      if (!res.ok) {
        setErrorMessage(data.error || "Something went wrong. Please try again.");
        return;
      }

      setSuccessMessage(
        data.message || "Thanks — your message has been sent successfully."
      );
      setForm(initialForm);
    } catch {
      setErrorMessage("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto max-w-5xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
            Contact SIXFL
          </div>

          <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl">
            Get in touch
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-white/70 sm:text-lg">
            Have a question about joining a league, registering a team,
            refereeing for SIXFL or partnering with us? Send us a message and
            we’ll get back to you.
          </p>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Contact form */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6 shadow-2xl shadow-black/30 sm:p-8">
            <div className="mb-6">
              <div className="text-xs uppercase tracking-[0.2em] text-emerald-400">
                Send us a message
              </div>
              <h2 className="mt-2 text-2xl font-black tracking-tight">
                Contact form
              </h2>
              <p className="mt-3 text-sm leading-6 text-white/65">
                Use the form below and your message will go straight to the SIXFL
                inbox.
              </p>
            </div>

            {successMessage ? (
              <div className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {successMessage}
              </div>
            ) : null}

            {errorMessage ? (
              <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {errorMessage}
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Honeypot field */}
              <div className="hidden" aria-hidden="true">
                <label htmlFor="website">Website</label>
                <input
                  id="website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={form.website}
                  onChange={(e) => updateField("website", e.target.value)}
                />
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="name"
                    className="mb-2 block text-sm font-semibold text-white"
                  >
                    Name
                  </label>
                  <input
                    id="name"
                    type="text"
                    value={form.name}
                    onChange={(e) => updateField("name", e.target.value)}
                    required
                    autoComplete="name"
                    className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-emerald-400"
                    placeholder="Your name"
                  />
                </div>

                <div>
                  <label
                    htmlFor="email"
                    className="mb-2 block text-sm font-semibold text-white"
                  >
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => updateField("email", e.target.value)}
                    required
                    autoComplete="email"
                    className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-emerald-400"
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="phone"
                    className="mb-2 block text-sm font-semibold text-white"
                  >
                    Phone number
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => updateField("phone", e.target.value)}
                    autoComplete="tel"
                    className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-emerald-400"
                    placeholder="Optional"
                  />
                </div>

                <div>
                  <label
                    htmlFor="enquiryType"
                    className="mb-2 block text-sm font-semibold text-white"
                  >
                    Enquiry type
                  </label>
                  <select
                    id="enquiryType"
                    value={form.enquiryType}
                    onChange={(e) => updateField("enquiryType", e.target.value)}
                    className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition focus:border-emerald-400"
                  >
                    <option>General enquiry</option>
                    <option>Team registration</option>
                    <option>Player enquiry</option>
                    <option>Referee enquiry</option>
                    <option>Venue partnership</option>
                    <option>Sponsorship / partnership</option>
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="message"
                  className="mb-2 block text-sm font-semibold text-white"
                >
                  Message
                </label>
                <textarea
                  id="message"
                  value={form.message}
                  onChange={(e) => updateField("message", e.target.value)}
                  required
                  rows={7}
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-emerald-400"
                  placeholder="Tell us how we can help..."
                />
              </div>

              <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-500 px-6 text-sm font-extrabold tracking-wide text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting ? "SENDING..." : "SEND MESSAGE"}
                </button>

                <Link
                  href="/register-interest?type=team"
                  className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 text-sm font-bold tracking-wide text-white transition hover:bg-white/10"
                >
                  REGISTER YOUR TEAM
                </Link>
              </div>
            </form>
          </div>

          {/* Contact details */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-8 shadow-2xl shadow-black/30">
            <div className="text-xs uppercase tracking-[0.2em] text-emerald-400">
              Contact details
            </div>

            <h2 className="mt-2 text-2xl font-black tracking-tight">
              Speak to SIXFL
            </h2>

            <p className="mt-3 text-sm leading-6 text-white/65">
              Prefer to contact us directly? Use the details below.
            </p>

            <div className="mt-8 space-y-8">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-white/50">
                  Email
                </div>
                <a
                  href="mailto:hello@sixfl.co.uk"
                  className="mt-2 block text-lg font-bold text-emerald-400 hover:underline"
                >
                  hello@sixfl.co.uk
                </a>
              </div>

              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-white/50">
                  Phone
                </div>
                <div className="mt-2 text-lg font-bold">01904 215102</div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-white/50">
                  Location
                </div>
                <div className="mt-2 text-white/70">
                  North Yorkshire, United Kingdom
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5">
                <div className="text-sm font-bold text-white">
                  Typical enquiries
                </div>
                <ul className="mt-3 space-y-2 text-sm text-white/70">
                  <li>• Team registration</li>
                  <li>• League availability</li>
                  <li>• Referee applications</li>
                  <li>• Venue partnerships</li>
                  <li>• General SIXFL questions</li>
                </ul>
              </div>
            </div>

            <div className="mt-8">
              <Link
                href="/"
                className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 text-sm font-bold tracking-wide text-white transition hover:bg-white/10"
              >
                BACK TO HOME
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}