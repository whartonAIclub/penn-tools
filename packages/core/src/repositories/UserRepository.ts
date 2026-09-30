import type { User, UserId } from "../types/index.js";

/** The Google account someone signed in with. */
export interface GoogleAccountInput {
  /** Google's stable account id (the OpenID `sub` claim). */
  googleId: string;
  email: string | null;
  name: string | null;
  image: string | null;
}

export interface UserRepository {
  findById(id: UserId): Promise<User | null>;
  /**
   * Called on every sign-in: returns the user for this Google account,
   * creating it on first sign-in, with name, email and picture refreshed.
   */
  upsertByGoogleAccount(input: GoogleAccountInput): Promise<User>;
}
