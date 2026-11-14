// Every Connector page sits on a starry night sky (sky/StarrySky.tsx). Connector
// is full width (its manifest), so the sky fills the page area; the pages
// themselves keep a centered column above it. Pages change the sky with
// useSkyScene or <SkyScene>.

import { SkyProvider } from "./sky/SkyContext";
import { StarrySky } from "./sky/StarrySky";
import styles from "./layout.module.css";

export default function ConnectorLayout({ children }: { children: React.ReactNode }) {
  return (
    <SkyProvider>
      <div className={styles.night}>
        <StarrySky />
        <div className={styles.column}>{children}</div>
      </div>
    </SkyProvider>
  );
}
