import { describe, expect, it } from "vitest";

import {
  SHIP_BLOCKED_SOURCE_INDICES,
  campaignLevels,
  createBoxobanCampaign,
  parseLevel,
} from "./boxoban";
import { packedLevelFiles } from "./packed-levels";
import { decodePackedRows } from "./packed-codec";

describe("packed Boxoban levels", () => {
  it("decodes a generated packed source file", () => {
    const sourceFile = packedLevelFiles.find((candidate) => {
      return candidate.levelCount > 0;
    });

    expect(sourceFile).toBeDefined();
    const decodedRows = decodePackedRows(
      sourceFile?.data ?? "",
      sourceFile?.levelCount ?? 0
    );

    expect(decodedRows).toHaveLength(sourceFile?.levelCount);
    expect(decodedRows[0]?.length).toBeGreaterThan(0);
    expect(decodedRows[0]?.[0]?.length).toBeGreaterThan(0);
  });

  it("parses Sokoban rows into trimmed board state", () => {
    const parsed = parseLevel([
      "#####",
      "#@  #",
      "# $ #",
      "# . #",
      "#####",
    ]);

    expect(parsed.width).toBe(3);
    expect(parsed.height).toBe(3);
    expect(parsed.startPlayer).toEqual({ x: 0, y: 0 });
    expect(parsed.startBoxes).toEqual(new Set(["1,1"]));
    expect(parsed.goals).toEqual(new Set(["1,2"]));
    expect(parsed.walls.size).toBe(0);
  });

  it("creates a bounded campaign from packed source files", () => {
    const campaign = createBoxobanCampaign(packedLevelFiles.slice(0, 1), 3);

    expect(campaign.length).toBeGreaterThan(0);
    expect(campaign.length).toBeLessThanOrEqual(3);
    expect(campaign[0]?.sourceIndex).toBeTypeOf("number");
    expect(campaign[0]?.id).toMatch(/^boxoban-/);
    expect(campaign[0]?.startBoxes.size).toBeGreaterThan(0);
  });

  it("keeps source-index blocked levels out of the shipped campaign", () => {
    for (const blockedSourceIndex of SHIP_BLOCKED_SOURCE_INDICES) {
      expect(
        campaignLevels.some((level) => level.sourceIndex === blockedSourceIndex)
      ).toBe(false);
    }
  });
});
