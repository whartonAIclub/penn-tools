/** @type {import('next').NextConfig} */
const config = {
  transpilePackages: [
    "@penntools/core",
    "@penntools/platform",
  ],
  // Ensures server-only modules (Prisma, env vars) never leak to the client bundle.
  // pdfjs-dist too, on the server only: bundled, it can't find the worker file it
  // loads next to itself (./pdf.worker.js), so every PDF fails to open.
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "prisma", "pdfjs-dist"],
  },
  async redirects() {
    return [
      // The site moved from its Railway domain; send old links to the same page on the new one.
      {
        source: "/:path*",
        has: [{ type: "host", value: "penntools.up.railway.app" }],
        destination: "https://penntools.org/:path*",
        permanent: true,
      },
      // AI Compass was a registered tool whose page only redirected here; it's a community tool now.
      { source: "/tools/ai-compass", destination: "https://akshitkalra.com/aicompass", permanent: true },
      // Tools that had numeric IDs, so old links and bookmarks keep working.
      { source: "/tools/1/:path*", destination: "/tools/coursematch-assist/:path*", permanent: true },
      { source: "/tools/7/:path*", destination: "/tools/resume-customizer/:path*", permanent: true },
      { source: "/tools/8/:path*", destination: "/tools/career-canvas/:path*", permanent: true },
    ];
  },
  webpack: (config) => {
    // pdfjs-dist optionally depends on `canvas` for server-side rendering.
    // We only use it in the browser, so stub it out to prevent build failures.
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default config;
