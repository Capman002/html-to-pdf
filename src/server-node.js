import http from "node:http";
import { chromium } from "playwright";

const PORT = 3000;
const HOST = "127.0.0.1";

const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle Preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Only support POST /api/pdf
  if (req.url === "/api/pdf" && req.method === "POST") {
    console.log("[Node Server] Request received: POST /api/pdf");

    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", async () => {
      try {
        let html;
        try {
          const json = JSON.parse(body);
          html = json.html;
          var scale = json.scale || 2;
        } catch (e) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid JSON" }));
          return;
        }

        if (!html) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "HTML is required" }));
          return;
        }

        console.log(
          `[Node Server] Launching Chromium (Content: ${html.length} chars) with Scale: ${scale}...`,
        );

        const start = Date.now();
        const browser = await chromium.launch({
          headless: true,
          args: ["--no-sandbox"],
        });

        const context = await browser.newContext({
          deviceScaleFactor: scale,
        });
        const page = await context.newPage();

        await page.setContent(html, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });

        const pdfBuffer = await page.pdf({
          format: "A4",
          printBackground: true,
          margin: { top: "0", right: "0", bottom: "0", left: "0" },
        });

        await browser.close();

        console.log(`[Node Server] PDF Generated in ${Date.now() - start}ms`);

        res.writeHead(200, {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'inline; filename="document.pdf"',
        });
        res.end(pdfBuffer);
      } catch (error) {
        console.error("[Node Server] Error:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Generation failed",
            details: error.toString(),
          }),
        );
      }
    });
  } else {
    res.writeHead(404);
    res.end("Not Found");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`🚀 Node.js PDF Server running at http://${HOST}:${PORT}`);
});
