/** @type {import('next').NextConfig} */
const config = {
  transpilePackages: [
    "@penntools/core",
    "@penntools/platform",
    "@penntools/tool-course-finder",
  ],
  experimental: {
    // Ensures server-only modules (Prisma, env vars) never leak to the client bundle.
    serverComponentsExternalPackages: ["@prisma/client", "prisma"],
  },
};

export default config;
