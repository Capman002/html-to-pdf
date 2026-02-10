import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { chromium } from "playwright";

const app = new Elysia()
  .use(
    cors({
      origin: true, // Allow all origins (or reflection) specifically for development
      methods: ["GET", "POST", "OPTIONS"],
    }),
  )
  .onRequest(({ request }) => {
    console.log(
      `[Global Log] Incoming ${request.method} request to: ${request.url}`,
    );
  })
  .post(
    "/api/pdf",
    async ({ body, set }) => {
      console.log("[Server] Handler triggered for /api/pdf");
      // ... rest of handler
      console.log("[Server] Request received for /api/pdf via POST");

      // Validate Body
      const { html } = body;
      if (!html) {
        console.warn("[Server] Missing HTML content in body");
        set.status = 400;
        return { error: "HTML content is required" };
      }

      // Inject PDF-safe CSS overrides into the HTML
      const pdfOverrides = `<style id="pdf-engine-overrides">
        @page { margin: 0 !important; }
        h1, h2, h3, h4, h5, h6 {
          break-after: avoid !important;
          page-break-after: avoid !important;
        }
        pre, table, figure, blockquote {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
      </style>`;

      let processedHtml = html;
      if (processedHtml.includes("</head>")) {
        processedHtml = processedHtml.replace("</head>", pdfOverrides + "</head>");
      } else if (processedHtml.includes("<body")) {
        processedHtml = processedHtml.replace("<body", pdfOverrides + "<body");
      } else {
        processedHtml = pdfOverrides + processedHtml;
      }

      // Log content summary
      console.log(
        `[Server] Generating PDF for content length: ${processedHtml.length} chars`,
      );

      let browser;
      try {
        console.log("[Server] Launching Chromium...");
        const startTime = Date.now();

        browser = await chromium.launch({
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
        });

        const context = await browser.newContext({
          deviceScaleFactor: 2,
          viewport: { width: 794, height: 1123 },
        });
        const page = await context.newPage();

        console.log("[Server] Setting content...");
        await page.setContent(processedHtml, {
          waitUntil: "networkidle",
          timeout: 30000,
        });

        // Wait for all fonts to load (Google Fonts, Adobe, etc.)
        await page.evaluate(() => document.fonts.ready);

        // Wait for images
        await page.evaluate(() => {
          return Promise.all(
            Array.from(document.images)
              .filter((img) => !img.complete)
              .map(
                (img) =>
                  new Promise((resolve) => {
                    img.onload = img.onerror = resolve;
                  }),
              ),
          );
        });

        // Switch to print media to detect @media print styles, then neutralize position:fixed
        await page.emulateMedia({ media: "print" });
        await page.evaluate(() => {
          document.querySelectorAll("*").forEach((el) => {
            if (window.getComputedStyle(el).position === "fixed") {
              el.style.setProperty("position", "relative", "important");
            }
          });
        });

        // Buffer for complex CSS rendering
        await page.waitForTimeout(500);

        console.log("[Server] Printing PDF...");
        const pdfBuffer = await page.pdf({
          format: "A4",
          printBackground: true,
          margin: { top: "0", right: "0", bottom: "0", left: "0" },
        });

        console.log(
          `[Server] PDF Generated in ${Date.now() - startTime}ms. Size: ${pdfBuffer.length} bytes`,
        );

        await browser.close();
        browser = null;

        set.headers["Content-Type"] = "application/pdf";
        set.headers["Content-Disposition"] = 'inline; filename="document.pdf"';

        return new Response(pdfBuffer as any);
      } catch (error) {
        console.error("[Server] CRITICAL PDF Generation Error:", error);
        if (browser) {
          await browser
            .close()
            .catch((err) => console.error("Error closing browser:", err));
        }
        set.status = 500;
        return { error: "Failed to generate PDF", details: String(error) };
      }
    },
    {
      body: t.Object({
        html: t.String(),
      }),
    },
  )
  .listen({
    port: 3000,
    hostname: "127.0.0.1",
  });

console.log(
  `🦊 Elysia PDF Service running at http://${app.server?.hostname}:${app.server?.port}`,
);
console.log("Ready to accept connections on 127.0.0.1...");
