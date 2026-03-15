// Extract vector figures from source PDF as individual PDF files for Typst
const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");

const srcPdfPath = path.resolve(__dirname, "../../Position based dynamics.pdf");
const imagesDir = path.resolve(__dirname, "../images");

const SRC_PAGE_HEIGHT = 792;

// Updated Figure 2 coordinates based on analysis
// Including diagram + labels + caption
const figures = [
  {
    name: "fig_2_vector",
    srcPageIndex: 3,
    // Diagram + all labels (p1, p2, Δp1, Δp2, d, m1, m2), no caption
    // Extended left and bottom to fix bottom-left clipping
    // SVG coords: { x: 280, y: 10, w: 325, h: 130 }
    // PDF coords: left=280, right=605, bottom=792-140=652, top=792-10=782
    clip: { left: 280, bottom: 652, right: 605, top: 782 },
  },
  {
    name: "fig_4_vector",
    srcPageIndex: 5,
    // Bending constraint diagram
    clip: { left: 5, bottom: 635, right: 315, top: 783 },
  },
  {
    name: "fig_5_vector",
    srcPageIndex: 5,
    // Self-collision constraint diagram
    clip: { left: 288, bottom: 645, right: 612, top: 783 },
  },
];

async function main() {
  const srcBytes = fs.readFileSync(srcPdfPath);
  const srcDoc = await PDFDocument.load(srcBytes);

  for (const fig of figures) {
    const clip = fig.clip;
    const w = clip.right - clip.left;
    const h = clip.top - clip.bottom;

    const outDoc = await PDFDocument.create();
    const embedded = await outDoc.embedPage(srcDoc.getPage(fig.srcPageIndex), clip);
    const page = outDoc.addPage([w, h]);
    page.drawPage(embedded, { x: 0, y: 0, width: w, height: h });

    const outPath = path.join(imagesDir, `${fig.name}.pdf`);
    const outBytes = await outDoc.save();
    fs.writeFileSync(outPath, outBytes);
    console.log(`${fig.name}.pdf: ${w}x${h}pt, ${(outBytes.length / 1024).toFixed(1)}KB`);
  }
  console.log("Done!");
}

main().catch(console.error);
