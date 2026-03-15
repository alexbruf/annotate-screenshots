import sharp from "sharp";
import { annotate } from "./annotate";
import type { Annotation } from "./types";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

const OUT_DIR = join(import.meta.dir, "..", "demo-output");

// ── Generate a realistic test "web page" screenshot ─────────────────────

async function createTestPage(): Promise<Buffer> {
  const w = 1280;
  const h = 800;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <!-- Page background -->
    <rect width="${w}" height="${h}" fill="#F1F5F9"/>

    <!-- Header -->
    <rect width="${w}" height="60" fill="#0F172A"/>
    <text x="32" y="38" fill="white" font-size="20" font-weight="bold"
      font-family="-apple-system, system-ui, sans-serif">Acme Dashboard</text>
    <text x="820" y="38" fill="#94A3B8" font-size="14"
      font-family="-apple-system, system-ui, sans-serif">Docs</text>
    <text x="890" y="38" fill="#94A3B8" font-size="14"
      font-family="-apple-system, system-ui, sans-serif">Pricing</text>
    <text x="970" y="38" fill="#94A3B8" font-size="14"
      font-family="-apple-system, system-ui, sans-serif">Blog</text>
    <rect x="1040" y="14" width="80" height="32" rx="6" fill="#3B82F6"/>
    <text x="1058" y="36" fill="white" font-size="13" font-weight="600"
      font-family="-apple-system, system-ui, sans-serif">Sign In</text>
    <rect x="1140" y="14" width="100" height="32" rx="6" fill="#10B981"/>
    <text x="1155" y="36" fill="white" font-size="13" font-weight="600"
      font-family="-apple-system, system-ui, sans-serif">Get Started</text>

    <!-- Left sidebar -->
    <rect x="0" y="60" width="220" height="740" fill="#1E293B"/>
    <text x="24" y="100" fill="#CBD5E1" font-size="11" font-weight="600"
      font-family="-apple-system, system-ui, sans-serif" letter-spacing="1">NAVIGATION</text>
    <rect x="12" y="112" width="196" height="36" rx="6" fill="#334155"/>
    <text x="40" y="136" fill="white" font-size="14"
      font-family="-apple-system, system-ui, sans-serif">Overview</text>
    <text x="40" y="172" fill="#94A3B8" font-size="14"
      font-family="-apple-system, system-ui, sans-serif">Analytics</text>
    <text x="40" y="208" fill="#94A3B8" font-size="14"
      font-family="-apple-system, system-ui, sans-serif">Reports</text>
    <text x="40" y="244" fill="#94A3B8" font-size="14"
      font-family="-apple-system, system-ui, sans-serif">Settings</text>

    <!-- Main content area -->
    <rect x="244" y="84" width="720" height="120" rx="12" fill="white"/>
    <text x="276" y="120" fill="#0F172A" font-size="22" font-weight="bold"
      font-family="-apple-system, system-ui, sans-serif">Welcome back, Alex</text>
    <text x="276" y="148" fill="#64748B" font-size="14"
      font-family="-apple-system, system-ui, sans-serif">Your project has 1,247 active users this month.</text>
    <rect x="276" y="164" width="130" height="28" rx="6" fill="#3B82F6"/>
    <text x="296" y="183" fill="white" font-size="12" font-weight="600"
      font-family="-apple-system, system-ui, sans-serif">View Analytics</text>
    <rect x="420" y="164" width="100" height="28" rx="6" fill="none" stroke="#CBD5E1" stroke-width="1.5"/>
    <text x="436" y="183" fill="#475569" font-size="12" font-weight="500"
      font-family="-apple-system, system-ui, sans-serif">Export CSV</text>

    <!-- Stats cards row -->
    <rect x="244" y="224" width="228" height="100" rx="10" fill="white"/>
    <text x="268" y="256" fill="#64748B" font-size="12"
      font-family="-apple-system, system-ui, sans-serif">Total Users</text>
    <text x="268" y="290" fill="#0F172A" font-size="28" font-weight="bold"
      font-family="-apple-system, system-ui, sans-serif">12,847</text>
    <text x="380" y="290" fill="#10B981" font-size="13"
      font-family="-apple-system, system-ui, sans-serif">+12%</text>

    <rect x="490" y="224" width="228" height="100" rx="10" fill="white"/>
    <text x="514" y="256" fill="#64748B" font-size="12"
      font-family="-apple-system, system-ui, sans-serif">Revenue</text>
    <text x="514" y="290" fill="#0F172A" font-size="28" font-weight="bold"
      font-family="-apple-system, system-ui, sans-serif">$48.2k</text>
    <text x="628" y="290" fill="#10B981" font-size="13"
      font-family="-apple-system, system-ui, sans-serif">+8%</text>

    <rect x="736" y="224" width="228" height="100" rx="10" fill="white"/>
    <text x="760" y="256" fill="#64748B" font-size="12"
      font-family="-apple-system, system-ui, sans-serif">Conversion</text>
    <text x="760" y="290" fill="#0F172A" font-size="28" font-weight="bold"
      font-family="-apple-system, system-ui, sans-serif">3.24%</text>
    <text x="872" y="290" fill="#EF4444" font-size="13"
      font-family="-apple-system, system-ui, sans-serif">-2%</text>

    <!-- Chart area -->
    <rect x="244" y="344" width="478" height="280" rx="10" fill="white"/>
    <text x="268" y="378" fill="#0F172A" font-size="16" font-weight="600"
      font-family="-apple-system, system-ui, sans-serif">User Growth</text>
    <polyline points="280,560 340,540 400,500 460,520 520,460 580,440 640,410 700,380"
      fill="none" stroke="#3B82F6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="280,560 340,540 400,500 460,520 520,460 580,440 640,410 700,380 700,580 280,580"
      fill="#3B82F620" stroke="none"/>
    <line x1="280" y1="580" x2="700" y2="580" stroke="#E2E8F0" stroke-width="1"/>
    <line x1="280" y1="380" x2="280" y2="580" stroke="#E2E8F0" stroke-width="1"/>

    <!-- Recent activity panel -->
    <rect x="740" y="344" width="224" height="280" rx="10" fill="white"/>
    <text x="764" y="378" fill="#0F172A" font-size="16" font-weight="600"
      font-family="-apple-system, system-ui, sans-serif">Activity</text>
    <text x="764" y="410" fill="#64748B" font-size="12"
      font-family="-apple-system, system-ui, sans-serif">New signup - john@acme.co</text>
    <line x1="764" y1="420" x2="940" y2="420" stroke="#F1F5F9" stroke-width="1"/>
    <text x="764" y="442" fill="#64748B" font-size="12"
      font-family="-apple-system, system-ui, sans-serif">Payment received - $299</text>
    <line x1="764" y1="452" x2="940" y2="452" stroke="#F1F5F9" stroke-width="1"/>
    <text x="764" y="474" fill="#64748B" font-size="12"
      font-family="-apple-system, system-ui, sans-serif">Feature deployed - v2.4.1</text>
    <rect x="764" y="560" width="176" height="32" rx="6" fill="#F1F5F9"/>
    <text x="810" y="581" fill="#475569" font-size="12" font-weight="500"
      font-family="-apple-system, system-ui, sans-serif">View All Activity</text>

    <!-- Bottom action bar -->
    <rect x="244" y="644" width="720" height="56" rx="10" fill="white"/>
    <rect x="268" y="656" width="120" height="32" rx="6" fill="#3B82F6"/>
    <text x="290" y="677" fill="white" font-size="13" font-weight="600"
      font-family="-apple-system, system-ui, sans-serif">New Project</text>
    <rect x="400" y="656" width="110" height="32" rx="6" fill="none" stroke="#CBD5E1" stroke-width="1.5"/>
    <text x="418" y="677" fill="#475569" font-size="13" font-weight="500"
      font-family="-apple-system, system-ui, sans-serif">Invite Team</text>
    <rect x="524" y="656" width="100" height="32" rx="6" fill="none" stroke="#CBD5E1" stroke-width="1.5"/>
    <text x="544" y="677" fill="#475569" font-size="13" font-weight="500"
      font-family="-apple-system, system-ui, sans-serif">Feedback</text>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ── Annotation data matching the test page ──────────────────────────────

const ALL_ANNOTATIONS: Annotation[] = [
  { ref: "e1", number: 1, role: "link", name: "Acme Dashboard", box: { x: 32, y: 14, width: 175, height: 32 } },
  { ref: "e2", number: 2, role: "link", name: "Docs", box: { x: 810, y: 22, width: 40, height: 20 } },
  { ref: "e3", number: 3, role: "link", name: "Pricing", box: { x: 878, y: 22, width: 55, height: 20 } },
  { ref: "e4", number: 4, role: "link", name: "Blog", box: { x: 960, y: 22, width: 35, height: 20 } },
  { ref: "e5", number: 5, role: "button", name: "Sign In", box: { x: 1040, y: 14, width: 80, height: 32 } },
  { ref: "e6", number: 6, role: "button", name: "Get Started", box: { x: 1140, y: 14, width: 100, height: 32 } },
  { ref: "e7", number: 7, role: "link", name: "Overview", box: { x: 12, y: 112, width: 196, height: 36 } },
  { ref: "e8", number: 8, role: "link", name: "Analytics", box: { x: 28, y: 158, width: 100, height: 20 } },
  { ref: "e9", number: 9, role: "link", name: "Reports", box: { x: 28, y: 194, width: 80, height: 20 } },
  { ref: "e10", number: 10, role: "link", name: "Settings", box: { x: 28, y: 230, width: 80, height: 20 } },
  { ref: "e11", number: 11, role: "button", name: "View Analytics", box: { x: 276, y: 164, width: 130, height: 28 } },
  { ref: "e12", number: 12, role: "button", name: "Export CSV", box: { x: 420, y: 164, width: 100, height: 28 } },
  { ref: "e13", number: 13, role: "region", name: "Total Users", box: { x: 244, y: 224, width: 228, height: 100 } },
  { ref: "e14", number: 14, role: "region", name: "Revenue", box: { x: 490, y: 224, width: 228, height: 100 } },
  { ref: "e15", number: 15, role: "region", name: "Conversion", box: { x: 736, y: 224, width: 228, height: 100 } },
  { ref: "e16", number: 16, role: "region", name: "User Growth Chart", box: { x: 244, y: 344, width: 478, height: 280 } },
  { ref: "e17", number: 17, role: "region", name: "Activity Panel", box: { x: 740, y: 344, width: 224, height: 280 } },
  { ref: "e18", number: 18, role: "button", name: "View All Activity", box: { x: 764, y: 560, width: 176, height: 32 } },
  { ref: "e19", number: 19, role: "button", name: "New Project", box: { x: 268, y: 656, width: 120, height: 32 } },
  { ref: "e20", number: 20, role: "button", name: "Invite Team", box: { x: 400, y: 656, width: 110, height: 32 } },
  { ref: "e21", number: 21, role: "button", name: "Feedback", box: { x: 524, y: 656, width: 100, height: 32 } },
];

// ── Generate demos ──────────────────────────────────────────────────────

async function run() {
  await mkdir(OUT_DIR, { recursive: true });

  const testImage = await createTestPage();
  await writeFile(join(OUT_DIR, "00-original.png"), testImage);
  console.log("Saved 00-original.png");

  // 1. Boxes — all elements
  const boxes = await annotate(testImage, ALL_ANNOTATIONS, { mode: "boxes" });
  await writeFile(join(OUT_DIR, "01-boxes-all.png"), boxes);
  console.log("Saved 01-boxes-all.png");

  // 2. Boxes — only specific elements (the CTA buttons)
  const boxesOnly = await annotate(testImage, ALL_ANNOTATIONS, {
    mode: "boxes",
    only: ["e5", "e6", "e11", "e19"],
    color: "#8B5CF6",
  });
  await writeFile(join(OUT_DIR, "02-boxes-selected.png"), boxesOnly);
  console.log("Saved 02-boxes-selected.png");

  // 3. Arrows — pointing out key elements with custom labels
  const arrows = await annotate(testImage, ALL_ANNOTATIONS, {
    mode: "arrows",
    only: ["e6", "e11", "e13", "e16", "e19"],
    labels: {
      e6: "Start here",
      e11: "Deep dive",
      e13: "Key metric",
      e16: "Growth trend",
      e19: "Quick action",
    },
  });
  await writeFile(join(OUT_DIR, "03-arrows.png"), arrows);
  console.log("Saved 03-arrows.png");

  // 4. Spotlight — focus on the stats cards
  const spotlight = await annotate(testImage, ALL_ANNOTATIONS, {
    mode: "spotlight",
    only: ["e13", "e14", "e15"],
  });
  await writeFile(join(OUT_DIR, "04-spotlight.png"), spotlight);
  console.log("Saved 04-spotlight.png");

  // 5. Flow — with frame so badges don't clip
  const flow = await annotate(testImage, ALL_ANNOTATIONS, {
    mode: "flow",
    only: ["e6", "e7", "e11", "e19"],
    frame: 40,
  });
  await writeFile(join(OUT_DIR, "05-flow.png"), flow);
  console.log("Saved 05-flow.png");

  // 6. Spotlight on action bar (green)
  const spotlightActions = await annotate(testImage, ALL_ANNOTATIONS, {
    mode: "spotlight",
    only: ["e19", "e20", "e21"],
    color: "#10B981",
    dimOpacity: 0.7,
  });
  await writeFile(join(OUT_DIR, "06-spotlight-actions.png"), spotlightActions);
  console.log("Saved 06-spotlight-actions.png");

  console.log(`\nAll demos saved to ${OUT_DIR}`);
}

run().catch(console.error);
