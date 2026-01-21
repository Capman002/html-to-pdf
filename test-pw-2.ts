import { chromium } from "playwright";

console.log("--- TEST START (Edge Channel) ---");
try {
  console.log("Attempting to launch Edge...");
  const start = Date.now();
  const browser = await chromium.launch({
    headless: true,
    channel: "msedge", // Try using installed Edge
  });
  console.log(`Edge launched in ${Date.now() - start}ms`);
  await browser.close();
  console.log("--- TEST PASS ---");
} catch (err) {
  console.log("Edge failed, trying plain launch with stdio ignore...");
  try {
    const browser = await chromium.launch({
      headless: true,
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
    });
    console.log("Plain launch passed!");
    await browser.close();
  } catch (e) {
    console.error("--- TEST FAILED ---");
    console.error(e);
  }
}
