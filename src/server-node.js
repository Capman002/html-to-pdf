import http from "node:http";
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0"; // Listen on all interfaces for Docker

// Static file serving helper
const serveStatic = (req, res) => {
  // Basic mapping for vite build output
  // Assuming dist is in root, so ../dist relative to src/server-node.js
  let filePath = path.join(
    __dirname,
    "../dist",
    req.url === "/" ? "index.html" : req.url,
  );

  // Prevent directory traversal
  if (!filePath.startsWith(path.join(__dirname, "../dist"))) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const extname = path.extname(filePath);
  let contentType = "text/html";

  switch (extname) {
    case ".js":
      contentType = "text/javascript";
      break;
    case ".css":
      contentType = "text/css";
      break;
    case ".json":
      contentType = "application/json";
      break;
    case ".png":
      contentType = "image/png";
      break;
    case ".jpg":
      contentType = "image/jpg";
      break;
    case ".svg":
      contentType = "image/svg+xml";
      break;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code == "ENOENT") {
        // SPA fallback or simple 404
        fs.readFile(
          path.join(__dirname, "../dist/index.html"),
          (err, indexContent) => {
            if (err) {
              res.writeHead(404);
              res.end("404 Not Found - Build dist not present?");
            } else {
              res.writeHead(200, { "Content-Type": "text/html" });
              res.end(indexContent, "utf-8");
            }
          },
        );
      } else {
        res.writeHead(500);
        res.end("Internal Server Error: " + error.code);
      }
    } else {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content, "utf-8");
    }
  });
};

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
        var scale = 2;
        try {
          const json = JSON.parse(body);
          html = json.html;
          scale = json.scale || 2;
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
          args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
        });

        const context = await browser.newContext({
          deviceScaleFactor: scale,
          viewport: { width: 794, height: 1123 },
        });
        const page = await context.newPage();

        await page.setContent(html, {
          waitUntil: "load",
          timeout: 30000,
        });

        // Wait for all fonts to load (Google Fonts, etc.)
        await page.evaluate(() => document.fonts.ready);

        // Small extra wait for complex CSS rendering (grids, animations, etc.)
        await page.waitForTimeout(500);

        const pdfBuffer = await page.pdf({
          format: "A4",
          printBackground: true,
          preferCSSPageSize: true,
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
    // Serve frontend for all other routes
    if (req.method === "GET") {
      serveStatic(req, res);
    } else {
      res.writeHead(404);
      res.end("Not Found");
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(
    `🚀 Node.js Monolith PDF Server running at http://${HOST}:${PORT}`,
  );
});
