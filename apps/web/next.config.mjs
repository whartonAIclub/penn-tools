/** @type {import('next').NextConfig} */
const config = {
  transpilePackages: [
    "@penntools/core",
    "@penntools/platform",
    "@penntools/tool-course-finder",
  ],
  // Ensures server-only modules (Prisma, env vars) never leak to the client bundle.
  serverExternalPackages: ["@prisma/client", "prisma"],
  webpack: (config) => {
    // pdfjs-dist optionally depends on `canvas` for server-side rendering.
    // We only use it in the browser, so stub it out to prevent build failures.
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default config;
