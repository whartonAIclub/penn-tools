#!/usr/bin/env python3
"""Capture the preview screenshots shown on the PennTools dashboard tiles.

Usage (use `python` or `py` instead of `python3` on Windows):
    python3 scripts/capture-tool-screenshots.py                          # every tool
    python3 scripts/capture-tool-screenshots.py career-canvas stactab    # just these

Needs Pillow (`pip install pillow`) and Chrome, or Edge, which every Windows
install has; set CHROME to the browser's path if it isn't found. Images are
written to apps/web/public/dashboard/{id}.jpg at 640x400.

Registered tools are captured from the local dev server, so run `pnpm dev`
first. They're cropped to the page area, without the site header and sidebar.
The capture is signed out, so tools that need a signed-in user show their
sign-in screen; take those by hand instead.

To add a tool, add a row to TARGETS. A `crop` box (left, top, right, bottom)
is in pixels of a window `width` wide (1280 by default) and `height` tall; use
it when the top of the page isn't representative.
"""

import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "apps/web/public/dashboard"
LOCAL = os.environ.get("PENNTOOLS_URL", "http://localhost:3000")
SIZE = (640, 400)
HEADER = 56  # --header-height in apps/web/src/app/globals.css
SIDEBAR = 260  # --sidebar-width in apps/web/src/app/globals.css


def local(path: str) -> dict:
    """A page on the dev server: a window wide enough for the sidebar plus a
    1280px page, cropped to the 1280x800 beside the sidebar and below the header."""
    return {
        "url": f"{LOCAL}{path}",
        "width": SIDEBAR + 1280,
        "height": HEADER + 800,
        "crop": (SIDEBAR, HEADER, SIDEBAR + 1280, HEADER + 800),
    }


TARGETS = {
    # Community tools (apps/web/src/data/communityTools.ts)
    "quakercal": {"url": "https://quakercal.vercel.app/"},
    "mbakit": {"url": "https://mbakit.vercel.app/"},
    "mba-tech-internships": {
        # The README, not GitHub's file listing.
        "url": "https://github.com/TrevorDohm/MBA-Tech-Internships-2027",
        "height": 2400,
        "crop": (24, 750, 936, 1320),
    },
    "pm-zero-to-one": {"url": "https://pmzerotoone.netlify.app/"},
    "roic-tree-generator": {"url": "https://roic-tree-generator.vercel.app/"},
    "defluffer": {"url": "https://itayzit.github.io/defluffer/"},
    "thankyougpt": {"url": "https://thank-you-gpt.com"},
    "stactab": {
        # The extension's promo image on its Chrome Web Store listing.
        "url": "https://chromewebstore.google.com/detail/stactab/hdfcdcoogjkdogmnhhopkekanpldoefh",
        "crop": (190, 348, 790, 718),
    },
    "ai-compass": {"url": "https://akshitkalra.com/aicompass"},
    # Registered tools (tools/*), keyed by manifest id
    "resume-customizer": local("/tools/resume-customizer"),
    "career-canvas": local("/tools/career-canvas"),
    "coursematch-assist": local("/tools/coursematch-assist"),
    "penn-planner": local("/tools/penn-planner"),
    "pitch-coach": local("/tools/pitch-coach"),
    "platform-playground": local("/tools/platform-playground"),
    "askpenn": local("/tools/askpenn"),
}


def find_browser() -> str:
    """Chrome, or another Chromium browser that takes the same headless flags.
    CHROME overrides the search."""
    if os.environ.get("CHROME"):
        return os.environ["CHROME"]
    if sys.platform == "darwin":
        candidates = [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        ]
    elif sys.platform == "win32":
        bases = [os.environ.get(k) for k in ("PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA")]
        candidates = [os.path.join(b, "Google", "Chrome", "Application", "chrome.exe") for b in bases if b]
        candidates += [os.path.join(b, "Microsoft", "Edge", "Application", "msedge.exe") for b in bases if b]
    else:
        candidates = [shutil.which(name) for name in ("google-chrome", "chromium", "chromium-browser", "microsoft-edge")]
    for candidate in candidates:
        if candidate and os.path.exists(candidate):
            return candidate
    sys.exit("Couldn't find Chrome or Edge. Set CHROME to the browser's path.")


def screenshot(browser: str, url: str, width: int, height: int, dest: Path, profile: Path) -> bool:
    # A fresh profile, so the capture never sees the user's own cookies (a
    # hidden sidebar, say) or hands off to a browser they have open.
    proc = subprocess.Popen(
        [
            browser, "--headless=new", "--disable-gpu", "--hide-scrollbars",
            "--no-first-run", "--no-default-browser-check", f"--user-data-dir={profile}",
            "--virtual-time-budget=10000", f"--window-size={width},{height}",
            f"--screenshot={dest}", url,
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    # Wait for the file, not the process: on Windows the process started here
    # can exit before the screenshot is written, and some pages (GitHub) keep
    # the browser alive after it is. Done once the file stops growing.
    deadline = time.monotonic() + 45
    size = -1
    while time.monotonic() < deadline:
        current = dest.stat().st_size if dest.exists() else 0
        if current > 0 and current == size:
            break
        size = current
        time.sleep(0.5)
    if proc.poll() is None:
        proc.kill()
    return dest.exists() and dest.stat().st_size > 0


def capture(browser: str, tool_id: str, target: dict, tmp: Path) -> bool:
    raw = tmp / f"{tool_id}.png"
    profile = tmp / f"{tool_id}-profile"
    if not screenshot(browser, target["url"], target.get("width", 1280), target.get("height", 800), raw, profile):
        return False
    with Image.open(raw) as opened:
        im = opened.convert("RGB")
    im = im.crop(target.get("crop", (0, 0, 1280, 800)))
    # Fill 640x400, center-cropping any crop box with a different shape.
    scale = max(SIZE[0] / im.width, SIZE[1] / im.height)
    im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    left, top = (im.width - SIZE[0]) // 2, 0
    im = im.crop((left, top, left + SIZE[0], top + SIZE[1]))
    im.save(OUT_DIR / f"{tool_id}.jpg", quality=82, optimize=True, progressive=True)
    return True


def main() -> int:
    ids = sys.argv[1:] or list(TARGETS)
    unknown = [i for i in ids if i not in TARGETS]
    if unknown:
        print(f"Unknown tool ids: {', '.join(unknown)}", file=sys.stderr)
        return 1
    browser = find_browser()
    print(f"Using {browser}")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    failed = []
    # On Windows a browser that's slow to exit can still hold a file open, so
    # don't let cleaning up the temporary folder fail the run.
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        for tool_id in ids:
            ok = capture(browser, tool_id, TARGETS[tool_id], Path(tmp))
            print(f"{'ok  ' if ok else 'FAIL'} {tool_id}")
            if not ok:
                failed.append(tool_id)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
