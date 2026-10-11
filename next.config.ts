import type { NextConfig } from "next";

const PRESS_FILES = [
  "./node_modules/pagedjs/dist/paged.polyfill.min.js",
  "./node_modules/@fontsource/newsreader/*.css",
  "./node_modules/@fontsource/newsreader/files/newsreader-latin*-{400,500,600}-*.woff*",
  "./node_modules/@fontsource/schibsted-grotesk/*.css",
  "./node_modules/@fontsource/schibsted-grotesk/files/schibsted-grotesk-latin*-{400,500,600,700}-*.woff*",
  "./public/library/covers/*.webp",
  "./public/library/topics/*.webp",
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["linkedom"],
  poweredByHeader: false,
  // The press reads these at run time: Paged.js, the book's faces, and the bundled covers and plates.
  outputFileTracingIncludes: {
    "/api/editions/**": PRESS_FILES,
    "/api/webhooks/stripe": PRESS_FILES,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
