// ========================================
// File: src/app/venues/page.tsx
// ========================================

import Image from "next/image";
import Link from "next/link";

const venues = [
  {
    name: "Rossett Sports Centre",
    league: "Harrogate Tuesday League",
    location: "Harrogate",
    address: ["Pannal Ash Road", "Harrogate", "HG2 9PH"],
    image: "/venues/rossett.jpg",
    imageAlt: "Rossett Sports Centre 3G football pitch",
    description:
      "Rossett Sports Centre provides a strong venue for SIXFL in Harrogate, with a modern artificial pitch, floodlit evening play and a professional environment for organised weekly league football.",
    features: [
      "3G artificial pitch",
      "Floodlit evening matches",
      "On-site parking",
      "Changing facilities",
      "Harrogate location",
    ],
    ctaHref: "/register-interest?type=team",
    infoHref: "https://www.rossettsportscentre.co.uk/",
    mapEmbedUrl:
      "https://www.google.com/maps?q=Rossett+Sports+Centre,+Pannal+Ash+Road,+Harrogate,+HG2+9PH&output=embed",
  },
  {
    name: "St John Fisher 3G Pitch",
    league: "Harrogate League Venue",
    location: "Harrogate",
    address: ["Hookstone Drive", "Harrogate", "HG2 8PT"],
    image: "/venues/st-john-fisher.jpg",
    imageAlt: "St John Fisher floodlit 3G football pitch",
    description:
      "The St John Fisher 3G pitch provides a modern floodlit football facility in Harrogate, offering a FIFA-standard artificial surface and strong evening playing conditions for organised league football.",
    features: [
      "FIFA standard 3G pitch",
      "Floodlit evening matches",
      "On-site parking",
      "Changing facilities",
      "Suitable for small-sided leagues",
    ],
    ctaHref: "/register-interest?type=team",
    infoHref: "https://www.stjohnfisher.org.uk/3G-Astro-Turf/",
    mapEmbedUrl:
      "https://www.google.com/maps?q=St+John+Fisher+Catholic+High+School+Harrogate&output=embed",
  },
  {
    name: "Ripon Grammar School 3G Pitch",
    league: "Ripon League Venue",
    location: "Ripon",
    address: ["Clotherholme Road", "Ripon", "HG4 2DG"],
    image: "/venues/ripon-grammar.jpg",
    imageAlt: "Ripon Grammar School 3G football pitch",
    description:
      "Ripon Grammar School offers a high-quality floodlit 3G football facility with a full-size artificial surface and multiple cross-pitch layouts, creating a strong venue for organised small-sided league football in Ripon.",
    features: [
      "FIFA-compliant 3G pitch",
      "Floodlit evening matches",
      "Multiple cross-pitch layouts",
      "Changing & shower facilities",
      "Ripon location",
    ],
    ctaHref: "/register-interest?type=team",
    infoHref: "https://www.ripongrammar.co.uk/about/community-lettings/",
    mapEmbedUrl:
      "https://www.google.com/maps?q=Ripon+Grammar+School,+Ripon&output=embed",
  },
  {
    name: "King James’s School 3G Pitch",
    league: "Knaresborough League Venue",
    location: "Knaresborough",
    address: ["King James Road", "Knaresborough", "HG5 8EB"],
    image: "/venues/king-james.jpg",
    imageAlt: "King James's School floodlit 3G football pitch",
    description:
      "King James’s School hosts a modern floodlit 3G football pitch in Knaresborough, providing a high-quality all-weather playing surface suitable for organised league football and small-sided formats.",
    features: [
      "Floodlit 3G pitch",
      "Full-size artificial surface",
      "Spectator viewing area",
      "Community hire facility",
      "Knaresborough location",
    ],
    ctaHref: "/register-interest?type=team",
    infoHref:
      "https://king-jamess.schoolbookings.co.uk/venues/397-king-jamess-school/5232-3g-floodlit-pitch",
    mapEmbedUrl:
      "https://www.google.com/maps?q=King+James's+School+Knaresborough&output=embed",
  },
];

export default function VenuesPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      {/* HERO */}
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.14),transparent_38%)]">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">
              SIXFL Venues
            </div>

            <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl">
              Venues
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-7 text-white/70 sm:text-lg">
              Strong leagues start with strong venues. SIXFL leagues are built
              around reliable facilities, quality surfaces and venues that
              create a proper match-night environment.
            </p>
          </div>
        </div>
      </section>

      {/* VENUE LIST */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10">
          {venues.map((venue) => (
            <VenueCard key={venue.name} {...venue} />
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-8 text-center shadow-2xl shadow-black/30 sm:p-10">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">
              Launch Leagues
            </div>

            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
              Want to play in a SIXFL league?
            </h2>

            <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-white/75 sm:text-base">
              Register your interest today and be first to hear when teams and
              leagues open in your area.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/register-interest?type=team"
                className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-500 px-6 text-sm font-extrabold tracking-wide text-black transition hover:bg-emerald-400"
              >
                REGISTER YOUR TEAM
              </Link>

              <Link
                href="/contact"
                className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 bg-black/30 px-6 text-sm font-bold tracking-wide text-white transition hover:bg-white/10"
              >
                CONTACT SIXFL
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function VenueCard({
  name,
  league,
  location,
  address,
  image,
  imageAlt,
  description,
  features,
  ctaHref,
  infoHref,
  mapEmbedUrl,
}: {
  name: string;
  league: string;
  location: string;
  address: string[];
  image: string;
  imageAlt: string;
  description: string;
  features: string[];
  ctaHref: string;
  infoHref: string;
  mapEmbedUrl: string;
}) {
  return (
    <div className="group overflow-hidden rounded-3xl border border-white/10 bg-white/[0.05] shadow-[0_24px_90px_rgba(0,0,0,0.38)] backdrop-blur-xl transition hover:border-emerald-500/30 hover:shadow-[0_30px_110px_rgba(16,185,129,0.15)]">
      {/* IMAGE HEADER */}
      <div className="relative aspect-[16/8] w-full overflow-hidden border-b border-white/10">
        <Image
          src={image}
          alt={imageAlt}
          fill
          className="object-cover transition-transform duration-[1600ms] ease-out group-hover:scale-105"
          priority
        />

        <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.85),rgba(0,0,0,0.2),rgba(0,0,0,0.2))]" />

        <div className="absolute bottom-0 left-0 right-0 p-6">
          <div className="text-xs font-bold tracking-[0.2em] text-emerald-300">
            {league}
          </div>

          <h3 className="mt-2 text-3xl font-black tracking-tight text-white">
            {name}
          </h3>
        </div>
      </div>

      {/* CONTENT */}
      <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="p-6 sm:p-8 lg:border-r lg:border-white/10">
          <p className="max-w-2xl text-sm leading-7 text-white/70 sm:text-base">
            {description}
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {features.map((feature) => (
              <span
                key={feature}
                className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold tracking-[0.14em] text-emerald-300"
              >
                {feature}
              </span>
            ))}
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href={ctaHref}
              className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-500 px-6 text-sm font-extrabold tracking-wide text-black transition hover:bg-emerald-400"
            >
              REGISTER YOUR TEAM
            </Link>

            <a
              href={infoHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 text-sm font-bold tracking-wide text-white transition hover:bg-white/10"
            >
              VENUE WEBSITE
            </a>
          </div>
        </div>

        <div className="p-6 sm:p-8">
          <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/[0.08] p-5">
            <div className="text-[11px] font-bold tracking-[0.2em] text-emerald-300">
              VENUE DETAILS
            </div>

            <div className="mt-5 space-y-4">
              <Detail label="Venue" value={name} />
              <Detail label="League" value={league} />
              <Detail label="Location" value={location} />
              <Detail label="Address" value={address.join(", ")} />
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-3xl border border-white/10 bg-black/30">
            <div className="border-b border-white/10 px-5 py-4">
              <div className="text-[11px] font-bold tracking-[0.2em] text-white/50">
                LOCATION MAP
              </div>
            </div>

            <div className="relative aspect-[16/11] w-full">
              <iframe
                src={mapEmbedUrl}
                title={`${name} map`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="absolute inset-0 h-full w-full border-0"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">
        {label}
      </div>
      <div className="mt-1 text-base font-semibold text-white">{value}</div>
    </div>
  );
}