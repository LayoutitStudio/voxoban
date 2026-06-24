import { CARDINAL_DIRECTIONS, fromKey, toKey } from "./coords";
import {
  hasAnyLegalPushAvailable,
  isBlockedCell,
  isWall,
} from "./rules";
import type { Coord, ParsedLevel } from "./types";

export function buildGoalReachabilityByGoal(
  level: ParsedLevel
): Map<string, Set<string>> {
  const reachableByGoal = new Map<string, Set<string>>();

  for (const goalKey of level.goals) {
    const goalCoord = fromKey(goalKey);
    if (isWall(level, goalCoord)) {
      continue;
    }

    const reachable = new Set<string>([goalKey]);
    const queue: Coord[] = [goalCoord];
    let queueIndex = 0;

    while (queueIndex < queue.length) {
      const current = queue[queueIndex];
      queueIndex += 1;
      if (!current) {
        continue;
      }

      for (const direction of CARDINAL_DIRECTIONS) {
        const previousBox = {
          x: current.x - direction.dx,
          y: current.y - direction.dy,
        };
        const pusherStance = {
          x: current.x - direction.dx * 2,
          y: current.y - direction.dy * 2,
        };

        if (isWall(level, previousBox) || isWall(level, pusherStance)) {
          continue;
        }

        const previousKey = toKey(previousBox);
        if (reachable.has(previousKey)) {
          continue;
        }

        reachable.add(previousKey);
        queue.push(previousBox);
      }
    }

    reachableByGoal.set(goalKey, reachable);
  }

  return reachableByGoal;
}

export function buildDeadBoxSquares(
  level: ParsedLevel,
  goalReachabilityByGoal = buildGoalReachabilityByGoal(level)
): Set<string> {
  const reachableByAnyGoal = new Set<string>();
  for (const reachableForGoal of goalReachabilityByGoal.values()) {
    for (const cellKey of reachableForGoal) {
      reachableByAnyGoal.add(cellKey);
    }
  }

  const deadSquares = new Set<string>();
  for (let y = 0; y < level.height; y += 1) {
    for (let x = 0; x < level.width; x += 1) {
      const coord = { x, y };
      const key = toKey(coord);
      if (level.walls.has(key)) {
        continue;
      }
      if (level.goals.has(key)) {
        continue;
      }
      if (!reachableByAnyGoal.has(key)) {
        deadSquares.add(key);
      }
    }
  }

  return deadSquares;
}

export function hasCornerDeadlock(
  level: ParsedLevel,
  boxes: ReadonlySet<string>
): boolean {
  for (const boxKey of boxes) {
    if (level.goals.has(boxKey)) {
      continue;
    }

    const boxCoord = fromKey(boxKey);
    const up = isWall(level, { x: boxCoord.x, y: boxCoord.y - 1 });
    const down = isWall(level, { x: boxCoord.x, y: boxCoord.y + 1 });
    const left = isWall(level, { x: boxCoord.x - 1, y: boxCoord.y });
    const right = isWall(level, { x: boxCoord.x + 1, y: boxCoord.y });

    if ((up && left) || (up && right) || (down && left) || (down && right)) {
      return true;
    }
  }

  return false;
}

export function hasDeadSquareDeadlock(
  level: ParsedLevel,
  boxes: ReadonlySet<string>,
  deadBoxSquares = buildDeadBoxSquares(level)
): boolean {
  for (const boxKey of boxes) {
    if (level.goals.has(boxKey)) {
      continue;
    }
    if (deadBoxSquares.has(boxKey)) {
      return true;
    }
  }
  return false;
}

export function hasTwoByTwoDeadlock(
  level: ParsedLevel,
  boxes: ReadonlySet<string>
): boolean {
  for (let y = -1; y < level.height; y += 1) {
    for (let x = -1; x < level.width; x += 1) {
      const cells: Coord[] = [
        { x, y },
        { x: x + 1, y },
        { x, y: y + 1 },
        { x: x + 1, y: y + 1 },
      ];

      let allBlocked = true;
      let hasAnyBox = false;
      let hasAnyGoalTile = false;

      for (const cell of cells) {
        const key = toKey(cell);
        if (!isBlockedCell(level, boxes, cell)) {
          allBlocked = false;
          break;
        }
        if (boxes.has(key)) {
          hasAnyBox = true;
        }
        if (level.goals.has(key)) {
          hasAnyGoalTile = true;
        }
      }

      if (allBlocked && hasAnyBox && !hasAnyGoalTile) {
        return true;
      }
    }
  }

  return false;
}

export function hasFreezeDeadlock(
  level: ParsedLevel,
  boxes: ReadonlySet<string>
): boolean {
  if (boxes.size > level.goals.size) {
    return false;
  }

  const horizontalMemo = new Map<string, boolean>();
  const verticalMemo = new Map<string, boolean>();
  const horizontalVisiting = new Set<string>();
  const verticalVisiting = new Set<string>();

  function isBlockedOnAxis(
    boxKey: string,
    axis: "horizontal" | "vertical"
  ): boolean {
    const memo = axis === "horizontal" ? horizontalMemo : verticalMemo;
    const visiting =
      axis === "horizontal" ? horizontalVisiting : verticalVisiting;
    const memoized = memo.get(boxKey);
    if (memoized !== undefined) {
      return memoized;
    }
    if (visiting.has(boxKey)) {
      return true;
    }

    visiting.add(boxKey);
    const boxCoord = fromKey(boxKey);
    const sideCells: [Coord, Coord] =
      axis === "horizontal"
        ? [
            { x: boxCoord.x - 1, y: boxCoord.y },
            { x: boxCoord.x + 1, y: boxCoord.y },
          ]
        : [
            { x: boxCoord.x, y: boxCoord.y - 1 },
            { x: boxCoord.x, y: boxCoord.y + 1 },
          ];

    const blockedSides = sideCells.map((cell) => {
      if (isWall(level, cell)) {
        return true;
      }
      const neighborBoxKey = toKey(cell);
      if (!boxes.has(neighborBoxKey)) {
        return false;
      }
      return isBlockedOnAxis(neighborBoxKey, axis);
    });

    const blocked = blockedSides[0] === true && blockedSides[1] === true;
    visiting.delete(boxKey);
    memo.set(boxKey, blocked);
    return blocked;
  }

  for (const boxKey of boxes) {
    if (level.goals.has(boxKey)) {
      continue;
    }
    if (!isBlockedOnAxis(boxKey, "horizontal")) {
      continue;
    }
    if (isBlockedOnAxis(boxKey, "vertical")) {
      return true;
    }
  }

  return false;
}

export function hasGoalMatchingDeadlock(
  level: ParsedLevel,
  boxes: ReadonlySet<string>,
  goalReachabilityByGoal = buildGoalReachabilityByGoal(level)
): boolean {
  const goalKeys = Array.from(level.goals);
  if (goalKeys.length === 0) {
    return false;
  }

  const boxKeys = Array.from(boxes);
  if (boxKeys.length < goalKeys.length) {
    return true;
  }

  const candidateBoxesByGoal = new Map<string, string[]>();
  for (const goalKey of goalKeys) {
    const reachable = goalReachabilityByGoal.get(goalKey);
    if (!reachable) {
      return true;
    }

    const candidates: string[] = [];
    for (const boxKey of boxKeys) {
      if (reachable.has(boxKey)) {
        candidates.push(boxKey);
      }
    }

    if (candidates.length === 0) {
      return true;
    }
    candidateBoxesByGoal.set(goalKey, candidates);
  }

  const sortedGoals = [...goalKeys].sort((leftGoal, rightGoal) => {
    const leftCount = candidateBoxesByGoal.get(leftGoal)?.length ?? 0;
    const rightCount = candidateBoxesByGoal.get(rightGoal)?.length ?? 0;
    return leftCount - rightCount;
  });

  const goalByBox = new Map<string, string>();

  function findAugmentingMatch(
    goalKey: string,
    seenBoxes: Set<string>
  ): boolean {
    const candidates = candidateBoxesByGoal.get(goalKey) ?? [];
    for (const boxKey of candidates) {
      if (seenBoxes.has(boxKey)) {
        continue;
      }
      seenBoxes.add(boxKey);

      const assignedGoal = goalByBox.get(boxKey);
      if (!assignedGoal || findAugmentingMatch(assignedGoal, seenBoxes)) {
        goalByBox.set(boxKey, goalKey);
        return true;
      }
    }
    return false;
  }

  for (const goalKey of sortedGoals) {
    if (!findAugmentingMatch(goalKey, new Set<string>())) {
      return true;
    }
  }

  return false;
}

export function hasObviousDeadlock(
  level: ParsedLevel,
  boxes: ReadonlySet<string>,
  deadBoxSquares = buildDeadBoxSquares(level),
  goalReachabilityByGoal = buildGoalReachabilityByGoal(level)
): boolean {
  return (
    hasDeadSquareDeadlock(level, boxes, deadBoxSquares) ||
    hasCornerDeadlock(level, boxes) ||
    hasTwoByTwoDeadlock(level, boxes) ||
    hasFreezeDeadlock(level, boxes) ||
    hasGoalMatchingDeadlock(level, boxes, goalReachabilityByGoal)
  );
}

export function isLostState(
  level: ParsedLevel,
  boxes: ReadonlySet<string>,
  player: Coord,
  forcedLoss: boolean,
  hasWon: boolean,
  deadBoxSquares = buildDeadBoxSquares(level),
  goalReachabilityByGoal = buildGoalReachabilityByGoal(level)
): boolean {
  return (
    !hasWon &&
    (forcedLoss ||
      hasObviousDeadlock(
        level,
        boxes,
        deadBoxSquares,
        goalReachabilityByGoal
      ) ||
      !hasAnyLegalPushAvailable(level, boxes, player))
  );
}
