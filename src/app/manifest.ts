import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "StrokeSense — stroke check",
    short_name: "StrokeSense",
    description: "A 60-second guided BE-FAST stroke check using on-device AI.",
    start_url: "/exam",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#e11d48",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
