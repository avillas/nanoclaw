---
name: pdf-generator
description: Generate a PDF file from Markdown or HTML content. Use when an agent needs to deliver a printable report, formal document, invoice, briefing, technical doc or any deliverable that benefits from a PDF format. Renders via headless Chromium so layouts, fonts and tables look correct.
---

# PDF Generator

## When to use

Use this skill whenever you need to **deliver a PDF file** — for example:

- A market research report or competitive analysis (Innovation)
- A campaign brief, content calendar or brand guideline doc (Marketing)
- A technical spec, ADR, runbook or release notes (Development)
- Any formal deliverable the user wants to download, save, print or share

If the user just needs the content visible in the chat, **do not** generate a PDF — write the content directly. The PDF skill is for files that need to live as files.

## How to invoke

The skill ships with a self-contained Node script at:

```
/workspace/offices/shared/skills/pdf-generator/md2pdf.js
```

Call it with two arguments — the input file and the desired output PDF path:

```bash
node /workspace/offices/shared/skills/pdf-generator/md2pdf.js <input> <output.pdf>
```

The input may be either a Markdown file (`.md`) or an HTML file (`.html`/`.htm`). The script auto-detects from the extension. Markdown is converted to HTML internally using a built-in CommonMark-subset converter (headings, paragraphs, **bold**, *italic*, `code`, code blocks, lists, links, tables, blockquotes, horizontal rules).

## Standard workflow

1. **Compose the content** as Markdown — it is the easiest format and produces good PDFs out of the box.
2. **Write it to a temporary file**, e.g. `/tmp/report.md`.
3. **Run the script** to produce the PDF directly inside `/workspace/reports/` (the office reports directory — see the *Output location* section below).
4. **Tell the user** the file is available on the dashboard's *Reports* page.

```bash
# Example
cat > /tmp/competitive-analysis.md <<'EOF'
# Competitive Analysis — Q2 2026

## Executive summary
...

## Top 3 competitors
| Company | Strength | Weakness |
|---------|----------|----------|
| ACME    | Brand    | Slow     |
| ...     | ...      | ...      |
EOF

node /workspace/offices/shared/skills/pdf-generator/md2pdf.js \
  /tmp/competitive-analysis.md \
  /workspace/reports/competitive-analysis-2026-04.pdf
```

The script prints `OK <output path>` on success and a clear error on failure.

## Output location

- **`/workspace/reports/<descriptive-name>.<ext>`** — **always**. This directory is mounted from the host at `data/reports/<office>/` and is **the only place** the dashboard's *Reports* page picks up files for download. Use a descriptive filename — the filename is what the user sees in the dashboard listing. Include a date or version suffix when relevant (e.g. `competitive-analysis-2026-04.pdf`).
- `/tmp/<file>` — fine for **scratch / intermediate** files (like the temporary markdown source above). Not visible to the user.
- **Never** write deliverables to `/workspace/group/`, `/workspace/extra/`, or anywhere else if you want the user to download them — those paths are not surfaced by the dashboard.

This same convention applies to any deliverable the agent produces, not just PDFs: CSVs, JSON exports, .md reports, .docx, images. If you save it to `/workspace/reports/`, it shows up in the dashboard automatically.

Files in `/workspace/reports/` are **auto-deleted after 60 days** by the dashboard's reports page on first access. Plan accordingly: anything that needs longer retention should be moved or copied elsewhere by the user.

## Styling

The script wraps the converted HTML in a print-friendly template (A4, 2cm margins, system serif body font, monospaced code blocks, GitHub-style table borders). For most reports this is enough.

If you need fully custom styling — branded colors, logos, multi-column layouts, page breaks at specific points — write **HTML directly** instead of Markdown and include `<style>` and `<img>` tags inline. The script will pass the HTML through verbatim. Use absolute file paths for images (`file:///workspace/group/logo.png`).

## Notes and limitations

- The script uses `chromium --headless --no-sandbox --print-to-pdf`. The `--no-sandbox` flag is required because the container does not have a user namespace; this is safe in our isolated container environment.
- Chromium prints some `dbus` warnings to stderr — they are harmless and the PDF still generates correctly. Ignore them.
- Output PDFs are usually 20-200 KB for short documents. Large reports with many images can grow to several MB.
- Generation typically takes 1-3 seconds for a few-page document.
- The script has zero npm dependencies — it only uses Node built-ins plus the chromium binary that ships in the container image. Nothing to install.
