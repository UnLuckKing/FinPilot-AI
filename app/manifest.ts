import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FinPilot AI",
    short_name: "FinPilot",
    description: "Ücretsiz finansal karar destek ve portföy takip uygulaması",
    start_url: "/panel",
    display: "standalone",
    background_color: "#07110e",
    theme_color: "#07110e",
    lang: "tr",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
