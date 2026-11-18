// Every Penn Pals page shares this header (Dashboard and Log a chat). A layout
// stays mounted while the user moves between its pages, so only the content
// below it changes.

import { PennPalsHeader } from "./PennPalsHeader";
import styles from "./PennPalsHeader.module.css";

export default function PennPalsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <PennPalsHeader />
      {children}
    </div>
  );
}
