import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RikaQuiz",
    short_name: "RikaQuiz",
    description: "中学理科4分野の一問一答学習サイト",
    start_url: "/",
    display: "standalone",
    background_color: "#ffe9f0",
    theme_color: "#f7a5bb",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
