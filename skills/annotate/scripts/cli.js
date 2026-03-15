#!/usr/bin/env bun
// @bun

// src/cli.ts
import { readFile, writeFile } from "fs/promises";
import { basename, dirname, extname, join } from "path";

// src/annotate.ts
import sharp from "sharp";
var FLOW_COLORS = [
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
  "#F59E0B",
  "#10B981",
  "#06B6D4",
  "#F97316",
  "#EF4444"
];
function escapeXml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
function estimateTextWidth(text, fontSize) {
  return text.length * fontSize * 0.58;
}
function centerOf(box) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
function filterAnnotations(annotations, only) {
  if (!only || only.length === 0)
    return annotations;
  const refs = new Set(only.map((r) => r.replace(/^@/, "")));
  return annotations.filter((a) => refs.has(a.ref));
}
function renderBoxesSvg(annotations, width, height, color, labels, padding = 3, minBoxSize = 0) {
  let elements = "";
  for (const ann of annotations) {
    const { x, y, width: w, height: h } = ann.box;
    let padX = padding;
    let padY = padding;
    if (minBoxSize > 0) {
      if (w < minBoxSize)
        padX = Math.max(padding, (minBoxSize - w) / 2);
      if (h < minBoxSize)
        padY = Math.max(padding, (minBoxSize - h) / 2);
    }
    const px = x - padX;
    const py = y - padY;
    const pw = w + padX * 2;
    const ph = h + padY * 2;
    elements += `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="6"
      fill="none" stroke="${color}" stroke-width="6" opacity="0.15" />`;
    elements += `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="6"
      fill="${hexToRgba(color, 0.08)}" stroke="${color}" stroke-width="2.5" />`;
    const label = labels?.[ann.ref] ?? ann.name ?? ann.role;
    const labelText = `${ann.number}  ${escapeXml(label)}`;
    const textW = estimateTextWidth(labelText, 12);
    const labelW = textW + 16;
    const labelH = 22;
    const labelX = Math.max(0, Math.min(px, width - labelW - 4));
    const labelY = py < labelH + 8 ? py + ph + 4 : py - labelH - 4;
    elements += `<rect x="${labelX}" y="${labelY}" width="${labelW}" height="${labelH}" rx="11" fill="${color}" />`;
    elements += `<text x="${labelX + 8}" y="${labelY + 15.5}" fill="white" font-size="12" font-weight="600"
      font-family="-apple-system, BlinkMacSystemFont, system-ui, sans-serif">${labelText}</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${elements}</svg>`;
}
function closestEdge(box, imgW, imgH) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const dists = [
    { edge: "top", d: cy },
    { edge: "bottom", d: imgH - cy },
    { edge: "left", d: cx },
    { edge: "right", d: imgW - cx }
  ];
  dists.sort((a, b) => a.d - b.d);
  return dists[0].edge;
}
function resolveOverlaps(labels, minGap) {
  labels.sort((a, b) => a.pos - b.pos);
  for (let i = 1;i < labels.length; i++) {
    const prev = labels[i - 1];
    const curr = labels[i];
    const overlap = prev.pos + prev.size + minGap - curr.pos;
    if (overlap > 0) {
      curr.pos += overlap;
    }
  }
}
function renderArrowsSvg(annotations, origWidth, origHeight, color, labels) {
  const FRAME = 50;
  const LABEL_H = 28;
  const LABEL_PAD = 10;
  const totalW = origWidth + FRAME * 2;
  const totalH = origHeight + FRAME * 2;
  const shifted = annotations.map((a) => ({
    ...a,
    box: {
      x: a.box.x + FRAME,
      y: a.box.y + FRAME,
      width: a.box.width,
      height: a.box.height
    }
  }));
  const edgeGroups = {
    top: [],
    bottom: [],
    left: [],
    right: []
  };
  for (const ann of shifted) {
    const edge = closestEdge(ann.box, totalW, totalH);
    edgeGroups[edge].push(ann);
  }
  let defs = `<defs>
    <marker id="ah" markerWidth="12" markerHeight="8" refX="11" refY="4" orient="auto-start-reverse">
      <path d="M0,1 L10,4 L0,7 Z" fill="${color}" />
    </marker>
    <filter id="lbl-shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="black" flood-opacity="0.25"/>
    </filter>
  </defs>`;
  let elements = "";
  function drawLabel(ann, lx, ly, labelW, edge) {
    const center = centerOf(ann.box);
    const labelText = escapeXml(labels?.[ann.ref] ?? ann.name ?? ann.role);
    let sx, sy, ex, ey;
    switch (edge) {
      case "top":
        sx = lx + labelW / 2;
        sy = ly + LABEL_H;
        ex = center.x;
        ey = ann.box.y;
        break;
      case "bottom":
        sx = lx + labelW / 2;
        sy = ly;
        ex = center.x;
        ey = ann.box.y + ann.box.height;
        break;
      case "left":
        sx = lx + labelW;
        sy = ly + LABEL_H / 2;
        ex = ann.box.x;
        ey = center.y;
        break;
      case "right":
        sx = lx;
        sy = ly + LABEL_H / 2;
        ex = ann.box.x + ann.box.width;
        ey = center.y;
        break;
    }
    elements += `<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}"
      stroke="${color}" stroke-width="1.5" marker-end="url(#ah)" opacity="0.7"/>`;
    elements += `<g filter="url(#lbl-shadow)">
      <rect x="${lx}" y="${ly}" width="${labelW}" height="${LABEL_H}" rx="6" fill="${color}" />
      <text x="${lx + 10}" y="${ly + 18.5}" fill="white" font-size="12" font-weight="600"
        font-family="-apple-system, BlinkMacSystemFont, system-ui, sans-serif">${labelText}</text>
    </g>`;
  }
  if (edgeGroups.top.length > 0) {
    const items = edgeGroups.top.map((ann, i) => {
      const label = labels?.[ann.ref] ?? ann.name ?? ann.role;
      const w = estimateTextWidth(label, 12) + 20;
      return { ann, labelW: w, pos: ann.box.x + ann.box.width / 2 - w / 2, size: w, idx: i };
    });
    resolveOverlaps(items, 8);
    for (const item of items) {
      const lx = Math.max(4, Math.min(totalW - item.labelW - 4, item.pos));
      drawLabel(item.ann, lx, LABEL_PAD, item.labelW, "top");
    }
  }
  if (edgeGroups.bottom.length > 0) {
    const items = edgeGroups.bottom.map((ann, i) => {
      const label = labels?.[ann.ref] ?? ann.name ?? ann.role;
      const w = estimateTextWidth(label, 12) + 20;
      return { ann, labelW: w, pos: ann.box.x + ann.box.width / 2 - w / 2, size: w, idx: i };
    });
    resolveOverlaps(items, 8);
    for (const item of items) {
      const lx = Math.max(4, Math.min(totalW - item.labelW - 4, item.pos));
      drawLabel(item.ann, lx, totalH - FRAME + LABEL_PAD, item.labelW, "bottom");
    }
  }
  if (edgeGroups.left.length > 0) {
    const items = edgeGroups.left.map((ann, i) => {
      const label = labels?.[ann.ref] ?? ann.name ?? ann.role;
      const w = estimateTextWidth(label, 12) + 20;
      return { ann, labelW: w, pos: ann.box.y + ann.box.height / 2 - LABEL_H / 2, size: LABEL_H, idx: i };
    });
    resolveOverlaps(items, 6);
    for (const item of items) {
      const ly = Math.max(4, Math.min(totalH - LABEL_H - 4, item.pos));
      const lx = Math.max(4, FRAME / 2 - item.labelW / 2);
      drawLabel(item.ann, lx, ly, item.labelW, "left");
    }
  }
  if (edgeGroups.right.length > 0) {
    const items = edgeGroups.right.map((ann, i) => {
      const label = labels?.[ann.ref] ?? ann.name ?? ann.role;
      const w = estimateTextWidth(label, 12) + 20;
      return { ann, labelW: w, pos: ann.box.y + ann.box.height / 2 - LABEL_H / 2, size: LABEL_H, idx: i };
    });
    resolveOverlaps(items, 6);
    for (const item of items) {
      const ly = Math.max(4, Math.min(totalH - LABEL_H - 4, item.pos));
      const lx = Math.min(totalW - 4 - item.labelW, totalW - FRAME + LABEL_PAD);
      drawLabel(item.ann, lx, ly, item.labelW, "right");
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}">
    ${defs}${elements}
  </svg>`;
  return {
    svg,
    layout: {
      svgWidth: totalW,
      svgHeight: totalH,
      frameTop: FRAME,
      frameBottom: FRAME,
      frameLeft: FRAME,
      frameRight: FRAME
    }
  };
}
function renderSpotlightSvg(annotations, width, height, color, dimOpacity = 0.6, padding = 8) {
  let maskCutouts = "";
  let borders = "";
  for (const ann of annotations) {
    const { x, y, width: w, height: h } = ann.box;
    const px = x - padding;
    const py = y - padding;
    const pw = w + padding * 2;
    const ph = h + padding * 2;
    maskCutouts += `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="8" fill="black"/>`;
    borders += `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="8"
      fill="none" stroke="${color}" stroke-width="2.5" opacity="0.9"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <mask id="spot-mask">
        <rect width="${width}" height="${height}" fill="white"/>
        ${maskCutouts}
      </mask>
    </defs>
    <rect width="${width}" height="${height}" fill="black" opacity="${dimOpacity}" mask="url(#spot-mask)"/>
    ${borders}
  </svg>`;
}
function renderFlowSvg(annotations, width, height) {
  if (annotations.length === 0)
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"/>`;
  let defs = `<defs>
    <filter id="fshadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="black" flood-opacity="0.2"/>
    </filter>
  </defs>`;
  let elements = "";
  for (let i = 0;i < annotations.length; i++) {
    const ann = annotations[i];
    const color = FLOW_COLORS[i % FLOW_COLORS.length];
    const cx = ann.box.x + ann.box.width / 2;
    const cy = ann.box.y - 20;
    elements += `<rect x="${ann.box.x - 3}" y="${ann.box.y - 3}"
      width="${ann.box.width + 6}" height="${ann.box.height + 6}"
      rx="6" fill="${hexToRgba(color, 0.1)}" stroke="${color}" stroke-width="2" opacity="0.7"/>`;
    elements += `<g filter="url(#fshadow)">
      <circle cx="${cx}" cy="${cy}" r="15" fill="${color}" />
      <text x="${cx}" y="${cy + 5}" fill="white" font-size="13" font-weight="bold"
        text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, system-ui, sans-serif">${i + 1}</text>
    </g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${defs}${elements}</svg>`;
}
async function annotate(imageInput, annotations, options = { mode: "boxes" }) {
  const filtered = filterAnnotations(annotations, options.only);
  const color = options.color ?? "#3B82F6";
  const frame = options.frame ?? 0;
  let image = sharp(imageInput);
  const metadata = await image.metadata();
  let width = metadata.width;
  let height = metadata.height;
  let shiftedAnnotations = filtered;
  if (frame > 0) {
    const frameColorHex = options.frameColor ?? "#F8FAFC";
    const r = parseInt(frameColorHex.slice(1, 3), 16);
    const g = parseInt(frameColorHex.slice(3, 5), 16);
    const b = parseInt(frameColorHex.slice(5, 7), 16);
    image = sharp(await image.toBuffer()).extend({
      top: frame,
      bottom: frame,
      left: frame,
      right: frame,
      background: { r, g, b, alpha: 255 }
    });
    width += frame * 2;
    height += frame * 2;
    shiftedAnnotations = filtered.map((a) => ({
      ...a,
      box: {
        x: a.box.x + frame,
        y: a.box.y + frame,
        width: a.box.width,
        height: a.box.height
      }
    }));
  }
  let svg;
  switch (options.mode) {
    case "boxes":
      svg = renderBoxesSvg(shiftedAnnotations, width, height, color, options.labels, options.padding ?? 3, options.minBoxSize ?? 0);
      break;
    case "arrows": {
      const arrowResult = renderArrowsSvg(filtered, metadata.width, metadata.height, color, options.labels);
      const { layout } = arrowResult;
      const frameColor = options.frameColor ?? "#F8FAFC";
      const fr = parseInt(frameColor.slice(1, 3), 16);
      const fg = parseInt(frameColor.slice(3, 5), 16);
      const fb = parseInt(frameColor.slice(5, 7), 16);
      const framedImage = sharp(await sharp(imageInput).toBuffer()).extend({
        top: layout.frameTop,
        bottom: layout.frameBottom,
        left: layout.frameLeft,
        right: layout.frameRight,
        background: { r: fr, g: fg, b: fb, alpha: 255 }
      });
      return framedImage.composite([{ input: Buffer.from(arrowResult.svg), top: 0, left: 0 }]).png().toBuffer();
    }
    case "spotlight":
      svg = renderSpotlightSvg(shiftedAnnotations, width, height, color, options.dimOpacity ?? 0.6, options.padding ?? 8);
      break;
    case "flow":
      svg = renderFlowSvg(shiftedAnnotations, width, height);
      break;
    default:
      throw new Error(`Unknown mode: ${options.mode}`);
  }
  return image.composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer();
}

// src/cli.ts
var MODES = ["boxes", "arrows", "spotlight", "flow"];
function usage() {
  console.log(`
  annotate - Post-process screenshots with clean annotations

  Usage:
    annotate <image> <annotations.json> [options]
    annotate <agent-browser-output.json> [options]
    agent-browser screenshot --annotate --json | annotate [options]

  Arguments:
    image              Path to screenshot PNG/JPG
    annotations        Path to annotations JSON (or pipe via stdin)

  When a single JSON file (or stdin) contains both "path" and "annotations"
  fields (the format from agent-browser screenshot --annotate --json), the
  image path is extracted automatically.

  Options:
    -m, --mode <mode>          Mode: boxes|arrows|spotlight|flow (default: boxes)
    -o, --output <path>        Output path (default: <image>-annotated.png)
    --only <refs...>           Only annotate specific refs (e.g., e1 e5 @e12)
    --label <ref=text>         Custom label (repeatable, e.g., --label e3="Click here")
    --color <hex>              Primary color (default: #3B82F6)
    --padding <px>             Box padding (default: 3)
    --min-box-size <px>        Minimum annotation box size for small elements
    --dim-opacity <0-1>        Spotlight dim opacity (default: 0.6)
    --frame <px>               Frame around image (default: 0, auto for arrows)
    --frame-color <hex>        Frame color (default: #F8FAFC)
    -h, --help                 Show this help

  Examples:
    # Standalone
    annotate screenshot.png annotations.json --mode boxes
    annotate screenshot.png annotations.json --mode arrows --only e6 e11 --label e6="Start here"
    annotate screenshot.png annotations.json --mode spotlight --only e13 e14 e15 --color "#10B981"
    annotate screenshot.png annotations.json --mode flow --only e6 e7 e11 e19 --frame 40

    # From agent-browser (pipe)
    agent-browser screenshot --annotate --json | annotate --mode boxes -o annotated.png
    agent-browser screenshot --annotate --json | annotate --mode spotlight --only e1 e5
    agent-browser screenshot --annotate --json | annotate --mode arrows --label e3="Click here"

    # From agent-browser (file)
    agent-browser screenshot --annotate --json > shot.json
    annotate shot.json --mode flow --only e1 e3 e7 --frame 40
`);
}
function parseArgs(argv) {
  const args = argv.slice(2);
  const positional = [];
  let outputPath = null;
  let mode = "boxes";
  const only = [];
  const labels = {};
  let color;
  let padding;
  let minBoxSize;
  let dimOpacity;
  let frame;
  let frameColor;
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "-h" || arg === "--help") {
      usage();
      process.exit(0);
    } else if (arg === "-m" || arg === "--mode") {
      i++;
      const val = args[i];
      if (!MODES.includes(val)) {
        console.error(`Invalid mode: ${val}. Must be one of: ${MODES.join(", ")}`);
        process.exit(1);
      }
      mode = val;
    } else if (arg === "-o" || arg === "--output") {
      i++;
      outputPath = args[i];
    } else if (arg === "--only") {
      i++;
      while (i < args.length && !args[i].startsWith("-")) {
        only.push(args[i].replace(/^@/, ""));
        i++;
      }
      continue;
    } else if (arg === "--label") {
      i++;
      const val = args[i];
      const eqIdx = val.indexOf("=");
      if (eqIdx === -1) {
        console.error(`Invalid --label format: ${val}. Use --label ref=text`);
        process.exit(1);
      }
      labels[val.slice(0, eqIdx).replace(/^@/, "")] = val.slice(eqIdx + 1);
    } else if (arg === "--color") {
      i++;
      color = args[i];
    } else if (arg === "--padding") {
      i++;
      padding = parseInt(args[i], 10);
    } else if (arg === "--min-box-size") {
      i++;
      minBoxSize = parseInt(args[i], 10);
    } else if (arg === "--dim-opacity") {
      i++;
      dimOpacity = parseFloat(args[i]);
    } else if (arg === "--frame") {
      i++;
      frame = parseInt(args[i], 10);
    } else if (arg === "--frame-color") {
      i++;
      frameColor = args[i];
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    } else {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    }
    i++;
  }
  const options = { mode };
  if (only.length > 0)
    options.only = only;
  if (Object.keys(labels).length > 0)
    options.labels = labels;
  if (color !== undefined)
    options.color = color;
  if (padding !== undefined)
    options.padding = padding;
  if (minBoxSize !== undefined)
    options.minBoxSize = minBoxSize;
  if (dimOpacity !== undefined)
    options.dimOpacity = dimOpacity;
  if (frame !== undefined)
    options.frame = frame;
  if (frameColor !== undefined)
    options.frameColor = frameColor;
  return { positional, options, outputPath };
}
async function readRawJson(source) {
  if (source) {
    return readFile(source, "utf-8");
  }
  const chunks = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}
function parseAnnotations(parsed) {
  const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed.annotations) ? parsed.annotations : (() => {
    throw new Error("Annotations must be an array or {annotations: [...]}");
  })();
  return arr.map((item, idx) => {
    if (!item.ref || item.number === undefined || !item.box) {
      throw new Error(`Invalid annotation at index ${idx}: must have ref, number, and box fields`);
    }
    return {
      ref: String(item.ref),
      number: Number(item.number),
      role: String(item.role ?? "element"),
      name: item.name ? String(item.name) : undefined,
      box: {
        x: Number(item.box.x),
        y: Number(item.box.y),
        width: Number(item.box.width),
        height: Number(item.box.height)
      }
    };
  });
}
function defaultOutputPath(imagePath) {
  const dir = dirname(imagePath);
  const ext = extname(imagePath);
  const name = basename(imagePath, ext);
  return join(dir, `${name}-annotated.png`);
}
async function main() {
  const { positional, options, outputPath } = parseArgs(process.argv);
  let imagePath;
  let annotations;
  if (positional.length === 2) {
    imagePath = positional[0];
    const raw = await readRawJson(positional[1]);
    const parsed = JSON.parse(raw);
    annotations = parseAnnotations(parsed);
  } else if (positional.length === 1) {
    const arg = positional[0];
    if (arg.endsWith(".json")) {
      const raw = await readRawJson(arg);
      const parsed = JSON.parse(raw);
      if (parsed.path && parsed.annotations) {
        imagePath = parsed.path;
        annotations = parseAnnotations(parsed);
      } else {
        console.error("JSON file must contain both 'path' and 'annotations' fields, or pass image as first arg.");
        process.exit(1);
      }
    } else {
      imagePath = arg;
      const raw = await readRawJson(null);
      const parsed = JSON.parse(raw);
      if (parsed.path && parsed.annotations) {
        annotations = parseAnnotations(parsed);
      } else {
        annotations = parseAnnotations(parsed);
      }
    }
  } else if (positional.length === 0) {
    const raw = await readRawJson(null);
    const parsed = JSON.parse(raw);
    if (parsed.path && parsed.annotations) {
      imagePath = parsed.path;
      annotations = parseAnnotations(parsed);
    } else {
      console.error("When piping via stdin, input must contain both 'path' and 'annotations' fields.");
      console.error("Example: agent-browser screenshot --annotate --json | annotate --mode boxes");
      process.exit(1);
    }
  } else {
    console.error("Too many arguments. Expected: annotate [image] [annotations.json]");
    process.exit(1);
  }
  if (!imagePath) {
    console.error("No image path. Pass as first argument or use agent-browser JSON output.");
    process.exit(1);
  }
  try {
    await readFile(imagePath);
  } catch {
    console.error(`Cannot read image: ${imagePath}`);
    process.exit(1);
  }
  if (annotations.length === 0) {
    console.error("No annotations found");
    process.exit(1);
  }
  const result = await annotate(imagePath, annotations, options);
  const outPath = outputPath ?? defaultOutputPath(imagePath);
  await writeFile(outPath, result);
  console.log(outPath);
}
main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
