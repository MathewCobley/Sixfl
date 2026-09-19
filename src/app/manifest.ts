import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "SIXFL",
    short_name: "SIXFL",
    description:
      "SIXFL six-a-side football leagues, fixtures, squads, payments and referee tools.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#0b0f14",
    theme_color: "#0b0f14",
    categories: ["sports", "lifestyle"],
    icons: [
      {
        src: "/favicon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/favicon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
