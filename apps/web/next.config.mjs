/** @type {import('next').NextConfig} */
const config = {
  transpilePackages: [
    "@penntools/core",
    "@penntools/platform",
    "@penntools/tool-course-finder",
  ],
  // Ensures server-only modules (Prisma, env vars) never leak to the client bundle.
  serverExternalPackages: ["@prisma/client", "prisma", "pdf-parse"],
  // pdfjs-dist optionally requires 'canvas' for Node.js SSR; stub it out in the
  // browser bundle so tool 7's PDF parser compiles without the native binary.
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default config;
