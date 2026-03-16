#!/usr/bin/env node
/**
 * build_qna_html.js
 *
 * Converts a QnA markdown file into a self-contained HTML document
 * with embedded SVG diagrams and MathJax support.
 *
 * Supports multiple papers via per-paper SECTION_META mappings.
 * The appropriate mapping is selected based on the input filename.
 *
 * Usage:
 *   node build_qna_html.js <input.md> [output.html] [image_dir]
 *
 * Defaults (all relative to input.md location):
 *   output    = <input_dir>/<input_basename>.html
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
  : path.join(INPUT_DIR, `${inputBasename}.html`);

const IMAGE_DIR = process.argv[4]
  ? path.resolve(process.argv[4])
  : path.join(INPUT_DIR, 'images');

// ---------------------------------------------------------------------------
// Vendor files (read once, inlined into HTML)
// ---------------------------------------------------------------------------
const VENDOR_DIR = path.join(__dirname, 'vendor');

// Three.js
const THREEJS_SRC = tryRead(path.join(VENDOR_DIR, 'three.min.js'));
const ORBIT_SRC = tryRead(path.join(VENDOR_DIR, 'OrbitControls.js'));
const HAS_THREEJS = !!(THREEJS_SRC && ORBIT_SRC);
if (HAS_THREEJS) {
  console.log('[build_qna_html] Three.js vendor files loaded');
} else {
  console.log('[build_qna_html] Three.js vendor files not found — skipping 3D views');
}

// MathJax (tex-svg, offline self-contained)
const MATHJAX_SRC = tryRead(path.join(VENDOR_DIR, 'mathjax-tex-svg.js'));
if (MATHJAX_SRC) {
  console.log('[build_qna_html] MathJax vendor file loaded (' +
    (MATHJAX_SRC.length / 1024).toFixed(0) + ' KB)');
} else {
  console.log('[build_qna_html] MathJax vendor file not found — using CDN fallback');
}

// D3.js v7 (offline, self-contained)
const D3_SRC = tryRead(path.join(VENDOR_DIR, 'd3.min.js'));
const HAS_D3 = !!D3_SRC;
if (HAS_D3) {
  console.log('[build_qna_html] D3.js vendor file loaded (' +
    (D3_SRC.length / 1024).toFixed(0) + ' KB)');
} else {
  console.log('[build_qna_html] D3.js vendor file not found — skipping D3 tree views');
}

// ---------------------------------------------------------------------------
// QNA3D shared helper functions (inlined into HTML <head>)
// ---------------------------------------------------------------------------
const QNA3D_HELPERS = `
window.QNA3D = {
  /** Compute wing-tip positions from dihedral angle (degrees) and wing length.
   *  Shared edge: p1=(-2,0,0), p2=(2,0,0) along X axis.
   *  Returns {p3, p4} as THREE.Vector3. */
  computeWings: function(angleDeg, wingLen) {
    var rad = angleDeg * Math.PI / 180;
    var half = rad / 2;
    return {
      p3: new THREE.Vector3(0,  Math.sin(half) * wingLen, -Math.cos(half) * wingLen),
      p4: new THREE.Vector3(0, -Math.sin(half) * wingLen, -Math.cos(half) * wingLen)
    };
  },

  /** Create a sprite text label. Uses Malgun Gothic for Korean support. */
  makeLabel: function(scene, text, pos, color, scale) {
    var c = document.createElement('canvas');
    c.width = 256; c.height = 80;
    var ctx = c.getContext('2d');
    ctx.font = 'bold 36px "Malgun Gothic", Georgia, serif';
    ctx.fillStyle = color || '#2c3e50';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 40);
    var tex = new THREE.CanvasTexture(c);
    var mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
    var sprite = new THREE.Sprite(mat);
    sprite.position.copy(pos);
    sprite.position.y += 0.25;
    var s = scale || 1;
    sprite.scale.set(0.8 * s, 0.28 * s, 1);
    scene.add(sprite);
    return sprite;
  },

  /** Update a single vertex in a BufferGeometry by index. */
  updateVtx: function(geom, idx, vec) {
    var pos = geom.attributes.position;
    pos.setXYZ(idx, vec.x, vec.y, vec.z);
    pos.needsUpdate = true;
    geom.computeVertexNormals();
  },

  /** Compute face normal via cross product: (b-a) x (c-a), normalised. */
  faceNormal: function(a, b, c) {
    var ab = new THREE.Vector3().subVectors(b, a);
    var ac = new THREE.Vector3().subVectors(c, a);
    return new THREE.Vector3().crossVectors(ab, ac).normalize();
  },

  /** Centroid of three points. */
  centroid: function(a, b, c) {
    return new THREE.Vector3(
      (a.x + b.x + c.x) / 3,
      (a.y + b.y + c.y) / 3,
      (a.z + b.z + c.z) / 3
    );
  }
};
`;

// ---------------------------------------------------------------------------
// D3Tree shared helper — renders a tree with d3.hierarchy + d3.tree
// Inlined into HTML <head> alongside D3.js vendor script.
// Scene plugins call D3Tree.render(containerId, tipId, treeData, colors).
// ---------------------------------------------------------------------------
const D3TREE_HELPERS = `
window.D3Tree = {
  /** Measure approximate text width (px) for a given label. */
  _textWidth: function(label) {
    return label.length * 7.8 + 24;
  },

  /**
   * Render a tree into a container element.
   * @param {string} containerId - DOM id of the container div
   * @param {string} tipId       - DOM id of the tooltip div
   * @param {object} treeData    - hierarchical data {name, cat, children?}
   * @param {object} colors      - {cat: {bg, border, label}} colour map
   */
  render: function(containerId, tipId, treeData, colors) {
    var container = document.getElementById(containerId);
    var tip = document.getElementById(tipId);
    if (!container) return;

    var root = d3.hierarchy(treeData);
    var nodeH = 72;
    var self = this;

    var layout = d3.tree()
      .nodeSize([120, nodeH])
      .separation(function(a, b) {
        var wA = self._textWidth(a.data.name);
        var wB = self._textWidth(b.data.name);
        var base = a.parent === b.parent ? 1 : 1.2;
        return Math.max(base, (wA + wB) / 2 / 120 + 0.15);
      });
    layout(root);

    // Compute bounding box
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    root.each(function(d) {
      var hw = self._textWidth(d.data.name) / 2;
      if (d.x - hw < x0) x0 = d.x - hw;
      if (d.x + hw > x1) x1 = d.x + hw;
      if (d.y - 18 < y0) y0 = d.y - 18;
      if (d.y + 18 > y1) y1 = d.y + 18;
    });
    var pad = 20;
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    var vw = x1 - x0, vh = y1 - y0;

    var svg = d3.select(container).append('svg')
      .attr('viewBox', x0 + ' ' + y0 + ' ' + vw + ' ' + vh)
      .style('width', '100%')
      .style('height', 'auto')
      .style('min-height', '180px')
      .style('max-height', '420px')
      .style('cursor', 'grab');

    var g = svg.append('g');

    // Zoom behaviour
    var zoom = d3.zoom()
      .scaleExtent([0.3, 3])
      .on('zoom', function(event) {
        g.attr('transform', event.transform);
        svg.style('cursor', 'grabbing');
      })
      .on('end', function() { svg.style('cursor', 'grab'); });
    svg.call(zoom);

    // Links
    g.selectAll('.d3tree-link')
      .data(root.links())
      .join('path')
      .attr('class', 'd3tree-link')
      .attr('fill', 'none')
      .attr('stroke', '#aaa')
      .attr('stroke-width', 1.5)
      .attr('d', function(d) {
        return 'M' + d.source.x + ',' + d.source.y +
          'C' + d.source.x + ',' + (d.source.y + d.target.y) / 2 +
          ' ' + d.target.x + ',' + (d.source.y + d.target.y) / 2 +
          ' ' + d.target.x + ',' + d.target.y;
      });

    // Nodes
    var node = g.selectAll('.d3tree-node')
      .data(root.descendants())
      .join('g')
      .attr('class', 'd3tree-node')
      .attr('transform', function(d) { return 'translate(' + d.x + ',' + d.y + ')'; });

    node.append('rect')
      .attr('rx', 6).attr('ry', 6)
      .attr('x', function(d) { return -self._textWidth(d.data.name) / 2; })
      .attr('y', -14)
      .attr('width', function(d) { return self._textWidth(d.data.name); })
      .attr('height', 28)
      .attr('fill', function(d) { return (colors[d.data.cat] || {}).bg || '#fff'; })
      .attr('stroke', function(d) { return (colors[d.data.cat] || {}).border || '#999'; })
      .attr('stroke-width', 1.5)
      .style('cursor', 'pointer')
      .style('filter', 'drop-shadow(0 1px 2px rgba(0,0,0,0.08))')
      .on('mouseenter', function(event, d) {
        d3.select(this).attr('stroke-width', 3)
          .style('filter', 'drop-shadow(0 2px 6px rgba(0,0,0,0.2))');
        if (tip) {
          var catInfo = colors[d.data.cat];
          tip.textContent = d.data.name + (catInfo ? ' — ' + catInfo.label : '');
          tip.style.opacity = '1';
        }
      })
      .on('mouseleave', function() {
        d3.select(this).attr('stroke-width', 1.5)
          .style('filter', 'drop-shadow(0 1px 2px rgba(0,0,0,0.08))');
        if (tip) tip.style.opacity = '0';
      });

    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', '12px')
      .attr('font-family', "'Consolas','Courier New',monospace")
      .attr('fill', '#222')
      .attr('pointer-events', 'none')
      .text(function(d) { return d.data.name; });
  }
};
`;

// ---------------------------------------------------------------------------
// Section → image mapping — loaded from <input_basename>.meta.json
// ---------------------------------------------------------------------------
const metaJsonPath = path.join(INPUT_DIR, `${inputBasename}.meta.json`);
const SECTION_META = fs.existsSync(metaJsonPath)
  ? JSON.parse(fs.readFileSync(metaJsonPath, 'utf-8'))
  : {};

// ---------------------------------------------------------------------------
// Scene plugin loader — external scene files in <input_dir>/scenes/
// ---------------------------------------------------------------------------
const SCENE_DIR = path.join(INPUT_DIR, 'scenes');

/**
 * Dynamically load a scene plugin from SCENE_DIR/<sceneId>.js
 * Returns the module exports or null if not found.
 * Clears require cache to pick up edits during development.
 */
function loadScene(sceneId) {
  const scenePath = path.join(SCENE_DIR, `${sceneId}.js`);
  if (!fs.existsSync(scenePath)) return null;
  delete require.cache[require.resolve(scenePath)];
  return require(scenePath);
}

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

    // --- Fenced code block (or ```math block) ---
    if (line.trimStart().startsWith('```')) {
      const lang = line.trimStart().slice(3).trim().toLowerCase();
      i++;
      const codeLines = [];
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lang === 'math' ? lines[i] : escapeHtml(lines[i]));
        i++;
      }
      i++; // skip closing ```
      if (lang === 'math') {
        out.push(`<div class="math-block">${inlineMarkdown(codeLines.join('\n'))}</div>`);
      } else {
        out.push(`<div class="code-block"><pre>${codeLines.join('\n')}</pre></div>`);
      }
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

    // --- Extra-analysis admonition block ---
    if (line.trim() === '<!-- EXTRA_ANALYSIS_START -->') {
      i++;
      const innerLines = [];
      while (i < lines.length && lines[i].trim() !== '<!-- EXTRA_ANALYSIS_END -->') {
        innerLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing marker
      const innerMd = innerLines.join('\n');
      const innerHtml = convertAnswerBody(innerMd); // recursive
      out.push(
        `<div class="extra-analysis">` +
        `<div class="extra-analysis-header">\uD83D\uDD0D 논문 외 추가 분석</div>\n` +
        `<div class="extra-analysis-body">${innerHtml}</div>` +
        `</div>`
      );
      continue;
    }

    // --- Fenced code block (or ```math block) ---
    if (line.trimStart().startsWith('```')) {
      const lang = line.trimStart().slice(3).trim().toLowerCase();
      i++;
      const codeLines = [];
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lang === 'math' ? lines[i] : escapeHtml(lines[i]));
        i++;
      }
      i++; // skip closing ```
      if (lang === 'math') {
        out.push(`<div class="math-block">${inlineMarkdown(codeLines.join('\n'))}</div>`);
      } else {
        out.push(`<div class="code-block"><pre>${codeLines.join('\n')}</pre></div>`);
      }
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
 * Split a table row by '|' delimiters, but ignore '|' inside $...$ LaTeX spans.
 * Returns an array of trimmed, non-empty cell strings.
 */
function splitTableRow(line) {
  const cells = [];
  let current = '';
  let inMath = false;
  for (let k = 0; k < line.length; k++) {
    const ch = line[k];
    if (ch === '$') {
      inMath = !inMath;
      current += ch;
    } else if (ch === '\\' && k + 1 < line.length) {
      // Keep backslash-escaped chars together (e.g. \|)
      current += ch + line[k + 1];
      k++;
    } else if (ch === '|' && !inMath) {
      const trimmed = current.trim();
      if (trimmed !== '') cells.push(trimmed);
      current = '';
    } else {
      current += ch;
    }
  }
  const trimmed = current.trim();
  if (trimmed !== '') cells.push(trimmed);
  return cells;
}

/**
 * Parse a Markdown table (array of lines) into an HTML <table>.
 */
function parseTable(lines) {
  if (lines.length < 2) return '';

  const headerCells = splitTableRow(lines[0]);
  // lines[1] is the separator row — skip it
  const bodyRows = lines.slice(2).map(splitTableRow);

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
// SVG pan/zoom script generator
// ---------------------------------------------------------------------------

/**
 * Returns an inline <script> block that adds mouse-wheel zoom and drag-pan
 * to the SVG inside the wrapper element with id `wrapperId`.
 * No external libraries required.
 */
function buildSvgPanZoomScript(wrapperId) {
  return `<script>
(function() {
  var wrap = document.getElementById('${wrapperId}');
  if (!wrap) return;
  var svg = wrap.querySelector('svg');
  if (!svg) return;

  // Ensure SVG fills the wrapper but stays bounded
  svg.style.display = 'block';
  svg.style.maxWidth = '100%';
  svg.style.cursor = 'grab';

  // State
  var scale = 1, panX = 0, panY = 0;
  var dragging = false, startX = 0, startY = 0, startPanX = 0, startPanY = 0;

  function applyTransform() {
    svg.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + scale + ')';
    svg.style.transformOrigin = '0 0';
  }

  // Wheel zoom (centred on cursor position relative to wrapper)
  wrap.addEventListener('wheel', function(e) {
    e.preventDefault();
    var rect = wrap.getBoundingClientRect();
    var mx = e.clientX - rect.left - panX;
    var my = e.clientY - rect.top  - panY;
    var delta = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    var newScale = Math.min(Math.max(scale * delta, 0.3), 8);
    panX -= mx * (newScale - scale);
    panY -= my * (newScale - scale);
    scale = newScale;
    applyTransform();
  }, { passive: false });

  // Drag pan
  wrap.addEventListener('mousedown', function(e) {
    if (e.button !== 0) return;
    dragging = true;
    startX = e.clientX; startY = e.clientY;
    startPanX = panX; startPanY = panY;
    svg.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', function(e) {
    if (!dragging) return;
    panX = startPanX + (e.clientX - startX);
    panY = startPanY + (e.clientY - startY);
    applyTransform();
  });
  window.addEventListener('mouseup', function() {
    if (dragging) { dragging = false; svg.style.cursor = 'grab'; }
  });

  // Double-click to reset
  wrap.addEventListener('dblclick', function() {
    scale = 1; panX = 0; panY = 0;
    applyTransform();
  });
})();
</script>`;
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
      const pzId = `svg-pz-${sectionNum}`;
      parts.push(
        `<div class="diagram">\n` +
        `<div class="svg-pz-wrap" id="${pzId}">\n${cleanSvg}\n</div>\n` +
        `<figcaption>그림 ${sectionNum}: ${meta.svgCaption}</figcaption>\n</div>\n` +
        buildSvgPanZoomScript(pzId)
      );
    }
  }

  // SVG diagram (secondary, if present)
  if (meta.svg2) {
    const svgPath2 = path.join(IMAGE_DIR, meta.svg2);
    const svgContent2 = tryRead(svgPath2);
    if (svgContent2) {
      const cleanSvg2 = svgContent2.replace(/<\?xml[^?]*\?>\s*/, '');
      const pzId2 = `svg-pz-${sectionNum}b`;
      parts.push(
        `<div class="diagram">\n` +
        `<div class="svg-pz-wrap" id="${pzId2}">\n${cleanSvg2}\n</div>\n` +
        `<figcaption>그림 ${sectionNum}b: ${meta.svgCaption2}</figcaption>\n</div>\n` +
        buildSvgPanZoomScript(pzId2)
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
// Three.js scene code generators
// ---------------------------------------------------------------------------

/**
 * Build the Three.js interactive 3D canvas HTML for a given section.
 * Now includes a dihedral angle slider control.
 * Returns empty string if section has no threejs field or vendor not loaded.
 */
function buildThreejsHtml(sectionNum) {
  if (!HAS_THREEJS) return '';
  const meta = SECTION_META[sectionNum];
  if (!meta || !meta.threejs) return '';

  const sceneId = meta.threejs;
  const scene = loadScene(sceneId);
  if (!scene || scene.type !== 'threejs') {
    console.warn(`[build_qna_html] Three.js scene '${sceneId}' not found in ${SCENE_DIR}`);
    return '';
  }

  const N = sectionNum;
  const ids = {
    canvas: `threejs-canvas-${N}`,
    container: `threejs-container-${N}`,
    slider: `angle-slider-${N}`,
    val: `angle-val-${N}`,
    toggle: `toggle-${N}`,
    state: `state-label-${N}`,
    acos: `acos-val-${N}`
  };

  const helpers = { buildInteractiveScene };
  const innerHtml = scene.html(ids);
  const sceneCode = scene.build(ids, helpers);
  if (!sceneCode) return '';

  const captionText = meta.svgCaption2 || meta.svgCaption || '';

  return `<div class="threejs-wrapper" id="${ids.container}">
${innerHtml}
  <figcaption>\uc778\ud130\ub799\ud2f0\ube0c 3D \ubdf0 \u2014 ${captionText}</figcaption>
</div>
<script>
(function() {
${sceneCode}
})();
</script>`;
}

/**
 * Unified interactive scene builder. All three scenes (Q4, Q5, Q8) share
 * the same winged-triangle-pair geometry with a dihedral angle slider.
 *
 * opts.faceLabels  — show 삼각형1/2 labels (Q4)
 * opts.normals     — show n1/n2 arrows, dihedral arc, φ label (Q5)
 * opts.gradients   — show ∂φ/∂pᵢ gradient arrows + labels (Q8)
 * opts.faceOpacity — face transparency (0.85 / 0.7 / 0.55)
 */
function buildInteractiveScene(canvasId, sliderId, valId, opts) {
  const showFaceLabels = opts.faceLabels ? 'true' : 'false';
  const showNormals    = opts.normals    ? 'true' : 'false';
  const showGradients  = opts.gradients  ? 'true' : 'false';
  const faceOpacity    = opts.faceOpacity || 0.85;

  return `
  var Q = window.QNA3D;
  var canvas = document.getElementById('${canvasId}');
  var width = canvas.parentElement.clientWidth - 40;
  var height = Math.min(400, width * 0.7);
  canvas.width = width;
  canvas.height = height;

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0xfafbfc);

  var camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
  camera.position.set(3, 2.5, 4);
  camera.lookAt(0, 0, 0);

  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  var controls = new THREE.OrbitControls(camera, canvas);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.7;

  // --- Fixed points ---
  var p1 = new THREE.Vector3(-2, 0, 0);
  var p2 = new THREE.Vector3(2, 0, 0);
  var wingLen = 1.8;

  // Initial wing positions (130°)
  var w = Q.computeWings(130, wingLen);
  var p3 = w.p3.clone();
  var p4 = w.p4.clone();

  // --- Upper face (p1, p2, p3) ---
  var upperGeom = new THREE.BufferGeometry();
  upperGeom.setAttribute('position', new THREE.Float32BufferAttribute([
    p1.x, p1.y, p1.z,  p2.x, p2.y, p2.z,  p3.x, p3.y, p3.z
  ], 3));
  upperGeom.computeVertexNormals();
  var upperMat = new THREE.MeshPhongMaterial({
    color: 0xa0cce4, side: THREE.DoubleSide,
    transparent: true, opacity: ${faceOpacity}, shininess: 30
  });
  var upperMesh = new THREE.Mesh(upperGeom, upperMat);
  scene.add(upperMesh);

  // --- Lower face (p1, p4, p2) ---
  var lowerGeom = new THREE.BufferGeometry();
  lowerGeom.setAttribute('position', new THREE.Float32BufferAttribute([
    p1.x, p1.y, p1.z,  p4.x, p4.y, p4.z,  p2.x, p2.y, p2.z
  ], 3));
  lowerGeom.computeVertexNormals();
  var lowerMat = new THREE.MeshPhongMaterial({
    color: 0xd4b8a0, side: THREE.DoubleSide,
    transparent: true, opacity: ${faceOpacity}, shininess: 30
  });
  var lowerMesh = new THREE.Mesh(lowerGeom, lowerMat);
  scene.add(lowerMesh);

  // --- Wireframe edges ---
  var upperWireGeom = new THREE.BufferGeometry().setFromPoints([p1, p2, p3.clone(), p1.clone()]);
  var upperWire = new THREE.Line(upperWireGeom, new THREE.LineBasicMaterial({ color: 0x6090b0, linewidth: 1 }));
  scene.add(upperWire);

  var lowerWireGeom = new THREE.BufferGeometry().setFromPoints([p1, p2, p4.clone(), p1.clone()]);
  var lowerWire = new THREE.Line(lowerWireGeom, new THREE.LineBasicMaterial({ color: 0xa08060, linewidth: 1 }));
  scene.add(lowerWire);

  var sharedEdge = new THREE.BufferGeometry().setFromPoints([p1, p2]);
  scene.add(new THREE.Line(sharedEdge, new THREE.LineBasicMaterial({ color: 0x2c3e50, linewidth: 2 })));

  // --- Vertex spheres ---
  var sphereGeom = new THREE.SphereGeometry(0.08, 16, 16);
  var sphereMat = new THREE.MeshPhongMaterial({ color: 0x2c3e50 });
  var sphere3 = new THREE.Mesh(sphereGeom, sphereMat);
  sphere3.position.copy(p3);
  scene.add(sphere3);
  var sphere4 = new THREE.Mesh(sphereGeom, sphereMat);
  sphere4.position.copy(p4);
  scene.add(sphere4);
  [p1, p2].forEach(function(p) {
    var s = new THREE.Mesh(sphereGeom, sphereMat);
    s.position.copy(p);
    scene.add(s);
  });

  // --- Vertex labels ---
  var lbl_p1 = Q.makeLabel(scene, 'p\\u2081', p1);
  var lbl_p2 = Q.makeLabel(scene, 'p\\u2082', p2);
  var lbl_p3 = Q.makeLabel(scene, 'p\\u2083', p3);
  var lbl_p4 = Q.makeLabel(scene, 'p\\u2084', p4);

  // --- Face labels (Q4 only) ---
  var lbl_face1 = null, lbl_face2 = null;
  if (${showFaceLabels}) {
    var uc = Q.centroid(p1, p2, p3);
    var lc = Q.centroid(p1, p4, p2);
    lbl_face1 = Q.makeLabel(scene, '\\uc0bc\\uac01\\ud6151', uc, '#3a6d8c');
    lbl_face2 = Q.makeLabel(scene, '\\uc0bc\\uac01\\ud6152', lc, '#9c6b42');
  }

  // --- Normal arrows + dihedral arc (Q5 only) ---
  var arrowN1 = null, arrowN2 = null, lbl_n1 = null, lbl_n2 = null;
  var arcLine = null, lbl_phi = null;
  if (${showNormals}) {
    var n1 = Q.faceNormal(p1, p2, p3);
    var n2 = Q.faceNormal(p1, p4, p2);
    var uc5 = Q.centroid(p1, p2, p3);
    var lc5 = Q.centroid(p1, p4, p2);
    var aLen = 1.4;

    arrowN1 = new THREE.ArrowHelper(n1, uc5, aLen, 0x2a6496, 0.2, 0.12);
    scene.add(arrowN1);
    arrowN2 = new THREE.ArrowHelper(n2, lc5, aLen, 0xb07030, 0.2, 0.12);
    scene.add(arrowN2);

    var n1Tip = new THREE.Vector3().copy(uc5).addScaledVector(n1, aLen + 0.2);
    var n2Tip = new THREE.Vector3().copy(lc5).addScaledVector(n2, aLen + 0.2);
    lbl_n1 = Q.makeLabel(scene, 'n\\u2081', n1Tip, '#2a6496');
    lbl_n2 = Q.makeLabel(scene, 'n\\u2082', n2Tip, '#b07030');

    // Dihedral arc
    var edgeMid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    var arcR = 0.8;
    var arcPts = [];
    for (var ai = 0; ai <= 32; ai++) {
      var at = ai / 32;
      var ad = new THREE.Vector3().lerpVectors(n1, n2, at).normalize().multiplyScalar(arcR);
      arcPts.push(new THREE.Vector3().copy(edgeMid).add(ad));
    }
    var arcGeom = new THREE.BufferGeometry().setFromPoints(arcPts);
    arcLine = new THREE.Line(arcGeom, new THREE.LineBasicMaterial({ color: 0xc0392b, linewidth: 2 }));
    scene.add(arcLine);

    var arcMidDir = new THREE.Vector3().lerpVectors(n1, n2, 0.5).normalize().multiplyScalar(arcR + 0.25);
    var phiPos = new THREE.Vector3().copy(edgeMid).add(arcMidDir);
    lbl_phi = Q.makeLabel(scene, '\\u03c6', phiPos, '#c0392b');
  }

  // --- Gradient arrows (Q8 only) ---
  var arrowG3 = null, arrowG4 = null, arrowG1 = null, arrowG2 = null;
  var lbl_g3 = null, lbl_g4 = null, lbl_g1 = null, lbl_g2 = null;
  if (${showGradients}) {
    var gn1 = Q.faceNormal(p1, p2, p3);
    var gn2 = Q.faceNormal(p1, p4, p2);
    var gColor = 0xc0392b;
    var gLen = 1.2;
    var cLen = 0.7;

    arrowG3 = new THREE.ArrowHelper(gn1, p3, gLen, gColor, 0.22, 0.14);
    scene.add(arrowG3);
    arrowG4 = new THREE.ArrowHelper(gn2, p4, gLen, gColor, 0.22, 0.14);
    scene.add(arrowG4);

    // Compensating arrows for p1, p2
    var edgeD = new THREE.Vector3().subVectors(p2, p1).normalize();
    var avgN = new THREE.Vector3().addVectors(gn1, gn2).normalize();
    var compD = new THREE.Vector3().crossVectors(edgeD, avgN).normalize();
    if (compD.y < 0) compD.negate();

    arrowG1 = new THREE.ArrowHelper(compD.clone(), p1, cLen, gColor, 0.16, 0.10);
    scene.add(arrowG1);
    arrowG2 = new THREE.ArrowHelper(compD.clone(), p2, cLen, gColor, 0.16, 0.10);
    scene.add(arrowG2);

    // Gradient labels
    var gt3 = new THREE.Vector3().copy(p3).addScaledVector(gn1, gLen + 0.15);
    var gt4 = new THREE.Vector3().copy(p4).addScaledVector(gn2, gLen + 0.15);
    var gt1 = new THREE.Vector3().copy(p1).addScaledVector(compD, cLen + 0.15);
    var gt2 = new THREE.Vector3().copy(p2).addScaledVector(compD, cLen + 0.15);
    lbl_g3 = Q.makeLabel(scene, '\\u2202\\u03c6/\\u2202p\\u2083', gt3, '#c0392b', 1.1);
    lbl_g4 = Q.makeLabel(scene, '\\u2202\\u03c6/\\u2202p\\u2084', gt4, '#c0392b', 1.1);
    lbl_g1 = Q.makeLabel(scene, '\\u2202\\u03c6/\\u2202p\\u2081', gt1, '#c0392b', 0.9);
    lbl_g2 = Q.makeLabel(scene, '\\u2202\\u03c6/\\u2202p\\u2082', gt2, '#c0392b', 0.9);
  }

  // --- Lighting ---
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  var dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
  dirLight.position.set(3, 5, 4);
  scene.add(dirLight);
  var dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
  dirLight2.position.set(-3, 2, -2);
  scene.add(dirLight2);

  // --- Grid ---
  var grid = new THREE.GridHelper(6, 12, 0xdddddd, 0xeeeeee);
  grid.position.y = -Math.sin(130 * Math.PI / 360) * wingLen - 0.1;
  scene.add(grid);

  // =====================================================================
  // updateAngle — called on slider input
  // =====================================================================
  function updateAngle(deg) {
    var ww = Q.computeWings(deg, wingLen);
    p3.copy(ww.p3);
    p4.copy(ww.p4);

    // Update face geometries (upper: index 2 = p3, lower: index 1 = p4)
    Q.updateVtx(upperGeom, 2, p3);
    Q.updateVtx(lowerGeom, 1, p4);

    // Update wireframes
    var uWpos = upperWireGeom.attributes.position;
    uWpos.setXYZ(2, p3.x, p3.y, p3.z);
    uWpos.needsUpdate = true;
    var lWpos = lowerWireGeom.attributes.position;
    lWpos.setXYZ(2, p4.x, p4.y, p4.z);
    lWpos.needsUpdate = true;

    // Update spheres
    sphere3.position.copy(p3);
    sphere4.position.copy(p4);

    // Update vertex labels (p3, p4)
    lbl_p3.position.copy(p3);
    lbl_p3.position.y += 0.25;
    lbl_p4.position.copy(p4);
    lbl_p4.position.y += 0.25;

    // Update grid Y
    grid.position.y = -Math.sin(deg * Math.PI / 360) * wingLen - 0.1;

    // --- Face labels (Q4) ---
    if (${showFaceLabels} && lbl_face1 && lbl_face2) {
      var uc = Q.centroid(p1, p2, p3);
      var lc = Q.centroid(p1, p4, p2);
      lbl_face1.position.copy(uc);
      lbl_face1.position.y += 0.25;
      lbl_face2.position.copy(lc);
      lbl_face2.position.y += 0.25;
    }

    // --- Normals + arc (Q5) ---
    if (${showNormals} && arrowN1 && arrowN2) {
      var n1 = Q.faceNormal(p1, p2, p3);
      var n2 = Q.faceNormal(p1, p4, p2);
      var uc5 = Q.centroid(p1, p2, p3);
      var lc5 = Q.centroid(p1, p4, p2);
      var aLen = 1.4;

      arrowN1.position.copy(uc5);
      arrowN1.setDirection(n1);
      arrowN2.position.copy(lc5);
      arrowN2.setDirection(n2);

      var n1Tip = new THREE.Vector3().copy(uc5).addScaledVector(n1, aLen + 0.2);
      var n2Tip = new THREE.Vector3().copy(lc5).addScaledVector(n2, aLen + 0.2);
      lbl_n1.position.copy(n1Tip);
      lbl_n2.position.copy(n2Tip);

      // Rebuild arc
      var edgeMid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
      var arcR = 0.8;
      var arcPos = arcLine.geometry.attributes.position;
      for (var ai = 0; ai <= 32; ai++) {
        var at = ai / 32;
        var ad = new THREE.Vector3().lerpVectors(n1, n2, at).normalize().multiplyScalar(arcR);
        var pt = new THREE.Vector3().copy(edgeMid).add(ad);
        arcPos.setXYZ(ai, pt.x, pt.y, pt.z);
      }
      arcPos.needsUpdate = true;

      var arcMidDir = new THREE.Vector3().lerpVectors(n1, n2, 0.5).normalize().multiplyScalar(arcR + 0.25);
      lbl_phi.position.copy(edgeMid).add(arcMidDir);
    }

    // --- Gradients (Q8) ---
    if (${showGradients} && arrowG3 && arrowG4) {
      var gn1 = Q.faceNormal(p1, p2, p3);
      var gn2 = Q.faceNormal(p1, p4, p2);
      var gLen = 1.2;
      var cLen = 0.7;

      arrowG3.position.copy(p3);
      arrowG3.setDirection(gn1);
      arrowG4.position.copy(p4);
      arrowG4.setDirection(gn2);

      var edgeD = new THREE.Vector3().subVectors(p2, p1).normalize();
      var avgN = new THREE.Vector3().addVectors(gn1, gn2).normalize();
      var compD = new THREE.Vector3().crossVectors(edgeD, avgN).normalize();
      if (compD.y < 0) compD.negate();

      arrowG1.setDirection(compD);
      arrowG2.setDirection(compD);

      // Update gradient labels
      lbl_g3.position.copy(p3);
      lbl_g3.position.addScaledVector(gn1, gLen + 0.15);
      lbl_g3.position.y += 0.25;
      lbl_g4.position.copy(p4);
      lbl_g4.position.addScaledVector(gn2, gLen + 0.15);
      lbl_g4.position.y += 0.25;
      lbl_g1.position.copy(p1);
      lbl_g1.position.addScaledVector(compD, cLen + 0.15);
      lbl_g1.position.y += 0.25;
      lbl_g2.position.copy(p2);
      lbl_g2.position.addScaledVector(compD, cLen + 0.15);
      lbl_g2.position.y += 0.25;
    }
  }

  // --- Slider event ---
  var slider = document.getElementById('${sliderId}');
  var valSpan = document.getElementById('${valId}');
  slider.addEventListener('input', function() {
    var deg = parseInt(this.value, 10);
    valSpan.textContent = deg + '\\u00b0';
    updateAngle(deg);
  });

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
`;
}

// ---------------------------------------------------------------------------
// Canvas2D interactive view builder
// ---------------------------------------------------------------------------

/**
 * Build a Canvas2D interactive visualization for a given section.
 * Dynamically loads scene plugin from <input_dir>/scenes/<scene_id>.js.
 * Returns empty string if section has no canvas2d field or scene not found.
 */
function buildCanvas2dHtml(sectionNum) {
  const meta = SECTION_META[sectionNum];
  if (!meta || !meta.canvas2d) return '';

  const sceneId = meta.canvas2d;
  const scene = loadScene(sceneId);
  if (!scene || scene.type !== 'canvas2d') {
    console.warn(`[build_qna_html] Canvas2D scene '${sceneId}' not found in ${SCENE_DIR}`);
    return '';
  }

  const N = sectionNum;
  const ids = {
    canvas: `canvas2d-${N}`,
    slider: `canvas2d-slider-${N}`,
    val: `canvas2d-val-${N}`,
    info: `canvas2d-info-${N}`,
    prev: `stepper-prev-${N}`,
    next: `stepper-next-${N}`
  };

  const helpers = { buildInteractiveScene };
  const innerHtml = scene.html(ids);
  const sceneCode = scene.build(ids, helpers);
  if (!sceneCode) return '';

  const captionText = meta.svgCaption2 || meta.svgCaption || '';

  return `<div class="canvas2d-wrapper">
${innerHtml}
  <figcaption>\uc778\ud130\ub799\ud2f0\ube0c 2D \ubdf0 \u2014 ${captionText}</figcaption>
</div>
<script>
(function() {
${sceneCode}
})();
</script>`;
}

// ---------------------------------------------------------------------------
// D3 Tree interactive view builder
// ---------------------------------------------------------------------------

/**
 * Build a D3.js interactive tree visualization for a given section.
 * Dynamically loads scene plugin from <input_dir>/scenes/<scene_id>.js.
 * Returns empty string if section has no d3tree field or scene not found.
 */
function buildD3TreeHtml(sectionNum) {
  const meta = SECTION_META[sectionNum];
  if (!meta || !meta.d3tree) return '';
  if (!HAS_D3) {
    console.warn(`[build_qna_html] D3.js vendor not loaded — skipping d3tree for section ${sectionNum}`);
    return '';
  }

  const sceneId = meta.d3tree;
  const scene = loadScene(sceneId);
  if (!scene || scene.type !== 'd3tree') {
    console.warn(`[build_qna_html] D3Tree scene '${sceneId}' not found in ${SCENE_DIR}`);
    return '';
  }

  const N = sectionNum;
  const ids = {
    wrapper: `d3tree-${N}`,
    panel0:  `d3tree-${N}-0`,
    panel1:  `d3tree-${N}-1`,
    tip0:    `d3tree-tip-${N}-0`,
    tip1:    `d3tree-tip-${N}-1`,
    legend:  `d3tree-legend-${N}`
  };

  const innerHtml = scene.html(ids);
  const sceneCode = scene.build(ids);
  if (!sceneCode) return '';

  const captionText = meta.svgCaption || '';

  return `<div class="d3tree-outer-wrapper">
${innerHtml}
  <figcaption>D3.js 인터랙티브 트리 — ${captionText}</figcaption>
</div>
<script>
(function() {
${sceneCode}
})();
</script>`;
}

// ---------------------------------------------------------------------------
// HTML template
// ---------------------------------------------------------------------------
function buildHtml(title, subtitle, tocHtml, sectionsHtml) {
  // Optionally inline Three.js + OrbitControls
  const threejsScripts = HAS_THREEJS
    ? `<script>\n// Three.js r137 (inlined)\n${THREEJS_SRC}\n</script>\n` +
      `<script>\n// OrbitControls r137 (inlined)\n${ORBIT_SRC}\n</script>\n` +
      `<script>\n// QNA3D shared helpers\n${QNA3D_HELPERS}\n</script>`
    : '';

  // Optionally inline D3.js + D3Tree helpers
  const d3Scripts = HAS_D3
    ? `<script>\n// D3.js v7 (inlined)\n${D3_SRC}\n</script>\n` +
      `<script>\n// D3Tree shared helpers\n${D3TREE_HELPERS}\n</script>`
    : '';

  // MathJax: prefer inlined vendor file, fallback to CDN
  const mathjaxConfig = `<script>
  window.MathJax = {
    tex: { inlineMath: [['\\\\(','\\\\)']], displayMath: [['\\\\[','\\\\]']] },
    options: { skipHtmlTags: ['code','pre'] },
    svg: { fontCache: 'local' },
    startup: { typeset: true }
  };
</script>`;
  const mathjaxScript = MATHJAX_SRC
    ? `${mathjaxConfig}\n<script>\n// MathJax 3 tex-svg (inlined, offline)\n${MATHJAX_SRC}\n</script>`
    : `${mathjaxConfig}\n<script async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js"></script>`;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
${mathjaxScript}
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

/* ---- Math block (MathJax-rendered, no <pre>) ---- */
.math-block {
  background: #f9f7f1; border: 1px solid #e0dcc8;
  border-radius: 6px; padding: 1em 1.2em; overflow-x: auto;
  margin: 1em 0; line-height: 1.8;
}
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

/* ---- SVG pan/zoom wrapper ---- */
.svg-pz-wrap {
  overflow: hidden; position: relative;
  cursor: grab; border-radius: 4px;
  user-select: none; -webkit-user-select: none;
}
.svg-pz-wrap:active { cursor: grabbing; }
.svg-pz-wrap svg { display: block; max-width: 100%; transition: none; }
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

/* ---- Three.js interactive canvas ---- */
.threejs-wrapper {
  text-align: center; margin: 1.5em 0; background: white;
  border: 1px solid #e0e0e0; border-radius: 8px; padding: 1em;
}
.threejs-canvas {
  display: block; margin: 0 auto; border-radius: 6px;
  cursor: grab; max-width: 100%;
}
.threejs-canvas:active { cursor: grabbing; }
.threejs-label {
  font-size: 0.85em; color: #888; margin-bottom: 0.5em;
}
.threejs-controls {
  display: flex; align-items: center; justify-content: center;
  gap: 0.7em; margin: 0.6em 0 0.2em;
  font-size: 0.95em; color: #444;
}
.threejs-controls label { font-weight: bold; white-space: nowrap; }
.threejs-controls input[type="range"] {
  width: 220px; accent-color: #2c5aa0; cursor: pointer;
}
.angle-display {
  display: inline-block; min-width: 3.5em; text-align: center;
  font-weight: bold; color: #c0392b; font-size: 1.05em;
  font-variant-numeric: tabular-nums;
}
.threejs-hint {
  font-size: 0.78em; color: #aaa; margin-top: 0.15em;
  text-align: center;
}
.reflection-btn {
  background: #2c5aa0; color: white; border: none;
  border-radius: 6px; padding: 0.45em 1.2em; cursor: pointer;
  font-size: 0.95em; font-weight: bold;
  transition: background 0.2s;
}
.reflection-btn:hover { background: #1a3a6e; }
.reflection-btn:active { background: #c0392b; }
.state-label {
  font-weight: bold; font-size: 0.95em;
  padding: 0.3em 0.8em; border-radius: 4px;
}
.state-original { color: #2c5aa0; background: #e8f4fd; }
.state-reflected { color: #c0392b; background: #fde8e8; }

/* ---- Canvas2D interactive view ---- */
.canvas2d-wrapper {
  text-align: center; margin: 1.5em 0; background: white;
  border: 1px solid #e0e0e0; border-radius: 8px; padding: 1em;
}
.canvas2d-canvas {
  display: block; margin: 0 auto; border-radius: 6px;
  border: 1px solid #eee; max-width: 100%;
}
.canvas2d-label {
  font-size: 0.85em; color: #888; margin-bottom: 0.5em;
}
.canvas2d-controls {
  display: flex; align-items: center; justify-content: center;
  gap: 0.7em; margin: 0.6em 0 0.8em;
  font-size: 0.95em; color: #444;
}
.canvas2d-controls label { font-weight: bold; white-space: nowrap; }
.canvas2d-controls input[type="range"] {
  width: 260px; accent-color: #e67e22; cursor: pointer;
}
.canvas2d-angle {
  display: inline-block; min-width: 3.5em; text-align: center;
  font-weight: bold; color: #e67e22; font-size: 1.05em;
  font-variant-numeric: tabular-nums;
}
.canvas2d-info {
  text-align: left; margin: 0.8em auto; max-width: 400px;
  font-size: 0.92em; line-height: 1.6;
}
.canvas2d-info-grid {
  display: grid; grid-template-columns: auto auto;
  gap: 0.2em 1em; margin-bottom: 0.5em;
}
.canvas2d-info-grid .info-label { color: #666; text-align: right; }
.canvas2d-info-grid .info-value { color: #333; font-family: 'Consolas', monospace; }
.canvas2d-legend {
  text-align: center; font-size: 0.85em; color: #666;
  margin-top: 0.4em; padding-top: 0.4em;
  border-top: 1px solid #eee;
}

/* ---- Extra-analysis admonition ---- */
.extra-analysis {
  margin: 1.5em 0;
  border: 2px solid #e8a838;
  border-radius: 8px;
  background: #fffbf0;
  overflow: hidden;
}
.extra-analysis-header {
  background: #f5e6c8;
  color: #7a5d1e;
  font-weight: bold;
  font-size: 1.0em;
  padding: 0.55em 1em;
  border-bottom: 1px solid #e8a838;
}
.extra-analysis-body {
  padding: 0.8em 1.2em;
}
.extra-analysis-body p { margin: 0.5em 0; }
.extra-analysis-body table { font-size: 0.93em; }

/* ---- Stepper buttons (prev / next) ---- */
.stepper-controls {
  display: flex; align-items: center; justify-content: center;
  gap: 1em; margin: 0.6em 0 0.8em;
}
.stepper-btn {
  background: #2c5aa0; color: white; border: none;
  border-radius: 6px; padding: 0.45em 1.4em; cursor: pointer;
  font-size: 1em; font-weight: bold; transition: background 0.2s;
}
.stepper-btn:hover:not(:disabled) { background: #1a3a6e; }
.stepper-btn:disabled { background: #aaa; cursor: not-allowed; }
.stepper-label {
  display: inline-block; min-width: 9em; text-align: center;
  font-weight: bold; color: #2c5aa0; font-size: 1.05em;
}

/* ---- D3 Tree interactive view ---- */
.d3tree-outer-wrapper {
  text-align: center; margin: 1.5em 0; background: white;
  border: 1px solid #e0e0e0; border-radius: 8px; padding: 1em;
}
.d3tree-wrapper { width: 100%; }
.d3tree-pair {
  display: flex; gap: 12px; flex-wrap: wrap;
  justify-content: center;
}
.d3tree-panel {
  flex: 1 1 380px; min-width: 300px; max-width: 100%;
}
.d3tree-container {
  border: 1px solid #e0e0e0; border-radius: 6px;
  background: #fafafa; overflow: hidden;
}
.d3tree-tip {
  font-size: 0.82em; color: #555; min-height: 1.4em;
  text-align: center; margin-top: 4px;
  opacity: 0; transition: opacity 0.2s;
}
.d3tree-legend {
  text-align: center; margin-top: 10px; padding: 6px 0;
  border-top: 1px solid #eee;
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
${threejsScripts}
${d3Scripts}
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
      const threejsHtml = buildThreejsHtml(s.num);
      const canvas2dHtml = buildCanvas2dHtml(s.num);
      const d3treeHtml = buildD3TreeHtml(s.num);
      const bodyHtml = markdownToHtml(s.body);

      // Insert diagram HTML right after the answer heading if present.
      // Three.js canvas goes right after the diagram(s).
      // Canvas2D goes after Three.js.
      // D3 Tree goes after Canvas2D.
      let combined;
      const answerHeadingTag = '<h3>답변</h3>';
      const answerIdx = bodyHtml.indexOf(answerHeadingTag);
      const mediaHtml = [diagramHtml, threejsHtml, canvas2dHtml, d3treeHtml].filter(Boolean).join('\n');
      if (answerIdx >= 0 && mediaHtml) {
        const insertPos = answerIdx + answerHeadingTag.length;
        combined =
          bodyHtml.slice(0, insertPos) +
          '\n' +
          mediaHtml +
          '\n' +
          bodyHtml.slice(insertPos);
      } else {
        combined = bodyHtml + (mediaHtml ? '\n' + mediaHtml : '');
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
