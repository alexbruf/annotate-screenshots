import sharp from "sharp";
import type { Annotation, AnnotateOptions, AnnotationBox } from "./types";

const FLOW_COLORS = [
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
  "#F59E0B",
  "#10B981",
  "#06B6D4",
  "#F97316",
  "#EF4444",
];

// ── Utilities ───────────────────────────────────────────────────────────

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.58;
}

function centerOf(box: AnnotationBox): { x: number; y: number } {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function filterAnnotations(
  annotations: Annotation[],
  only?: string[]
): Annotation[] {
  if (!only || only.length === 0) return annotations;
  const refs = new Set(only.map((r) => r.replace(/^@/, "")));
  return annotations.filter((a) => refs.has(a.ref));
}

// ── Collision detection ─────────────────────────────────────────────────

interface PlacedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function rectsOverlap(a: PlacedRect, b: PlacedRect): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

// ── Boxes mode ──────────────────────────────────────────────────────────

function renderBoxesSvg(
  annotations: Annotation[],
  width: number,
  height: number,
  color: string,
  labels?: Record<string, string>,
  padding: number = 3,
  minBoxSize: number = 0
): string {
  let elements = "";

  for (const ann of annotations) {
    const { x, y, width: w, height: h } = ann.box;
    // If element is smaller than minBoxSize, pad it up to that size
    let padX = padding;
    let padY = padding;
    if (minBoxSize > 0) {
      if (w < minBoxSize) padX = Math.max(padding, (minBoxSize - w) / 2);
      if (h < minBoxSize) padY = Math.max(padding, (minBoxSize - h) / 2);
    }
    const px = x - padX;
    const py = y - padY;
    const pw = w + padX * 2;
    const ph = h + padY * 2;

    // Glow
    elements += `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="6"
      fill="none" stroke="${color}" stroke-width="6" opacity="0.15" />`;
    // Border + subtle fill
    elements += `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="6"
      fill="${hexToRgba(color, 0.08)}" stroke="${color}" stroke-width="2.5" />`;

    // Label
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

// ── Arrows mode ─────────────────────────────────────────────────────────
// Labels are placed in a frame outside the image, arrows point inward.
// The frame is auto-added by the arrows renderer itself.

type Edge = "top" | "bottom" | "left" | "right";

function closestEdge(box: AnnotationBox, imgW: number, imgH: number): Edge {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const dists: Array<{ edge: Edge; d: number }> = [
    { edge: "top", d: cy },
    { edge: "bottom", d: imgH - cy },
    { edge: "left", d: cx },
    { edge: "right", d: imgW - cx },
  ];
  dists.sort((a, b) => a.d - b.d);
  return dists[0].edge;
}

function resolveOverlaps(
  labels: Array<{ pos: number; size: number; idx: number }>,
  minGap: number
): void {
  labels.sort((a, b) => a.pos - b.pos);
  for (let i = 1; i < labels.length; i++) {
    const prev = labels[i - 1];
    const curr = labels[i];
    const overlap = prev.pos + prev.size + minGap - curr.pos;
    if (overlap > 0) {
      curr.pos += overlap;
    }
  }
}

interface ArrowsLayout {
  svgWidth: number;
  svgHeight: number;
  frameTop: number;
  frameBottom: number;
  frameLeft: number;
  frameRight: number;
}

function renderArrowsSvg(
  annotations: Annotation[],
  origWidth: number,
  origHeight: number,
  color: string,
  labels?: Record<string, string>
): { svg: string; layout: ArrowsLayout } {
  const FRAME = 50;
  const LABEL_H = 28;
  const LABEL_PAD = 10;

  const totalW = origWidth + FRAME * 2;
  const totalH = origHeight + FRAME * 2;

  // Shift all boxes into frame-adjusted coordinates
  const shifted = annotations.map((a) => ({
    ...a,
    box: {
      x: a.box.x + FRAME,
      y: a.box.y + FRAME,
      width: a.box.width,
      height: a.box.height,
    },
  }));

  // Assign each annotation to its closest edge
  const edgeGroups: Record<Edge, typeof shifted> = {
    top: [], bottom: [], left: [], right: [],
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

  function drawLabel(
    ann: (typeof shifted)[0],
    lx: number,
    ly: number,
    labelW: number,
    edge: Edge
  ) {
    const center = centerOf(ann.box);
    const labelText = escapeXml(
      labels?.[ann.ref] ?? ann.name ?? ann.role
    );

    // Arrow endpoints
    let sx: number, sy: number, ex: number, ey: number;
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

  // Top edge: labels in top frame, arranged horizontally
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

  // Bottom edge
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

  // Left edge: labels in left frame, arranged vertically
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

  // Right edge
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
      frameRight: FRAME,
    },
  };
}

// ── Spotlight mode ──────────────────────────────────────────────────────

function renderSpotlightSvg(
  annotations: Annotation[],
  width: number,
  height: number,
  color: string,
  dimOpacity: number = 0.6,
  padding: number = 8
): string {
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

// ── Flow mode ───────────────────────────────────────────────────────────

function renderFlowSvg(
  annotations: Annotation[],
  width: number,
  height: number
): string {
  if (annotations.length === 0)
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"/>`;

  let defs = `<defs>
    <filter id="fshadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="black" flood-opacity="0.2"/>
    </filter>
  </defs>`;

  let elements = "";

  // Numbered badges + element highlights only (no connecting lines)
  for (let i = 0; i < annotations.length; i++) {
    const ann = annotations[i];
    const color = FLOW_COLORS[i % FLOW_COLORS.length];
    const cx = ann.box.x + ann.box.width / 2;
    const cy = ann.box.y - 20;

    // Element highlight
    elements += `<rect x="${ann.box.x - 3}" y="${ann.box.y - 3}"
      width="${ann.box.width + 6}" height="${ann.box.height + 6}"
      rx="6" fill="${hexToRgba(color, 0.1)}" stroke="${color}" stroke-width="2" opacity="0.7"/>`;

    // Numbered badge
    elements += `<g filter="url(#fshadow)">
      <circle cx="${cx}" cy="${cy}" r="15" fill="${color}" />
      <text x="${cx}" y="${cy + 5}" fill="white" font-size="13" font-weight="bold"
        text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, system-ui, sans-serif">${i + 1}</text>
    </g>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${defs}${elements}</svg>`;
}

// ── Main entry point ────────────────────────────────────────────────────

export async function annotate(
  imageInput: Buffer | string,
  annotations: Annotation[],
  options: AnnotateOptions = { mode: "boxes" }
): Promise<Buffer> {
  const filtered = filterAnnotations(annotations, options.only);
  const color = options.color ?? "#3B82F6";
  const frame = options.frame ?? 0;

  let image = sharp(imageInput);
  const metadata = await image.metadata();
  let width = metadata.width!;
  let height = metadata.height!;

  // Apply frame if requested
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
      background: { r, g, b, alpha: 255 },
    });

    width += frame * 2;
    height += frame * 2;

    // Shift annotation coordinates
    shiftedAnnotations = filtered.map((a) => ({
      ...a,
      box: {
        x: a.box.x + frame,
        y: a.box.y + frame,
        width: a.box.width,
        height: a.box.height,
      },
    }));
  }

  let svg: string;

  switch (options.mode) {
    case "boxes":
      svg = renderBoxesSvg(
        shiftedAnnotations,
        width,
        height,
        color,
        options.labels,
        options.padding ?? 3,
        options.minBoxSize ?? 0
      );
      break;
    case "arrows": {
      // Arrows mode manages its own frame — use original filtered annotations
      // (before any user-specified frame shift) since it does its own shifting
      const arrowResult = renderArrowsSvg(
        filtered,
        metadata.width!,
        metadata.height!,
        color,
        options.labels
      );
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
        background: { r: fr, g: fg, b: fb, alpha: 255 },
      });

      return framedImage
        .composite([{ input: Buffer.from(arrowResult.svg), top: 0, left: 0 }])
        .png()
        .toBuffer();
    }
    case "spotlight":
      svg = renderSpotlightSvg(
        shiftedAnnotations,
        width,
        height,
        color,
        options.dimOpacity ?? 0.6,
        options.padding ?? 8
      );
      break;
    case "flow":
      svg = renderFlowSvg(shiftedAnnotations, width, height);
      break;
    default:
      throw new Error(`Unknown mode: ${options.mode}`);
  }

  return image
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}
