export interface Admin {
  /** Lowercase. */
  email: string;
  addedAt: Date;
  /** The email of the admin who added them, or null for the first admins. */
  addedBy: string | null;
}

/**
 * Who can open the platform's admin page. Emails are matched lowercase; the
 * repository lowercases what it's given.
 */
export interface AdminRepository {
  /** Oldest first. */
  list(): Promise<Admin[]>;
  isAdmin(email: string): Promise<boolean>;
  /** Adds the email; adding an existing admin changes nothing. */
  add(email: string, addedBy: string): Promise<void>;
  remove(email: string): Promise<void>;
}
