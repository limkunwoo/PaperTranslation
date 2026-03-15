#!/usr/bin/env node
/**
 * build_qna_html.js
 *
 * Converts the QnA markdown (논문_QnA.md) into a self-contained HTML document
 * with embedded SVG diagrams and MathJax support.
 *
 * Usage:
 *   node build_qna_html.js <input.md> [output.html] [image_dir]
 *
 * Defaults (all relative to input.md location):
 *   output    = <input_dir>/output/<input_basename>_QnA.html
 *   image_dir = <input_dir>/images/
 *
 * Example:
 *   node D:/MyProjects/PaperTranslation/tools/build_qna_html.js \
 *        D:/MyProjects/ClothSimulation/qna/논문_QnA.md
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Path resolution — everything relative to input file location
// ---------------------------------------------------------------------------
const inputPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : (() => { console.error('Usage: node build_qna_html.js <input.md> [output.html] [image_dir]'); process.exit(1); })();

const INPUT_DIR = path.dirname(inputPath);
const inputBasename = path.basename(inputPath, path.extname(inputPath));

const outputPath = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.join(INPUT_DIR, 'output', `${inputBasename}.html`);

const IMAGE_DIR = process.argv[4]
  ? path.resolve(process.argv[4])
  : path.join(INPUT_DIR, 'images');

// ---------------------------------------------------------------------------
// Section → image mapping
// ---------------------------------------------------------------------------
const SECTION_META = {
  1: {
    svg: 'constraints_comparison.svg',
    png: null,
    svgCaption: '등식 제약 vs 부등식 제약 비교',
    title: '등식/부등식 제약',
  },
  2: {
    svg: 'stick_model_grid.svg',
    png: null,
    svgCaption: '스틱 모델 격자 — 구조·전단·굽힘 스틱 연결',
    title: '스틱 모델',
  },
  3: {
    svg: 'two_skip_spring.svg',
    png: null,
    svgCaption: '두 칸 건너 스프링에 의한 굽힘 저항 원리',
    title: '질량-스프링 모델과 두 칸 건너 스프링',
  },
  4: {
    svg: 'winged_triangle_pair.svg',
    svg2: 'cloth_buckling.svg',
    png: null,
    svgCaption: '날개형 삼각형 쌍 (Winged Triangle Pair)',
    svgCaption2: '천 좌굴 (Cloth Buckling) — 압축에 의한 주름 형성',
    title: '삼각형 메시 확장과 날개형 삼각형 쌍',
  },
  5: {
    svg: 'dihedral_angle.svg',
    png: null,
    svgCaption: '이면각 (Dihedral Angle) 정의',
    title: '이면각',
  },
  6: {
    svg: 'virtual_tetrahedron.svg',
    png: null,
    svgCaption: '가상 사면체를 이용한 굽힘 제약 모델',
    title: '[VMT06]과 [THMG04]의 굽힘 모델',
  },
  7: {
    svg: null,
    png: null,
    svgCaption: null,
    title: '모드 분석',
  },
  8: {
    svg: 'gradient_arrows.svg',
    png: null,
    svgCaption: '편미분 ∂φ/∂pᵢ — 각 정점의 그래디언트 방향',
    title: '편미분 ∂φ/∂pᵢ',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Try to read a file; return its content or null. */
function tryRead(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/** Try to read a file as base64; return the string or null. */
function tryReadBase64(filePath) {
  try {
    return fs.readFileSync(filePath).toString('base64');
  } catch {
    return null;
  }
}

/** Escape HTML special characters (but preserve already-safe content). */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// Markdown → HTML converter (minimal, tailored to the QnA format)
// ---------------------------------------------------------------------------

/**
 * Convert a block of Markdown text (within a section) to HTML.
 * Handles code blocks, tables, bold, inline code, math, paragraphs, and HR.
 */
function markdownToHtml(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // --- Fenced code block ---
    if (line.trimStart().startsWith('```')) {
      i++;
      const codeLines = [];
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(escapeHtml(lines[i]));
        i++;
      }
      i++; // skip closing ```
      out.push(`<div class="code-block"><pre>${codeLines.join('\n')}</pre></div>`);
      continue;
    }

    // --- Horizontal rule ---
    if (/^---+\s*$/.test(line.trim())) {
      out.push('<hr>');
      i++;
      continue;
    }

    // --- Table ---
    if (line.includes('|') && i + 1 < lines.length && /\|[\s-]+\|/.test(lines[i + 1])) {
      const tableLines = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        tableLines.push(lines[i]);
        i++;
      }
      out.push(parseTable(tableLines));
      continue;
    }

    // --- ### Headings (질문 / 답변) ---
    const h3Match = line.match(/^###\s+(.*)/);
    if (h3Match) {
      const heading = h3Match[1].trim();
      if (heading === '질문') {
        // Collect everything under ### 질문 until next ### or end
        i++;
        const questionLines = [];
        while (i < lines.length && !lines[i].startsWith('### ')) {
          questionLines.push(lines[i]);
          i++;
        }
        const body = inlineMarkdown(questionLines.join('\n').trim());
        out.push(`<h3>질문</h3>\n<div class="question">${wrapParagraphs(body)}</div>`);
      } else if (heading === '답변') {
        out.push('<h3>답변</h3>\n<div class="answer">');
        i++;
        // The caller will close this div at the section boundary.
        // We'll mark it with a sentinel that we close later.
        // Actually, let's just collect the rest and render it.
        const answerLines = [];
        while (i < lines.length) {
          answerLines.push(lines[i]);
          i++;
        }
        out.push(convertAnswerBody(answerLines.join('\n')));
        out.push('</div>');
      } else {
        out.push(`<h3>${inlineMarkdown(heading)}</h3>`);
        i++;
      }
      continue;
    }

    // --- Blank line → skip ---
    if (line.trim() === '') {
      i++;
      continue;
    }

    // --- Default: paragraph (collect consecutive non-blank, non-special lines) ---
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trimStart().startsWith('```') &&
      !lines[i].startsWith('### ') &&
      !/^---+\s*$/.test(lines[i].trim()) &&
      !(lines[i].includes('|') && i + 1 < lines.length && /\|[\s-]+\|/.test(lines[i + 1]))
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      out.push(`<p>${inlineMarkdown(paraLines.join('\n'))}</p>`);
    }
  }

  return out.join('\n');
}

/**
 * Convert the body of an answer (everything after ### 답변).
 * This is its own sub-parser so we can handle code blocks, tables, bold
 * sub-headings (**...**), etc.
 */
function convertAnswerBody(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // --- Fenced code block ---
    if (line.trimStart().startsWith('```')) {
      i++;
      const codeLines = [];
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(escapeHtml(lines[i]));
        i++;
      }
      i++; // skip closing ```
      out.push(`<div class="code-block"><pre>${codeLines.join('\n')}</pre></div>`);
      continue;
    }

    // --- Horizontal rule ---
    if (/^---+\s*$/.test(line.trim())) {
      out.push('<hr>');
      i++;
      continue;
    }

    // --- Table ---
    if (line.includes('|') && i + 1 < lines.length && /\|[\s-]+\|/.test(lines[i + 1])) {
      const tableLines = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        tableLines.push(lines[i]);
        i++;
      }
      out.push(parseTable(tableLines));
      continue;
    }

    // --- Blank line → skip ---
    if (line.trim() === '') {
      i++;
      continue;
    }

    // --- Default: paragraph ---
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trimStart().startsWith('```') &&
      !/^---+\s*$/.test(lines[i].trim()) &&
      !(lines[i].includes('|') && i + 1 < lines.length && /\|[\s-]+\|/.test(lines[i + 1]))
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      out.push(`<p>${inlineMarkdown(paraLines.join('\n'))}</p>`);
    }
  }

  return out.join('\n');
}

/**
 * Convert inline Markdown: bold, inline code, math delimiters.
 */
function inlineMarkdown(text) {
  // Display math first: $$...$$ → \[...\]
  text = text.replace(/\$\$(.+?)\$\$/gs, (_, m) => `\\[${m}\\]`);
  // Inline math: $...$ → \(...\)  (but not inside code spans)
  // We'll do code spans first to protect them, then math.

  // Protect code spans: `...` → placeholder
  const codeSpans = [];
  text = text.replace(/`([^`]+?)`/g, (_, code) => {
    codeSpans.push(`<code>${escapeHtml(code)}</code>`);
    return `%%CODE_SPAN_${codeSpans.length - 1}%%`;
  });

  // Inline math: $...$ → \(...\)
  text = text.replace(/\$(.+?)\$/g, (_, m) => `\\(${m}\\)`);

  // Bold: **...** → <strong>
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Restore code spans
  text = text.replace(/%%CODE_SPAN_(\d+)%%/g, (_, idx) => codeSpans[Number(idx)]);

  // Convert newlines inside paragraphs to <br> only for lines that aren't
  // purely whitespace (soft wraps).
  text = text.replace(/\n/g, '<br>\n');

  return text;
}

/**
 * Wrap a chunk of inline-converted text into <p> tags, splitting on double <br>.
 */
function wrapParagraphs(html) {
  // Split on double line breaks
  const parts = html.split(/<br>\s*<br>/g).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return html;
  return parts.map((p) => `<p>${p}</p>`).join('\n');
}

/**
 * Parse a Markdown table (array of lines) into an HTML <table>.
 */
function parseTable(lines) {
  if (lines.length < 2) return '';

  const parseRow = (line) =>
    line
      .split('|')
      .map((c) => c.trim())
      .filter((c) => c !== '');

  const headerCells = parseRow(lines[0]);
  // lines[1] is the separator row — skip it
  const bodyRows = lines.slice(2).map(parseRow);

  let html = '<table>\n<thead><tr>';
  for (const cell of headerCells) {
    html += `<th>${inlineMarkdown(cell)}</th>`;
  }
  html += '</tr></thead>\n<tbody>\n';
  for (const row of bodyRows) {
    html += '<tr>';
    for (const cell of row) {
      html += `<td>${inlineMarkdown(cell)}</td>`;
    }
    html += '</tr>\n';
  }
  html += '</tbody></table>';
  return html;
}

// ---------------------------------------------------------------------------
// Section parsing
// ---------------------------------------------------------------------------

/**
 * Split the Markdown file into sections. Returns an array of
 * { num, heading, body } objects.
 */
function parseSections(md) {
  const sections = [];
  // Match ## N. heading
  const sectionRegex = /^## (\d+)\.\s+(.*)$/gm;
  let match;
  const starts = [];

  while ((match = sectionRegex.exec(md)) !== null) {
    starts.push({
      num: parseInt(match[1], 10),
      heading: match[2].trim(),
      index: match.index,
      matchLen: match[0].length,
    });
  }

  for (let i = 0; i < starts.length; i++) {
    const bodyStart = starts[i].index + starts[i].matchLen;
    const bodyEnd = i + 1 < starts.length ? starts[i + 1].index : md.length;
    sections.push({
      num: starts[i].num,
      heading: starts[i].heading,
      body: md.slice(bodyStart, bodyEnd).trim(),
    });
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Extract the document title and intro (before first ## section)
// ---------------------------------------------------------------------------
function parseIntro(md) {
  const firstSection = md.indexOf('\n## ');
  const intro = firstSection >= 0 ? md.slice(0, firstSection).trim() : '';
  // Title: first # heading
  const titleMatch = intro.match(/^# (.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : '논문 Q&A';
  // Subtitle: text after title (skip ----)
  const afterTitle = intro
    .replace(/^# .+$/m, '')
    .replace(/^---+$/gm, '')
    .trim();
  return { title, subtitle: afterTitle };
}

// ---------------------------------------------------------------------------
// Build embedded images HTML for a section
// ---------------------------------------------------------------------------
function buildDiagramHtml(sectionNum) {
  const meta = SECTION_META[sectionNum];
  if (!meta) return '';

  const parts = [];

  // SVG diagram (primary)
  if (meta.svg) {
    const svgPath = path.join(IMAGE_DIR, meta.svg);
    const svgContent = tryRead(svgPath);
    if (svgContent) {
      const cleanSvg = svgContent.replace(/<\?xml[^?]*\?>\s*/, '');
      parts.push(
        `<div class="diagram">\n${cleanSvg}\n` +
          `<figcaption>그림 ${sectionNum}: ${meta.svgCaption}</figcaption>\n</div>`
      );
    }
  }

  // SVG diagram (secondary, if present)
  if (meta.svg2) {
    const svgPath2 = path.join(IMAGE_DIR, meta.svg2);
    const svgContent2 = tryRead(svgPath2);
    if (svgContent2) {
      const cleanSvg2 = svgContent2.replace(/<\?xml[^?]*\?>\s*/, '');
      parts.push(
        `<div class="diagram">\n${cleanSvg2}\n` +
          `<figcaption>그림 ${sectionNum}b: ${meta.svgCaption2}</figcaption>\n</div>`
      );
    }
  }

  // PNG illustration (optional — skip silently if missing)
  if (meta.png) {
    const pngPath = path.join(IMAGE_DIR, meta.png);
    const b64 = tryReadBase64(pngPath);
    if (b64) {
      parts.push(
        `<div class="illustration">\n` +
          `<img src="data:image/png;base64,${b64}" alt="${meta.title}">\n` +
          `</div>`
      );
    }
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// HTML template
// ---------------------------------------------------------------------------
function buildHtml(title, subtitle, tocHtml, sectionsHtml) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<script>
  window.MathJax = {
    tex: { inlineMath: [['\\\\(','\\\\)']], displayMath: [['\\\\[','\\\\]']] },
    options: { skipHtmlTags: ['code','pre'] }
  };
</script>
<script async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"></script>
<style>
/* ---- Base ---- */
* { box-sizing: border-box; }
body {
  font-family: 'Malgun Gothic', 'Segoe UI', sans-serif;
  max-width: 900px; margin: 0 auto; padding: 2em;
  background: #fafafa; color: #222; line-height: 1.7;
}
h1 {
  text-align: center; border-bottom: 3px solid #2c5aa0;
  padding-bottom: 0.5em; color: #1a3a6e;
}
.subtitle {
  text-align: center; color: #555; font-size: 1.05em;
  margin-top: -0.5em; margin-bottom: 2em;
}
h2 {
  color: #2c5aa0; border-left: 4px solid #2c5aa0;
  padding-left: 0.5em; margin-top: 2em;
}
h3 { color: #555; }

/* ---- Question / Answer ---- */
.question {
  background: #e8f4fd; border-radius: 8px;
  padding: 1em 1.5em; margin: 1em 0;
  border-left: 4px solid #5ba3d9;
}
.answer { margin: 1em 0; }

/* ---- Code ---- */
.code-block {
  background: #f5f5f5; border: 1px solid #ddd;
  border-radius: 6px; padding: 1em; overflow-x: auto;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 0.9em; margin: 1em 0; white-space: pre;
}
.code-block pre { margin: 0; white-space: pre; }
code {
  background: #f0f0f0; padding: 0.15em 0.4em; border-radius: 3px;
  font-family: 'Consolas', 'Courier New', monospace; font-size: 0.9em;
}

/* ---- Tables ---- */
table { border-collapse: collapse; width: 100%; margin: 1em 0; }
th, td { border: 1px solid #ccc; padding: 0.5em 1em; text-align: left; }
th { background: #f0f0f0; font-weight: bold; }
tr:nth-child(even) { background: #fafafa; }

/* ---- Diagrams / Illustrations ---- */
.diagram {
  text-align: center; margin: 1.5em 0; background: white;
  border: 1px solid #e0e0e0; border-radius: 8px; padding: 1em;
}
.diagram svg { max-width: 100%; height: auto; }
figcaption {
  font-size: 0.9em; color: #666;
  margin-top: 0.5em; font-style: italic;
}
.illustration { text-align: center; margin: 1.5em 0; }
.illustration img {
  max-width: 80%; border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

/* ---- Table of Contents ---- */
.toc {
  background: #fff; border: 1px solid #ddd;
  border-radius: 8px; padding: 1.5em; margin: 2em 0;
}
.toc h2 {
  margin-top: 0; border-left: none; padding-left: 0;
  text-align: center; font-size: 1.2em;
}
.toc ol { padding-left: 1.5em; }
.toc li { margin: 0.4em 0; }
.toc a { color: #2c5aa0; text-decoration: none; }
.toc a:hover { text-decoration: underline; }

/* ---- Misc ---- */
hr { border: none; border-top: 1px solid #ddd; margin: 2em 0; }
p { margin: 0.6em 0; }
strong { color: #1a3a6e; }
.footer {
  text-align: center; color: #999; font-size: 0.85em;
  margin-top: 3em; padding-top: 1em; border-top: 1px solid #eee;
}

/* ---- Responsive ---- */
@media (max-width: 640px) {
  body { padding: 1em; }
  .diagram { padding: 0.5em; }
  .illustration img { max-width: 100%; }
  table { font-size: 0.85em; }
  th, td { padding: 0.3em 0.5em; }
}
</style>
</head>
<body>

<h1>${escapeHtml(title)}</h1>
${subtitle ? `<p class="subtitle">${inlineMarkdown(subtitle)}</p>` : ''}

${tocHtml}

${sectionsHtml}

<div class="footer">
  이 문서는 <code>build_qna_html.js</code>에 의해 자동 생성되었습니다.
</div>

</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  // Read input
  const md = fs.readFileSync(inputPath, 'utf-8');
  console.log(`[build_qna_html] Reading: ${inputPath}`);

  // Parse
  const { title, subtitle } = parseIntro(md);
  const sections = parseSections(md);
  console.log(`[build_qna_html] Found ${sections.length} sections`);

  // Build Table of Contents
  const tocItems = sections
    .map(
      (s) =>
        `<li><a href="#section-${s.num}">${s.num}. ${escapeHtml(s.heading)}</a></li>`
    )
    .join('\n');
  const tocHtml = `<div class="toc">\n<h2>목차</h2>\n<ol>\n${tocItems}\n</ol>\n</div>`;

  // Build section HTML
  const sectionsHtml = sections
    .map((s) => {
      const diagramHtml = buildDiagramHtml(s.num);
      const bodyHtml = markdownToHtml(s.body);

      // Insert diagram HTML right after the answer heading if present.
      // We look for the closing of the <h3>답변</h3> tag and insert after it.
      let combined;
      const answerHeadingTag = '<h3>답변</h3>';
      const answerIdx = bodyHtml.indexOf(answerHeadingTag);
      if (answerIdx >= 0 && diagramHtml) {
        const insertPos = answerIdx + answerHeadingTag.length;
        combined =
          bodyHtml.slice(0, insertPos) +
          '\n' +
          diagramHtml +
          '\n' +
          bodyHtml.slice(insertPos);
      } else {
        combined = bodyHtml + (diagramHtml ? '\n' + diagramHtml : '');
      }

      return (
        `<section id="section-${s.num}">\n` +
        `<h2>${s.num}. ${escapeHtml(s.heading)}</h2>\n` +
        combined +
        '\n</section>'
      );
    })
    .join('\n\n');

  // Assemble
  const html = buildHtml(title, subtitle, tocHtml, sectionsHtml);

  // Ensure output directory exists
  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, html, 'utf-8');
  console.log(`[build_qna_html] Written: ${outputPath}`);
  console.log(`[build_qna_html] Size: ${(Buffer.byteLength(html, 'utf-8') / 1024).toFixed(1)} KB`);
}

main();
