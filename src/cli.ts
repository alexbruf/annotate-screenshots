#!/usr/bin/env bun
import { readFile, writeFile } from "fs/promises";
import { basename, dirname, extname, join } from "path";
import { annotate } from "./annotate";
import type { Annotation, AnnotateOptions, Mode } from "./types";

const MODES: Mode[] = ["boxes", "arrows", "spotlight", "flow"];

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

interface ParsedArgs {
  positional: string[];
  options: AnnotateOptions;
  outputPath: string | null;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);

  const positional: string[] = [];
  let outputPath: string | null = null;
  let mode: Mode = "boxes";
  const only: string[] = [];
  const labels: Record<string, string> = {};
  let color: string | undefined;
  let padding: number | undefined;
  let minBoxSize: number | undefined;
  let dimOpacity: number | undefined;
  let frame: number | undefined;
  let frameColor: string | undefined;

  let i = 0;
  while (i < args.length) {
    const arg = args[i]!;

    if (arg === "-h" || arg === "--help") {
      usage();
      process.exit(0);
    } else if (arg === "-m" || arg === "--mode") {
      i++;
      const val = args[i]!;
      if (!MODES.includes(val as Mode)) {
        console.error(`Invalid mode: ${val}. Must be one of: ${MODES.join(", ")}`);
        process.exit(1);
      }
      mode = val as Mode;
    } else if (arg === "-o" || arg === "--output") {
      i++;
      outputPath = args[i]!;
    } else if (arg === "--only") {
      i++;
      while (i < args.length && !args[i]!.startsWith("-")) {
        only.push(args[i]!.replace(/^@/, ""));
        i++;
      }
      continue;
    } else if (arg === "--label") {
      i++;
      const val = args[i]!;
      const eqIdx = val.indexOf("=");
      if (eqIdx === -1) {
        console.error(`Invalid --label format: ${val}. Use --label ref=text`);
        process.exit(1);
      }
      labels[val.slice(0, eqIdx).replace(/^@/, "")] = val.slice(eqIdx + 1);
    } else if (arg === "--color") {
      i++;
      color = args[i]!;
    } else if (arg === "--padding") {
      i++;
      padding = parseInt(args[i]!, 10);
    } else if (arg === "--min-box-size") {
      i++;
      minBoxSize = parseInt(args[i]!, 10);
    } else if (arg === "--dim-opacity") {
      i++;
      dimOpacity = parseFloat(args[i]!);
    } else if (arg === "--frame") {
      i++;
      frame = parseInt(args[i]!, 10);
    } else if (arg === "--frame-color") {
      i++;
      frameColor = args[i]!;
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    } else {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    }

    i++;
  }

  const options: AnnotateOptions = { mode };
  if (only.length > 0) options.only = only;
  if (Object.keys(labels).length > 0) options.labels = labels;
  if (color !== undefined) options.color = color;
  if (padding !== undefined) options.padding = padding;
  if (minBoxSize !== undefined) options.minBoxSize = minBoxSize;
  if (dimOpacity !== undefined) options.dimOpacity = dimOpacity;
  if (frame !== undefined) options.frame = frame;
  if (frameColor !== undefined) options.frameColor = frameColor;

  return { positional, options, outputPath };
}

async function readRawJson(source: string | null): Promise<string> {
  if (source) {
    return readFile(source, "utf-8");
  }
  const chunks: Buffer[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function parseAnnotations(parsed: any): Annotation[] {
  const arr: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.annotations)
      ? parsed.annotations
      : (() => { throw new Error("Annotations must be an array or {annotations: [...]}"); })();

  return arr.map((item: any, idx: number) => {
    if (!item.ref || item.number === undefined || !item.box) {
      throw new Error(
        `Invalid annotation at index ${idx}: must have ref, number, and box fields`
      );
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
        height: Number(item.box.height),
      },
    };
  });
}

function defaultOutputPath(imagePath: string): string {
  const dir = dirname(imagePath);
  const ext = extname(imagePath);
  const name = basename(imagePath, ext);
  return join(dir, `${name}-annotated.png`);
}

async function main() {
  const { positional, options, outputPath } = parseArgs(process.argv);

  let imagePath: string | undefined;
  let annotations: Annotation[];

  if (positional.length === 2) {
    // annotate <image> <annotations.json>
    imagePath = positional[0];
    const raw = await readRawJson(positional[1]!);
    const parsed = JSON.parse(raw);
    annotations = parseAnnotations(parsed);
  } else if (positional.length === 1) {
    // Could be: annotate <image> (stdin annotations)
    // Or:       annotate <agent-browser-output.json>
    const arg = positional[0]!;

    if (arg.endsWith(".json")) {
      // Treat as agent-browser combined output
      const raw = await readRawJson(arg);
      const parsed = JSON.parse(raw);
      if (parsed.path && parsed.annotations) {
        imagePath = parsed.path;
        annotations = parseAnnotations(parsed);
      } else {
        // It's just an annotations file, need image from stdin? No — error.
        console.error("JSON file must contain both 'path' and 'annotations' fields, or pass image as first arg.");
        process.exit(1);
      }
    } else {
      // It's an image path, read annotations from stdin
      imagePath = arg;
      const raw = await readRawJson(null);
      const parsed = JSON.parse(raw);
      if (parsed.path && parsed.annotations) {
        // stdin is agent-browser output — use its path as fallback, but CLI arg takes precedence
        annotations = parseAnnotations(parsed);
      } else {
        annotations = parseAnnotations(parsed);
      }
    }
  } else if (positional.length === 0) {
    // annotate (stdin only — must be agent-browser combined output)
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

  // Verify image exists
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
