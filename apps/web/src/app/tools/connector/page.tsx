// Connector: helps Wharton students meet people outside their usual circles.
// For now, just the profile form; nothing is saved yet.

import type { Metadata } from "next";
import { ProfileForm } from "./ProfileForm";

export const metadata: Metadata = {
  title: "Connector",
};

export default function ConnectorPage() {
  return <ProfileForm />;
}
