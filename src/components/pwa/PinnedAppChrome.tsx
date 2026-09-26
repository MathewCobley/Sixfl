"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** App chrome belongs to the viewport, not a page's overflow/transform context.
 * Keep document scrolling and existing role-specific links, mode gates and safe
 * area padding. This owns its portal and measures only its own element: it does
 * not discover, move or restyle other React markup. */
export default function PinnedAppChrome({
  edge,
  children,
}: {
  edge: "top" | "bottom";
  children: ReactNode;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState(0);
  const [offset, setOffset] = useState(0);
  const layer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHost(document.body);
  }, []);

  useLayoutEffect(() => {
    const element = layer.current;
    if (!host || !element) return;
    const measure = () => {
      // Hidden player web chrome must reserve no space.
      const next = element.getBoundingClientRect().height;
      setHeight(previous => previous === next ? previous : next);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [host]);

  useEffect(() => {
    if (!host) return;
    const viewport = window.visualViewport;
    const update = () => {
      // Follow keyboard/browser viewport changes, but leave pinch zoom native.
      const normalScale = !viewport || Math.abs(viewport.scale - 1) < 0.01;
      const next = viewport && normalScale
        ? Math.max(0, edge === "top"
          ? viewport.offsetTop
          : window.innerHeight - viewport.height - viewport.offsetTop)
        : 0;
      setOffset(previous => previous === next ? previous : next);
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [host, edge]);

  // Identical server/first-client markup; the normal chrome is never duplicated.
  if (!host) return <>{children}</>;

  return <>
    {edge === "top" ? (
      <div data-app-header-space aria-hidden="true" style={{ height, flexShrink: 0 }} />
    ) : null}
    {createPortal(
      <div ref={layer} className="sixfl-pinned-app-chrome" data-app-chrome-edge={edge}
        style={{ position: "fixed", left: 0, right: 0, [edge]: offset, zIndex: edge === "top" ? 40 : 50 }}>
        <style>{`
          /* Only direct children owned by this portal. The wrapper is the
             single positioning owner; hidden web variants remain hidden. */
          .sixfl-pinned-app-chrome > header,
          .sixfl-pinned-app-chrome > nav {
            position: static !important;
            inset: auto !important;
            width: 100%;
          }
        `}</style>
        {children}
      </div>,
      host,
    )}
  </>;
}
