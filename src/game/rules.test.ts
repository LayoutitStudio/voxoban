import { describe, expect, it } from "vitest";

import { parseLevel } from "../levels/boxoban";
import {
  hasAnyLegalPushAvailable,
  isWall,
  tryMoveOnBoard,
} from "./rules";

describe("Sokoban movement rules", () => {
  it("blocks movement into walls", () => {
    const level = parseLevel([
      "#####",
      "#@# #",
      "# $ #",
      "# . #",
      "#####",
    ]);

    const result = tryMoveOnBoard(
      level,
      level.startPlayer,
      level.startBoxes,
      1,
      0
    );

    expect(result.moved).toBe(false);
    expect(result.player).toEqual(level.startPlayer);
    expect(result.boxes).toEqual(level.startBoxes);
    expect(isWall(level, { x: 1, y: 0 })).toBe(true);
  });

  it("pushes one box into an open target", () => {
    const level = parseLevel([
      "#####",
      "#@$.#",
      "#   #",
      "#####",
    ]);

    const result = tryMoveOnBoard(
      level,
      level.startPlayer,
      level.startBoxes,
      1,
      0
    );

    expect(result.moved).toBe(true);
    expect(result.player).toEqual({ x: 1, y: 0 });
    expect(result.facing).toBe("east");
    expect(result.pushedBoxCoord).toEqual({ x: 2, y: 0 });
    expect(result.pushedBoxKey).toBe("2,0");
    expect(result.boxes).toEqual(new Set(["2,0"]));
  });

  it("detects whether any legal push remains", () => {
    const movableLevel = parseLevel([
      "#####",
      "#@$.#",
      "#   #",
      "#####",
    ]);
    const stuckLevel = parseLevel([
      "#####",
      "#@$##",
      "# . #",
      "#####",
    ]);

    expect(
      hasAnyLegalPushAvailable(
        movableLevel,
        movableLevel.startBoxes,
        movableLevel.startPlayer
      )
    ).toBe(true);
    expect(
      hasAnyLegalPushAvailable(
        stuckLevel,
        stuckLevel.startBoxes,
        stuckLevel.startPlayer
      )
    ).toBe(false);
  });
});
