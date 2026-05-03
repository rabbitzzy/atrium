/**
 * Generates sketch-style illustrations for each Atrium flywheel step.
 * Supports three providers:
 *
 *   pollinations  Truly free, no key, no account. Uses public FLUX API.
 *                 Default when no keys are set. Just works.
 *   fal           fal.ai FLUX.1-schnell. Requires FAL_KEY + paid credits.
 *   hf            Hugging Face FLUX.1-schnell. Requires HF_TOKEN + monthly credits.
 *
 * Provider selection (PROVIDER env var overrides auto-detect):
 *   No keys set  → pollinations (free, automatic)
 *   FAL_KEY set  → fal
 *   HF_TOKEN set → hf
 *   PROVIDER=pollinations|fal|hf  → explicit override
 *
 * Typo avoidance: prompts describe visual layout and icons — no specific text
 * strings are asked of the model, so there is nothing to misspell.
 *
 * Run from repo root:
 *   npx tsx tools/illustrate.ts
 */

import { fal } from "@fal-ai/client";
import { HfInference } from "@huggingface/inference";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "illustrations");

// Global style applied to every image.
// Color palette: black lines on white + exactly three flat accent colors (sage green, amber, warm gray).
// No blur anywhere. No text rendered.
const STYLE =
  "minimalist ink line illustration, white background with generous white space, " +
  "thin clean black ink outlines, flat color fills using only these three accent colors: " +
  "sage green, muted amber, light warm gray — no other colors, no gradients, no textures, " +
  "no background blur, no depth-of-field, no bokeh, all elements equally sharp and crisp, " +
  "editorial children's picture book style, clean simple flat composition";

// Consistent student character — same in every scene with a child.
const STUDENT =
  "The child is Asian, age 7-8, with short straight dark hair, " +
  "wearing a plain light-colored t-shirt and dark pants, drawn in simple clean outline style.";

// Consistent classroom background — same in every scene set in school.
const ROOM =
  "Background: modern American elementary school room, white walls, " +
  "light wood-tone floor, rows of simple rectangular desks, " +
  "a whiteboard on the back wall, large windows on one side letting in flat daylight. " +
  "No Japanese decor, no plants, no clutter.";

// Shared kiosk hardware — used verbatim in every kiosk scene.
// Scanner arm is rigid right-angle (L-shape), no curves, no gooseneck.
const KIOSK =
  "The kiosk counter and all its hardware is large and fills the center foreground of the image. " +
  "On the counter, four items always together: " +
  "ONE — a standard rectangular flat-panel PC monitor on a short desk stand, thin bezel, not a TV, not a projector; " +
  "TWO — a flat keyboard on the counter directly in front of the monitor; " +
  "THREE — an IPEVO V4K Pro document camera with a rigid right-angle arm (no curves, no gooseneck): " +
  "a small flat rectangular base on the counter, a straight vertical metal post rises from the base, " +
  "then bends at exactly 90 degrees into a straight horizontal arm extending over the desk, " +
  "with a small compact camera at the tip pointing straight down — hard right angles only, like an upside-down L — " +
  "the arm's total height must be lower than the top of the monitor screen, never taller than the monitor; " +
  "FOUR — a compact inkjet printer to the right of the monitor.";

const SCENES = [
  {
    step: "1 · Bootstrap Eval",
    file: "01-bootstrap-eval.png",
    scene:
      STUDENT + " " +
      "The child stands at a kiosk counter looking at the monitor screen. " +
      KIOSK +
      " The monitor shows a simple welcome graphic — a friendly icon and the child's name displayed. " +
      "No badge, no lanyard. The document camera arm is part of the kiosk hardware but idle, camera pointing down at empty counter. " +
      "No text in image. " +
      ROOM,
  },
  {
    step: "2 · Plan Task",
    file: "02-plan-task.png",
    scene:
      STUDENT + " " +
      "The child stands at the kiosk counter, arms at sides, reading the monitor screen. Not touching the keyboard. " +
      KIOSK +
      " The monitor screen shows exactly two elements: " +
      "the words 'Next Task' as a heading in the upper center, " +
      "and directly below it a large sage-green rounded rectangle button with the word 'Print' on it. " +
      "Simple short English words only, large font, nothing else on screen. " +
      ROOM,
  },
  {
    step: "3 · Print Card",
    file: "03-print-card.png",
    scene:
      STUDENT + " " +
      "The child stands at the kiosk counter, one hand extended toward paper emerging from the printer. " +
      KIOSK +
      " The printer on the right outputs a white paper worksheet. " +
      "The document camera right-angle arm is clearly shorter in total height than the monitor screen. " +
      "Black ink on white paper, no color on the worksheet. No text in image. " +
      ROOM,
  },
  {
    step: "4 · Student Works",
    file: "04-student-works.png",
    scene:
      STUDENT + " " +
      "The child sits at a school desk facing directly toward the viewer, face fully visible, looking down at the paper. " +
      "A printed worksheet lies flat on the desk surface in front of the child — on the desk, not on a chair. " +
      "The child holds a pencil and is writing into a blank answer box on the worksheet. " +
      "No kiosk hardware in this scene. " +
      ROOM,
  },
  {
    step: "5 · Scan Submission",
    file: "05-scan-submission.png",
    scene:
      STUDENT + " " +
      "The child faces the viewer and holds a white paper worksheet flat in both hands, placing it on the counter. " +
      "Hands on the paper only — not touching the keyboard. " +
      "On the counter: a flat-panel PC monitor; a keyboard (untouched); " +
      "a short rigid L-shaped document camera — vertical post shorter than half the monitor, " +
      "horizontal arm low over the counter, camera tip pointing straight down, no curves; " +
      "a printer to the right. " +
      "The paper worksheet shows simple math: 2+3=5, 7-4=3, 4+4=8. " +
      "Monitor shows a top-down preview of the worksheet. No text in image. " +
      ROOM,
  },
  {
    step: "6 · AI Evaluates",
    file: "06-ai-evaluates.png",
    scene:
      "Close-up view of a flat-panel PC monitor screen divided into two equal panels. " +
      "Left panel: a top-down scan thumbnail of a worksheet — five numbered rows each with a number filled in. " +
      "Right panel: a single large circular loading spinner, nothing else. " +
      "No text on screen. Monitor bezel and keyboard edge visible at frame bottom. " +
      ROOM,
  },
  {
    step: "7 · Generate Debrief",
    file: "07-generate-debrief.png",
    scene:
      "An adult parent sits on a sofa in a living room, holding a smartphone and looking at the screen. " +
      "The phone screen shows a simple white checklist of five rows. " +
      "Each row has a colored dot on the left and a single short word on the right: " +
      "Row 1: green dot — word 'Good'. " +
      "Row 2: amber dot — word 'OK'. " +
      "Row 3: red dot — word 'Help'. " +
      "Row 4: green dot — word 'Good'. " +
      "Row 5: green dot — word 'Good'. " +
      "Short words in large readable font, nothing else on screen. " +
      "Living room background: sofa, white wall, window, all sharp with no blur.",
  },
  {
    step: "8 · Update Tree",
    file: "08-update-tree.png",
    scene:
      "An adult parent sits on a sofa in a living room, holding a smartphone and looking at the screen. " +
      "The phone shows a hexagonal radar chart — six axes radiating from the center, drawn with thin black lines. " +
      "Each axis has a short label at its tip in small text: 'Math', 'Read', 'Write', 'Art', 'Sci', 'CN'. " +
      "The Math segment is filled sage green and slightly larger than the others. " +
      "Other segments lightly filled warm gray. White screen background, thin ink lines. " +
      "Living room background: sofa, white wall, window, all sharp with no blur.",
  },
  {
    step: "9 · Award Leaf + Next Task",
    file: "09-award-leaf.png",
    scene:
      STUDENT + " " +
      "The child stands at the kiosk counter, smiling, arms at sides, not touching the keyboard. " +
      KIOSK +
      " The monitor shows a large leaf outline icon in sage green centered on the top half of the screen, " +
      "and a large sage-green rectangular button on the bottom half. No text. " +
      ROOM,
  },
];

// ─── Provider setup ───────────────────────────────────────────────────────────

type Provider = "pollinations" | "fal" | "hf";

function resolveProvider(): Provider {
  const explicit = process.env["PROVIDER"] as Provider | undefined;
  if (explicit === "pollinations" || explicit === "fal" || explicit === "hf") return explicit;
  if (process.env["FAL_KEY"]) return "fal";
  if (process.env["HF_TOKEN"]) return "hf";
  return "pollinations";
}

async function generateImage(
  provider: Provider,
  prompt: string,
  outPath: string,
  seed: number,
): Promise<number> {
  if (provider === "pollinations") {
    const url =
      `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
      `?width=768&height=432&model=flux&nologo=true&seed=${seed}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Pollinations ${res.status}: ${await res.text()}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(outPath, buf);
    return buf.length;

  } else if (provider === "fal") {
    fal.config({ credentials: process.env["FAL_KEY"] });
    const result = await fal.subscribe("fal-ai/flux/schnell", {
      input: {
        prompt,
        image_size: { width: 768, height: 432 },
        num_inference_steps: 4,
        num_images: 1,
        enable_safety_checker: false,
      },
      logs: false,
    });
    const imageUrl = (result.data as { images: { url: string }[] }).images[0].url;
    const res = await fetch(imageUrl);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(outPath, buf);
    return buf.length;

  } else {
    const hf = new HfInference(process.env["HF_TOKEN"]);
    const blob = await hf.textToImage({
      model: "black-forest-labs/FLUX.1-dev",
      inputs: prompt,
      parameters: { width: 768, height: 432, num_inference_steps: 50, guidance_scale: 4.5 },
    });
    const buf = Buffer.from(await blob.arrayBuffer());
    fs.writeFileSync(outPath, buf);
    return buf.length;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const provider = resolveProvider();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`Provider: ${provider}`);
  console.log(`Generating ${SCENES.length} illustrations → ${OUT_DIR}\n`);

  for (const [i, { step, file, scene }] of SCENES.entries()) {
    const outPath = path.join(OUT_DIR, file);
    if (fs.existsSync(outPath)) {
      console.log(`skip  ${file}  (already exists)`);
      continue;
    }

    const prompt = `${scene}, ${STYLE}`;
    console.log(`gen   ${step}`);

    try {
      const bytes = await generateImage(provider, prompt, outPath, i + 1);
      console.log(`saved ${file}  (${(bytes / 1024).toFixed(0)} KB)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`error ${file}: ${msg}`);
    }
  }

  console.log("\nDone. Open tools/illustrations/ to view the PNGs.");
}

main().catch(console.error);
