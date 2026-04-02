/** @type {import('next').NextConfig} */
const config = {
  transpilePackages: [
    "@penntools/core",
    "@penntools/platform",
    "@penntools/tool-course-finder",
  ],
  // Ensures server-only modules (Prisma, env vars) never leak to the client bundle.
  serverExternalPackages: ["@prisma/client", "prisma"],
};

export default config;
