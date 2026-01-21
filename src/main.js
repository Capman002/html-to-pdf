import "./style.css";

// Setup basic app structure
document.querySelector("#app").innerHTML = `
  <div class="converter-card" id="main-card">
    <div class="main-grid">
        <!-- Left Column: Editor -->
        <div class="editor-column">
            <div class="input-container">
                <textarea id="html-input" spellcheck="false" placeholder="<!-- Type your HTML here -->"></textarea>
            </div>
            
            <div class="controls-row">
                <div class="input-group">
                    <select id="quality-select" class="select-input">
                        <option value="1">Standard (1x)</option>
                        <option value="2">High (2x)</option>
                        <option value="4" selected>Ultra (4x)</option>
                    </select>
                </div>
                <button id="preview-btn" class="btn-convert">
                <span>Export PDF</span>
                </button>
            </div>
        </div>

        <!-- Right Column: Live Preview with Pan/Zoom -->
        <div class="preview-column" style="position: relative;">
            <div class="live-preview-viewport" id="viewport">
                <div class="live-preview-content" id="pan-container">
                    <iframe id="live-preview-frame" title="Live Preview" scrolling="no"></iframe>
                </div>
            </div>

            <div class="preview-toolbar">
                <button id="zoom-out" class="tool-btn" title="Zoom Out">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </button>
                <span id="zoom-level">100%</span>
                <button id="zoom-in" class="tool-btn" title="Zoom In">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </button>
                <div class="toolbar-divider"></div>
                <button id="reset-view" class="tool-btn" title="Reset View">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>
                </button>
            </div>
        </div>
    </div>
  </div>
`;

// Inject Portals (Modal & Render Container) directly into body
const portalHtml = `
  <!-- Loading Overlay -->
  <div id="generation-loader">
    <div class="loader-spinner"></div>
    <p>Gerando PDF (Playwright)...</p>
  </div>

  <!-- Modal -->
  <div class="modal-overlay" id="modal-overlay">
    <div class="modal-content">
      <div class="modal-header">
        <div style="display: flex; gap: 1rem; align-items: center;">
            <button class="modal-close" id="modal-close" style="padding-left: 0;">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            </button>
            <span class="modal-title">Document Preview</span>
        </div>
      </div>
      <iframe class="pdf-preview-frame" id="pdf-frame"></iframe>
      <div class="modal-footer">
        <button class="btn-secondary" id="modal-cancel">Edit</button>
        <button class="btn-primary" id="modal-download">Download PDF</button>
      </div>
    </div>
  </div>
`;

document.getElementById("modal-overlay")?.remove();
document.body.insertAdjacentHTML("beforeend", portalHtml);

// Elements
const previewBtn = document.getElementById("preview-btn");
const htmlInput = document.getElementById("html-input");
const modalOverlay = document.getElementById("modal-overlay");
const modalClose = document.getElementById("modal-close");
const modalCancel = document.getElementById("modal-cancel");
const modalDownload = document.getElementById("modal-download");
const pdfFrame = document.getElementById("pdf-frame");
const mainCard = document.getElementById("main-card");
const generationLoader = document.getElementById("generation-loader");
const livePreviewFrame = document.getElementById("live-preview-frame");

// Zoom Logic (No Panning)
let zoom = 1;

const viewport = document.getElementById("viewport");
const panContainer = document.getElementById("pan-container"); // Now acts as the scaled wrapper
const zoomLevelEl = document.getElementById("zoom-level");

const updatedTransform = () => {
  // Only scale, transform origin is top-center in CSS
  // Using style transform on the content container
  const documentSheet = document.getElementById("pan-container");
  documentSheet.style.transform = `scale(${zoom})`;
  zoomLevelEl.textContent = `${Math.round(zoom * 100)}%`;
};

document.getElementById("zoom-in").addEventListener("click", () => {
  zoom = Math.min(zoom + 0.1, 2.5);
  updatedTransform();
});

document.getElementById("zoom-out").addEventListener("click", () => {
  zoom = Math.max(zoom - 0.1, 0.5);
  updatedTransform();
});

document.getElementById("reset-view").addEventListener("click", () => {
  zoom = 1;
  updatedTransform();
});

// Wheel Scaling (Ctrl + Scroll)
viewport.addEventListener("wheel", (e) => {
  if (e.ctrlKey) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    zoom = Math.min(Math.max(zoom + delta, 0.5), 2.5);
    updatedTransform();
  }
});

// Live Preview Logic
const updateLivePreview = () => {
  const val =
    htmlInput.value ||
    "<div style='font-family: sans-serif; padding: 40px; text-align: center; color: #555;'><h1>Start Typing...</h1></div>";
  const doc = livePreviewFrame.contentWindow.document;

  // Auto-scale to fit width first time or on resize
  // We can just rely on the CSS 'width: 210mm' which is physical.
  // If the logical viewport is smaller, we can scale it down if desired, but
  // the Pan/Zoom interface is designed to handle this.
  // However, to prevent "breaking", we ensure the iframe has no Scrollbars.

  doc.open();
  doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
        <style>
            body { 
                margin: 0 !important; 
                padding: 0 !important; 
                background: white; 
                width: 100%;
                min-height: 100%;
                height: auto;
                box-sizing: border-box;
                overflow: visible;
            }
            /* Robust scaling for huge content */
            img, svg, canvas { max-width: 100%; height: auto; }
            * { box-sizing: border-box; }
        </style>
        </head>
        <body>
            ${val}
        </body>
        </html>
    `);
  doc.close();

  // Resize iframe to fit content height
  const resizeObserver = new ResizeObserver((entries) => {
    for (let entry of entries) {
      const h = entry.contentRect.height;
      // Ensure min height A4
      livePreviewFrame.style.height = Math.max(h, 1123) + "px"; // 297mm in px approx
    }
  });

  // We need to observe the BODY inside the iframe
  // Wait for load
  livePreviewFrame.onload = () => {
    const body = livePreviewFrame.contentWindow.document.body;
    // Initial set
    livePreviewFrame.style.height = Math.max(body.scrollHeight, 1123) + "px";
    resizeObserver.observe(body);
  };
  // Trigger if already loaded
  if (livePreviewFrame.contentDocument.readyState === "complete") {
    livePreviewFrame.onload();
  }
};

// Initial Auto-Fit Logic
window.addEventListener("load", () => {
  // Center the A4 sheet initially
  const vpW = viewport.clientWidth;
  const vpH = viewport.clientHeight;
  // A4 width in pixels approx 794px
  const a4W = 794;

  // If viewport is smaller than A4, zoom out to fit
  if (vpW < a4W + 40) {
    zoom = (vpW - 60) / a4W;
  } else {
    zoom = 0.8; // default slight zoom out for overview
  }

  // Center logic
  translateX = 0;
  translateY = 0;
  updatedTransform();

  setTimeout(updateLivePreview, 100);
});

htmlInput.addEventListener("input", updateLivePreview);

// State
let currentPdfBlob = null;

// Helpers
const showLoader = () => {
  generationLoader.classList.add("active");
};

const hideLoader = () => {
  generationLoader.classList.remove("active");
};

const showModal = () => {
  modalOverlay.classList.add("active");
  mainCard.style.opacity = "0";
};

const hideModal = () => {
  modalOverlay.classList.remove("active");
  mainCard.style.opacity = "1";
  if (pdfFrame.src) {
    URL.revokeObjectURL(pdfFrame.src);
    pdfFrame.src = "";
  }
  currentPdfBlob = null;
};

// Event Listeners
previewBtn.addEventListener("click", async () => {
  let content = htmlInput.value.trim();

  if (!content) {
    content =
      "<div style='font-family: sans-serif; padding: 20px;'><h1>Hello World</h1><p>Test document.</p></div>";
  }

  // Loading state
  const originalText = previewBtn.innerHTML;
  previewBtn.textContent = "Generating...";
  previewBtn.disabled = true;

  showLoader();

  try {
    // Prepare content with scripts to disable animations and ensure print styles
    const setupScript = `
        <script>
            window.Chart = window.Chart || {};
            window.Chart.defaults = window.Chart.defaults || {};
            window.Chart.defaults.animation = false;
            window.Chart.defaults.animations = false;
            window.Chart.defaults.responsive = false;
            window.Chart.defaults.maintainAspectRatio = false;
        </script>
        <style>
            html, body {
                margin: 0 !important;
                padding: 0 !important;
                background: white !important;
                -webkit-print-color-adjust: exact !important;
            }
        </style>
    `;

    let finalContent = content;
    if (!finalContent.toLowerCase().includes("<!doctype")) {
      finalContent = "<!DOCTYPE html>" + finalContent;
    }

    if (finalContent.includes("<head>")) {
      finalContent = finalContent.replace("<head>", "<head>" + setupScript);
    } else {
      finalContent = setupScript + finalContent;
    }

    // Read user selected scale
    const scaleSelect = document.getElementById("quality-select");
    const scale = scaleSelect ? parseInt(scaleSelect.value) : 2;

    // Call Backend API
    const response = await fetch("/api/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: finalContent, scale: scale }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Server error details:", errorText);
      throw new Error(`Server returned ${response.status}: ${errorText}`);
    }

    const blob = await response.blob();
    currentPdfBlob = blob;

    // Create URL for preview
    const blobUrl = URL.createObjectURL(blob) + "#zoom=50";
    pdfFrame.src = blobUrl;

    showModal();
    hideLoader();
  } catch (error) {
    console.error("Preview failed:", error);
    alert(`Failed to generate preview: ${error.message}`);
    hideLoader();
  } finally {
    previewBtn.innerHTML = originalText;
    previewBtn.disabled = false;
  }
});

// Download Handler
modalDownload.addEventListener("click", () => {
  if (currentPdfBlob) {
    const url = URL.createObjectURL(currentPdfBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "document.pdf";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    // hideModal(); // Kept open as requested
  }
});

modalClose.addEventListener("click", hideModal);
modalCancel.addEventListener("click", hideModal);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modalOverlay.classList.contains("active")) {
    hideModal();
  }
});
