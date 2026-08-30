export function printManuscript(title: string, html: string): void {
  const win = window.open("", "_blank", "noopener,noreferrer");
  if (win === null) return;
  const safeTitle = title.replace(/</g, "");
  win.document.write(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${safeTitle}</title>
  <style>
    body {
      margin: 2.4rem auto;
      max-width: 38em;
      font-family: Palatino, "Iowan Old Style", "Songti SC", "Noto Serif SC", serif;
      font-size: 16px;
      line-height: 1.85;
      color: #111;
    }
    h1, h2, h3 { font-weight: 650; line-height: 1.35; }
    img { max-width: 100%; }
    hr { border: none; border-top: 1px solid #ccc; margin: 1.6em 0; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
${html}
</body>
</html>`);
  win.document.close();
  win.focus();
  win.print();
}
