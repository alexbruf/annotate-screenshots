---
name: annotate
description: Annotate screenshots with visual overlays — boxes, arrows, spotlights, and numbered flows. Use when the user needs to highlight, label, or call out specific elements on a screenshot. Triggers include requests to "annotate a screenshot", "highlight elements", "add arrows to a screenshot", "spotlight this section", "show the steps", "mark up this page", "label these buttons", or any task requiring visual annotation of browser screenshots. Works standalone or piped from agent-browser.
allowed-tools: Bash(bun *)
---

# Screenshot Annotation

Post-process screenshots with clean visual annotations. Takes a screenshot image + element annotation data (from `agent-browser screenshot --annotate --json`) and produces annotated images.

## How to Run

The CLI is a bundled script at `${CLAUDE_SKILL_DIR}/scripts/cli.js`. It requires `bun` and the `sharp` native dependency.

**First-time setup** (install sharp):

```bash
cd ${CLAUDE_SKILL_DIR} && bun install
```

**Run the CLI:**

```bash
bun ${CLAUDE_SKILL_DIR}/scripts/cli.js [args...]
```

All file path arguments (image, JSON, output) must be **absolute paths**.

## Core Workflow

1. **Capture**: Take an annotated screenshot with agent-browser
2. **Annotate**: Pipe or pass the output to the CLI with a mode

```bash
# Pipe directly from agent-browser
agent-browser screenshot --annotate --json | bun ${CLAUDE_SKILL_DIR}/scripts/cli.js --mode boxes -o /tmp/annotated.png

# Or save and annotate separately
agent-browser screenshot --annotate --json > /tmp/shot.json
bun ${CLAUDE_SKILL_DIR}/scripts/cli.js /tmp/shot.json --mode spotlight --only e1 e5 -o /tmp/spotlight.png
```

## Annotation Modes

### Boxes (default)

Rounded rectangles around elements with numbered pill labels. Best for showing all interactive elements or highlighting specific ones.

```bash
# All elements
agent-browser screenshot --annotate --json | bun ${CLAUDE_SKILL_DIR}/scripts/cli.js --mode boxes

# Only specific elements, custom color
agent-browser screenshot --annotate --json | bun ${CLAUDE_SKILL_DIR}/scripts/cli.js --mode boxes --only e5 e6 e11 --color "#8B5CF6"

# Small elements get min-box-size padding
bun ${CLAUDE_SKILL_DIR}/scripts/cli.js /tmp/shot.json --mode boxes --min-box-size 40
```

### Arrows

Labels placed in a frame outside the screenshot with arrows pointing inward. Best for callouts with custom descriptions.

```bash
agent-browser screenshot --annotate --json | bun ${CLAUDE_SKILL_DIR}/scripts/cli.js --mode arrows \
  --only e6 e11 e19 \
  --label e6="Start here" \
  --label e11="Deep dive" \
  --label e19="Quick action"
```

### Spotlight

Dims everything except selected elements. Best for focusing attention on specific areas.

```bash
# Spotlight with default blue border
agent-browser screenshot --annotate --json | bun ${CLAUDE_SKILL_DIR}/scripts/cli.js --mode spotlight --only e13 e14 e15

# Green border, heavier dim
agent-browser screenshot --annotate --json | bun ${CLAUDE_SKILL_DIR}/scripts/cli.js --mode spotlight \
  --only e19 e20 e21 --color "#10B981" --dim-opacity 0.7
```

### Flow

Numbered badges on elements showing a sequence of steps. Best for documenting user journeys or click paths.

```bash
agent-browser screenshot --annotate --json | bun ${CLAUDE_SKILL_DIR}/scripts/cli.js --mode flow \
  --only e6 e7 e11 e19 --frame 40
```

## Full Option Reference

```
bun ${CLAUDE_SKILL_DIR}/scripts/cli.js [image] [annotations.json] [options]

Arguments:
  image              Screenshot PNG/JPG path (absolute)
  annotations        Annotations JSON path (absolute), or pipe via stdin

Options:
  -m, --mode <mode>          boxes|arrows|spotlight|flow (default: boxes)
  -o, --output <path>        Output file (default: <image>-annotated.png)
  --only <refs...>           Filter to specific refs (e.g., e1 e5 @e12)
  --label <ref=text>         Custom label per ref (repeatable)
  --color <hex>              Primary color (default: #3B82F6)
  --padding <px>             Box padding in pixels (default: 3)
  --min-box-size <px>        Minimum box size for small elements
  --dim-opacity <0-1>        Spotlight dim opacity (default: 0.6)
  --frame <px>               Frame around image (default: 0, auto for arrows)
  --frame-color <hex>        Frame color (default: #F8FAFC)
```

## Input Formats

The annotations JSON accepts two formats:

**Array format** (standalone):
```json
[
  {"ref": "e1", "number": 1, "role": "button", "name": "Submit", "box": {"x": 100, "y": 200, "width": 150, "height": 40}}
]
```

**Agent-browser format** (includes image path):
```json
{
  "path": "/path/to/screenshot.png",
  "annotations": [
    {"ref": "e1", "number": 1, "role": "button", "name": "Submit", "box": {"x": 100, "y": 200, "width": 150, "height": 40}}
  ]
}
```

When using the agent-browser format (via file or stdin), the image path is extracted automatically — no need to pass it as a separate argument.

## Common Patterns

### Document a signup flow

```bash
agent-browser open https://example.com/signup
agent-browser screenshot --annotate --json > /tmp/signup.json
bun ${CLAUDE_SKILL_DIR}/scripts/cli.js /tmp/signup.json --mode flow --only e4 e5 e6 --frame 40 -o /tmp/signup-flow.png
```

### Highlight CTAs for a design review

```bash
agent-browser screenshot --annotate --json | bun ${CLAUDE_SKILL_DIR}/scripts/cli.js --mode boxes \
  --only e5 e6 --color "#8B5CF6" -o /tmp/ctas.png
```

### Spotlight a form section

```bash
agent-browser screenshot --annotate --json | bun ${CLAUDE_SKILL_DIR}/scripts/cli.js --mode spotlight \
  --only e4 e5 e6 --dim-opacity 0.65 -o /tmp/form-spotlight.png
```

### Annotated callouts for documentation

```bash
agent-browser screenshot --annotate --json | bun ${CLAUDE_SKILL_DIR}/scripts/cli.js --mode arrows \
  --only e1 e3 e7 \
  --label e1="Navigation" \
  --label e3="Search bar" \
  --label e7="User menu" \
  -o /tmp/doc-callouts.png
```
