// ========================================
// File: src/components/player-pool/PlayerPoolLogo.tsx
// ========================================

import Image from "next/image";

type PlayerPoolLogoProps = {
  compact?: boolean;
  className?: string;
  priority?: boolean;
};

export default function PlayerPoolLogo({
  compact = false,
  className = "",
  priority = false,
}: PlayerPoolLogoProps) {
  if (compact) {
    return (
      <div className={`inline-flex items-center gap-3 ${className}`}>
        <Image
          src="/player-pool-mark.svg"
          alt=""
          aria-hidden="true"
          width={52}
          height={52}
          className="h-11 w-11 shrink-0"
          unoptimized
        />
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.24em] text-white/45">
            SIXFL
          </div>
          <div className="mt-0.5 text-xl font-black uppercase leading-none tracking-[0.08em] text-white">
            Player<span className="text-emerald-400">Pool</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`max-w-[760px] ${className}`}>
      <Image
        src="/logo2.png"
        alt="SIXFL"
        width={949}
        height={252}
        priority={priority}
        className="h-auto w-full max-w-[640px] object-contain"
      />

      <div className="mt-3 flex items-center gap-4 sm:gap-5">
        <Image
          src="/player-pool-mark.svg"
          alt=""
          aria-hidden="true"
          width={82}
          height={82}
          className="h-16 w-16 shrink-0 sm:h-20 sm:w-20"
          unoptimized
        />

        <div className="min-w-0">
          <div className="text-3xl font-black uppercase leading-none tracking-[0.1em] text-white sm:text-5xl">
            Player<span className="text-emerald-400">Pool</span>
          </div>
          <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.19em] text-white/45 sm:text-xs">
            Available players. Private introductions.
          </div>
        </div>
      </div>
    </div>
  );
}
