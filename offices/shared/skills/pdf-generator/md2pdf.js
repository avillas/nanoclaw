#!/usr/bin/env node
/**
 * md2pdf.js — generate a PDF from a Markdown or HTML file using headless
 * Chromium. Self-contained: no npm dependencies, only Node built-ins plus the
 * chromium binary that ships in the nanoclaw-agent container image.
 *
 * Usage:
 *   node md2pdf.js <input> <output.pdf>
 *
 * If <input> ends in .md the file is converted from Markdown to HTML using
 * a minimal CommonMark-subset converter (headings, paragraphs, bold, italic,
 * inline code, code blocks, lists, links, tables, blockquotes, horizontal
 * rules). If it ends in .html / .htm the file is used verbatim (you are
 * responsible for providing a complete document and any inline <style>).
 *
 * On success the script prints "OK <output path>" and exits 0. On failure it
 * prints an error message to stderr and exits non-zero.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error('usage: md2pdf.js <input> <output.pdf>');
  process.exit(2);
}
const [inputPath, outputPath] = args;

if (!fs.existsSync(inputPath)) {
  console.error(`error: input file not found: ${inputPath}`);
  process.exit(2);
}
if (!outputPath.toLowerCase().endsWith('.pdf')) {
  console.error('error: output path must end in .pdf');
  process.exit(2);
}

const ext = path.extname(inputPath).toLowerCase();
const raw = fs.readFileSync(inputPath, 'utf-8');

let html;
if (ext === '.md' || ext === '.markdown') {
  html = wrapInTemplate(markdownToHtml(raw), path.basename(inputPath, ext));
} else if (ext === '.html' || ext === '.htm') {
  html = raw;
} else {
  console.error(`error: unsupported input extension "${ext}" (use .md or .html)`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Render via headless chromium
// ---------------------------------------------------------------------------
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md2pdf-'));
const tmpHtml = path.join(tmpDir, 'doc.html');
fs.writeFileSync(tmpHtml, html, 'utf-8');

const absOutput = path.resolve(outputPath);
fs.mkdirSync(path.dirname(absOutput), { recursive: true });

const result = spawnSync(
  'chromium',
  [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--no-pdf-header-footer',
    `--print-to-pdf=${absOutput}`,
    `file://${tmpHtml}`,
  ],
  { encoding: 'utf-8' },
);

// Clean up temp file regardless of outcome.
try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch {
  /* ignore */
}

if (result.error) {
  console.error(`error: failed to spawn chromium: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) {
  console.error(`error: chromium exited with code ${result.status}`);
  if (result.stderr) {
    // Filter out the dbus warnings — they're noise, not real errors.
    const meaningful = result.stderr
      .split('\n')
      .filter((l) => l && !/dbus|object_proxy|gpu_data_manager/i.test(l));
    if (meaningful.length > 0) console.error(meaningful.join('\n'));
  }
  process.exit(1);
}
if (!fs.existsSync(absOutput)) {
  console.error('error: chromium reported success but no PDF was written');
  process.exit(1);
}

const sizeKb = (fs.statSync(absOutput).size / 1024).toFixed(1);
console.log(`OK ${absOutput} (${sizeKb} KB)`);

// ===========================================================================
// HTML template
// ===========================================================================
function wrapInTemplate(bodyHtml, title) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
@page { size: A4; margin: 2cm; }
html, body {
  font-family: -apple-system, "Segoe UI", "Liberation Serif", Georgia, serif;
  font-size: 11pt;
  line-height: 1.5;
  color: #1a1a1a;
}
body { max-width: 100%; margin: 0; }
h1, h2, h3, h4, h5, h6 {
  font-family: -apple-system, "Segoe UI", "Liberation Sans", Arial, sans-serif;
  line-height: 1.25;
  margin-top: 1.4em;
  margin-bottom: 0.5em;
  color: #111;
  page-break-after: avoid;
}
h1 { font-size: 22pt; border-bottom: 2px solid #ddd; padding-bottom: 0.2em; }
h2 { font-size: 16pt; border-bottom: 1px solid #eee; padding-bottom: 0.15em; }
h3 { font-size: 13pt; }
h4 { font-size: 11.5pt; }
h5, h6 { font-size: 11pt; color: #555; }
p { margin: 0.6em 0; }
ul, ol { margin: 0.6em 0; padding-left: 1.6em; }
li { margin: 0.2em 0; }
li > p { margin: 0.2em 0; }
blockquote {
  margin: 0.8em 0;
  padding: 0.4em 1em;
  border-left: 3px solid #ccc;
  color: #555;
  background: #fafafa;
}
code {
  font-family: "SFMono-Regular", "Menlo", "Liberation Mono", monospace;
  font-size: 0.92em;
  background: #f4f4f4;
  padding: 0.1em 0.35em;
  border-radius: 3px;
}
pre {
  background: #f4f4f4;
  padding: 0.8em 1em;
  border-radius: 4px;
  border: 1px solid #e5e5e5;
  overflow-x: auto;
  line-height: 1.4;
  page-break-inside: avoid;
}
pre code { background: transparent; padding: 0; font-size: 9.5pt; }
hr { border: none; border-top: 1px solid #ddd; margin: 1.5em 0; }
table {
  border-collapse: collapse;
  margin: 1em 0;
  width: 100%;
  font-size: 10pt;
  page-break-inside: avoid;
}
th, td {
  border: 1px solid #d0d0d0;
  padding: 0.4em 0.7em;
  text-align: left;
  vertical-align: top;
}
th { background: #f4f4f4; font-weight: 600; }
a { color: #0366d6; text-decoration: none; }
img { max-width: 100%; height: auto; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

// ===========================================================================
// Markdown → HTML — minimal CommonMark subset
// ===========================================================================
function markdownToHtml(src) {
  // Normalize line endings
  let text = src.replace(/\r\n?/g, '\n');

  // 1. Extract fenced code blocks first so their contents are not touched by
  //    any subsequent regex. Replace with sentinel placeholders.
  const codeBlocks = [];
  text = text.replace(
    /^```([^\n`]*)\n([\s\S]*?)\n```$/gm,
    (_match, lang, body) => {
      const idx = codeBlocks.length;
      const cls = lang.trim() ? ` class="language-${escapeHtml(lang.trim())}"` : '';
      codeBlocks.push(
        `<pre><code${cls}>${escapeHtml(body)}</code></pre>`,
      );
      return `\u0000CODEBLOCK${idx}\u0000`;
    },
  );

  // 2. Split into blocks separated by blank lines.
  const blocks = text.split(/\n{2,}/);

  const out = [];
  for (let block of blocks) {
    block = block.replace(/\s+$/g, '');
    if (!block) continue;

    // Restore code block placeholder verbatim
    if (/^\u0000CODEBLOCK\d+\u0000$/.test(block)) {
      out.push(block);
      continue;
    }

    // Heading
    const headingMatch = block.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      out.push(
        `<h${level}>${inline(headingMatch[2].trim())}</h${level}>`,
      );
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(block.trim())) {
      out.push('<hr>');
      continue;
    }

    // Table — needs at least header row, separator row, and one data row
    if (looksLikeTable(block)) {
      out.push(renderTable(block));
      continue;
    }

    // Blockquote
    if (block.split('\n').every((l) => /^>\s?/.test(l))) {
      const inner = block
        .split('\n')
        .map((l) => l.replace(/^>\s?/, ''))
        .join('\n');
      out.push(`<blockquote>${markdownToHtml(inner)}</blockquote>`);
      continue;
    }

    // Unordered list
    if (block.split('\n').every((l) => /^[\-*+]\s+/.test(l))) {
      const items = block
        .split('\n')
        .map((l) => `<li>${inline(l.replace(/^[\-*+]\s+/, ''))}</li>`)
        .join('');
      out.push(`<ul>${items}</ul>`);
      continue;
    }

    // Ordered list
    if (block.split('\n').every((l) => /^\d+\.\s+/.test(l))) {
      const items = block
        .split('\n')
        .map((l) => `<li>${inline(l.replace(/^\d+\.\s+/, ''))}</li>`)
        .join('');
      out.push(`<ol>${items}</ol>`);
      continue;
    }

    // Default: paragraph. Single newlines inside become <br>.
    const paragraph = block
      .split('\n')
      .map((l) => inline(l))
      .join('<br>\n');
    out.push(`<p>${paragraph}</p>`);
  }

  // 3. Restore code block placeholders.
  let html = out.join('\n');
  html = html.replace(
    /\u0000CODEBLOCK(\d+)\u0000/g,
    (_, idx) => codeBlocks[Number(idx)] || '',
  );
  return html;
}

function looksLikeTable(block) {
  const lines = block.split('\n');
  if (lines.length < 2) return false;
  if (!/\|/.test(lines[0])) return false;
  // Second line must be a separator row like |---|---|
  if (!/^\s*\|?[\s\-:|]+\|?\s*$/.test(lines[1])) return false;
  if (!/-/.test(lines[1])) return false;
  return true;
}

function renderTable(block) {
  const lines = block.split('\n').filter((l) => l.trim().length > 0);
  const splitRow = (line) =>
    line
      .replace(/^\s*\|/, '')
      .replace(/\|\s*$/, '')
      .split('|')
      .map((c) => c.trim());

  const headers = splitRow(lines[0]);
  const aligns = splitRow(lines[1]).map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return null;
  });
  const dataRows = lines.slice(2).map(splitRow);

  const th = headers
    .map(
      (h, i) =>
        `<th${aligns[i] ? ` style="text-align:${aligns[i]}"` : ''}>${inline(h)}</th>`,
    )
    .join('');
  const tbody = dataRows
    .map(
      (cells) =>
        `<tr>${cells
          .map(
            (c, i) =>
              `<td${aligns[i] ? ` style="text-align:${aligns[i]}"` : ''}>${inline(c)}</td>`,
          )
          .join('')}</tr>`,
    )
    .join('');

  return `<table><thead><tr>${th}</tr></thead><tbody>${tbody}</tbody></table>`;
}

/**
 * Apply inline transforms (bold/italic/code/links/escape) to a single line of
 * already-block-classified text. Order matters: extract inline code first
 * (its contents must not be touched), then escape HTML, then run the
 * remaining transforms, then restore the inline code.
 */
function inline(text) {
  const inlineCodes = [];
  let s = text.replace(/`([^`]+)`/g, (_m, body) => {
    const idx = inlineCodes.length;
    inlineCodes.push(`<code>${escapeHtml(body)}</code>`);
    return `\u0001CODE${idx}\u0001`;
  });

  s = escapeHtml(s);

  // Images first (link syntax has the same shape minus the leading !)
  s = s.replace(
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g,
    (_m, alt, src) => `<img alt="${alt}" src="${src}">`,
  );
  // Links
  s = s.replace(
    /\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g,
    (_m, label, href) => `<a href="${href}">${label}</a>`,
  );
  // Bold (** or __) before italic so the inner * isn't matched
  s = s.replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  // Italic (* or _)
  s = s.replace(/(^|[^\w*])\*([^\s*][^*]*)\*(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^\w_])_([^\s_][^_]*)_(?!\w)/g, '$1<em>$2</em>');

  // Restore inline code
  s = s.replace(
    /\u0001CODE(\d+)\u0001/g,
    (_, idx) => inlineCodes[Number(idx)] || '',
  );
  return s;
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
