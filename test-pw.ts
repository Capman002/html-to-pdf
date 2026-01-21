import { chromium } from "playwright";

console.log("--- TEST START ---");
try {
  console.log("Attempting to launch Chromium...");
  const start = Date.now();
  const browser = await chromium.launch({
    headless: true,
    // Add logging to seeing if internal stdout helps
    logger: {
      isEnabled: () => true,
      log: (name, severity, message) => console.log(`[PW] ${name}: ${message}`),
    },
  });
  console.log(`Chromium launched in ${Date.now() - start}ms`);

  const page = await browser.newPage();
  console.log("Page created");

  await browser.close();
  console.log("Browser closed");
  console.log("--- TEST PASS ---");
} catch (err) {
  console.error("--- TEST FAILED ---");
  console.error(err);
}
