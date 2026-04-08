import type { ReactNode } from "react";
import { Sidebar } from "./_components/Sidebar";

export default function PennPlannerLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", minHeight: "calc(100vh - 90px)", background: "#fafafa" }}>
      <Sidebar />
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}
