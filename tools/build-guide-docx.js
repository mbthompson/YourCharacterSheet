#!/usr/bin/env node
/*
 * Rebuilds "The Character Sheet - A Guide to Knowing Yourself.docx" from
 * "The Character Sheet - Guide.md", reproducing the design of the original
 * hand-built docx-js document (values below were read out of the old file's
 * document.xml / styles.xml / header1.xml / footer1.xml / numbering.xml).
 *
 * Usage:
 *   NODE_PATH="$(npm root -g)" node build-guide-docx.js <Guide.md> <out.docx>
 *
 * Optional environment switches:
 *   TIER_COLOURS=1      colour the Level column text with the score tier colours
 *                       (the old document did NOT do this; it used zebra rows)
 *   PREVIEW_FROM="..."  dev aid: drop the title page and everything before the
 *                       first source line starting with this text, so that a
 *                       Quick Look thumbnail (page 1 only) shows that section
 */
const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, Header, Footer,
  AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType, VerticalAlign,
  PageNumber, PageBreak, LevelFormat, PageOrientation,
} = require("docx");

const [, , SRC, OUT] = process.argv;
if (!SRC || !OUT) {
  console.error("usage: node build-guide-docx.js <Guide.md> <out.docx>");
  process.exit(2);
}

// ---------------------------------------------------------------- design tokens
const SERIF = "Georgia";
const SANS = "Arial";
const INK = "2D2D2D";      // body text, H1
const BROWN = "8B6F47";    // H2, callout lead, table header fill, Level column
const SLATE = "4A5568";    // H3, "Sub-scores:" label, sub-score names
const GREY = "999999";     // taglines, header/footer, title page small text
const CALLOUT = "666666";  // callout body
const RULE = "CCCCCC";     // hairline rules and cell borders
const ZEBRA = ["F5F5F5", "FFFFFF"]; // table body rows, starting with F5F5F5

const TIER_COLOURS = {
  "1–4": "DC2626", "5–7": "EA580C", "8–9": "D97706", "10–11": "9CA3AF",
  "12–13": "65A30D", "14–15": "16A34A", "16–17": "059669", "18–20": "047857",
};
const USE_TIER_COLOURS = process.env.TIER_COLOURS === "1";

// Headings that the old document set one level lower than their markdown level
// (it rendered them as Heading 3 beneath "How Abilities Work").
const DEMOTED_H3 = [/^Active\b/, /^Choosing Your Abilities$/];

// Paragraphs the old document set in bold as a design touch (not bold in the md).
const BOLD_PARAGRAPHS = [/^Let’s begin\.$/];

const TITLE_MD = "The Character Sheet: A Guide to Knowing Yourself";

// ---------------------------------------------------------------- read + parse
let md = fs.readFileSync(SRC, "utf8").replace(/\r\n/g, "\n");
if (md.includes("—")) throw new Error("source contains an em dash (U+2014)");
// Typographic apostrophes, as in the old document (and as pandoc's smart reader does).
md = md.replace(/(?<=[A-Za-z0-9])'(?=[A-Za-z])/g, "’");

function parseBlocks(text) {
  const lines = text.split("\n");
  const blocks = [];
  const isSpecial = (l) => /^(#{1,6}\s|---\s*$|\||- )/.test(l);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m;
    if (/^---\s*$/.test(line)) { blocks.push({ type: "hr" }); i++; continue; }
    if ((m = line.match(/^(#{1,6})\s+(.*\S)\s*$/))) {
      blocks.push({ type: "heading", level: m[1].length, text: m[2] }); i++; continue;
    }
    if (line.startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        const cells = lines[i].trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells);
        i++;
      }
      blocks.push({ type: "table", rows }); continue;
    }
    if (line.startsWith("- ")) {
      const items = [];
      while (i < lines.length && lines[i].startsWith("- ")) { items.push(lines[i].slice(2).trim()); i++; }
      blocks.push({ type: "list", items }); continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !isSpecial(lines[i])) { buf.push(lines[i].trim()); i++; }
    blocks.push({ type: "para", text: buf.join(" ") });
  }
  return blocks;
}

// **bold** and *italic* -> [{text, bold, italics}]
function parseInline(text) {
  const segs = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) segs.push({ text: text.slice(last, m.index) });
    if (m[1] !== undefined) segs.push({ text: m[1], bold: true });
    else segs.push({ text: m[2], italics: true });
    last = re.lastIndex;
  }
  if (last < text.length) segs.push({ text: text.slice(last) });
  for (const s of segs) {
    if (/[*_`\[\]]/.test(s.text)) throw new Error("unparsed markdown in: " + s.text);
    if (s.text.includes("'")) throw new Error("straight apostrophe left in: " + s.text);
  }
  return segs;
}
const plain = (text) => parseInline(text).map((s) => s.text).join("");

// ---------------------------------------------------------------- run / paragraph builders
function run(text, o = {}) {
  return new TextRun({
    text,
    font: o.font || SERIF,
    color: o.color || INK,
    size: o.size || 22,
    bold: o.bold || undefined,
    italics: o.italics || undefined,
    characterSpacing: o.characterSpacing,
  });
}
// md inline -> runs, layering md bold/italic on top of a base style
function runs(text, base = {}, boldOverride = {}) {
  return parseInline(text).map((s) =>
    run(s.text, {
      ...base,
      ...(s.bold ? boldOverride : {}),
      bold: base.bold || s.bold,
      italics: base.italics || s.italics,
    })
  );
}

const body = (text, base) =>
  new Paragraph({ spacing: { after: 160, line: 300 }, children: runs(text, base) });

const spacer = (after = 80) => new Paragraph({ spacing: { after } });

const rule = () =>
  new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, color: RULE, size: 1 } },
    spacing: { before: 200, after: 200 },
  });

const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

function heading(level, text) {
  const spec = {
    1: { h: HeadingLevel.HEADING_1, before: 400, after: 200, font: SERIF, color: INK, size: 36 },
    2: { h: HeadingLevel.HEADING_2, before: 360, after: 160, font: SERIF, color: BROWN, size: 28 },
    3: { h: HeadingLevel.HEADING_3, before: 240, after: 120, font: SANS, color: SLATE, size: 24 },
  }[level];
  return new Paragraph({
    heading: spec.h,
    keepNext: true,
    spacing: { before: spec.before, after: spec.after },
    children: [run(plain(text), { font: spec.font, color: spec.color, size: spec.size, bold: true })],
  });
}

const tagline = (text) =>
  new Paragraph({
    keepNext: true,
    spacing: { after: 120, line: 280 },
    children: [run(plain(text), { italics: true, color: GREY })],
  });

const subScoresLabel = (text) =>
  new Paragraph({
    keepNext: true,
    spacing: { before: 200, after: 120 },
    children: [run(plain(text), { font: SANS, bold: true, color: SLATE, size: 21 })],
  });

// "**Health.** Are you ..." -> indented paragraph, slate bold name, no bullet glyph
const subScore = (text) =>
  new Paragraph({
    spacing: { after: 100, line: 280 },
    indent: { left: 360 },
    children: runs(text, {}, { color: SLATE }),
  });

// "**When scoring Body, ask yourself:** ..." -> indented italic callout
function callout(text) {
  return new Paragraph({
    spacing: { before: 160, after: 200, line: 280 },
    indent: { left: 360 },
    children: parseInline(text).map((s) =>
      s.bold
        ? run(s.text, { bold: true, italics: true, color: BROWN })
        : run(s.text, { italics: true, color: CALLOUT })
    ),
  });
}

const bullet = (text) =>
  new Paragraph({
    style: "ListParagraph",
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 80, line: 280 },
    children: runs(text),
  });

const closing = (text) =>
  new Paragraph({
    spacing: { after: 160, line: 300 },
    children: [run(plain(text), { italics: true, color: BROWN, size: 24 })],
  });

// ---------------------------------------------------------------- title page
function titlePage() {
  const centre = (after, children) =>
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: after === undefined ? undefined : { after }, children });
  return [
    new Paragraph({ spacing: { before: 4000 } }),
    centre(200, [run("THE", { font: SANS, color: GREY, size: 28, characterSpacing: 400 })]),
    centre(100, [run("CHARACTER SHEET", { bold: true, size: 56 })]),
    rule(),
    centre(400, [run("A Guide to Knowing Yourself", { italics: true, color: BROWN, size: 28 })]),
    new Paragraph({ spacing: { before: 2000 } }),
    centre(100, [run("A structured self-reflection tool", { color: GREY, size: 20 })]),
    centre(undefined, [run("grounded in psychological science", { color: GREY, size: 20 })]),
  ];
}

// ---------------------------------------------------------------- score table
const COLS = [1200, 1800, 6360]; // sums to 9360 = 6.5in text width

function cell(width, fill, children, centred) {
  const b = { style: BorderStyle.SINGLE, color: RULE, size: 1 };
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: { top: b, left: b, bottom: b, right: b },
    shading: { fill, type: ShadingType.CLEAR },
    margins: { top: 80, left: 120, bottom: 80, right: 120 },
    verticalAlign: centred ? VerticalAlign.CENTER : undefined,
    children,
  });
}

function scoreTable(rows) {
  const [head, ...data] = rows;
  if (head.length !== 2 || head[0] !== "Score" || head[1] !== "Meaning") throw new Error("unexpected table header: " + head);
  const centred = (children) => new Paragraph({ alignment: AlignmentType.CENTER, children });
  const hrun = (t) => run(t, { font: SANS, bold: true, color: "FFFFFF", size: 20 });

  const out = [
    new TableRow({
      tableHeader: true,
      cantSplit: true,
      children: [
        cell(COLS[0], BROWN, [centred([hrun("Score")])], true),
        cell(COLS[1], BROWN, [centred([hrun("Level")])], true),
        cell(COLS[2], BROWN, [new Paragraph({ children: [hrun("Meaning")] })], true),
      ],
    }),
  ];
  data.forEach(([score, meaning], idx) => {
    // "**Critical.** This area ..." -> Level "Critical" + Meaning "This area ..."
    const m = meaning.match(/^\*\*([^*]+)\.\*\*\s+(.*)$/);
    if (!m) throw new Error("table row does not start with a bold level name: " + meaning);
    if (!TIER_COLOURS[score]) throw new Error("unknown score range: " + score);
    const fill = ZEBRA[idx % 2];
    const levelColour = USE_TIER_COLOURS ? TIER_COLOURS[score] : BROWN;
    out.push(
      new TableRow({
        cantSplit: true,
        children: [
          cell(COLS[0], fill, [centred([run(score, { font: SANS, bold: true, size: 20 })])], true),
          cell(COLS[1], fill, [centred([run(m[1], { font: SANS, bold: true, color: levelColour, size: 20 })])], true),
          cell(COLS[2], fill, [new Paragraph({ spacing: { line: 260 }, children: runs(m[2], { font: SANS, size: 19 }) })], false),
        ],
      })
    );
  });
  if (data.length !== 8) throw new Error("expected 8 scale rows, got " + data.length);
  return new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: COLS, rows: out });
}

// ---------------------------------------------------------------- assemble
let blocks = parseBlocks(md);

if (process.env.PREVIEW_FROM) {
  const k = blocks.findIndex((b) => (b.text || "").startsWith(process.env.PREVIEW_FROM));
  if (k < 0) throw new Error("PREVIEW_FROM not found");
  blocks = blocks.slice(k);
}

const children = [];
const lastParaIndex = blocks.map((b) => b.type).lastIndexOf("para");

blocks.forEach((b, i) => {
  const prev = blocks[i - 1];
  const next = blocks[i + 1];

  if (b.type === "heading") {
    if (b.level === 1) {
      if (b.text !== TITLE_MD) throw new Error("unexpected document title: " + b.text);
      children.push(...titlePage());
    } else if (b.level === 2) {
      children.push(heading(1, b.text));
    } else if (b.level === 3) {
      children.push(heading(DEMOTED_H3.some((re) => re.test(b.text)) ? 3 : 2, b.text));
    } else {
      children.push(heading(3, b.text));
    }
    return;
  }

  if (b.type === "hr") {
    // Section separators, as the old document rendered them:
    //  - before every top-level (##) section: a page break
    //  - before attributes 1, 2, 4, 6, 8: a hairline rule
    //  - before attributes 3, 5, 7: a page break (two attributes per spread)
    const attr = next && next.type === "heading" && next.level === 3 && next.text.match(/^(\d+)\.\s/);
    if (attr) {
      const n = Number(attr[1]);
      children.push(n > 1 && n % 2 === 1 ? pageBreak() : rule());
    } else if (i > 0) {
      children.push(pageBreak());
    }
    return;
  }

  if (b.type === "table") {
    children.push(spacer(), scoreTable(b.rows), spacer());
    return;
  }

  if (b.type === "list") {
    const isSubScores = prev && prev.type === "para" && /^\*\*Sub-scores:\*\*$/.test(prev.text);
    if (isSubScores) {
      b.items.forEach((t) => children.push(subScore(t)));
    } else {
      b.items.forEach((t) => children.push(bullet(t)));
      children.push(spacer());
    }
    return;
  }

  // paragraphs
  const t = b.text;
  if (/^\*\*Sub-scores:\*\*$/.test(t)) return void children.push(subScoresLabel(t));
  if (/^\*\*When scoring [^*]+\*\* /.test(t)) return void children.push(callout(t));
  if (/^\*[^*]+\*$/.test(t) && prev && prev.type === "heading") return void children.push(tagline(t));
  if (i === lastParaIndex && !process.env.PREVIEW_FROM) return void children.push(spacer(), closing(t));
  if (BOLD_PARAGRAPHS.some((re) => re.test(t))) return void children.push(body(t, { bold: true }));
  children.push(body(t));
});

const doc = new Document({
  title: TITLE_MD,
  description: "A structured self-reflection tool grounded in psychological science",
  styles: {
    default: { document: { run: { font: SERIF, size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: SERIF, color: INK },
        paragraph: { spacing: { before: 400, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: SERIF, color: BROWN },
        paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: SANS, color: SLATE },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840, orientation: PageOrientation.PORTRAIT }, // US Letter
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 708, footer: 708 },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [run("The Character Sheet", { font: SANS, italics: true, color: GREY, size: 16 })],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                run("Page ", { font: SANS, color: GREY, size: 16 }),
                new TextRun({ children: [PageNumber.CURRENT], font: SANS, color: GREY, size: 16 }),
              ],
            }),
          ],
        }),
      },
      children,
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log(`wrote ${OUT} (${buf.length} bytes, ${children.length} body blocks)`);
});
