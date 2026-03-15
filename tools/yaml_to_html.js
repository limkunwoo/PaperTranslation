// yaml_to_html.js — Convert YAML to self-contained HTML with MathJax v3
// Usage: node yaml_to_html.js <input.yaml> <output.html>
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { yamlTextToHtml } = require('./math_convert');

// ─── Paths (from CLI args or defaults) ───
const yamlPath = process.argv[2] ? path.resolve(process.argv[2]) : null;
const htmlPath = process.argv[3] ? path.resolve(process.argv[3]) : null;
if (!yamlPath || !htmlPath) {
  console.error('Usage: node yaml_to_html.js <input.yaml> <output.html>');
  process.exit(1);
}
const baseDir = path.dirname(yamlPath);

// ─── Read & parse YAML ───
const yamlText = fs.readFileSync(yamlPath, 'utf-8');
const doc = yaml.load(yamlText);
const { metadata, content } = doc;

// ─── Helper: process paragraph text ───
function processText(text) {
  // Replace blank lines (\n\n) with <br><br>
  let result = text.replace(/\n\n/g, '<br><br>');
  // Replace remaining single newlines with space (within a paragraph)
  result = result.replace(/\n/g, ' ');
  // Process inline markup via yamlTextToHtml
  result = yamlTextToHtml(result);
  return result;
}

// ─── Helper: embed image ───
function embedImage(source, format, width) {
  let resolvedPath;
  if (format === 'vector') {
    // Vector images have no extension in YAML — append .svg
    resolvedPath = path.join(baseDir, source + '.svg');
  } else {
    resolvedPath = path.join(baseDir, source);
  }

  if (!fs.existsSync(resolvedPath)) {
    console.warn(`WARNING: Image not found: ${resolvedPath}`);
    return `<p style="color:red;">[Image not found: ${source}]</p>`;
  }

  if (format === 'vector') {
    // Inline SVG
    const svgContent = fs.readFileSync(resolvedPath, 'utf-8');
    return `<div style="max-width:${width}; margin:0 auto;">${svgContent}</div>`;
  } else {
    // Raster — base64 embed
    const imgBuffer = fs.readFileSync(resolvedPath);
    const b64 = imgBuffer.toString('base64');
    return `<img src="data:image/png;base64,${b64}" style="max-width:${width}; width:100%; height:auto; display:block; margin:0 auto;" />`;
  }
}

// ─── Helper: detect and strip Typst #text(size: ...) wrapper ───
function stripTypstTextWrapper(text) {
  const m = text.match(/^#text\(size:\s*([\d.]+(?:pt|em|px))\)\[(.+)\]$/s);
  if (m) {
    return { fontSize: m[1], innerText: m[2] };
  }
  return null;
}

// ─── Helper: pseudocode syntax highlighting (with $...$ math support) ───
function highlightPseudocode(text) {
  // All keywords, multi-word first to ensure longest match
  const keywords = [
    'end algorithm', 'end foreach', 'end if', 'end for', 'end loop',
    'for all',
    'algorithm', 'foreach', 'endfor', 'endloop', 'endwhile',
    'loop', 'initialize', 'if', 'then', 'else', 'do',
    'return', 'while', 'times', 'in', 'for'
  ];
  const kwPattern = keywords.map(k => k.replace(/ /g, '\\s+')).join('|');
  const kwRe = new RegExp('(?<![a-zA-Z])(' + kwPattern + ')(?![a-zA-Z])', 'g');

  return text.split('\n').map(line => {
    // Step 0: Extract $...$ math regions → placeholders
    const mathRegions = [];
    let esc = line.replace(/\$([^$]+)\$/g, (_, math) => {
      mathRegions.push(math);
      return '\x00MATH' + (mathRegions.length - 1) + '\x00';
    });

    // Step 1: Escape HTML entities (outside math)
    esc = esc
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Step 2: Wrap line numbers — patterns: (N) at start, or NN: at start
    esc = esc.replace(/^(\s*)(\(\d+\))(\s)/, '$1<span class="ln">$2</span>$3');
    esc = esc.replace(/^(\s*)(\d{2}:)(\s)/, '$1<span class="ln">$2</span>$3');

    // Step 3: Wrap operators (← ≠)
    esc = esc.replace(/←/g, '<span class="op">←</span>');
    esc = esc.replace(/≠/g, '<span class="op">≠</span>');

    // Step 4: Wrap keywords — single regex, longest match first
    esc = esc.replace(kwRe, '<span class="kw">$1</span>');

    // Step 5: Restore math regions as MathJax inline math \(...\)
    esc = esc.replace(/\x00MATH(\d+)\x00/g, (_, idx) => {
      const latex = mathRegions[parseInt(idx)];
      return `\\(${latex}\\)`;
    });

    return esc;
  }).join('\n');
}

// ─── Build HTML content nodes ───
const bodyParts = [];

for (const node of content) {
  switch (node.type) {
    case 'heading': {
      const tag = node.level === 2 ? 'h2' : 'h3';
      bodyParts.push(`<${tag}>${yamlTextToHtml(node.text)}</${tag}>`);
      break;
    }

    case 'paragraph': {
      const noIndent = node.indent === false;
      const indentClass = noIndent ? ' class="no-indent"' : '';

      // Check for Typst #text(size:...) wrapper
      const wrapper = stripTypstTextWrapper(node.text);
      if (wrapper) {
        const processed = processText(wrapper.innerText);
        bodyParts.push(`<p${indentClass} style="font-size:${wrapper.fontSize};">${processed}</p>`);
      } else {
        const processed = processText(node.text);
        bodyParts.push(`<p${indentClass}>${processed}</p>`);
      }
      break;
    }

    case 'equation': {
      // Fix malformed matrix LaTeX from YAML (Typst artifact: "delim: \text{(} &" inside \begin{pmatrix})
      let latex = node.latex.replace(/\\begin\{pmatrix\}delim:\s*\\text\{[^}]*\}\s*&\s*/g, '\\begin{pmatrix}');
      const number = node.number;
      const suffix = node.suffix;

      let html = '<div class="equation">';
      html += `<div class="equation-content">$$${latex}$$</div>`;
      if (suffix) {
        html += `<div class="equation-suffix">${suffix}</div>`;
      }
      if (number != null) {
        html += `<div class="equation-number">(${number})</div>`;
      }
      html += '</div>';
      bodyParts.push(html);
      break;
    }

    case 'figure': {
      const imgHtml = embedImage(node.source, node.format, node.width);
      const captionHtml = node.caption ? processText(node.caption) : '';
      bodyParts.push(`<figure><div class="figure-image">${imgHtml}</div>${captionHtml ? `<figcaption>${captionHtml}</figcaption>` : ''}</figure>`);
      break;
    }

    case 'figure_grid': {
      const cols = node.columns || 2;
      let html = `<figure class="figure-grid"><div class="figure-grid-items" style="grid-template-columns: repeat(${cols}, 1fr);">`;
      for (const item of node.items) {
        const imgHtml = embedImage(item.source, item.format || 'raster', '100%');
        const labelHtml = item.label ? `<div class="figure-grid-label">${yamlTextToHtml(item.label)}</div>` : '';
        html += `<div class="figure-grid-item">${imgHtml}${labelHtml}</div>`;
      }
      html += '</div>';
      if (node.caption) {
        html += `<figcaption>${processText(node.caption)}</figcaption>`;
      }
      html += '</figure>';
      bodyParts.push(html);
      break;
    }

    case 'table': {
      let html = '<div class="table-container">';
      if (node.title) {
        html += `<div class="table-title">${yamlTextToHtml(node.title)}</div>`;
      }
      html += '<table>';
      if (node.headers) {
        html += '<thead><tr>';
        for (const h of node.headers) {
          html += `<th>${yamlTextToHtml(h)}</th>`;
        }
        html += '</tr></thead>';
      }
      html += '<tbody>';
      for (const row of node.rows) {
        html += '<tr>';
        for (const cell of row) {
          html += `<td>${yamlTextToHtml(cell)}</td>`;
        }
        html += '</tr>';
      }
      html += '</tbody></table>';
      if (node.caption) {
        html += `<div class="table-caption">${processText(node.caption)}</div>`;
      }
      html += '</div>';
      bodyParts.push(html);
      break;
    }

    case 'code': {
      const codeText = node.content || node.text || '';
      const title = node.title || '';
      const highlighted = highlightPseudocode(codeText);
      let html = '<div class="code-block">';
      if (title) {
        html += `<div class="code-title">${title}</div>`;
      }
      html += `<div class="code-body">${highlighted}</div>`;
      html += '</div>';
      bodyParts.push(html);
      break;
    }

    case 'list': {
      const items = node.items.map(item => `<li>${yamlTextToHtml(item)}</li>`).join('\n');
      bodyParts.push(`<ul>${items}</ul>`);
      break;
    }

    case 'separator': {
      bodyParts.push('<hr>');
      break;
    }

    default: {
      console.warn(`Unknown node type: ${node.type}`);
    }
  }
}

// ─── Build title block ───
const titleBlock = `
<div class="title-block">
  <div class="title">${metadata.title}</div>
  <div class="authors">${Array.isArray(metadata.authors) ? metadata.authors.join(', ') : metadata.authors}</div>
  <div class="affiliation">${metadata.affiliation}</div>
  <div class="venue">${metadata.venue}</div>
  <div class="editors">${metadata.editors}</div>
</div>`;

// ─── Build copyright footer ───
const copyrightBlock = metadata.copyright ? `<div class="copyright">${metadata.copyright}</div>` : '';

// ─── Full HTML ───
const fullHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${metadata.title}</title>
<script>
MathJax = {
  tex: {
    inlineMath: [['\\\\(', '\\\\)']],
    displayMath: [['$$', '$$']],
  },
  options: {
    skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']
  }
};
</script>
<script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"></script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: #fefcf9;
    color: #1e1e1e;
    font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;
    font-size: 16px;
    line-height: 2.0;
    padding: 2em 1em;
  }

  .content {
    max-width: 800px;
    margin: 0 auto;
    background: #fefdfb;
    padding: 2em 2.5em;
  }

  /* Title block */
  .title-block { text-align: center; margin-bottom: 2em; }
  .title-block .title {
    font-size: 22pt;
    font-weight: bold;
    color: #1a5276;
    margin-bottom: 0.4em;
  }
  .title-block .authors {
    font-size: 11pt;
    font-weight: bold;
    margin-bottom: 0.2em;
  }
  .title-block .affiliation {
    font-size: 10pt;
    color: #5b7d9a;
    margin-bottom: 0.3em;
  }
  .title-block .venue,
  .title-block .editors {
    font-size: 9pt;
    font-style: italic;
    color: gray;
  }

  /* Headings */
  h2 {
    font-size: 1.6em;
    font-weight: bold;
    color: #1a5276;
    border-bottom: 1px solid #b0c4d8;
    padding-bottom: 8px;
    margin-top: 2em;
    margin-bottom: 0.6em;
  }
  h3 {
    font-size: 1.25em;
    font-weight: bold;
    color: #2980b9;
    margin-top: 1.5em;
    margin-bottom: 0.5em;
  }

  /* Paragraphs */
  p {
    text-align: justify;
    text-indent: 1em;
    margin-bottom: 18px;
  }
  p.no-indent {
    text-indent: 0;
  }

  /* Strong */
  strong { color: #1a5276; }

  /* Equations */
  .equation {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 1em;
    margin: 1em 0;
  }
  .equation-content {
    text-align: center;
  }
  .equation-suffix {
    white-space: nowrap;
  }
  .equation-number {
    min-width: 3em;
    text-align: right;
    white-space: nowrap;
  }

  /* Figures */
  figure {
    text-align: center;
    margin: 1.5em 0;
  }
  .figure-image {
    display: flex;
    justify-content: center;
  }
  .figure-image svg {
    max-width: 100%;
    height: auto;
  }
  figcaption {
    font-size: 0.9em;
    color: #4a6a7d;
    margin-top: 8px;
    text-align: center;
  }

  /* Figure grids */
  .figure-grid {
    text-align: center;
    margin: 1.5em 0;
  }
  .figure-grid-items {
    display: grid;
    gap: 12px;
    justify-items: center;
    align-items: end;
  }
  .figure-grid-item img {
    max-width: 100%;
    height: auto;
    display: block;
  }
  .figure-grid-label {
    font-size: 0.85em;
    color: #4a6a7d;
    margin-top: 4px;
    text-align: center;
  }

  /* Tables */
  .table-container {
    margin: 1.5em 0;
    text-align: center;
  }
  .table-title {
    font-weight: bold;
    color: #1a5276;
    margin-bottom: 8px;
    font-size: 1em;
  }
  table {
    margin: 0 auto;
    border-collapse: collapse;
    font-size: 0.92em;
  }
  th, td {
    border: 1px solid #b0c4d8;
    padding: 6px 14px;
    text-align: center;
  }
  th {
    background: #eaf2f8;
    color: #1a5276;
    font-weight: bold;
  }
  td {
    background: #fefdfb;
  }
  .table-caption {
    font-size: 0.9em;
    color: #4a6a7d;
    margin-top: 8px;
    text-align: center;
  }

  /* Code blocks */
  .code-block {
    margin: 1em 0;
    border: 1px solid #d4dde6;
    border-radius: 4px;
    overflow-x: auto;
    background: #f4f7fa;
  }
  .code-title {
    background: #eaf2f8;
    border-bottom: 1px solid #d4dde6;
    padding: 8px 20px;
    font-size: 0.95em;
    font-weight: 600;
    color: #1a5276;
  }
  .code-body {
    padding: 16px 20px;
    font-family: Consolas, 'Courier New', monospace;
    font-size: 0.9em;
    line-height: 1.6;
    white-space: pre;
  }
  .code-body .kw { color: #1a5276; font-weight: 600; }
  .code-body .ln { color: #999; }
  .code-body .op { color: #d63384; }

  /* Lists */
  ul {
    margin-left: 1.2em;
    margin-bottom: 18px;
  }
  li {
    margin-bottom: 0.4em;
  }

  /* Separator */
  hr {
    border: none;
    border-top: 1px solid #b0c4d8;
    margin: 2em 0;
  }

  /* Copyright */
  .copyright {
    text-align: center;
    font-size: small;
    font-style: italic;
    color: gray;
    margin-top: 3em;
    padding-top: 1em;
    border-top: 1px solid #b0c4d8;
  }
</style>
</head>
<body>
<div class="content">
${titleBlock}
${bodyParts.join('\n')}
${copyrightBlock}
</div>
</body>
</html>`;

fs.writeFileSync(htmlPath, fullHtml, 'utf-8');

const stats = fs.statSync(htmlPath);
console.log(`Generated: ${htmlPath}`);
console.log(`File size: ${(stats.size / 1024).toFixed(1)} KB`);
