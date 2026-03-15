// yaml_to_typst.js — Generate Typst (.typ) file from YAML intermediate representation
// Usage: node yaml_to_typst.js <input.yaml> <output.typ>

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { latexToTypst, yamlTextToTypst } = require('./math_convert.js');

// ─── Paths (from CLI args or defaults) ───
const yamlPath = process.argv[2] ? path.resolve(process.argv[2]) : null;
const typPath = process.argv[3] ? path.resolve(process.argv[3]) : null;
if (!yamlPath || !typPath) {
  console.error('Usage: node yaml_to_typst.js <input.yaml> <output.typ>');
  process.exit(1);
}
const baseDir = path.dirname(yamlPath);

// ─── Read and parse YAML ───
const yamlContent = fs.readFileSync(yamlPath, 'utf8');
const doc = yaml.load(yamlContent);

const metadata = doc.metadata;
const content = doc.content;

// ─── Typst preamble (v3 typography) ───
// Note: header text uses metadata title
const preamble = `// ${metadata.title} - Korean Translation
// Generated from YAML intermediate representation

// ─── Color Palette ───
#let accent = rgb("#1a5276")
#let accent-light = rgb("#2980b9")
#let accent-sub = rgb("#5b7d9a")
#let rule-color = rgb("#b0c4d8")
#let caption-fg = rgb("#4a6a7d")
#let code-bg = rgb("#f4f7fa")
#let code-border = rgb("#d4dde6")
#let bg-cream = rgb("#fefdfb")

// ─── Page Setup ───
#set page(
  paper: "a4",
  margin: (top: 28mm, bottom: 28mm, left: 24mm, right: 24mm),
  fill: bg-cream,
  header: context {
    if counter(page).get().first() > 1 [
      #set text(size: 7.5pt, fill: accent-sub, font: "Malgun Gothic")
      #h(1fr) ${metadata.title.replace(/\$/g, '\\$')} — 한국어 번역
    ]
  },
  footer: context {
    set text(size: 8pt, fill: accent-sub, font: "Malgun Gothic")
    align(center)[#counter(page).display()]
  },
)

// ─── Text & Paragraph ───
#set text(font: "Malgun Gothic", size: 10.5pt, lang: "ko", fill: luma(30))
#set par(justify: true, leading: 1.1em, first-line-indent: 1em, spacing: 1.9em)

// ─── Headings ───
#set heading(numbering: none)

#show heading.where(level: 1): it => {
  set text(size: 20pt, weight: "bold", font: "Malgun Gothic", fill: accent)
  set par(first-line-indent: 0pt)
  v(0.4em)
  it
  v(0.3em)
}

#show heading.where(level: 2): it => {
  set text(size: 13pt, weight: "bold", font: "Malgun Gothic", fill: accent)
  set par(first-line-indent: 0pt)
  v(1.6em)
  block(below: 0.5em)[
    #it
    #v(0.15em)
    #line(length: 100%, stroke: 0.4pt + rule-color)
  ]
}

#show heading.where(level: 3): it => {
  set text(size: 11.5pt, weight: "bold", font: "Malgun Gothic", fill: accent-light)
  set par(first-line-indent: 0pt)
  v(1.2em)
  it
  v(0.4em)
}

// ─── Figures ───
#show figure: it => {
  v(1.2em)
  it
  v(1.2em)
}
#show figure.caption: it => {
  set text(size: 9pt, fill: caption-fg)
  set par(first-line-indent: 0pt, leading: 0.7em)
  v(0.5em)
  it
}

// ─── Code Blocks ───
#show raw.where(block: true): it => {
  set text(font: "Consolas", size: 9pt, fill: luma(40))
  set par(first-line-indent: 0pt, leading: 0.75em)
  v(0.4em)
  block(
    width: 100%,
    fill: code-bg,
    stroke: 0.5pt + code-border,
    radius: 4pt,
    inset: (x: 16pt, y: 12pt),
    it,
  )
  v(0.4em)
}
#show raw.where(block: false): set text(font: "Consolas", size: 9.5pt)

// ─── Math ───
#show math.equation: set text(font: ("New Computer Modern Math", "Malgun Gothic"))

// ─── Lists ───
#set list(indent: 1.2em, body-indent: 0.5em, spacing: 0.8em)

// ─── Strong text styling ───
#show strong: set text(font: "Malgun Gothic", fill: accent)

// ─── Horizontal Rules ───
#let separator() = {
  v(1em)
  line(length: 100%, stroke: 0.6pt + rule-color)
  v(1em)
}
`;

// ─── Helper: escape Typst content-mode special chars ───
// In Typst content mode, [ and ] are special (content blocks).
// We need to escape them when they appear as literal text.
function escapeTypstContent(text) {
  // Escape [ and ] but NOT if they're part of Typst markup we want to keep
  // This is context-dependent. For general text, escape them.
  text = text.replace(/\[/g, '\\[');
  text = text.replace(/\]/g, '\\]');
  return text;
}

// ─── Process paragraph text ───
function processText(text) {
  // Check if text starts with Typst markup (e.g., #text(size: 9pt)[...)
  if (text.startsWith('#text(') || text.startsWith('"#text(')) {
    // Strip surrounding quotes if present
    let t = text;
    if (t.startsWith('"') && t.endsWith('"')) {
      t = t.slice(1, -1);
    }
    // This is already Typst markup — but still convert inline math
    // Convert inline LaTeX math $...$ to Typst math
    t = t.replace(/\$([^$]+)\$/g, (_, math) => {
      return `$${latexToTypst(math)}$`;
    });
    // Convert **bold** to *bold* (Typst strong)
    t = t.replace(/\*\*([^*]+?)\*\*/g, '*$1*');
    return t;
  }

  // Normal text: process through yamlTextToTypst
  let result = yamlTextToTypst(text);

  // Handle blank lines (\n\n) — replace with Typst line break
  result = result.replace(/\n\n/g, ' \\\n');

  return result;
}

// ─── Generate title block ───
function generateTitleBlock(meta) {
  const authorsStr = Array.isArray(meta.authors) ? meta.authors.join(', ') : meta.authors;
  return `#align(center)[
  #set par(first-line-indent: 0pt, leading: 0.7em)
  #text(size: 22pt, weight: "bold", font: "Malgun Gothic", fill: accent)[${meta.title}]
  #v(0.6em)
  #text(size: 11pt, weight: "bold", fill: luma(40))[${authorsStr}]
  #v(0.2em)
  #text(size: 10pt, fill: accent-sub)[${meta.affiliation}]
  #v(0.5em)
  #text(size: 9pt, style: "italic", fill: luma(100))[
    ${meta.venue}\\
    ${meta.editors}
  ]
]

#separator()
`;
}

// ─── Render a content node ───
function renderNode(node) {
  switch (node.type) {
    case 'heading':
      return renderHeading(node);
    case 'paragraph':
      return renderParagraph(node);
    case 'equation':
      return renderEquation(node);
    case 'figure':
      return renderFigure(node);
    case 'figure_grid':
      return renderFigureGrid(node);
    case 'table':
      return renderTable(node);
    case 'code':
      return renderCode(node);
    case 'list':
      return renderList(node);
    case 'separator':
      return '#separator()\n';
    default:
      console.warn(`Unknown node type: ${node.type}`);
      return '';
  }
}

function renderHeading(node) {
  const prefix = '='.repeat(node.level);
  const text = yamlTextToTypst(node.text);
  return `${prefix} ${text}\n`;
}

function renderParagraph(node) {
  const text = processText(node.text);
  if (node.indent === false) {
    return `#par(first-line-indent: 0pt)[${text}]\n`;
  }
  return `${text}\n`;
}

function renderEquation(node) {
  // Pre-process: fix malformed LaTeX where Typst artifacts leaked into matrix definitions
  // e.g., \begin{pmatrix}delim: \text{(} & ... → \begin{pmatrix} ...
  let latex = node.latex;
  latex = latex.replace(/\\begin\{pmatrix\}delim:\s*\\text\{[^}]*\}\s*&\s*/g, '\\begin{pmatrix}');

  let typstMath = latexToTypst(latex);

  // Add suffix if present
  if (node.suffix) {
    typstMath += ` quad "${node.suffix}"`;
  }

  // Add equation number if present
  if (node.number !== undefined) {
    typstMath += ` quad quad (${node.number})`;
  }

  return `$ ${typstMath} $\n`;
}

function renderFigure(node) {
  let source = node.source;
  // For vector images, append .pdf
  if (node.format === 'vector') {
    source = source + '.pdf';
  }

  const width = node.width || '100%';
  const caption = node.caption ? yamlTextToTypst(node.caption) : '';

  return `#figure(image("${source}", width: ${width}), caption: [${caption}])\n`;
}

function renderFigureGrid(node) {
  const cols = node.columns || 2;
  const caption = node.caption ? yamlTextToTypst(node.caption) : '';

  let lines = [];
  lines.push('#figure(');
  lines.push(`  grid(`);
  lines.push(`    columns: ${cols},`);
  lines.push(`    gutter: 12pt,`);

  for (const item of node.items) {
    let source = item.source;
    if (item.format === 'vector') {
      source = source + '.pdf';
    }
    const label = item.label ? yamlTextToTypst(item.label) : '';
    lines.push(`    figure(image("${source}", width: 100%), caption: [${label}]),`);
  }

  lines.push(`  ),`);
  lines.push(`  caption: [${caption}]`);
  lines.push(`)\n`);

  return lines.join('\n');
}

function renderTable(node) {
  const caption = node.caption ? yamlTextToTypst(node.caption) : '';
  const title = node.title ? yamlTextToTypst(node.title) : '';
  const numCols = node.headers ? node.headers.length : (node.rows[0] ? node.rows[0].length : 1);

  let lines = [];
  lines.push('#figure(');
  lines.push(`  table(`);
  lines.push(`    columns: ${numCols},`);
  lines.push(`    align: center,`);
  lines.push(`    stroke: 0.5pt + rgb("#b0c4d8"),`);
  lines.push(`    inset: 6pt,`);

  if (node.headers) {
    const headerCells = node.headers.map(h => {
      const text = yamlTextToTypst(h);
      return `    [*${text}*],`;
    });
    lines.push(...headerCells);
  }

  for (const row of node.rows) {
    const cells = row.map(cell => {
      const text = yamlTextToTypst(cell);
      return `    [${text}],`;
    });
    lines.push(...cells);
  }

  lines.push(`  ),`);
  lines.push(`  caption: [${caption}]`);
  lines.push(`)\n`);

  return lines.join('\n');
}

function renderCode(node) {
  const codeText = node.content || node.text || '';
  const title = node.title || '';
  const codeLines = codeText.trimEnd().split('\n');

  const typstLines = codeLines.map(line => renderTypstCodeLine(line));

  let result = '#v(0.4em)\n';
  result += '#block(width: 100%, fill: code-bg, stroke: 0.5pt + code-border, radius: 4pt, clip: true)[\n';

  if (title) {
    result += '  #block(width: 100%, fill: rgb("#eaf2f8"), inset: (x: 16pt, y: 8pt), below: 0pt, above: 0pt)[\n';
    result += '    #set par(first-line-indent: 0pt)\n';
    result += `    #text(font: "Malgun Gothic", size: 9.5pt, fill: accent, weight: "bold")[${escapeTypstContent(title)}]\n`;
    result += '  ]\n';
  }

  result += '  #block(inset: (x: 16pt, y: 12pt), width: 100%)[\n';
  result += '    #set text(font: "Consolas", size: 9pt, fill: luma(40))\n';
  result += '    #set par(first-line-indent: 0pt, leading: 0.7em, spacing: 0.7em)\n';
  result += '    ' + typstLines.join('\\\n    ') + '\n';
  result += '  ]\n';
  result += ']\n';
  result += '#v(0.4em)\n';

  return result;
}

// ─── Pseudocode keywords for Typst code highlighting ───
const codeKeywords = [
  'end algorithm', 'end foreach', 'end if', 'end for', 'end loop',
  'for all',
  'algorithm', 'foreach', 'endfor', 'endloop', 'endwhile',
  'loop', 'initialize', 'if', 'then', 'else', 'do',
  'return', 'while', 'times', 'in', 'for'
];
const codeKwPattern = codeKeywords.map(k => k.replace(/ /g, '\\s+')).join('|');
const codeKwRe = new RegExp('(?<![a-zA-Z])(' + codeKwPattern + ')(?![a-zA-Z])', 'g');

function renderTypstCodeLine(line) {
  if (line.trim() === '') return '';

  let lineNum = '';
  let afterNumSpaces = 0;
  let content = '';

  // Try to match line number patterns
  let m = line.match(/^(\(\d+\))(\s+)(.*)/);
  if (m) {
    lineNum = m[1];
    afterNumSpaces = m[2].length;
    content = m[3];
  } else {
    m = line.match(/^(\d{2}:)(\s+)(.*)/);
    if (m) {
      lineNum = m[1];
      afterNumSpaces = m[2].length;
      content = m[3];
    } else {
      // No line number — treat entire line as content with leading spaces
      m = line.match(/^(\s*)(.*)/);
      const leadSpaces = m[1].length;
      content = m[2];
      if (leadSpaces > 0) {
        return `#h(${(leadSpaces * 0.5).toFixed(1)}em)` + processTypstCodeContent(content);
      }
      return processTypstCodeContent(content);
    }
  }

  // Build output: line number + indentation + content
  let result = `#text(fill: luma(150))[${lineNum}]`;
  if (afterNumSpaces > 0) {
    result += `#h(${(afterNumSpaces * 0.5).toFixed(1)}em)`;
  }
  result += processTypstCodeContent(content);
  return result;
}

function processTypstCodeContent(text) {
  // Step 0: Extract $...$ math regions → placeholders
  const mathRegions = [];
  let processed = text.replace(/\$([^$]+)\$/g, (_, math) => {
    mathRegions.push(math);
    return '\x00MATH' + (mathRegions.length - 1) + '\x00';
  });

  // Step 1: Escape Typst special characters in non-math content
  // Characters: # $ [ ] * _ \ @ ` ~ < >
  processed = processed.replace(/([#$\[\]*_\\@`~<>])/g, '\\$1');

  // Step 2: Handle operators
  processed = processed.replace(/←/g, '#text(fill: rgb("#d63384"))[←]');
  processed = processed.replace(/≠/g, '#text(fill: rgb("#d63384"))[≠]');

  // Step 3: Handle keywords
  processed = processed.replace(codeKwRe, (_, kw) => `#text(fill: accent, weight: "bold")[${kw}]`);

  // Step 4: Restore math regions — convert LaTeX to Typst math
  processed = processed.replace(/\x00MATH(\d+)\x00/g, (_, idx) => {
    let latex = mathRegions[parseInt(idx)];
    // Normalize \\\\ → \\ for block scalar double-backslash
    latex = latex.replace(/\\\\/g, '\\');
    const typstMath = latexToTypst(latex);
    return `$${typstMath}$`;
  });

  return processed;
}

function renderList(node) {
  const items = node.items.map(item => {
    const text = yamlTextToTypst(item);
    return `- ${text}`;
  });
  return items.join('\n') + '\n';
}

// ─── Build the full .typ file ───
const lines = [];

// Preamble
lines.push(preamble);

// Title block
lines.push(generateTitleBlock(metadata));

// Content nodes
for (const node of content) {
  lines.push(renderNode(node));
}

// Copyright at the end
if (metadata.copyright) {
  lines.push(`_${metadata.copyright}_\n`);
}

// Join and write
const output = lines.join('\n');
fs.writeFileSync(typPath, output, 'utf8');

const stats = fs.statSync(typPath);
console.log(`Generated: ${typPath}`);
console.log(`Size: ${stats.size} bytes`);
