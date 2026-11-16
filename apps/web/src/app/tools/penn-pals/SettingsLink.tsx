// A link to the site's Settings (for an AI key) that opens in a new tab.
// Settings is a platform page with no way back to Penn Pals, and leaving would
// lose anything typed here; in a new tab, the user closes it and reloads.

export function SettingsLink({ children, className }: { children: React.ReactNode; className?: string | undefined }) {
  return (
    <a href="/settings" target="_blank" rel="noopener noreferrer" className={className} title="Opens in a new tab">
      {children} <span aria-hidden="true">↗</span>
      <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clipPath: "inset(50%)" }}>
        (opens in a new tab)
      </span>
    </a>
  );
}
