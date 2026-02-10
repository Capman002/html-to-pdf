import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

// ─── Configuração ───────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const DIST_DIR = path.resolve(__dirname, "../dist");

// ─── MIME types para static serving ─────────────────────────
const MIME_MAP = /** @type {Record<string, string>} */ ({
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
});

// ─── Geração de PDF (lógica isolada — SRP) ──────────────────
async function generatePdf(html, scale = 2) {
  // CSS overrides para paginação segura
  // NÃO sobrescrever @page margins — elas são controladas pelo page.pdf()
  const pdfOverrides = `<style id="pdf-engine-overrides">
    h1, h2, h3, h4, h5, h6 {
      break-after: avoid !important;
      page-break-after: avoid !important;
    }
    pre, table, figure, blockquote {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }
  </style>`;

  // Injetar overrides no <head> ou antes do <body>
  let processedHtml = html;
  if (processedHtml.includes("</head>")) {
    processedHtml = processedHtml.replace("</head>", pdfOverrides + "</head>");
  } else if (processedHtml.includes("<body")) {
    processedHtml = processedHtml.replace("<body", pdfOverrides + "<body");
  } else {
    processedHtml = pdfOverrides + processedHtml;
  }

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  });

  try {
    const context = await browser.newContext({
      deviceScaleFactor: scale,
      viewport: { width: 794, height: 1123 },
    });
    const page = await context.newPage();

    // 1. Carregar HTML e esperar recursos externos (fonts, CSS, imagens)
    await page.setContent(processedHtml, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });

    // 2. Aguardar API de Fonts (Google Fonts, Adobe, etc.)
    await page.evaluate(() => document.fonts.ready);

    // 3. Aguardar imagens pendentes
    await page.evaluate(() =>
      Promise.all(
        Array.from(document.images)
          .filter((img) => !img.complete)
          .map(
            (img) =>
              new Promise((resolve) => {
                img.onload = img.onerror = resolve;
              }),
          ),
      ),
    );

    // 4. Ativar @media print e neutralizar position:fixed
    //    EXCETO .footer — precisa manter fixed para repetir em todas as páginas
    await page.emulateMedia({ media: "print" });
    await page.evaluate(() => {
      document.querySelectorAll("*").forEach((el) => {
        if (el instanceof HTMLElement) {
          const isFooter = el.classList.contains("footer");
          if (window.getComputedStyle(el).position === "fixed" && !isFooter) {
            el.style.setProperty("position", "relative", "important");
          }
        }
      });
    });

    // 5. Buffer para CSS complexo (grids, pseudo-elements)
    await page.waitForTimeout(500);

    // 6. Gerar PDF com margens que acomodam o footer fixo
    return await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "15mm", right: "15mm", bottom: "25mm", left: "15mm" },
    });
  } finally {
    await browser.close();
  }
}

// ─── Static File Serving ────────────────────────────────────
function serveStatic(req, res) {
  const requestPath = req.url === "/" ? "/index.html" : req.url;
  const filePath = path.join(DIST_DIR, requestPath);

  // Segurança: prevenir directory traversal
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME_MAP[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === "ENOENT") {
        // SPA fallback
        fs.readFile(path.join(DIST_DIR, "index.html"), (fallbackErr, html) => {
          if (fallbackErr) {
            res.writeHead(404);
            res.end("Not Found — execute 'npm run build' primeiro.");
          } else {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(html, "utf-8");
          }
        });
      } else {
        res.writeHead(500);
        res.end("Internal Server Error");
      }
    } else {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content, "utf-8");
    }
  });
}

// ─── Servidor HTTP ──────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // ── API: Geração de PDF ─────────────────────────────────
  if (req.url === "/api/pdf" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk.toString()));
    req.on("end", async () => {
      try {
        const { html, scale = 2 } = JSON.parse(body);

        if (!html) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "HTML is required" }));
          return;
        }

        console.log(`[PDF] Gerando (${html.length} chars, scale: ${scale})...`);
        const start = Date.now();

        const pdfBuffer = await generatePdf(html, scale);

        console.log(
          `[PDF] Concluído em ${Date.now() - start}ms (${pdfBuffer.length} bytes)`,
        );

        res.writeHead(200, {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'inline; filename="document.pdf"',
        });
        res.end(pdfBuffer);
      } catch (error) {
        console.error("[PDF] Erro:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Falha ao gerar PDF",
            details: String(error),
          }),
        );
      }
    });
    return;
  }

  // ── Static: Serve o build do Vite (dist/) ───────────────
  if (req.method === "GET") {
    serveStatic(req, res);
  } else {
    res.writeHead(404);
    res.end("Not Found");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`🚀 PDF Server rodando em http://${HOST}:${PORT}`);
});
