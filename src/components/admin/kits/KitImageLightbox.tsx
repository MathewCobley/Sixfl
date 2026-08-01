"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  src: string;
  fullSrc?: string;
  alt: string;
  className?: string;
  imageClassName?: string;
};

export default function KitImageLightbox({
  src,
  fullSrc,
  alt,
  className = "group relative block w-full cursor-zoom-in overflow-hidden",
  imageClassName = "h-full w-full object-contain",
}: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className}
        aria-label={`Enlarge ${alt}`}
        title="Click to enlarge"
      >
        <img src={src} alt={alt} loading="lazy" className={imageClassName} />
        <span className="pointer-events-none absolute inset-x-2 bottom-2 rounded-lg bg-black/70 px-2 py-1 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          Click to enlarge
        </span>
      </button>

      {mounted && open
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={alt}
              className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm sm:p-8"
              onMouseDown={(event) => {
                if (event.currentTarget === event.target) setOpen(false);
              }}
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="absolute right-4 top-4 inline-flex min-h-11 items-center justify-center rounded-xl border border-white/20 bg-black/70 px-4 text-sm font-semibold text-white transition hover:bg-white/10 sm:right-6 sm:top-6"
              >
                Close
              </button>

              <img
                src={fullSrc ?? src}
                alt={alt}
                className="max-h-[86vh] max-w-[94vw] rounded-2xl bg-white object-contain p-2 shadow-2xl sm:max-h-[88vh] sm:max-w-[88vw]"
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
