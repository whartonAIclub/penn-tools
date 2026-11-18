/**
 * editor.ts — reads the editor (a contentEditable element filled by docToHtml)
 * back into a ResumeDoc, for the exports and the AI chat. Elements docToHtml
 * wrote carry data-rc; anything the browser added while the user edited (new
 * lines, lists) is read by its tag. Bold, italic and underline come from the
 * computed style, so they're right however the browser marked them up.
 */

import { contactStyle, type ResumeDoc, type ResumeLine, type ResumeSection, type TextRun } from "@penntools/tool-resume-customizer/resume";

const BLOCK_TAGS = new Set(["DIV", "P", "UL", "OL", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "SECTION", "BLOCKQUOTE"]);

function isBlock(node: Node): node is HTMLElement {
  return node instanceof HTMLElement && BLOCK_TAGS.has(node.tagName);
}

function isUnderlined(node: Node, root: Node): boolean {
  for (let el = node.parentElement; el && el !== root; el = el.parentElement) {
    if (el.tagName === "U" || getComputedStyle(el).textDecorationLine.includes("underline")) return true;
  }
  return false;
}

/** Whitespace collapsed where runs meet, the ends trimmed, and empty runs dropped. */
function tidy(runs: TextRun[]): TextRun[] {
  for (let i = 1; i < runs.length; i++) {
    if (runs[i - 1]!.text.endsWith(" ") && runs[i]!.text.startsWith(" ")) runs[i]!.text = runs[i]!.text.slice(1);
  }
  if (runs[0]) runs[0].text = runs[0].text.trimStart();
  const last = runs[runs.length - 1];
  if (last) last.text = last.text.trimEnd();
  return runs.filter((r) => r.text);
}

/**
 * The styled text under `nodes`, one list of runs per line: a <br> (pasted
 * text has them) starts a new line, as it does on screen. Lines without text
 * are left out.
 */
function readLines(nodes: Node[], root: Node): TextRun[][] {
  const lines: TextRun[][] = [[]];
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? "").replace(/\s+/g, " ");
      if (!text) return;
      const style = node.parentElement ? getComputedStyle(node.parentElement) : null;
      const r: TextRun = {
        text,
        bold: style ? parseInt(style.fontWeight, 10) >= 600 : false,
        italic: style ? style.fontStyle !== "normal" : false,
        underline: isUnderlined(node, root),
      };
      const runs = lines[lines.length - 1]!;
      const last = runs[runs.length - 1];
      if (last && last.bold === r.bold && last.italic === r.italic && last.underline === r.underline) last.text += r.text;
      else runs.push(r);
    } else if (node instanceof HTMLElement) {
      if (node.tagName === "BR") lines.push([]);
      else node.childNodes.forEach(visit);
    }
  };
  nodes.forEach(visit);
  return lines.map(tidy).filter((runs) => runs.length);
}

/** The styled text under `nodes` as one line: line breaks become spaces (a row has one line). */
function readRuns(nodes: Node[], root: Node): TextRun[] {
  const space: TextRun = { text: " ", bold: false, italic: false, underline: false };
  return tidy(readLines(nodes, root).flatMap((runs, i) => (i ? [{ ...space }, ...runs] : runs)));
}

/** An element's text on one line; innerText, unlike textContent, turns a <br> into a break, not nothing. */
function plainText(el: HTMLElement): string {
  return el.innerText.replace(/\s+/g, " ").trim();
}

/**
 * Keeps one name line. Pressing Enter in the name, or pasting several lines
 * into it, makes the browser copy its attributes and style onto new lines;
 * left alone they'd all look like the name on screen. The name is the first
 * name line with text (Enter at its start puts an empty copy before it,
 * which is removed: the exports have no blank line above the name). The
 * other copies become contact lines where they are, so they're shown, and
 * exported, between the name and the contact details. The page calls this
 * after each edit.
 */
export function tidyHeader(root: HTMLElement): void {
  const names = [...root.querySelectorAll<HTMLElement>('[data-rc="name"]')];
  if (names.length < 2) return;
  const kept = names.find((el) => el.textContent?.trim()) ?? names[0]!;
  let afterName = false;
  for (const el of names) {
    if (el === kept) {
      afterName = true;
    } else if (!afterName && !el.textContent?.trim()) {
      el.remove();
    } else {
      el.dataset.rc = "contact";
      el.setAttribute("style", contactStyle(false));
    }
  }
}

/** The resume in the editor. */
export function editorToDoc(root: HTMLElement): ResumeDoc {
  const doc: ResumeDoc = { name: "", contact: "", sections: [] };
  let section: ResumeSection | null = null;

  const push = (line: ResumeLine) => {
    if (!section) {
      section = { heading: "", lines: [] };
      doc.sections.push(section);
    }
    section.lines.push(line);
  };
  const pushText = (nodes: Node[]) => {
    for (const runs of readLines(nodes, root)) push({ kind: "text", runs });
  };
  /** `next` added to `text`, which already holds the earlier part, if any. */
  const join = (text: string, next: string, separator: string) => [text, next].filter(Boolean).join(separator);

  const visitChildren = (parent: Node) => {
    // Inline nodes between blocks, such as text typed after a list, form a line.
    let inline: Node[] = [];
    const flush = () => {
      if (inline.length) pushText(inline);
      inline = [];
    };
    parent.childNodes.forEach((node) => {
      if (isBlock(node)) {
        flush();
        visitBlock(node);
      } else {
        inline.push(node);
      }
    });
    flush();
  };

  const visitBlock = (el: HTMLElement) => {
    const kind = el.dataset.rc;
    // Pressing Enter in a contact line makes another (the browser copies the
    // attributes): each is a line of the contact block, in order. Extra name
    // lines become contact lines through tidyHeader; joining is the fallback
    // if one remains.
    if (kind === "name") {
      doc.name = join(doc.name, plainText(el), " ");
      return;
    }
    if (kind === "contact") {
      doc.contact = join(doc.contact, plainText(el), "\n");
      return;
    }
    if (kind === "heading") {
      section = { heading: plainText(el), lines: [] };
      doc.sections.push(section);
      return;
    }
    if (el.tagName === "LI") {
      for (const runs of readLines([el], root)) push({ kind: "bullet", runs });
      return;
    }
    if (el.tagName === "UL" || el.tagName === "OL") {
      el.childNodes.forEach((child) => {
        if (child instanceof HTMLElement && child.tagName === "LI") visitBlock(child);
        else if (child.textContent?.trim()) pushText([child]);
      });
      return;
    }
    if (kind === "row") {
      const left = el.querySelector<HTMLElement>('[data-rc="left"]');
      const right = el.querySelector<HTMLElement>('[data-rc="right"]');
      if (left || right) {
        const line: ResumeLine = {
          kind: "row",
          startsEntry: el.dataset.entry === "1",
          left: left ? readRuns([left], root) : [],
          right: right ? readRuns([right], root) : [],
        };
        if (line.left.length || line.right.length) push(line);
        return;
      }
    }
    // A block holding other blocks (the browser wraps lines when the user
    // edits) is read line by line; otherwise it's one line of text.
    if (Array.from(el.childNodes).some(isBlock)) visitChildren(el);
    else pushText([el]);
  };

  visitChildren(root);
  doc.sections = doc.sections.filter((s) => s.heading || s.lines.length);
  return doc;
}
