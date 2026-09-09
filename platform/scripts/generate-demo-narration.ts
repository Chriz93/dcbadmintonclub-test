import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tour } from "../src/demo/tour.ts";

// Optional development utility: uses the installed macOS voice, with no paid service.
const output = "public/demo-narration";
mkdirSync(output, { recursive: true });
const temporary = mkdtempSync(join(tmpdir(), "maplewood-narration-"));
try {
  for (const [index, step] of tour.entries()) {
    const source = join(temporary, `step-${index + 1}.txt`),
      audio = join(temporary, `step-${index + 1}.aiff`);
    writeFileSync(source, step.narration);
    execFileSync("/usr/bin/say", [
      "-v",
      "Samantha",
      "-r",
      "168",
      "-f",
      source,
      "-o",
      audio,
    ]);
    execFileSync("/usr/bin/afconvert", [
      "-f",
      "WAVE",
      "-d",
      "LEI16@22050",
      audio,
      join(output, `step-${index + 1}.wav`),
    ]);
    if (statSync(join(output, `step-${index + 1}.wav`)).size < 10000)
      throw new Error(
        "Speech synthesis produced empty audio. Run on macOS with access to the installed voice service.",
      );
    console.log(`Narration ${index + 1}/${tour.length}: ${step.title}`);
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
