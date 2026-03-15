// extract.js — Extract text and raster images from a PDF
// Usage: node extract.js <input.pdf> <output_dir>
const fs = require("fs");
const path = require("path");
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

const PDF_PATH = process.argv[2] ? path.resolve(process.argv[2]) : null;
const OUTPUT_DIR = process.argv[3] ? path.resolve(process.argv[3]) : null;
if (!PDF_PATH || !OUTPUT_DIR) {
  console.error("Usage: node extract.js <input.pdf> <output_dir>");
  process.exit(1);
}
const IMAGES_DIR = path.resolve(OUTPUT_DIR, "images");
const TEXT_OUTPUT = path.resolve(OUTPUT_DIR, "extracted_text.json");

async function extractText(doc) {
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const items = textContent.items.map((item) => ({
      text: item.str,
      x: item.transform[4],
      y: item.transform[5],
      fontSize: Math.round(item.transform[0] * 100) / 100,
      fontName: item.fontName || "",
    }));
    pages.push({ pageNum: i, items });
  }
  return pages;
}

async function extractImages(doc) {
  const sharp = require("sharp");
  let imageCount = 0;

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const ops = await page.getOperatorList();

    for (let j = 0; j < ops.fnArray.length; j++) {
      if (
        ops.fnArray[j] === pdfjsLib.OPS.paintImageXObject ||
        ops.fnArray[j] === pdfjsLib.OPS.paintJpegXObject
      ) {
        const imgName = ops.argsArray[j][0];
        try {
          const img = await page.objs.get(imgName);
          if (!img || !img.data) continue;

          imageCount++;
          const width = img.width;
          const height = img.height;
          const data = img.data;

          // pdfjs returns RGBA data
          let channels = 4;
          let rawData = Buffer.from(data);

          // If data length matches RGB (3 channels)
          if (data.length === width * height * 3) {
            channels = 3;
          } else if (data.length === width * height * 1) {
            channels = 1;
          }

          const outputPath = path.join(
            IMAGES_DIR,
            `fig_${imageCount}_page${i}.png`
          );
          await sharp(rawData, {
            raw: { width, height, channels },
          })
            .png()
            .toFile(outputPath);

          console.log(
            `Image ${imageCount}: page ${i}, ${width}x${height}, channels=${channels} -> ${path.basename(outputPath)}`
          );
        } catch (e) {
          console.error(`Failed to extract image ${imgName} on page ${i}:`, e.message);
        }
      }
    }
  }
  return imageCount;
}

async function main() {
  console.log("Loading PDF:", PDF_PATH);
  const data = new Uint8Array(fs.readFileSync(PDF_PATH));
  const doc = await pdfjsLib.getDocument({ data, verbosity: 0 }).promise;
  console.log(`Pages: ${doc.numPages}`);

  // Extract text
  console.log("\n--- Extracting text ---");
  const pages = await extractText(doc);
  fs.writeFileSync(TEXT_OUTPUT, JSON.stringify(pages, null, 2), "utf-8");
  console.log(`Text saved to: ${TEXT_OUTPUT}`);

  // Print text preview per page
  for (const page of pages) {
    const fullText = page.items.map((it) => it.text).join(" ");
    console.log(`\nPage ${page.pageNum} (${page.items.length} items): ${fullText.substring(0, 200)}...`);
  }

  // Extract images
  console.log("\n--- Extracting images ---");
  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
  const imgCount = await extractImages(doc);
  console.log(`\nTotal images extracted: ${imgCount}`);
}

main().catch(console.error);
