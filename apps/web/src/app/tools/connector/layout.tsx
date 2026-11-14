// Every Connector page sits on a starry night sky (sky/StarrySky.tsx). Connector
// is full width (its manifest), so the sky fills the page area; the pages
// themselves keep a centered column above it. Pages change the sky with
// useSkyScene or <SkyScene>. Headings use Space Grotesk and text uses Inter,
// loaded only for Connector.

import { Inter, Space_Grotesk } from "next/font/google";
import { SkyProvider } from "./sky/SkyContext";
import { StarrySky } from "./sky/StarrySky";
import styles from "./layout.module.css";

const display = Space_Grotesk({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });
const body = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body" });

export default function ConnectorLayout({ children }: { children: React.ReactNode }) {
  return (
    <SkyProvider>
      <div className={`${styles.night} ${display.variable} ${body.variable}`}>
        <StarrySky />
        <div className={styles.column}>{children}</div>
      </div>
    </SkyProvider>
  );
}
