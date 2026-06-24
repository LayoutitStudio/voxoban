import { describe, expect, it } from "vitest";

import { parseLevel } from "../levels/boxoban";
import { toKey } from "./coords";
import {
  buildDeadBoxSquares,
  buildGoalReachabilityByGoal,
  hasCornerDeadlock,
  hasTwoByTwoDeadlock,
  isLostState,
} from "./deadlocks";

describe("Sokoban deadlock rules", () => {
  it("marks non-goal immutable corners as deadlocks", () => {
    const level = parseLevel([
      "#####",
      "#$@.#",
      "#   #",
      "#####",
    ]);

    expect(hasCornerDeadlock(level, level.startBoxes)).toBe(true);
  });

  it("builds dead box squares from reverse goal reachability", () => {
    const level = parseLevel([
      "#####",
      "#$@.#",
      "#   #",
      "#####",
    ]);
    const deadSquares = buildDeadBoxSquares(
      level,
      buildGoalReachabilityByGoal(level)
    );

    expect(deadSquares.has(toKey({ x: 0, y: 0 }))).toBe(true);
    expect(deadSquares.has(toKey({ x: 2, y: 0 }))).toBe(false);
  });

  it("detects 2x2 box deadlocks", () => {
    const level = parseLevel([
      "######",
      "#@   #",
      "# $$ #",
      "# $$ #",
      "#  . #",
      "######",
    ]);

    expect(hasTwoByTwoDeadlock(level, level.startBoxes)).toBe(true);
  });

  it("treats forced loss as lost until the level is won", () => {
    const level = parseLevel([
      "#####",
      "#@$.#",
      "#   #",
      "#####",
    ]);

    expect(
      isLostState(
        level,
        level.startBoxes,
        level.startPlayer,
        true,
        false
      )
    ).toBe(true);
    expect(
      isLostState(
        level,
        level.startBoxes,
        level.startPlayer,
        true,
        true
      )
    ).toBe(false);
  });
});
