// math_convert.js — Bidirectional Typst ↔ LaTeX math converter
// Used by:
//   - typst_to_yaml.js: Typst → LaTeX (extracting from .typ into YAML)
//   - yaml_to_typst.js: LaTeX → Typst (generating .typ from YAML)

// ═══════════════════════════════════════════════════
// Helper: find matching closing paren/bracket
// ═══════════════════════════════════════════════════
function findMatchingParen(str, startIdx, open = '(', close = ')') {
  let depth = 1;
  let i = startIdx;
  while (i < str.length && depth > 0) {
    if (str[i] === open) depth++;
    else if (str[i] === close) depth--;
    if (depth === 0) return i;
    i++;
  }
  return -1; // unmatched
}

// Split Typst function arguments at top-level commas
// e.g., "bold(p)_1, bold(p)_2" → ["bold(p)_1", "bold(p)_2"]
function splitArgs(str) {
  const args = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

// ═══════════════════════════════════════════════════
// TYPST → LATEX
// ═══════════════════════════════════════════════════

// Typst function name → LaTeX command mapping (single-arg)
const typstFuncToLatex1 = {
  'bold': '\\mathbf',
  'bb': '\\mathbb',
  'tilde': '\\tilde',
  'hat': '\\hat',
  'bar': '\\bar',
  'vec': '\\vec',
  'dot.op': '\\dot',
  'sqrt': '\\sqrt',
  'cal': '\\mathcal',
  'text': '\\text',
  'upright': '\\mathrm',
};

// Typst function name → LaTeX command mapping (two-arg)
const typstFuncToLatex2 = {
  'frac': '\\frac',
};

// Typst symbol → LaTeX symbol
const typstSymbolToLatex = {
  // Greek letters
  'alpha': '\\alpha',
  'beta': '\\beta',
  'gamma': '\\gamma',
  'delta': '\\delta',
  'epsilon': '\\epsilon',
  'zeta': '\\zeta',
  'eta': '\\eta',
  'theta': '\\theta',
  'iota': '\\iota',
  'kappa': '\\kappa',
  'lambda': '\\lambda',
  'mu': '\\mu',
  'nu': '\\nu',
  'xi': '\\xi',
  'pi': '\\pi',
  'rho': '\\rho',
  'sigma': '\\sigma',
  'tau': '\\tau',
  'upsilon': '\\upsilon',
  'phi': '\\phi',
  'phi.alt': '\\varphi',
  'chi': '\\chi',
  'psi': '\\psi',
  'omega': '\\omega',
  'Delta': '\\Delta',
  'Gamma': '\\Gamma',
  'Lambda': '\\Lambda',
  'Sigma': '\\Sigma',
  'Omega': '\\Omega',
  'Phi': '\\Phi',
  'Pi': '\\Pi',
  'Theta': '\\Theta',

  // Operators
  'times': '\\times',
  'dot': '\\cdot',
  'approx': '\\approx',
  'nabla': '\\nabla',
  'partial': '\\partial',
  'sum': '\\sum',
  'prod': '\\prod',
  'inf': '\\infty',
  'in': '\\in',

  // Arrows
  'arrow.r': '\\rightarrow',
  'arrow.l': '\\leftarrow',
  'arrow.r.double': '\\Rightarrow',
  'arrow.l.double': '\\Leftarrow',

  // Relations
  'lt.eq': '\\leq',
  'gt.eq': '\\geq',
  'eq.not': '\\neq',
  'plus.minus': '\\pm',

  // Spacing
  'quad': '\\quad',
  'thin': '\\,',

  // Misc
  'dots': '\\ldots',
  'dots.c': '\\cdots',
  'arccos': '\\arccos',
  'arcsin': '\\arcsin',
  'sin': '\\sin',
  'cos': '\\cos',
  'log': '\\log',
  'exp': '\\exp',
  'max': '\\max',
  'min': '\\min',
  'lim': '\\lim',
  'dif': '\\mathrm{d}',
};

/**
 * Convert a Typst math expression to LaTeX.
 * Handles function calls, symbols, subscripts, superscripts, grouping.
 */
function typstToLatex(input) {
  let str = input.trim();

  // Pass 0: Handle Typst string literals "text" → placeholder
  const textPlaceholders = [];
  str = str.replace(/"([^"]+)"/g, (_, text) => {
    const idx = textPlaceholders.length;
    textPlaceholders.push(text);
    return `@@TXT${idx}@@`;
  });

  // Pass 1: Handle mat(delim: "(...)", ...) → \begin{pmatrix}...\end{pmatrix}
  str = handleMatFunction(str);

  // Pass 2: Iteratively handle function calls (innermost first)
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 50) {
    changed = false;
    iterations++;

    // Handle two-arg functions: frac(A, B) → \frac{A}{B}
    for (const [funcName, latexCmd] of Object.entries(typstFuncToLatex2)) {
      const regex = new RegExp(`\\b${funcName}\\(`);
      let match;
      while ((match = regex.exec(str)) !== null) {
        const argsStart = match.index + funcName.length + 1;
        const closeIdx = findMatchingParen(str, argsStart);
        if (closeIdx === -1) break;
        const argsStr = str.substring(argsStart, closeIdx);
        const args = splitArgs(argsStr);
        if (args.length >= 2) {
          const replacement = `${latexCmd}{${args[0]}}{${args[1]}}`;
          str = str.substring(0, match.index) + replacement + str.substring(closeIdx + 1);
          changed = true;
        } else {
          break;
        }
      }
    }

    // Handle single-arg functions: bold(X) → \mathbf{X}
    for (const [funcName, latexCmd] of Object.entries(typstFuncToLatex1)) {
      // Escape dots in func names like dot.op
      const escaped = funcName.replace('.', '\\.');
      const regex = new RegExp(`\\b${escaped}\\(`);
      let match;
      while ((match = regex.exec(str)) !== null) {
        const argsStart = match.index + funcName.length + 1;
        const closeIdx = findMatchingParen(str, argsStart);
        if (closeIdx === -1) break;
        const argContent = str.substring(argsStart, closeIdx);
        const replacement = `${latexCmd}{${argContent}}`;
        str = str.substring(0, match.index) + replacement + str.substring(closeIdx + 1);
        changed = true;
      }
    }
  }

  // Pass 3: Handle "slash" → /
  str = str.replace(/\bslash\b/g, '/');

  // Pass 4: Handle multi-char symbols (longer names first to avoid partial matches)
  const sortedSymbols = Object.keys(typstSymbolToLatex).sort((a, b) => b.length - a.length);
  for (const sym of sortedSymbols) {
    // Use word boundary for alpha symbols, but handle dot-separated symbols specially
    if (sym.includes('.')) {
      const escaped = sym.replace(/\./g, '\\.');
      str = str.replace(new RegExp(escaped, 'g'), typstSymbolToLatex[sym]);
    } else {
      // Use letter-based boundaries instead of \b (which treats _ as word char)
      // This ensures sum_i matches sum (not blocked by _ being a "word char")
      str = str.replace(new RegExp(`(?<![a-zA-Z])${sym}(?![a-zA-Z])`, 'g'), typstSymbolToLatex[sym]);
    }
  }

  // Pass 5: Handle subscript/superscript grouping
  // Typst: _(expr) → LaTeX: _{expr}
  // Typst: ^(expr) → LaTeX: ^{expr}
  str = str.replace(/_\(/g, '_{');
  str = fixGroupingParens(str, '_{');
  str = str.replace(/\^\(/g, '^{');
  str = fixGroupingParens(str, '^{');

  // Pass 6: Restore text placeholders
  for (let i = 0; i < textPlaceholders.length; i++) {
    str = str.replace(`@@TXT${i}@@`, `\\text{${textPlaceholders[i]}}`);
  }

  return str;
}

// Handle mat(delim: "(", ...) → \begin{pmatrix}...\end{pmatrix}
function handleMatFunction(str) {
  const matRegex = /\bmat\s*\(/;
  let match;
  while ((match = matRegex.exec(str)) !== null) {
    const argsStart = match.index + match[0].length;
    const closeIdx = findMatchingParen(str, argsStart);
    if (closeIdx === -1) break;
    const argsStr = str.substring(argsStart, closeIdx);

    // Parse delim option
    let delimType = 'p'; // default pmatrix
    const delimMatch = argsStr.match(/delim\s*:\s*"([^"]*)"/);
    if (delimMatch) {
      if (delimMatch[1] === '(') delimType = 'p';
      else if (delimMatch[1] === '[') delimType = 'b';
      else if (delimMatch[1] === '{') delimType = 'B';
      else if (delimMatch[1] === '|') delimType = 'v';
    }

    // Remove delim option and parse the rest as matrix entries
    let matContent = argsStr.replace(/delim\s*:\s*"[^"]*"\s*,?\s*/, '');
    // Rows separated by ; and columns by ,
    const rows = matContent.split(';').map(r => r.trim());
    const latexRows = rows.map(row => {
      const cols = splitArgs(row);
      return cols.join(' & ');
    });
    const latexMat = `\\begin{${delimType}matrix}${latexRows.join(' \\\\ ')}\\end{${delimType}matrix}`;
    str = str.substring(0, match.index) + latexMat + str.substring(closeIdx + 1);
  }
  return str;
}

// After converting _( to _{, fix the corresponding ) to }
function fixGroupingParens(str, prefix) {
  let searchStart = 0;
  while (true) {
    const idx = str.indexOf(prefix, searchStart);
    if (idx === -1) break;
    const braceStart = idx + prefix.length;
    // Find matching } (it was originally ), now we need to find the matching one)
    // But we already replaced ( with {, so we need to find matching )
    // Actually, we only replaced the opening ( with {, the closing ) is still )
    // Let's find matching ) and replace with }
    let depth = 1;
    let i = braceStart;
    while (i < str.length && depth > 0) {
      if (str[i] === '(' || str[i] === '{') depth++;
      else if (str[i] === ')') {
        depth--;
        if (depth === 0) {
          str = str.substring(0, i) + '}' + str.substring(i + 1);
          break;
        }
      } else if (str[i] === '}') {
        depth--;
        if (depth === 0) break; // already correct
      }
      i++;
    }
    searchStart = idx + 1;
  }
  return str;
}


// ═══════════════════════════════════════════════════
// LATEX → TYPST
// ═══════════════════════════════════════════════════

const latexCmdToTypst1 = {
  '\\mathbf': 'bold',
  '\\mathbb': 'bb',
  '\\tilde': 'tilde',
  '\\hat': 'hat',
  '\\bar': 'bar',
  '\\vec': 'vec',
  '\\dot': 'dot.op',
  '\\sqrt': 'sqrt',
  '\\mathcal': 'cal',
  '\\mathrm': 'upright',
};

const latexCmdToTypst2 = {
  '\\frac': 'frac',
};

// Build reverse symbol map
const latexSymbolToTypst = {};
for (const [typstSym, latexSym] of Object.entries(typstSymbolToLatex)) {
  latexSymbolToTypst[latexSym] = typstSym;
}

/**
 * Convert a LaTeX math expression to Typst.
 */
function latexToTypst(input) {
  let str = input.trim();

  // Pass 0: Handle \text{...} → "..." placeholder
  const textPlaceholders = [];
  str = str.replace(/\\text\{([^}]+)\}/g, (_, text) => {
    const idx = textPlaceholders.length;
    textPlaceholders.push(text);
    return `@@TXT${idx}@@`;
  });

  // Pass 0.5: Remove \left and \right (Typst auto-sizes delimiters)
  // Also convert \| → || (double vertical bar / norm)
  str = str.replace(/\\left\s*/g, '');
  str = str.replace(/\\right\s*/g, '');
  str = str.replace(/\\\|/g, '||');

  // Handle \geq, \leq before symbol pass (ensure they're in symbol map)
  // \geq → >= and \leq → <= if not in symbol map already

  // Pass 1: Handle matrix environments
  str = str.replace(/\\begin\{(p|b|B|v|V)matrix\}([\s\S]*?)\\end\{\1matrix\}/g, (_, delim, content) => {
    const delimChar = { p: '(', b: '[', B: '{', v: '|', V: '||' }[delim] || '(';
    const rows = content.split('\\\\').map(r => r.trim());
    const typstRows = rows.map(row => row.split('&').map(c => c.trim()).join(', '));
    return `mat(delim: "${delimChar}", ${typstRows.join('; ')})`;
  });

  // Pass 2: Handle two-arg commands: \frac{A}{B} → frac(A, B)
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 50) {
    changed = false;
    iterations++;

    for (const [latexCmd, typstFunc] of Object.entries(latexCmdToTypst2)) {
      const escaped = latexCmd.replace(/\\/g, '\\\\');
      const regex = new RegExp(escaped + '\\{');
      let match;
      while ((match = regex.exec(str)) !== null) {
        const arg1Start = match.index + latexCmd.length + 1;
        const arg1End = findMatchingParen(str, arg1Start, '{', '}');
        if (arg1End === -1) break;
        // Expect { right after
        if (str[arg1End + 1] !== '{') break;
        const arg2Start = arg1End + 2;
        const arg2End = findMatchingParen(str, arg2Start, '{', '}');
        if (arg2End === -1) break;
        const arg1 = str.substring(arg1Start, arg1End);
        const arg2 = str.substring(arg2Start, arg2End);
        const replacement = `${typstFunc}(${arg1}, ${arg2})`;
        str = str.substring(0, match.index) + replacement + str.substring(arg2End + 1);
        changed = true;
      }
    }

    // Handle single-arg commands: \mathbf{X} → bold(X)
    for (const [latexCmd, typstFunc] of Object.entries(latexCmdToTypst1)) {
      const escaped = latexCmd.replace(/\\/g, '\\\\');
      const regex = new RegExp(escaped + '\\{');
      let match;
      while ((match = regex.exec(str)) !== null) {
        const argStart = match.index + latexCmd.length + 1;
        const argEnd = findMatchingParen(str, argStart, '{', '}');
        if (argEnd === -1) break;
        const argContent = str.substring(argStart, argEnd);
        const replacement = `${typstFunc}(${argContent})`;
        str = str.substring(0, match.index) + replacement + str.substring(argEnd + 1);
        changed = true;
      }
    }
  }

  // Pass 3: Handle subscript/superscript braces → parens
  // LaTeX: _{expr} → Typst: _(expr) (only if expr is multi-char)
  str = str.replace(/_\{([^}]*)\}/g, (_, content) => {
    if (content.length <= 1 && !content.includes('\\')) return `_${content}`;
    return `_(${content})`;
  });
  str = str.replace(/\^\{([^}]*)\}/g, (_, content) => {
    if (content.length <= 1 && !content.includes('\\')) return `^${content}`;
    return `^(${content})`;
  });

  // Pass 4: Replace LaTeX symbols with Typst equivalents (longer first)
  const sortedLatex = Object.keys(latexSymbolToTypst).sort((a, b) => b.length - a.length);
  for (const sym of sortedLatex) {
    const escaped = sym.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
    str = str.replace(new RegExp(escaped, 'g'), latexSymbolToTypst[sym]);
  }

  // Pass 5: Clean up remaining bare braces used for grouping
  // Simple cases: {X} → X when X is a single token
  str = str.replace(/\{(\w)\}/g, '$1');

  // Pass 6: Replace / with slash when it's a division operator
  // (context-dependent — skip for now, only handle explicit cases)

  // Pass 7: Restore text placeholders
  for (let i = 0; i < textPlaceholders.length; i++) {
    str = str.replace(`@@TXT${i}@@`, `"${textPlaceholders[i]}"`);
  }

  return str;
}


// ═══════════════════════════════════════════════════
// INLINE TEXT PROCESSING
// ═══════════════════════════════════════════════════

/**
 * Convert inline Typst math (within $...$) in a text string to LaTeX.
 * Also handles Typst text formatting: *bold* → **bold**, _italic_ → *italic*
 */
function typstTextToYaml(text) {
  // Convert inline math $...$ — extract Typst math, convert to LaTeX
  let result = text.replace(/\$([^$]+)\$/g, (_, math) => {
    return `$${typstToLatex(math)}$`;
  });

  // Typst bold: *text* → **text** (YAML/markdown convention)
  // But be careful: in Typst, *text* is strong/bold, while in Markdown ** is bold
  // We'll use **text** for bold and *text* for italic in YAML
  // Typst _text_ = emphasis/italic
  // Actually, Typst uses *...* for bold (strong) and _..._ for italic (emphasis)
  // We want YAML to use **...** for bold and *...* for italic (Markdown convention)

  // This is tricky because Typst *...* = bold, Markdown *...* = italic
  // For now, keep Typst conventions and let renderers handle it
  // Actually, let's convert to Markdown convention:
  // Typst *text* → YAML **text** (bold)
  // Typst _text_ → YAML *text* (italic)

  // Replace Typst strong markers *...* with **...**
  // But only when used as text formatting, not in math contexts
  // Since math is already wrapped in $...$, we can do this safely
  result = result.replace(/(?<!\*)\*(?!\*)([^*]+?)(?<!\*)\*(?!\*)/g, '**$1**');

  return result;
}

/**
 * Convert inline LaTeX math (within $...$) in a YAML text string to Typst.
 */
function yamlTextToTypst(text) {
  // Convert inline math $...$ — extract LaTeX math, convert to Typst
  // Note: In YAML block scalars (|), \\ remains literal \\, so we normalize
  // double backslashes to single inside math before conversion.
  let result = text.replace(/\$([^$]+)\$/g, (_, math) => {
    const normalized = math.replace(/\\\\/g, '\\');
    return `$${latexToTypst(normalized)}$`;
  });

  // Convert YAML **text** (bold) → Typst *text* (strong)
  result = result.replace(/\*\*([^*]+?)\*\*/g, '*$1*');

  // Convert YAML _text_ (italic) → Typst _text_ (emph) — already correct syntax, just unescape brackets
  // (Typst uses _ for emphasis natively, so _text_ passes through as-is)

  // Unescape YAML-escaped brackets: \[ → [, \] → ]
  result = result.replace(/\\\[/g, '[');
  result = result.replace(/\\\]/g, ']');

  // Escape double-quotes outside math regions to prevent Typst string interpretation
  // Split by $...$ math delimiters, escape quotes only in non-math parts
  const parts = result.split(/(\$[^$]+\$)/g);
  result = parts.map((part, i) => {
    if (i % 2 === 1) return part; // math region, keep as-is
    // Escape literal " in text mode — Typst uses smart quotes but unmatched " causes errors
    // Replace with typographic quotes (Unicode left/right double quotes)
    return part.replace(/"([^"]*?)"/g, '\u201c$1\u201d');
  }).join('');

  return result;
}

/**
 * Convert inline LaTeX math in YAML text to MathJax HTML delimiters.
 * $...$ → \(...\) for inline math
 */
function yamlTextToHtml(text) {
  // *** STEP 1: Extract $...$ math regions FIRST to protect them from italic/bold processing ***
  // (Underscore _ inside math like $\mathbf{x}_{i_{n_j}}$ would be misinterpreted as italic markup)
  const mathRegions = [];
  let result = text.replace(/\$([^$]+)\$/g, (_, math) => {
    const normalized = math.replace(/\\\\/g, '\\');
    const placeholder = `\x00MATH${mathRegions.length}\x00`;
    mathRegions.push(`\\(${normalized}\\)`);
    return placeholder;
  });

  // STEP 2: Convert bold **text** → <strong>text</strong>
  result = result.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');

  // STEP 3: Convert italic *text* → <em>text</em>  (asterisk style)
  // Opening * must not be preceded by alphanumeric (to avoid matching e.g. BWR*08)
  // Closing * must not be followed by alphanumeric (to avoid matching e.g. *08])
  result = result.replace(/(?<![a-zA-Z0-9*])\*(?!\*)([^*]+?)(?<!\*)\*(?![a-zA-Z0-9*])/g, '<em>$1</em>');

  // STEP 4: Convert italic _text_ → <em>text</em>  (underscore style)
  // Negative lookbehind/ahead for word chars to avoid matching math subscripts
  result = result.replace(/(?<![a-zA-Z0-9\\$])_([^_]+?)_(?![a-zA-Z0-9])/g, '<em>$1</em>');

  // STEP 5: Restore math regions as \(...\) for MathJax
  result = result.replace(/\x00MATH(\d+)\x00/g, (_, idx) => mathRegions[parseInt(idx)]);

  // STEP 6: Unescape YAML-escaped brackets: \[ → [, \] → ]
  // These are used in YAML plain scalars to prevent [text] being parsed as YAML sequences.
  // Must run AFTER math restoration so \(...\) delimiters are already in place.
  // Also fixes \[ inside math (LaTeX doesn't need \[ for literal brackets in inline math).
  result = result.replace(/\\\[/g, '[');
  result = result.replace(/\\\]/g, ']');

  return result;
}


module.exports = {
  typstToLatex,
  latexToTypst,
  typstTextToYaml,
  yamlTextToTypst,
  yamlTextToHtml,
  findMatchingParen,
  splitArgs,
};
