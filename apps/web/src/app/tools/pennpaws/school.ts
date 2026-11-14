// Whether the platform's local development user, who has no Penn email, may
// pass PennPaws's Penn check. Only when running `pnpm dev`; never on the site.
export const ALLOW_LOCAL_TEST_ACCOUNT = process.env.NODE_ENV === "development";
