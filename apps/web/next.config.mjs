/** @type {import('next').NextConfig} */
const config = {
  transpilePackages: [
    "@penntools/core",
    "@penntools/platform",
  ],
  // Loaded from node_modules on the server instead of bundled: bundled, pdfjs-dist
  // can't find the worker file it loads next to itself (./pdf.worker.js), so every
  // PDF fails to open. (Next.js already does this for Prisma.)
  serverExternalPackages: ["pdfjs-dist"],
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
};

export default config;
