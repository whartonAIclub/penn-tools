// Loads Google Programmable Search (limited to upenn.edu in its settings) for
// the "Find an email" panel. If it can't load, the tool falls back to opening
// the search in a window beside the tool (see openSearch.ts).

/** The tool's Programmable Search engine. Public: it appears in the page anyway. */
export const SEARCH_ENGINE_ID = "b5cecbaca2c394506";

/** Give up waiting for Google's script after this long. */
const LOAD_TIMEOUT_MS = 8000;

interface SearchElement {
  execute: (query: string) => void;
}

/** The parts of the page Google's script uses. (Kept separate from Window: another tool declares its own `google`.) */
interface SearchWindow {
  __gcse?: { parsetags: "explicit"; initializationCallback: () => void };
  google?: {
    search?: {
      cse?: {
        element?: {
          render: (
            box: { div: HTMLElement; tag: "searchbox"; gname: string },
            results: { div: HTMLElement; tag: "searchresults"; gname: string },
          ) => void;
          getElement: (gname: string) => SearchElement | undefined;
        };
      };
    };
  };
}

export type SearchStatus = "idle" | "loading" | "ready" | "failed";

let status: SearchStatus = "idle";
let loading: Promise<void> | null = null;

/** Whether the search can be shown inside the tool, as far as we know yet. */
export function searchStatus(): SearchStatus {
  return status;
}

/** Starts loading Google's script once; later calls share the same result. */
export function loadSearch(): Promise<void> {
  if (loading) return loading;
  status = "loading";
  loading = new Promise<void>((resolve, reject) => {
    const w = window as unknown as SearchWindow;
    const fail = () => reject(new Error("Programmable Search didn't load"));
    const timer = window.setTimeout(fail, LOAD_TIMEOUT_MS);
    w.__gcse = {
      parsetags: "explicit",
      initializationCallback: () => {
        window.clearTimeout(timer);
        resolve();
      },
    };
    const script = document.createElement("script");
    script.src = `https://cse.google.com/cse.js?cx=${SEARCH_ENGINE_ID}`;
    script.async = true;
    script.onerror = () => {
      window.clearTimeout(timer);
      fail();
    };
    document.head.appendChild(script);
  }).then(
    () => {
      status = "ready";
    },
    (error: unknown) => {
      status = "failed";
      throw error;
    },
  );
  return loading;
}

let count = 0;

/**
 * Draws the search box and the results inside the panel (as two parts, so
 * Google doesn't pop the results over the whole page) and runs `query`.
 * Returns false if that isn't possible.
 */
export function showSearch(div: HTMLElement, query: string): boolean {
  const element = (window as unknown as SearchWindow).google?.search?.cse?.element;
  if (!element) return false;
  // Each panel gets its own name; Google keeps elements by name.
  const gname = `nwcm-search-${++count}`;
  try {
    const box = document.createElement("div");
    const results = document.createElement("div");
    div.replaceChildren(box, results);
    element.render({ div: box, tag: "searchbox", gname }, { div: results, tag: "searchresults", gname });
    element.getElement(gname)?.execute(query);
    return true;
  } catch {
    return false;
  }
}
