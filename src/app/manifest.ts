import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "https://khizer.shahzebzada.net/",
    name: "Khizer Ledger",
    short_name: "Khizer",
    description: "Property ledger",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#030D18",
    theme_color: "#030D18",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
