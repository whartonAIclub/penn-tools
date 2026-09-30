// NextAuth's sign-in, callback and sign-out endpoints. See lib/auth.ts.

import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
