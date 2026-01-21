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

      // Log content summary
      console.log(
        `[Server] Generating PDF for content length: ${html.length} chars`,
      );

      let browser;
      try {
        console.log("[Server] Launching Chromium...");
        const startTime = Date.now();

        browser = await chromium.launch({
          headless: true, // Explicitly set headless
          args: ["--no-sandbox"], // Safer for some environments (Docker/Windows quirks)
        });

        const context = await browser.newContext();
        const page = await context.newPage();

        console.log("[Server] Setting content...");
        // Use domcontentloaded for speed, networkidle can be flaky with external fonts/scripts
        await page.setContent(html, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });

        // Optional: fast check for fonts or styles if needed
        // await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => console.log('Network idle timeout skipped'));

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
