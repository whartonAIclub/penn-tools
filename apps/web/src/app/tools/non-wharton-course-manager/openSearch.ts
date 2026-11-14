// Opens the contact search in a window beside the tool, so the student can
// copy the email and paste it back without losing their place.

/** Returns false if the browser blocked the window; the link then opens in a new tab as usual. */
export function openBeside(href: string): boolean {
  const width = Math.round(window.screen.availWidth / 2);
  const height = window.outerHeight;
  // Just right of this window, but never off the edge of the screen.
  const left = Math.min(window.screenX + window.outerWidth, window.screen.availWidth - width);
  const top = window.screenY;
  const popup = window.open(href, "nwcm-search", `popup,width=${width},height=${height},left=${left},top=${top}`);
  if (!popup) return false;
  // The search page can't reach back into the tool.
  popup.opener = null;
  popup.focus();
  return true;
}
