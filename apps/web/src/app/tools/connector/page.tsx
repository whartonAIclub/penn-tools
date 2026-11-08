// Connector: helps Wharton students meet people outside their usual circles.
// For now: the profile form, then the questions; nothing is saved yet.

import type { Metadata } from "next";
import { Connector } from "./Connector";

export const metadata: Metadata = {
  title: "Connector",
};

export default function ConnectorPage() {
  return <Connector />;
}
