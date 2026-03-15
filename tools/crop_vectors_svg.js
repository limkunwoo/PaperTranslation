// Create cropped SVG files from full-page SVGs by adjusting viewBox
// This preserves vector quality (infinite resolution) from the original PDF

const fs = require("fs");
const path = require("path");

const imagesDir = path.resolve(__dirname, "../images");

function cropSvg(sourceFile, viewBoxRegion, outputFile) {
  const inputPath = path.join(imagesDir, sourceFile);
  const outputPath = path.join(imagesDir, outputFile);

  let svg = fs.readFileSync(inputPath, "utf-8");

  // Replace the viewBox and width/height in the root <svg> element
  const { x, y, w, h } = viewBoxRegion;

  // Replace viewBox="0 0 612 792" with our cropped region
  svg = svg.replace(
    /viewBox="[^"]*"/,
    `viewBox="${x} ${y} ${w} ${h}"`
  );

  // Replace width and height to match aspect ratio (use pt units for clarity)
  svg = svg.replace(/width="[^"]*"/, `width="${w}pt"`);
  svg = svg.replace(/height="[^"]*"/, `height="${h}pt"`);

  fs.writeFileSync(outputPath, svg, "utf-8");

  const stat = fs.statSync(outputPath);
  console.log(
    `${outputFile}: viewBox(${x}, ${y}, ${w}, ${h}) → ${(stat.size / 1024).toFixed(1)} KB`
  );
}

// PDF coordinate system: 0,0 is bottom-left, but pdftocairo SVG uses top-left origin
// The SVG viewBox "0 0 612 792" maps to the full page (612pt × 792pt)
//
// From the 3x rendered images (1836×2376 pixels), convert pixel coords to PDF points:
//   pt_x = pixel_x / 3
//   pt_y = pixel_y / 3

// === Figure 2: Distance constraint projection (page 4, right column upper area) ===
// 3x pixels: left=960, top=100, width=850, height=250
// PDF points: left≈320, top≈33, width≈283, height≈83
// Extended left and bottom to fix bottom-left clipping
cropSvg("page_4.svg", { x: 280, y: 10, w: 325, h: 130 }, "fig_2_vector.svg");

// === Figure 4: Bending constraint (page 6, left side) ===
// 3x pixels: left=50, top=40, width=860, height=400
// PDF points: left≈17, top≈13, width≈287, height≈133
cropSvg("page_6.svg", { x: 10, y: 13, w: 300, h: 140 }, "fig_4_vector.svg");

// === Figure 5: Self-collision constraint (page 6, right side) ===
// 3x pixels: left=890, top=40, width=920, height=400
// PDF points: left≈297, top≈13, width≈307, height≈133
cropSvg("page_6.svg", { x: 293, y: 13, w: 315, h: 130 }, "fig_5_vector.svg");

console.log("\nDone! SVG vector figures created.");
console.log("These preserve original vector quality from the PDF.");
