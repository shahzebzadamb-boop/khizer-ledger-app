import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "https://khizer.shahzebzada.net/",
    name: "KHIZER LEDGER",
    short_name: "KHIZER LEDGER",
    description: "Client money management and accounting",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#111214",
    theme_color: "#111214",
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
