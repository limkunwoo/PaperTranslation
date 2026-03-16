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
// Section → image mapping — loaded from <input_basename>.meta.json
// ---------------------------------------------------------------------------
const metaJsonPath = path.join(INPUT_DIR, `${inputBasename}.meta.json`);
const SECTION_META = fs.existsSync(metaJsonPath)
  ? JSON.parse(fs.readFileSync(metaJsonPath, 'utf-8'))
  : {};

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

  const canvasId = `threejs-canvas-${sectionNum}`;
  const containerId = `threejs-container-${sectionNum}`;
  const sliderId = `angle-slider-${sectionNum}`;
  const valId = `angle-val-${sectionNum}`;

  const toggleId = `reflection-toggle-${sectionNum}`;
  const acosId = `acos-val-${sectionNum}`;
  const stateId = `state-label-${sectionNum}`;

  let sceneCode = '';
  if (meta.threejs === 'winged_triangle_pair') {
    sceneCode = buildQ4Scene(canvasId, sliderId, valId);
  } else if (meta.threejs === 'dihedral_angle') {
    sceneCode = buildQ5Scene(canvasId, sliderId, valId);
  } else if (meta.threejs === 'gradient_arrows') {
    sceneCode = buildQ8Scene(canvasId, sliderId, valId);
  } else if (meta.threejs === 'arccos_reflection') {
    sceneCode = buildQ11Scene(canvasId, sliderId, valId, toggleId, acosId, stateId);
  } else if (meta.threejs === 'constraint_generation') {
    sceneCode = buildQ16Scene(canvasId, toggleId, stateId);
  }
  if (!sceneCode) return '';

  const isQ11 = meta.threejs === 'arccos_reflection';
  const isQ16 = meta.threejs === 'constraint_generation';

  // --- Q16 uses a completely different layout (toggle button, no slider) ---
  if (isQ16) {
    return `<div class="threejs-wrapper" id="${containerId}">
  <div class="threejs-label">\ub9c8\uc6b0\uc2a4 \ub4dc\ub798\uadf8: 3D \ud68c\uc804 | \ubc84\ud2bc: \ubc29\ubc95 \uc804\ud658</div>
  <div class="threejs-controls">
    <button id="${toggleId}" class="reflection-btn">\u21c5 \ubc29\ubc95 \uc804\ud658</button>
    <span class="state-label state-original" id="${stateId}">\ubaa8\uc11c\ub9ac \uae30\ubc18 (Edge-based)</span>
  </div>
  <canvas id="${canvasId}" class="threejs-canvas"></canvas>
  <div class="threejs-hint">\ud1a0\uae00 \ubc84\ud2bc\uc73c\ub85c \ubaa8\uc11c\ub9ac \uae30\ubc18 / \uaf2d\uc9d3\uc810 \uae30\ubc18 \ube44\uad50</div>
  <figcaption>\uc778\ud130\ub799\ud2f0\ube0c 3D \ubdf0 \u2014 \uc81c\uc57d \uc870\uac74 \uc0dd\uc131 \ubc29\ubc95 \ube44\uad50</figcaption>
</div>
<script>
(function() {
${sceneCode}
})();
</script>`;
  }

  // Q11 gets additional reflection toggle button + arccos display
  const extraControls = isQ11
    ? `\n  <div class="threejs-controls">
    <button id="${toggleId}" class="reflection-btn">\u21c5 \ubc18\uc0ac \uc804\ud658 (Reflection)</button>
    <span class="state-label" id="${stateId}">\uc6d0\ub798 \uc811\ud798</span>
  </div>
  <div class="threejs-controls">
    <label>arccos \uac12:</label>
    <span class="angle-display" id="${acosId}">130\u00b0</span>
    <span style="font-size:0.85em; color:#888;"> \u2190 \ub450 \uc0c1\ud0dc \ubaa8\ub450 \ub3d9\uc77c</span>
  </div>`
    : '';

  const captionText = isQ11 ? meta.svgCaption2 : meta.svgCaption;

  return `<div class="threejs-wrapper" id="${containerId}">
  <div class="threejs-label">\ub9c8\uc6b0\uc2a4 \ub4dc\ub798\uadf8: 3D \ud68c\uc804 | \uc2ac\ub77c\uc774\ub354: \uc774\uba74\uac01 \uc870\uc808</div>
  <div class="threejs-controls">
    <label>\uc774\uba74\uac01 \u03c6</label>
    <input type="range" id="${sliderId}" min="10" max="180" value="130" step="1">
    <span class="angle-display" id="${valId}">130\u00b0</span>
  </div>${extraControls}
  <canvas id="${canvasId}" class="threejs-canvas"></canvas>
  <div class="threejs-hint">10\u00b0 (\uc811\ud798) \u2194 180\u00b0 (\ud3c9\uba74)</div>
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

/** Q4 wrapper: winged triangle pair — face labels, high opacity */
function buildQ4Scene(canvasId, sliderId, valId) {
  return buildInteractiveScene(canvasId, sliderId, valId, {
    faceLabels: true, normals: false, gradients: false,
    faceOpacity: 0.85,
  });
}

/** Q5 wrapper: dihedral angle — normals + arc, medium opacity */
function buildQ5Scene(canvasId, sliderId, valId) {
  return buildInteractiveScene(canvasId, sliderId, valId, {
    faceLabels: false, normals: true, gradients: false,
    faceOpacity: 0.7,
  });
}

/** Q8 wrapper: gradient arrows — gradient arrows, low opacity */
function buildQ8Scene(canvasId, sliderId, valId) {
  return buildInteractiveScene(canvasId, sliderId, valId, {
    faceLabels: false, normals: false, gradients: true,
    faceOpacity: 0.55,
  });
}

/**
 * Q11 scene: arccos reflection — demonstrates that arccos gives the same
 * value for the original fold and its reflection (mirrored fold).
 *
 * This is a standalone scene (not using buildInteractiveScene) because it
 * needs a reflection toggle button unique to Q11.
 *
 * Features:
 *  - Two triangle faces with normals, dihedral arc, φ label
 *  - Slider controls fold angle (10°–180°)
 *  - "반사 전환" button flips p3↔p4 to show mirrored configuration
 *  - arccos display always shows same value regardless of reflection state
 *  - Face color changes to red tones when reflected, blue tones when original
 */
function buildQ11Scene(canvasId, sliderId, valId, toggleId, acosId, stateId) {
  return `
  var Q = window.QNA3D;
  var canvas = document.getElementById('${canvasId}');
  var width = canvas.parentElement.clientWidth - 40;
  var height = Math.min(420, width * 0.75);
  canvas.width = width;
  canvas.height = height;

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0xfafbfc);

  var camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
  camera.position.set(3.5, 3, 4.5);
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

  // --- State ---
  var isReflected = false;
  var currentDeg = 130;

  // --- Fixed points (shared edge along X axis) ---
  var p1 = new THREE.Vector3(-2, 0, 0);
  var p2 = new THREE.Vector3(2, 0, 0);
  var wingLen = 1.8;

  // --- Compute wing positions ---
  // Original: both wings fold toward -Z (zBack < 0)
  // Reflected: both wings fold toward +Z (zBack negated) — XY plane (z=0) symmetry
  // arccos(n1·n2) is identical for both, demonstrating the arccos ambiguity
  function computeWingsQ11(angleDeg, reflected) {
    var rad = angleDeg * Math.PI / 180;
    var half = rad / 2;
    var yUp = Math.sin(half) * wingLen;
    var zBack = -Math.cos(half) * wingLen;
    if (reflected) {
      zBack = -zBack;  // reflect across XY plane (negate Z)
    }
    return {
      p3: new THREE.Vector3(0,  yUp, zBack),
      p4: new THREE.Vector3(0, -yUp, zBack)
    };
  }

  // Initial wing positions
  var w = computeWingsQ11(130, false);
  var p3 = w.p3.clone();
  var p4 = w.p4.clone();

  // --- Materials ---
  var upperColor = 0xa0cce4;
  var lowerColor = 0xd4b8a0;

  // --- Upper face (p1, p2, p3) ---
  var upperGeom = new THREE.BufferGeometry();
  upperGeom.setAttribute('position', new THREE.Float32BufferAttribute([
    p1.x, p1.y, p1.z,  p2.x, p2.y, p2.z,  p3.x, p3.y, p3.z
  ], 3));
  upperGeom.computeVertexNormals();
  var upperMat = new THREE.MeshPhongMaterial({
    color: upperColor, side: THREE.DoubleSide,
    transparent: true, opacity: 0.7, shininess: 30
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
    color: lowerColor, side: THREE.DoubleSide,
    transparent: true, opacity: 0.7, shininess: 30
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

  // --- Normal arrows (both originate from shared edge midpoint) ---
  var n1 = Q.faceNormal(p1, p2, p3);
  var n2 = Q.faceNormal(p1, p4, p2);
  var edgeMid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
  var aLen = 1.3;

  var arrowN1 = new THREE.ArrowHelper(n1, edgeMid.clone(), aLen, 0x2a6496, 0.2, 0.12);
  scene.add(arrowN1);
  var arrowN2 = new THREE.ArrowHelper(n2, edgeMid.clone(), aLen, 0xb07030, 0.2, 0.12);
  scene.add(arrowN2);

  var n1Tip = new THREE.Vector3().copy(edgeMid).addScaledVector(n1, aLen + 0.2);
  var n2Tip = new THREE.Vector3().copy(edgeMid).addScaledVector(n2, aLen + 0.2);
  var lbl_n1 = Q.makeLabel(scene, 'n\\u2081', n1Tip, '#2a6496');
  var lbl_n2 = Q.makeLabel(scene, 'n\\u2082', n2Tip, '#b07030');

  // --- Dihedral arc (centered at edgeMid) ---
  var arcR = 0.8;
  var arcPts = [];
  for (var ai = 0; ai <= 32; ai++) {
    var at = ai / 32;
    var ad = new THREE.Vector3().lerpVectors(n1, n2, at).normalize().multiplyScalar(arcR);
    arcPts.push(new THREE.Vector3().copy(edgeMid).add(ad));
  }
  var arcGeom = new THREE.BufferGeometry().setFromPoints(arcPts);
  var arcLine = new THREE.Line(arcGeom, new THREE.LineBasicMaterial({ color: 0xc0392b, linewidth: 2 }));
  scene.add(arcLine);

  var arcMidDir = new THREE.Vector3().lerpVectors(n1, n2, 0.5).normalize().multiplyScalar(arcR + 0.25);
  var phiPos = new THREE.Vector3().copy(edgeMid).add(arcMidDir);
  var lbl_phi = Q.makeLabel(scene, '\\u03c6', phiPos, '#c0392b');

  // --- "반사 평면" indicator (XY plane at z=0, vertical) ---
  // Reflection is Z-negate, so the mirror plane is XY (z=0).
  // PlaneGeometry default orientation is already in XY plane — no rotation needed.
  var planeGeom = new THREE.PlaneGeometry(5, 3.5);
  var planeMat = new THREE.MeshBasicMaterial({
    color: 0xffcc00, side: THREE.DoubleSide,
    transparent: true, opacity: 0.08
  });
  var planeMesh = new THREE.Mesh(planeGeom, planeMat);
  // No rotation — default XY plane at z=0 is exactly the reflection plane
  planeMesh.position.set(0, 0, 0);
  scene.add(planeMesh);
  var lbl_plane = Q.makeLabel(scene, '\\ubc18\\uc0ac \\ud3c9\\uba74', new THREE.Vector3(2.3, 1.5, 0.05), '#b8860b', 0.85);

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
  // updateScene — called on slider or reflection toggle
  // =====================================================================
  function updateScene(deg, reflected) {
    var ww = computeWingsQ11(deg, reflected);
    p3.copy(ww.p3);
    p4.copy(ww.p4);

    // Update face geometries
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

    // Update vertex labels
    lbl_p3.position.copy(p3); lbl_p3.position.y += 0.25;
    lbl_p4.position.copy(p4); lbl_p4.position.y += 0.25;

    // Update grid Y
    grid.position.y = -Math.sin(deg * Math.PI / 360) * wingLen - 0.1;

    // Face colors — keep same regardless of reflection
    // (only fold direction changes, not the triangles themselves)

    // Normals (both from shared edge midpoint)
    var nn1 = Q.faceNormal(p1, p2, p3);
    var nn2 = Q.faceNormal(p1, p4, p2);
    var eMid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);

    arrowN1.position.copy(eMid);
    arrowN1.setDirection(nn1);
    arrowN2.position.copy(eMid);
    arrowN2.setDirection(nn2);

    var nt1 = new THREE.Vector3().copy(eMid).addScaledVector(nn1, aLen + 0.2);
    var nt2 = new THREE.Vector3().copy(eMid).addScaledVector(nn2, aLen + 0.2);
    lbl_n1.position.copy(nt1);
    lbl_n2.position.copy(nt2);

    // Rebuild arc
    var arcPos = arcLine.geometry.attributes.position;
    for (var ai = 0; ai <= 32; ai++) {
      var at = ai / 32;
      var ad = new THREE.Vector3().lerpVectors(nn1, nn2, at).normalize().multiplyScalar(arcR);
      var pt = new THREE.Vector3().copy(eMid).add(ad);
      arcPos.setXYZ(ai, pt.x, pt.y, pt.z);
    }
    arcPos.needsUpdate = true;

    var aMidDir = new THREE.Vector3().lerpVectors(nn1, nn2, 0.5).normalize().multiplyScalar(arcR + 0.25);
    lbl_phi.position.copy(eMid).add(aMidDir);

    // --- KEY: arccos value is always the same ---
    // arccos(cos(φ)) = φ for φ ∈ [0,π] — the reflection doesn't change it
    var acosVal = deg;  // arccos always returns the same angle
    document.getElementById('${acosId}').textContent = acosVal + '\\u00b0';

    // Update state label
    var stateEl = document.getElementById('${stateId}');
    stateEl.textContent = reflected ? '\\ubc18\\uc0ac\\ub41c \\uc811\\ud798 (Reflected)' : '\\uc6d0\\ub798 \\uc811\\ud798 (Original)';
    stateEl.className = reflected ? 'state-label state-reflected' : 'state-label state-original';

    // Reflection plane visibility — make slightly more visible in reflected state
    planeMat.opacity = reflected ? 0.18 : 0.08;
  }

  // --- Initial state label ---
  var stateElInit = document.getElementById('${stateId}');
  stateElInit.className = 'state-label state-original';

  // --- Slider event ---
  var slider = document.getElementById('${sliderId}');
  var valSpan = document.getElementById('${valId}');
  slider.addEventListener('input', function() {
    currentDeg = parseInt(this.value, 10);
    valSpan.textContent = currentDeg + '\\u00b0';
    updateScene(currentDeg, isReflected);
  });

  // --- Reflection toggle ---
  var toggleBtn = document.getElementById('${toggleId}');
  toggleBtn.addEventListener('click', function() {
    isReflected = !isReflected;
    updateScene(currentDeg, isReflected);
  });

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
`;
}

/**
 * Q16 scene: constraint generation comparison — edge-based vs vertex-based.
 *
 * Standalone scene (not using buildInteractiveScene) because it has a unique
 * toggle UI and no dihedral angle slider.
 *
 * Shows a 7-vertex parallelogram mesh (6 triangles) with a slightly domed center.
 * Toggle button switches between:
 *   - Edge-based: highlights shared-edge midpoints as virtual vertices,
 *     shows constraint triangles (b0, b1, v=midpoint)
 *   - Vertex-based: highlights actual vertex 3 and its most-opposite neighbor pairs
 *
 * Vertex layout (top view):
 *        5  6       (top row, z = +S)
 *     2  3  4       (middle row, z = 0)
 *     0  1          (bottom row, z = -S)
 *
 * Triangles: [0,1,3], [0,3,2], [1,4,3], [2,3,5], [3,4,6], [3,6,5]
 * All internal edges pass through vertex 3 (center, slightly domed).
 */
function buildQ16Scene(canvasId, toggleId, stateId) {
  return `
  var Q = window.QNA3D;
  var canvas = document.getElementById('${canvasId}');
  var width = canvas.parentElement.clientWidth - 40;
  var height = Math.min(440, width * 0.78);
  canvas.width = width;
  canvas.height = height;

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0xfafbfc);

  var camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
  camera.position.set(0, 5.5, 4.5);
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

  // ── Mesh: 7-vertex parallelogram, domed center ──
  //        5  6       (z = +S)
  //     2  3  4       (z = 0)
  //     0  1          (z = -S)
  var S = 1.6;
  var dome = 0.5;
  var verts = [
    new THREE.Vector3(-S, 0, -S),    // 0
    new THREE.Vector3( 0, 0, -S),    // 1
    new THREE.Vector3(-S, 0,  0),    // 2
    new THREE.Vector3( 0, dome, 0),  // 3 (center, domed)
    new THREE.Vector3( S, 0,  0),    // 4
    new THREE.Vector3( 0, 0,  S),    // 5
    new THREE.Vector3( S, 0,  S)     // 6
  ];

  // 6 triangles — consistent diagonal direction (edges 0→3, 3→6)
  var triIndices = [
    [0, 1, 3],  // tri 0
    [0, 3, 2],  // tri 1
    [1, 4, 3],  // tri 2
    [2, 3, 5],  // tri 3
    [3, 4, 6],  // tri 4
    [3, 6, 5]   // tri 5
  ];

  // ── Materials ──
  var baseFaceMat = new THREE.MeshPhongMaterial({
    color: 0xdde8f0, side: THREE.DoubleSide,
    transparent: true, opacity: 0.45, shininess: 20
  });

  // ── Draw base mesh faces ──
  var faceMeshes = [];
  triIndices.forEach(function(tri) {
    var geom = new THREE.BufferGeometry();
    var a = verts[tri[0]], b = verts[tri[1]], c = verts[tri[2]];
    geom.setAttribute('position', new THREE.Float32BufferAttribute([
      a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z
    ], 3));
    geom.computeVertexNormals();
    var mesh = new THREE.Mesh(geom, baseFaceMat.clone());
    scene.add(mesh);
    faceMeshes.push(mesh);
  });

  // ── Wireframe ──
  var wireMat = new THREE.LineBasicMaterial({ color: 0x90a4ae, linewidth: 1 });
  triIndices.forEach(function(tri) {
    var pts = [verts[tri[0]], verts[tri[1]], verts[tri[2]], verts[tri[0]]];
    var geom = new THREE.BufferGeometry().setFromPoints(pts);
    scene.add(new THREE.Line(geom, wireMat));
  });

  // ── Vertex spheres ──
  var sphereGeom = new THREE.SphereGeometry(0.07, 12, 12);
  var vertSpheres = [];
  var baseVertMat = new THREE.MeshPhongMaterial({ color: 0x546e7a });
  verts.forEach(function(v) {
    var s = new THREE.Mesh(sphereGeom, baseVertMat.clone());
    s.position.copy(v);
    scene.add(s);
    vertSpheres.push(s);
  });

  // ── Vertex labels ──
  verts.forEach(function(v, idx) {
    Q.makeLabel(scene, '' + idx, new THREE.Vector3(v.x, v.y + 0.25, v.z), '#546e7a', 0.7);
  });

  // ── Highlight group ──
  var highlightGroup = new THREE.Group();
  scene.add(highlightGroup);

  // ── State ──
  var isVertexBased = false;

  // ── Constraint definitions ──

  // Edge-based constraints (two representative shared edges):
  //   edge [1,3]: shared by tri 0 ([0,1,3]) and tri 2 ([1,4,3])
  //     → wing vertices (b0, b1) = 0, 4; faces = [0, 2]
  //   edge [3,5]: shared by tri 3 ([2,3,5]) and tri 5 ([3,6,5])
  //     → wing vertices (b0, b1) = 2, 6; faces = [3, 5]
  var edgeConstraints = [
    { edge: [1, 3], b0: 0, b1: 4, faces: [0, 2] },
    { edge: [3, 5], b0: 2, b1: 6, faces: [3, 5] }
  ];

  // Vertex-based constraints: vertex 3 (center), 1-ring = {0,1,2,4,5,6}
  //   Most-opposite pairs:
  //     0 ↔ 6 (diagonal, gold)
  //     1 ↔ 5 (vertical, blue)
  //     2 ↔ 4 (horizontal, green)
  var vertexConstraints = [
    { v: 3, b0: 0, b1: 6 },  // diagonal
    { v: 3, b0: 1, b1: 5 },  // vertical
    { v: 3, b0: 2, b1: 4 }   // horizontal
  ];

  var midpointMat = new THREE.MeshPhongMaterial({ color: 0xe53935 });
  var edgeLineMats = [
    new THREE.LineBasicMaterial({ color: 0xe53935, linewidth: 2 }),
    new THREE.LineBasicMaterial({ color: 0x2e7d32, linewidth: 2 })
  ];
  var edgeHlColors = [0xf9a825, 0x66bb6a];
  var edgeHlHex = ['#f9a825', '#2e7d32'];

  function clearHighlights() {
    while (highlightGroup.children.length > 0) {
      var child = highlightGroup.children[0];
      highlightGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material && child.material.dispose) child.material.dispose();
    }
    faceMeshes.forEach(function(m) {
      m.material.color.setHex(0xdde8f0);
      m.material.opacity = 0.45;
    });
    vertSpheres.forEach(function(s) {
      s.material.color.setHex(0x546e7a);
      s.scale.setScalar(1);
    });
  }

  function showEdgeBased() {
    clearHighlights();

    edgeConstraints.forEach(function(ec, ci) {
      var pa = verts[ec.edge[0]], pb = verts[ec.edge[1]];
      var mid = new THREE.Vector3().addVectors(pa, pb).multiplyScalar(0.5);

      // Midpoint sphere (virtual vertex v)
      var midSphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.10, 16, 16), midpointMat.clone()
      );
      midSphere.position.copy(mid);
      highlightGroup.add(midSphere);

      // "v" label at midpoint
      Q.makeLabel(highlightGroup, 'v', new THREE.Vector3(mid.x, mid.y + 0.28, mid.z), '#e53935', 0.85);

      // b0, b1 positions
      var b0 = verts[ec.b0], b1 = verts[ec.b1];
      var lineMat = edgeLineMats[ci];

      // Highlight b0, b1 spheres
      vertSpheres[ec.b0].material.color.setHex(edgeHlColors[ci]);
      vertSpheres[ec.b0].scale.setScalar(1.5);
      vertSpheres[ec.b1].material.color.setHex(edgeHlColors[ci]);
      vertSpheres[ec.b1].scale.setScalar(1.5);

      // Constraint triangle outline: b0 → v(mid) → b1 → b0
      var triPts = [b0, mid, b1, b0];
      var triGeom = new THREE.BufferGeometry().setFromPoints(triPts);
      highlightGroup.add(new THREE.Line(triGeom, lineMat));

      // Dashed line for shared edge
      var edgeGeom = new THREE.BufferGeometry().setFromPoints([pa, pb]);
      var dashMat = new THREE.LineDashedMaterial({
        color: ci === 0 ? 0xe53935 : 0x2e7d32,
        dashSize: 0.1, gapSize: 0.06
      });
      var edgeLine = new THREE.Line(edgeGeom, dashMat);
      edgeLine.computeLineDistances();
      highlightGroup.add(edgeLine);

      // b0, b1 labels
      Q.makeLabel(highlightGroup, 'b\\u2080',
        new THREE.Vector3(b0.x, b0.y + 0.33, b0.z), edgeHlHex[ci], 0.85);
      Q.makeLabel(highlightGroup, 'b\\u2081',
        new THREE.Vector3(b1.x, b1.y + 0.33, b1.z), edgeHlHex[ci], 0.85);

      // Highlight the two faces sharing this edge
      ec.faces.forEach(function(fi) {
        faceMeshes[fi].material.color.setHex(edgeHlColors[ci]);
        faceMeshes[fi].material.opacity = 0.40;
      });
    });
  }

  function showVertexBased() {
    clearHighlights();

    // Highlight center vertex 3
    vertSpheres[3].material.color.setHex(0xe53935);
    vertSpheres[3].scale.setScalar(2.0);

    var colors = [0xf9a825, 0x42a5f5, 0x66bb6a];
    var colorHex = ['#f9a825', '#42a5f5', '#2e7d32'];
    var matArr = [
      new THREE.LineBasicMaterial({ color: 0xf9a825, linewidth: 2 }),
      new THREE.LineBasicMaterial({ color: 0x42a5f5, linewidth: 2 }),
      new THREE.LineBasicMaterial({ color: 0x66bb6a, linewidth: 2 })
    ];

    vertexConstraints.forEach(function(vc, ci) {
      var vp = verts[vc.v];
      var b0 = verts[vc.b0], b1 = verts[vc.b1];

      // Highlight b0, b1
      vertSpheres[vc.b0].material.color.setHex(colors[ci]);
      vertSpheres[vc.b0].scale.setScalar(1.5);
      vertSpheres[vc.b1].material.color.setHex(colors[ci]);
      vertSpheres[vc.b1].scale.setScalar(1.5);

      // Constraint triangle: b0 → v → b1 → b0
      var triPts = [b0, vp, b1, b0];
      var triGeom = new THREE.BufferGeometry().setFromPoints(triPts);
      highlightGroup.add(new THREE.Line(triGeom, matArr[ci]));

      // b0, b1 labels (offset away from center)
      var off0 = new THREE.Vector3().subVectors(b0, vp).normalize().multiplyScalar(0.3);
      var off1 = new THREE.Vector3().subVectors(b1, vp).normalize().multiplyScalar(0.3);
      Q.makeLabel(highlightGroup, 'b\\u2080', new THREE.Vector3(
        b0.x + off0.x, b0.y + 0.3, b0.z + off0.z), colorHex[ci], 0.8);
      Q.makeLabel(highlightGroup, 'b\\u2081', new THREE.Vector3(
        b1.x + off1.x, b1.y + 0.3, b1.z + off1.z), colorHex[ci], 0.8);
    });

    // v label
    Q.makeLabel(highlightGroup, 'v', new THREE.Vector3(
      verts[3].x, verts[3].y + 0.38, verts[3].z), '#e53935', 0.95);

    // Highlight all 6 faces (all adjacent to vertex 3)
    faceMeshes.forEach(function(m) {
      m.material.color.setHex(0xc5e1f5);
      m.material.opacity = 0.35;
    });
  }

  // ── Lighting ──
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  var dLight = new THREE.DirectionalLight(0xffffff, 0.65);
  dLight.position.set(3, 6, 4);
  scene.add(dLight);
  var dLight2 = new THREE.DirectionalLight(0xffffff, 0.25);
  dLight2.position.set(-3, 2, -3);
  scene.add(dLight2);

  // ── Initial display ──
  showEdgeBased();

  // ── Toggle event ──
  var toggleBtn = document.getElementById('${toggleId}');
  var stateEl = document.getElementById('${stateId}');

  toggleBtn.addEventListener('click', function() {
    isVertexBased = !isVertexBased;
    if (isVertexBased) {
      showVertexBased();
      stateEl.textContent = '\\uaf2d\\uc9d3\\uc810 \\uae30\\ubc18 (Vertex-based)';
      stateEl.className = 'state-label state-reflected';
    } else {
      showEdgeBased();
      stateEl.textContent = '\\ubaa8\\uc11c\\ub9ac \\uae30\\ubc18 (Edge-based)';
      stateEl.className = 'state-label state-original';
    }
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
 * Currently supports: 'gradient_direction' (Q10).
 * Returns empty string if section has no canvas2d field.
 */
function buildCanvas2dHtml(sectionNum) {
  const meta = SECTION_META[sectionNum];
  if (!meta || !meta.canvas2d) return '';

  const canvasId = `canvas2d-${sectionNum}`;
  const sliderId = `canvas2d-slider-${sectionNum}`;
  const valId = `canvas2d-val-${sectionNum}`;

  let sceneCode = '';

  if (meta.canvas2d === 'gradient_direction') {
    sceneCode = buildGradientDirectionScene(canvasId, sliderId, valId);
  } else if (meta.canvas2d === 'cst_ast_stepper') {
    sceneCode = buildCstAstStepperScene(canvasId, sliderId, valId);
  }
  if (!sceneCode) return '';

  // Per-scene UI configuration
  const isStepper = meta.canvas2d === 'cst_ast_stepper';

  if (isStepper) {
    // Stepper uses < > buttons instead of a slider
    const prevBtnId = `stepper-prev-${sectionNum}`;
    const nextBtnId = `stepper-next-${sectionNum}`;
    const figcaptionText = '\uc778\ud130\ub799\ud2f0\ube0c 2D \ubdf0 \u2014 \ud1a0\ud070 \uc2a4\ud2b8\ub9bc \u2192 CST \u2192 AST \ub2e8\uacc4\ubcc4 \ubcc0\ud658';
    return `<div class="canvas2d-wrapper">
  <div class="canvas2d-label">\ub2e8\uacc4\ubcc4 \ubcc0\ud658 \uc560\ub2c8\uba54\uc774\uc158 \u2014 \ubc84\ud2bc\uc73c\ub85c \ub2e4\uc74c/\uc774\uc804 \ub2e8\uacc4\ub97c \ud655\uc778\ud558\uc138\uc694</div>
  <div class="canvas2d-controls stepper-controls">
    <button id="${prevBtnId}" class="stepper-btn" disabled>\u276e \uc774\uc804</button>
    <span class="stepper-label" id="${valId}">\uc18c\uc2a4 \ucf54\ub4dc</span>
    <button id="${nextBtnId}" class="stepper-btn">\ub2e4\uc74c \u276f</button>
  </div>
  <canvas id="${canvasId}" class="canvas2d-canvas"></canvas>
  <div class="canvas2d-info" id="canvas2d-info-${sectionNum}"></div>
  <figcaption>${figcaptionText}</figcaption>
</div>
<script>
(function() {
${sceneCode}
})();
</script>`;
  }

  // Non-stepper scenes use slider
  const labelText = '\uc2ac\ub77c\uc774\ub354: \ubc29\ud5a5 d\uc758 \uac01\ub3c4 \u03b8 \uc870\uc808 | \ubc29\ud5a5 \ubbf8\ubd84\uac12 \uc2e4\uc2dc\uac04 \ud45c\uc2dc';
  const figcaptionText = '\uc778\ud130\ub799\ud2f0\ube0c 2D \ubdf0 \u2014 \ubc29\ud5a5 \ubbf8\ubd84\uacfc \uadf8\ub798\ub514\uc5b8\ud2b8 \ubc29\ud5a5\uc758 \uad00\uacc4';

  return `<div class="canvas2d-wrapper">
  <div class="canvas2d-label">${labelText}</div>
  <div class="canvas2d-controls">
    <label>\ubc29\ud5a5 \uac01\ub3c4 \u03b8</label>
    <input type="range" id="${sliderId}" min="0" max="360" value="0" step="1">
    <span class="canvas2d-angle" id="${valId}">0\u00b0</span>
  </div>
  <canvas id="${canvasId}" class="canvas2d-canvas"></canvas>
  <div class="canvas2d-info" id="canvas2d-info-${sectionNum}"></div>
  <figcaption>${figcaptionText}</figcaption>
</div>
<script>
(function() {
${sceneCode}
})();
</script>`;
}

/**
 * Canvas2D scene: CST → AST stepper.
 * Slider steps through 4 stages:
 *   0 = Source code
 *   1 = Token stream
 *   2 = CST (Parse Tree)
 *   3 = AST
 * Example input: message Player { string name = 1; int32 level = 2; }
 */
function buildCstAstStepperScene(canvasId, sliderId, valId) {
  return `
  var canvas = document.getElementById('${canvasId}');
  var ctx = canvas.getContext('2d');
  var infoEl = document.getElementById('canvas2d-info-${canvasId.split('-').pop()}');

  // --- Canvas sizing ---
  var wrapW = canvas.parentElement.clientWidth - 40;
  var W = Math.min(720, wrapW);
  var H = Math.round(W * 0.72);
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  var STEP_LABELS = [
    '\uc18c\uc2a4 \ucf54\ub4dc',
    '\ud1a0\ud070 \uc2a4\ud2b8\ub9bc',
    'CST (Parse Tree)',
    'AST'
  ];

  var STEP_COLORS = ['#1a6b3a', '#b07d00', '#2c5aa0', '#8b1a1a'];
  var BG = '#fafbfc';
  var BORDER = '#dde3ea';

  // ── Helper: rounded rect ──
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ── Helper: arrow ──
  function arrow(x0, y0, x1, y1, color, lw) {
    var dx = x1 - x0, dy = y1 - y0;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 2) return;
    var ux = dx / len, uy = dy / len;
    var hl = 9, hw = 5;
    ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.lineWidth = lw || 1.5;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - ux * hl, y1 - uy * hl); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - ux * hl + uy * hw, y1 - uy * hl - ux * hw);
    ctx.lineTo(x1 - ux * hl - uy * hw, y1 - uy * hl + ux * hw);
    ctx.closePath(); ctx.fill();
  }

  // ── Helper: text box (node) ──
  function textBox(text, cx, cy, bgColor, textColor, pad, fontSize) {
    pad = pad || 6;
    fontSize = fontSize || 12;
    ctx.font = 'bold ' + fontSize + 'px \\'Consolas\\', monospace';
    var tw = ctx.measureText(text).width;
    var bw = tw + pad * 2, bh = fontSize + pad * 2;
    roundRect(cx - bw / 2, cy - bh / 2, bw, bh, 5);
    ctx.fillStyle = bgColor || '#e8f4fd';
    ctx.fill();
    ctx.strokeStyle = textColor || '#2c5aa0';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = textColor || '#2c5aa0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + fontSize + 'px \\'Consolas\\', monospace';
    ctx.fillText(text, cx, cy);
    return { cx: cx, cy: cy, w: bw, h: bh };
  }

  // ── Step 0: Source code ──
  function drawStep0() {
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);

    // Title
    ctx.fillStyle = '#555'; ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('\ub2e8\uacc4 0 \u2014 \uc18c\uc2a4 \ucf54\ub4dc (\uc785\ub825)', W / 2, 26);

    // Code box
    var lines = [
      'message Player {',
      '    string name  = 1;',
      '    int32  level = 2;',
      '}'
    ];
    var bx = W * 0.1, by = 50, bw = W * 0.8, bh = lines.length * 24 + 20;
    roundRect(bx, by, bw, bh, 8);
    ctx.fillStyle = '#1e1e2e'; ctx.fill();
    ctx.strokeStyle = '#444466'; ctx.lineWidth = 1.5; ctx.stroke();

    var kw = ['message', 'string', 'int32'];
    var kwColor = '#569cd6';
    var strColor = '#ce9178';
    var numColor = '#b5cea8';
    var defColor = '#dcdcaa';

    lines.forEach(function(line, li) {
      var lx = bx + 18;
      var ly = by + 20 + li * 24;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = '13px \\'Consolas\\', monospace';

      // Simple syntax highlight
      var tokens2 = line.split(/(\bstring\b|\bint32\b|\bmessage\b|\{|\}|=|;)/);
      var cx2 = lx;
      tokens2.forEach(function(tok) {
        var col = '#d4d4d4';
        if (tok === 'message') col = kwColor;
        else if (tok === 'string' || tok === 'int32') col = kwColor;
        else if (tok === '{' || tok === '}') col = '#ffd700';
        else if (tok === '=' || tok === ';') col = '#d4d4d4';
        else if (/^\d+$/.test(tok.trim())) col = numColor;
        else if (/^[A-Z]/.test(tok.trim())) col = defColor;
        ctx.fillStyle = col;
        ctx.fillText(tok, cx2, ly);
        cx2 += ctx.measureText(tok).width;
      });
    });

    // Label below
    ctx.fillStyle = '#888'; ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('.proto \ud30c\uc77c \uc6d0\ubcf8 \ud14d\uc2a4\ud2b8 \u2014 \uc0ac\ub78c\uc774 \uc791\uc131', W / 2, by + bh + 18);
  }

  // ── Step 1: Token stream ──
  function drawStep1() {
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#555'; ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('\ub2e8\uacc4 1 \u2014 \ud1a0\ud070 \uc2a4\ud2b8\ub9bc (ANTLR Lexer \ucd9c\ub825)', W / 2, 26);

    var tokens3 = [
      { t: 'MESSAGE',            color: '#569cd6', bg: '#1e3a5f' },
      { t: 'IDENTIFIER("Player")', color: '#dcdcaa', bg: '#2a2a1e' },
      { t: 'LC',                 color: '#ffd700', bg: '#2a2000' },
      { t: 'STRING',             color: '#569cd6', bg: '#1e3a5f' },
      { t: 'IDENTIFIER("name")', color: '#dcdcaa', bg: '#2a2a1e' },
      { t: 'EQ',                 color: '#d4d4d4', bg: '#2a2a2a' },
      { t: 'INT_LIT("1")',       color: '#b5cea8', bg: '#1a2a1a' },
      { t: 'SEMI',               color: '#d4d4d4', bg: '#2a2a2a' },
      { t: 'INT32',              color: '#569cd6', bg: '#1e3a5f' },
      { t: 'IDENTIFIER("level")',color: '#dcdcaa', bg: '#2a2a1e' },
      { t: 'EQ',                 color: '#d4d4d4', bg: '#2a2a2a' },
      { t: 'INT_LIT("2")',       color: '#b5cea8', bg: '#1a2a1a' },
      { t: 'SEMI',               color: '#d4d4d4', bg: '#2a2a2a' },
      { t: 'RC',                 color: '#ffd700', bg: '#2a2000' },
      { t: 'EOF',                color: '#888',    bg: '#222' }
    ];

    // Layout: wrap into rows
    var margin = 18, gap = 6, rowH = 34, startY = 55;
    var x = margin, y = startY, rowMax = W - margin;
    ctx.font = '11px \\'Consolas\\', monospace';

    tokens3.forEach(function(tok) {
      var tw = ctx.measureText(tok.t).width + 14;
      if (x + tw > rowMax && x > margin) { x = margin; y += rowH + gap; }
      roundRect(x, y, tw, rowH - 6, 5);
      ctx.fillStyle = tok.bg; ctx.fill();
      ctx.strokeStyle = tok.color; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = tok.color;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(tok.t, x + tw / 2, y + (rowH - 6) / 2);
      x += tw + gap;
    });

    ctx.fillStyle = '#888'; ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ANTLR Lexer\uac00 \uc18c\uc2a4\ub97c \ud1a0\ud070 \ubc30\uc5f4\ub85c \ubd84\ub9ac \u2014 \uad6c\ub450\uc810(EQ, SEMI)\ub3c4 \ud3ec\ud568', W / 2, H - 14);
  }

  // ── Step 2: CST ──
  function drawStep2() {
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#555'; ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('\ub2e8\uacc4 2 \u2014 CST (Parse Tree) \u2014 ANTLR Parser \ucd9c\ub825', W / 2, 20);

    // Node color scheme
    var ruleC  = { bg: '#e8f0fd', border: '#2c5aa0', text: '#1a3a6e' };   // rule node (blue)
    var tokC   = { bg: '#fef9e7', border: '#b07d00', text: '#7a5200' };   // terminal token (amber)
    var semC   = { bg: '#f0f0f0', border: '#999',    text: '#666' };      // semantic action (gray)

    var fs = 11; // font size
    function node(label, cx, cy, scheme) {
      return textBox(label, cx, cy, scheme.bg, scheme.border, 5, fs);
    }
    function conn(x0, y0, x1, y1) {
      arrow(x0, y0, x1, y1, '#aaa', 1);
    }

    // Layout: two independent sub-trees side by side for clarity
    // Left sub-tree: messageName chain  Right sub-tree: messageBody chain
    // Row Y positions (generous vertical spacing)
    var r0 = 40, r1 = 95, r2 = 148, r3 = 200, r4 = 252, r5 = 304;

    // ── root: messageDef ──
    node('messageDef', W/2, r0, ruleC);

    // ── Level-1 children: spread evenly across canvas width ──
    // MESSAGE(left), messageName, doMsgNameDef(center), messageBody(right)
    var x_kw   = W * 0.09;
    var x_mn   = W * 0.28;
    var x_sem  = W * 0.50;
    var x_mb   = W * 0.78;

    node('MESSAGE',         x_kw,  r1, tokC);
    node('messageName',     x_mn,  r1, ruleC);
    node('doMsgNameDef',    x_sem, r1, semC);
    node('messageBody',     x_mb,  r1, ruleC);

    conn(W/2, r0+12, x_kw,  r1-12);
    conn(W/2, r0+12, x_mn,  r1-12);
    conn(W/2, r0+12, x_sem, r1-12);
    conn(W/2, r0+12, x_mb,  r1-12);

    // ── messageName → ident → ID("Player") ──
    node('ident',        x_mn, r2, ruleC);
    conn(x_mn, r1+12,   x_mn, r2-12);
    node('ID("Player")', x_mn, r3, tokC);
    conn(x_mn, r2+12,   x_mn, r3-12);

    // ── messageBody children: LC, doEnterBlock, field[0], field[1], RC ──
    // Spread within right half [0.55 .. 0.99]
    var x_lc   = W * 0.55;
    var x_de   = W * 0.64;
    var x_me0  = W * 0.75;
    var x_me1  = W * 0.88;
    var x_rc   = W * 0.98;

    node('LC',               x_lc,  r2, tokC);
    node('doEnterBlock',     x_de,  r2, semC);
    node('messageElement[0]',x_me0, r2, ruleC);
    node('messageElement[1]',x_me1, r2, ruleC);
    node('RC',               x_rc,  r3, tokC);

    conn(x_mb, r1+12, x_lc,  r2-12);
    conn(x_mb, r1+12, x_de,  r2-12);
    conn(x_mb, r1+12, x_me0, r2-12);
    conn(x_mb, r1+12, x_me1, r2-12);
    conn(x_mb, r1+12, x_rc,  r3-12);

    // ── field[0]: type_(STRING) fieldLabel fieldName EQ INT SEMI ──
    // Anchored under x_me0; leaf tokens spread from 0.50 to 0.86
    node('field', x_me0, r3, ruleC);
    conn(x_me0, r2+12, x_me0, r3-12);

    var fx = [W*0.50, W*0.60, W*0.68, W*0.77, W*0.86];
    var fl = ['STRING', 'ID("name")', 'EQ', 'INT("1")', 'SEMI'];
    fl.forEach(function(lbl, i) {
      node(lbl, fx[i], r4, tokC);
      conn(x_me0, r3+12, fx[i], r4-12);
    });

    // ── field[1]: simplified ──
    node('field(…level…)', x_me1, r3, ruleC);
    conn(x_me1, r2+12, x_me1, r3-12);

    // Note
    ctx.fillStyle = '#999'; ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('\u25a0 \ud30c\ub780 = \ubb38\ubc95 \uaddc\uce59 \ub178\ub4dc  \u25a1 \ud669\uc0c9 = \ud130\ubbf8\ub110 \ud1a0\ud070  \u25a1 \ud68c\uc0c9 = \uc2dc\ub9e8\ud2f1 \uc561\uc158', 12, H - 14);
  }

  // ── Step 3: AST ──
  function drawStep3() {
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#555'; ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('\ub2e8\uacc4 3 \u2014 AST (\ucd94\uc0c1 \uad6c\ubb38 \ud2b8\ub9ac) \u2014 Visitor \ud328\ud134 \ubcc0\ud658 \uacb0\uacfc', W / 2, 20);

    var astC  = { bg: '#fde8e8', border: '#8b1a1a', text: '#8b1a1a' };
    var leafC = { bg: '#fff5e6', border: '#7a5200', text: '#7a5200' };
    var fs = 12;

    function node(label, cx, cy, scheme) {
      return textBox(label, cx, cy, scheme.bg, scheme.border, 7, fs);
    }
    function conn(x0, y0, x1, y1) {
      arrow(x0, y0, x1, y1, '#c08080', 1.5);
    }

    var r0 = 55, r1 = 125, r2 = 210, r3 = 285;

    // MessageNode (root)
    node('MessageNode', W/2, r0, astC);

    // name field (left)
    node('name: "Player"', W*0.28, r1, leafC);
    conn(W/2, r0+16, W*0.28, r1-16);

    // fields array (right)
    node('fields: [...]', W*0.72, r1, astC);
    conn(W/2, r0+16, W*0.72, r1-16);

    // Two FieldNodes
    node('FieldNode', W*0.35, r2, astC);
    node('FieldNode', W*0.65, r2, astC);
    conn(W*0.72, r1+16, W*0.35, r2-16);
    conn(W*0.72, r1+16, W*0.65, r2-16);

    // FieldNode[0] leaves
    var lx0 = W * 0.35;
    node('label: null',    lx0 - 90, r3, leafC);
    node('type: "string"', lx0 - 30, r3, leafC);
    node('name: "name"',   lx0 + 30, r3, leafC);
    node('number: 1',      lx0 + 90, r3, leafC);
    conn(lx0, r2+16, lx0 - 90, r3-14);
    conn(lx0, r2+16, lx0 - 30, r3-14);
    conn(lx0, r2+16, lx0 + 30, r3-14);
    conn(lx0, r2+16, lx0 + 90, r3-14);

    // FieldNode[1] leaves
    var lx1 = W * 0.65;
    node('label: null',    lx1 - 90, r3, leafC);
    node('type: "int32"',  lx1 - 30, r3, leafC);
    node('name: "level"',  lx1 + 30, r3, leafC);
    node('number: 2',      lx1 + 90, r3, leafC);
    conn(lx1, r2+16, lx1 - 90, r3-14);
    conn(lx1, r2+16, lx1 - 30, r3-14);
    conn(lx1, r2+16, lx1 + 30, r3-14);
    conn(lx1, r2+16, lx1 + 90, r3-14);

    ctx.fillStyle = '#888'; ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CST 29\uac1c \ub178\ub4dc \u2192 AST 3\uac1c \ub178\ub4dc\ub85c \uc555\ucd95 \u2014 \uad6c\ub450\uc810/\ub798\ud37c \uaddc\uce59 \uc81c\uac70', W / 2, H - 14);
  }

  var stepFns = [drawStep0, drawStep1, drawStep2, drawStep3];
  var currentStep = 0;

  function draw(step) {
    currentStep = step;
    stepFns[step]();
    // Update info panel
    var stepColors = ['#1a6b3a', '#b07d00', '#2c5aa0', '#8b1a1a'];
    var descs = [
      '<strong style="color:#1a6b3a">\uc18c\uc2a4 \ucf54\ub4dc</strong>: .proto \ud30c\uc77c \uc6d0\ubcf8. \uc0ac\ub78c\uc774 \uc791\uc131\ud55c \ud14d\uc2a4\ud2b8.',
      '<strong style="color:#b07d00">\ud1a0\ud070 \uc2a4\ud2b8\ub9bc</strong>: ANTLR Lexer\uac00 \uc18c\uc2a4\ub97c \ud1a0\ud070 \ubc30\uc5f4\ub85c \ubd84\ub9ac. \uad6c\ub450\uc810(EQ, SEMI)\ub3c4 \ud1a0\ud070.',
      '<strong style="color:#2c5aa0">CST (Parse Tree)</strong>: ANTLR Parser\uac00 \uc790\ub3d9 \uc0dd\uc131. \ubaa8\ub4e0 \ubb38\ubc95 \uaddc\uce59\uc774 \ub178\ub4dc\ub85c \ud45c\ud604. \ub798\ud37c \uaddc\uce59\uacfc \uad6c\ub450\uc810 \ud3ec\ud568.',
      '<strong style="color:#8b1a1a">AST</strong>: Visitor \ud328\ud134\uc73c\ub85c \uc218\ub3d9 \ubcc0\ud658. \uc758\ubbf8 \uc788\ub294 \ub178\ub4dc\ub9cc \ub0a8\uae40. \ucf54\ub4dc \uc0dd\uc131\uae30\uc758 \uc785\ub825.'
    ];
    if (infoEl) infoEl.innerHTML = '<div style="padding:6px 10px; font-size:0.92em; color:#444;">' + descs[step] + '</div>';
  }

  // Button event (prev / next)
  var prevBtn = document.getElementById('stepper-prev-${canvasId.split('-').pop()}');
  var nextBtn = document.getElementById('stepper-next-${canvasId.split('-').pop()}');
  var labelEl = document.getElementById('${valId}');
  var stepNames = ['\uc18c\uc2a4 \ucf54\ub4dc', '\ud1a0\ud070 \uc2a4\ud2b8\ub9bc', 'CST', 'AST'];
  var TOTAL = 4;

  function updateButtons() {
    prevBtn.disabled = currentStep === 0;
    nextBtn.disabled = currentStep === TOTAL - 1;
    labelEl.textContent = stepNames[currentStep];
  }

  prevBtn.addEventListener('click', function() {
    if (currentStep > 0) { draw(currentStep - 1); updateButtons(); }
  });
  nextBtn.addEventListener('click', function() {
    if (currentStep < TOTAL - 1) { draw(currentStep + 1); updateButtons(); }
  });

  // Initial
  updateButtons();
  draw(0);
`;
}

/**
 * Canvas2D scene: Gradient direction visualization.
 * Shows contour lines of f(x,y) = x² + y², a point P, the gradient vector,
 * and a user-controlled direction vector d. Displays directional derivative
 * D_d f = |∇f| cos θ in real time.
 */
function buildGradientDirectionScene(canvasId, sliderId, valId) {
  return `
  var canvas = document.getElementById('${canvasId}');
  var ctx = canvas.getContext('2d');
  var infoEl = document.getElementById('canvas2d-info-${canvasId.split('-').pop()}');

  // --- Canvas sizing ---
  var wrapW = canvas.parentElement.clientWidth - 40;
  var W = Math.min(520, wrapW);
  var H = W;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  // --- Coordinate system ---
  // Map math coords [-5, 5] x [-5, 5] to canvas
  var xMin = -5, xMax = 5, yMin = -5, yMax = 5;
  function toCanvas(mx, my) {
    return [
      (mx - xMin) / (xMax - xMin) * W,
      (1 - (my - yMin) / (yMax - yMin)) * H
    ];
  }

  // --- Point P ---
  var Px = 3, Py = 2;
  // gradient at P: ∇f = (2x, 2y) = (6, 4)
  var gradX = 2 * Px, gradY = 2 * Py;
  var gradMag = Math.sqrt(gradX * gradX + gradY * gradY);  // |∇f| = √52
  // gradient direction angle (from +x axis)
  var gradAngle = Math.atan2(gradY, gradX);  // ≈ 33.69°

  // --- Draw function ---
  var currentTheta = 0; // radians, relative to +x axis (absolute direction of d)

  function draw(thetaAbs) {
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#fafbfc';
    ctx.fillRect(0, 0, W, H);

    // --- Grid lines ---
    ctx.strokeStyle = '#e8e8e8';
    ctx.lineWidth = 0.5;
    for (var gx = -4; gx <= 4; gx++) {
      var p1 = toCanvas(gx, yMin); var p2 = toCanvas(gx, yMax);
      ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
    }
    for (var gy = -4; gy <= 4; gy++) {
      var p3 = toCanvas(xMin, gy); var p4 = toCanvas(xMax, gy);
      ctx.beginPath(); ctx.moveTo(p3[0], p3[1]); ctx.lineTo(p4[0], p4[1]); ctx.stroke();
    }

    // --- Axes ---
    ctx.strokeStyle = '#bbb';
    ctx.lineWidth = 1;
    var ox = toCanvas(0, 0);
    ctx.beginPath(); ctx.moveTo(toCanvas(xMin, 0)[0], ox[1]); ctx.lineTo(toCanvas(xMax, 0)[0], ox[1]); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ox[0], toCanvas(0, yMin)[1]); ctx.lineTo(ox[0], toCanvas(0, yMax)[1]); ctx.stroke();
    ctx.fillStyle = '#888'; ctx.font = '12px sans-serif';
    ctx.fillText('x', toCanvas(4.7, 0)[0], toCanvas(4.7, -0.4)[1]);
    ctx.fillText('y', toCanvas(0.2, 4.7)[0], toCanvas(0.2, 4.7)[1]);

    // --- Contour lines: f(x,y) = x² + y² = c ---
    var contourLevels = [2, 5, 10, 17, 26, 37, 50];
    ctx.lineWidth = 1;
    for (var ci = 0; ci < contourLevels.length; ci++) {
      var c = contourLevels[ci];
      var r = Math.sqrt(c);
      if (r > 5.5) continue;
      var center = toCanvas(0, 0);
      var edgePt = toCanvas(r, 0);
      var rCanvas = edgePt[0] - center[0];
      // Highlight the contour passing through P: c = Px²+Py² = 13
      var isP = (c === (Px*Px + Py*Py));
      ctx.strokeStyle = isP ? '#2c5aa0' : 'rgba(100,140,200,0.35)';
      ctx.lineWidth = isP ? 2 : 1;
      ctx.beginPath();
      ctx.arc(center[0], center[1], Math.abs(rCanvas), 0, 2 * Math.PI);
      ctx.stroke();
      // Label
      if (r <= 5) {
        var labelPos = toCanvas(r * 0.71, r * 0.71);
        ctx.fillStyle = isP ? '#2c5aa0' : '#8aa4c8';
        ctx.font = isP ? 'bold 11px sans-serif' : '10px sans-serif';
        ctx.fillText('c=' + c, labelPos[0] + 3, labelPos[1] - 3);
      }
    }

    // --- Contour through P: c = 13 (emphasized) ---
    var cP = Px * Px + Py * Py;  // 13
    var rP = Math.sqrt(cP);
    var ctrP = toCanvas(0, 0);
    var edgP = toCanvas(rP, 0);
    var rCanvasP = edgP[0] - ctrP[0];
    ctx.strokeStyle = '#2c5aa0';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 3]);
    ctx.beginPath();
    ctx.arc(ctrP[0], ctrP[1], Math.abs(rCanvasP), 0, 2 * Math.PI);
    ctx.stroke();
    ctx.setLineDash([]);

    // --- Point P ---
    var pCanvas = toCanvas(Px, Py);
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(pCanvas[0], pCanvas[1], 5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = '#333';
    ctx.fillText('P(' + Px + ',' + Py + ')', pCanvas[0] + 8, pCanvas[1] - 8);

    // --- Arrow helper ---
    function drawArrow(x0, y0, x1, y1, color, lineW, headLen) {
      var p0 = toCanvas(x0, y0);
      var p1 = toCanvas(x1, y1);
      var dx = p1[0] - p0[0], dy = p1[1] - p0[1];
      var len = Math.sqrt(dx*dx + dy*dy);
      if (len < 1) return;
      var ux = dx/len, uy = dy/len;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = lineW;
      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1]);
      ctx.lineTo(p1[0], p1[1]);
      ctx.stroke();
      // Arrowhead
      var hl = headLen || 10;
      ctx.beginPath();
      ctx.moveTo(p1[0], p1[1]);
      ctx.lineTo(p1[0] - ux*hl + uy*hl*0.4, p1[1] - uy*hl - ux*hl*0.4);
      ctx.lineTo(p1[0] - ux*hl - uy*hl*0.4, p1[1] - uy*hl + ux*hl*0.4);
      ctx.closePath();
      ctx.fill();
    }

    // --- Gradient arrow (red) ---
    var arrowScale = 0.25;  // scale gradient for display
    var gEndX = Px + gradX * arrowScale;
    var gEndY = Py + gradY * arrowScale;
    drawArrow(Px, Py, gEndX, gEndY, '#c0392b', 2.5, 12);
    // Label
    var gLabelPos = toCanvas(gEndX + 0.1, gEndY + 0.3);
    ctx.fillStyle = '#c0392b';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('\\u2207f = (' + gradX + ',' + gradY + ')', gLabelPos[0], gLabelPos[1]);

    // --- Direction d arrow ---
    // thetaAbs is the absolute angle from +x axis
    var thetaRel = thetaAbs - gradAngle; // angle relative to gradient direction
    // Normalize to [-π, π]
    while (thetaRel > Math.PI) thetaRel -= 2 * Math.PI;
    while (thetaRel < -Math.PI) thetaRel += 2 * Math.PI;
    var cosTheta = Math.cos(thetaRel);
    var dirDerivative = gradMag * cosTheta;

    // Color: green (aligned) → gray (perpendicular) → red (opposite)
    // cosTheta: 1=green, 0=gray, -1=red
    var r, g, b;
    if (cosTheta >= 0) {
      // green to gray: cosTheta 1→0
      r = Math.round(150 * (1 - cosTheta));
      g = Math.round(160 * cosTheta + 150 * (1 - cosTheta));
      b = Math.round(50 * (1 - cosTheta) + 50 * cosTheta);
    } else {
      // gray to red: cosTheta 0→-1
      var t = -cosTheta;
      r = Math.round(150 + 42 * t);
      g = Math.round(150 * (1 - t));
      b = Math.round(50 * (1 - t));
    }
    var dirColor = 'rgb(' + r + ',' + g + ',' + b + ')';

    // d is unit vector
    var dLen = 1.8;  // display length
    var dEndX = Px + Math.cos(thetaAbs) * dLen;
    var dEndY = Py + Math.sin(thetaAbs) * dLen;
    drawArrow(Px, Py, dEndX, dEndY, dirColor, 2.5, 11);
    // Label
    var dLabelPos = toCanvas(dEndX + 0.15, dEndY + 0.15);
    ctx.fillStyle = dirColor;
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('d', dLabelPos[0], dLabelPos[1]);

    // --- Angle arc between gradient and d ---
    var arcR = 25; // pixels
    var startA = -gradAngle; // canvas angle (y-flipped)
    var endA = -thetaAbs;
    ctx.strokeStyle = '#e67e22';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    // Draw arc from gradient direction to d direction
    ctx.arc(pCanvas[0], pCanvas[1], arcR, startA, endA, thetaRel > 0);
    ctx.stroke();
    // θ label
    var midA = -(gradAngle + thetaRel / 2);
    ctx.fillStyle = '#e67e22';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('\\u03b8', pCanvas[0] + arcR * 1.3 * Math.cos(midA) - 4, pCanvas[1] + arcR * 1.3 * Math.sin(midA) + 4);

    // --- Tangent line (perpendicular to gradient at P, along contour) ---
    // Tangent direction: (-gradY, gradX) normalized
    var tangLen = 2.0;
    var tNorm = Math.sqrt(gradX*gradX + gradY*gradY);
    var tDirX = -gradY / tNorm * tangLen;
    var tDirY = gradX / tNorm * tangLen;
    ctx.strokeStyle = 'rgba(100,100,100,0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    var t1 = toCanvas(Px + tDirX, Py + tDirY);
    var t2 = toCanvas(Px - tDirX, Py - tDirY);
    ctx.beginPath(); ctx.moveTo(t1[0], t1[1]); ctx.lineTo(t2[0], t2[1]); ctx.stroke();
    ctx.setLineDash([]);
    // Label "접선 (contour)"
    ctx.fillStyle = '#999';
    ctx.font = '10px sans-serif';
    ctx.fillText('\\uc811\\uc120 (contour)', t1[0] + 3, t1[1] - 3);

    // --- Info panel ---
    var thetaDeg = (thetaRel * 180 / Math.PI);
    if (thetaDeg < 0) thetaDeg += 360;
    if (thetaDeg > 180) thetaDeg = 360 - thetaDeg; // show as 0-180 range
    var absAngleDeg = (thetaAbs * 180 / Math.PI);
    if (absAngleDeg < 0) absAngleDeg += 360;

    infoEl.innerHTML =
      '<div class="canvas2d-info-grid">' +
      '<span class="info-label">\\u2207f \\ubc29\\ud5a5:</span>' +
      '<span class="info-value">' + (gradAngle * 180 / Math.PI).toFixed(1) + '\\u00b0</span>' +
      '<span class="info-label">d \\ubc29\\ud5a5:</span>' +
      '<span class="info-value">' + absAngleDeg.toFixed(1) + '\\u00b0</span>' +
      '<span class="info-label">\\u03b8 (\\u2207f\\uc640 d \\uc0ac\\uc774\\uac01):</span>' +
      '<span class="info-value" style="color:#e67e22; font-weight:bold;">' + thetaDeg.toFixed(1) + '\\u00b0</span>' +
      '<span class="info-label">cos \\u03b8:</span>' +
      '<span class="info-value" style="color:' + dirColor + '; font-weight:bold;">' + cosTheta.toFixed(3) + '</span>' +
      '<span class="info-label">|\\u2207f|:</span>' +
      '<span class="info-value">' + gradMag.toFixed(2) + '</span>' +
      '<span class="info-label">D<sub>d</sub>f = |\\u2207f| cos \\u03b8:</span>' +
      '<span class="info-value" style="color:' + dirColor + '; font-weight:bold; font-size:1.1em;">' + dirDerivative.toFixed(2) + '</span>' +
      '</div>' +
      '<div class="canvas2d-legend">' +
      '<span style="color:#c0392b;">\\u25a0</span> \\u2207f (\\uadf8\\ub798\\ub514\\uc5b8\\ud2b8)\\u00a0\\u00a0' +
      '<span style="color:' + dirColor + ';">\\u25a0</span> d (\\uc120\\ud0dd \\ubc29\\ud5a5)\\u00a0\\u00a0' +
      '<span style="color:#e67e22;">\\u25a0</span> \\u03b8 (\\uc0ac\\uc774\\uac01)\\u00a0\\u00a0' +
      '<span style="color:#2c5aa0;">---</span> \\ub4f1\\uace0\\uc120 c=13' +
      '</div>';
  }

  // --- Slider event ---
  var slider = document.getElementById('${sliderId}');
  var valSpan = document.getElementById('${valId}');
  slider.addEventListener('input', function() {
    var deg = parseInt(this.value, 10);
    valSpan.textContent = deg + '\\u00b0';
    currentTheta = deg * Math.PI / 180;
    draw(currentTheta);
  });

  // --- Initial draw ---
  draw(currentTheta);
`;
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
      const bodyHtml = markdownToHtml(s.body);

      // Insert diagram HTML right after the answer heading if present.
      // Three.js canvas goes right after the diagram(s).
      // Canvas2D goes after Three.js.
      let combined;
      const answerHeadingTag = '<h3>답변</h3>';
      const answerIdx = bodyHtml.indexOf(answerHeadingTag);
      const mediaHtml = [diagramHtml, threejsHtml, canvas2dHtml].filter(Boolean).join('\n');
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
