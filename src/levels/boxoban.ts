import {
  packedLevelFiles,
  type PackedLevelFile,
} from "./packed-levels";
import {
  CARDINAL_DIRECTIONS,
  fromKey,
  manhattanDistance,
  toKey,
} from "../game/coords";
import type { CampaignLevel, Coord, LevelTier, ParsedLevel } from "../game/types";
import { decodePackedRows } from "./packed-codec";

export const FALLBACK_LEVEL_ROWS = [
  "##########",
  "#        #",
  "#  .     #",
  "#  $     #",
  "#  @     #",
  "##########",
] as const;

export const BOXOBAN_LEVEL_LIMIT = 9999;
export const MIN_REACHABLE_OPEN_TILES = 40;
export const ADJACENT_BOX_GOAL_COMPLEXITY_PENALTY = 180;
export const NEAR_BOX_GOAL_COMPLEXITY_PENALTY = 60;

// Stable source indices to exclude from shipping builds.
export const SHIP_BLOCKED_SOURCE_INDICES = new Set<number>([
  12564, // l=9p0
  14107, // l=avv
]);

export type RawBoxobanLevel = {
  sourceIndex: number;
  rows: string[];
  tier: LevelTier;
};

export const boxobanSourceFiles: PackedLevelFile[] = packedLevelFiles.filter(
  (sourceFile) => sourceFile.levelCount > 0
);

export function trimSolidWallBorder(rows: readonly string[]): string[] {
  if (rows.length === 0) {
    return [];
  }

  const width = Math.max(...rows.map((row) => row.length));
  if (!Number.isFinite(width) || width <= 0) {
    return [...rows];
  }

  const grid = rows.map((row) => row.padEnd(width, " ").split(""));
  const height = grid.length;

  const isSolidWallRow = (
    rowIndex: number,
    left: number,
    right: number
  ): boolean => {
    const row = grid[rowIndex];
    if (!row) {
      return false;
    }
    for (let x = left; x <= right; x += 1) {
      if (row[x] !== "#") {
        return false;
      }
    }
    return true;
  };

  const isSolidWallCol = (
    colIndex: number,
    top: number,
    bottom: number
  ): boolean => {
    for (let y = top; y <= bottom; y += 1) {
      const row = grid[y];
      if (!row || row[colIndex] !== "#") {
        return false;
      }
    }
    return true;
  };

  let top = 0;
  let bottom = height - 1;
  let left = 0;
  let right = width - 1;
  let changed = true;

  while (changed && top <= bottom && left <= right) {
    changed = false;

    if (top <= bottom && isSolidWallRow(top, left, right)) {
      top += 1;
      changed = true;
    }

    if (top <= bottom && isSolidWallRow(bottom, left, right)) {
      bottom -= 1;
      changed = true;
    }

    if (left <= right && isSolidWallCol(left, top, bottom)) {
      left += 1;
      changed = true;
    }

    if (left <= right && isSolidWallCol(right, top, bottom)) {
      right -= 1;
      changed = true;
    }
  }

  if (top > bottom || left > right) {
    return [...rows];
  }

  return grid.slice(top, bottom + 1).map((row) => {
    return row.slice(left, right + 1).join("");
  });
}

export function parseLevel(rows: readonly string[]): ParsedLevel {
  const normalizedRows = trimSolidWallBorder(rows);
  const playableWidth =
    normalizedRows.length > 0
      ? Math.max(...normalizedRows.map((row) => row.length))
      : 0;
  const playableHeight = normalizedRows.length;
  const width = playableWidth;
  const height = playableHeight;
  const walls = new Set<string>();
  const goals = new Set<string>();
  const startBoxes = new Set<string>();
  let startPlayer: Coord | null = null;

  for (let y = 0; y < playableHeight; y += 1) {
    const row = normalizedRows[y] ?? "";
    for (let x = 0; x < playableWidth; x += 1) {
      const cell = row[x] ?? " ";
      const coord = { x, y };
      const key = toKey(coord);

      if (cell === "#") {
        walls.add(key);
        continue;
      }

      if (cell === "." || cell === "+" || cell === "*") {
        goals.add(key);
      }

      if (cell === "$" || cell === "*") {
        startBoxes.add(key);
      }

      if (cell === "@" || cell === "+") {
        startPlayer = coord;
      }
    }
  }

  if (!startPlayer) {
    throw new Error("Level is missing player start (@ or +)");
  }

  return {
    width,
    height,
    walls,
    goals,
    startBoxes,
    startPlayer,
  };
}

export function parseBoxobanLevels(
  sourceFiles: readonly PackedLevelFile[]
): RawBoxobanLevel[] {
  const parsedLevels: RawBoxobanLevel[] = [];
  let nextSourceIndex = 0;

  for (const sourceFile of sourceFiles) {
    let decodedRows: string[][] = [];
    try {
      decodedRows = decodePackedRows(sourceFile.data, sourceFile.levelCount);
    } catch {
      continue;
    }

    for (const rows of decodedRows) {
      parsedLevels.push({
        sourceIndex: nextSourceIndex,
        rows,
        tier: sourceFile.tier,
      });
      nextSourceIndex += 1;
    }
  }

  return parsedLevels;
}

export function minimumGoalMatchingDistance(
  boxesList: Coord[],
  goalsList: Coord[]
): number {
  if (boxesList.length === 0 || goalsList.length === 0) {
    return 0;
  }

  const usedGoalIndexes = new Set<number>();
  let bestCost = Number.POSITIVE_INFINITY;

  function search(boxIndex: number, cost: number): void {
    if (cost >= bestCost) {
      return;
    }

    if (boxIndex >= boxesList.length) {
      bestCost = Math.min(bestCost, cost);
      return;
    }

    const box = boxesList[boxIndex];
    if (!box) {
      return;
    }

    for (let goalIndex = 0; goalIndex < goalsList.length; goalIndex += 1) {
      if (usedGoalIndexes.has(goalIndex)) {
        continue;
      }

      const goal = goalsList[goalIndex];
      if (!goal) {
        continue;
      }

      usedGoalIndexes.add(goalIndex);
      search(boxIndex + 1, cost + manhattanDistance(box, goal));
      usedGoalIndexes.delete(goalIndex);
    }
  }

  search(0, 0);
  return Number.isFinite(bestCost) ? bestCost : 0;
}

export function countReachableOpenTiles(levelToScore: ParsedLevel): number {
  const queue: Coord[] = [{ ...levelToScore.startPlayer }];
  const visited = new Set<string>([toKey(levelToScore.startPlayer)]);
  let queueIndex = 0;

  while (queueIndex < queue.length) {
    const current = queue[queueIndex];
    queueIndex += 1;
    if (!current) {
      continue;
    }

    for (const direction of CARDINAL_DIRECTIONS) {
      const neighbor = {
        x: current.x + direction.dx,
        y: current.y + direction.dy,
      };
      if (
        neighbor.x < 0 ||
        neighbor.y < 0 ||
        neighbor.x >= levelToScore.width ||
        neighbor.y >= levelToScore.height
      ) {
        continue;
      }

      const neighborKey = toKey(neighbor);
      if (visited.has(neighborKey) || levelToScore.walls.has(neighborKey)) {
        continue;
      }

      visited.add(neighborKey);
      queue.push(neighbor);
    }
  }

  return visited.size;
}

export function estimateLevelComplexity(
  levelToScore: ParsedLevel,
  reachableOpenTiles: number
): number {
  const boxesList = Array.from(levelToScore.startBoxes, (boxKey) =>
    fromKey(boxKey)
  );
  const goalsList = Array.from(levelToScore.goals, (goalKey) =>
    fromKey(goalKey)
  );

  const playerToBoxDistance = boxesList.reduce((best, boxCoord) => {
    return Math.min(
      best,
      manhattanDistance(levelToScore.startPlayer, boxCoord)
    );
  }, Number.POSITIVE_INFINITY);

  const matchedGoalDistance = minimumGoalMatchingDistance(boxesList, goalsList);
  const boardArea = levelToScore.width * levelToScore.height;
  const wallDensity = boardArea > 0 ? levelToScore.walls.size / boardArea : 0;
  const roominessPenalty = Math.max(0, 40 - reachableOpenTiles);
  let adjacentGoalPenalty = 0;

  let cornerPenalty = 0;
  for (const boxCoord of boxesList) {
    if (levelToScore.goals.has(toKey(boxCoord))) {
      continue;
    }

    const up = levelToScore.walls.has(
      toKey({ x: boxCoord.x, y: boxCoord.y - 1 })
    );
    const down = levelToScore.walls.has(
      toKey({ x: boxCoord.x, y: boxCoord.y + 1 })
    );
    const left = levelToScore.walls.has(
      toKey({ x: boxCoord.x - 1, y: boxCoord.y })
    );
    const right = levelToScore.walls.has(
      toKey({ x: boxCoord.x + 1, y: boxCoord.y })
    );

    if ((up || down) && (left || right)) {
      cornerPenalty += 1;
    }

    const nearestGoalDistance = goalsList.reduce((bestDistance, goalCoord) => {
      return Math.min(bestDistance, manhattanDistance(boxCoord, goalCoord));
    }, Number.POSITIVE_INFINITY);

    if (nearestGoalDistance <= 1) {
      adjacentGoalPenalty += ADJACENT_BOX_GOAL_COMPLEXITY_PENALTY;
    } else if (nearestGoalDistance === 2) {
      adjacentGoalPenalty += NEAR_BOX_GOAL_COMPLEXITY_PENALTY;
    }
  }

  return (
    matchedGoalDistance * 12 +
    (Number.isFinite(playerToBoxDistance) ? playerToBoxDistance : 0) * 3 +
    cornerPenalty * 35 +
    adjacentGoalPenalty +
    wallDensity * 140 +
    roominessPenalty * 6
  );
}

export function compareCampaignLevels(
  a: CampaignLevel,
  b: CampaignLevel
): number {
  if (a.complexity !== b.complexity) {
    return a.complexity - b.complexity;
  }
  if (a.reachableOpenTiles !== b.reachableOpenTiles) {
    return b.reachableOpenTiles - a.reachableOpenTiles;
  }
  return a.sourceIndex - b.sourceIndex;
}

export function allocateTierTargets(
  levelLimit: number,
  availableByTier: Record<LevelTier, number>
): Record<LevelTier, number> {
  const targets: Record<LevelTier, number> = {
    unfiltered: 0,
    medium: 0,
    hard: 0,
  };
  const activeTiers = (["unfiltered", "medium", "hard"] as LevelTier[]).filter(
    (tier) => (availableByTier[tier] ?? 0) > 0
  );
  if (activeTiers.length === 0) {
    return targets;
  }

  const baseTarget = Math.floor(levelLimit / activeTiers.length);
  for (const tier of activeTiers) {
    targets[tier] = baseTarget;
  }

  let remainder = levelLimit - baseTarget * activeTiers.length;
  let remainderIndex = activeTiers.length - 1;
  while (remainder > 0) {
    const tier = activeTiers[remainderIndex];
    if (tier) {
      targets[tier] += 1;
      remainder -= 1;
    }
    remainderIndex -= 1;
    if (remainderIndex < 0) {
      remainderIndex = activeTiers.length - 1;
    }
  }

  const selectedTargets: Record<LevelTier, number> = {
    unfiltered: Math.min(targets.unfiltered, availableByTier.unfiltered),
    medium: Math.min(targets.medium, availableByTier.medium),
    hard: Math.min(targets.hard, availableByTier.hard),
  };

  let remaining =
    levelLimit -
    selectedTargets.unfiltered -
    selectedTargets.medium -
    selectedTargets.hard;
  const refillOrder: LevelTier[] = ["hard", "medium", "unfiltered"];

  while (remaining > 0) {
    let filled = false;
    for (const tier of refillOrder) {
      if (selectedTargets[tier] >= availableByTier[tier]) {
        continue;
      }
      selectedTargets[tier] += 1;
      remaining -= 1;
      filled = true;
      if (remaining <= 0) {
        break;
      }
    }
    if (!filled) {
      break;
    }
  }

  return selectedTargets;
}

export function buildBoxobanCampaign(
  sourceFiles: readonly PackedLevelFile[],
  levelLimit: number
): CampaignLevel[] {
  const parsedLevels = parseBoxobanLevels(sourceFiles);
  const scoredByTier: Record<LevelTier, CampaignLevel[]> = {
    unfiltered: [],
    medium: [],
    hard: [],
  };
  const safeLimit = Math.max(1, levelLimit);

  for (const parsedLevel of parsedLevels) {
    try {
      const levelData = parseLevel(parsedLevel.rows);
      const reachableOpenTiles = countReachableOpenTiles(levelData);
      scoredByTier[parsedLevel.tier].push({
        ...levelData,
        id: `boxoban-${parsedLevel.tier}-${String(
          parsedLevel.sourceIndex
        ).padStart(6, "0")}`,
        sourceIndex: parsedLevel.sourceIndex,
        tier: parsedLevel.tier,
        complexity: estimateLevelComplexity(levelData, reachableOpenTiles),
        reachableOpenTiles,
      });
    } catch {
      // Skip malformed level blocks.
    }
  }

  const sortedByTier: Record<LevelTier, CampaignLevel[]> = {
    unfiltered: [...scoredByTier.unfiltered].sort(compareCampaignLevels),
    medium: [...scoredByTier.medium].sort(compareCampaignLevels),
    hard: [...scoredByTier.hard].sort(compareCampaignLevels),
  };
  const availableByTier: Record<LevelTier, number> = {
    unfiltered: sortedByTier.unfiltered.length,
    medium: sortedByTier.medium.length,
    hard: sortedByTier.hard.length,
  };
  const targets = allocateTierTargets(safeLimit, availableByTier);

  const roomyUnfiltered = sortedByTier.unfiltered.filter(
    (candidateLevel) =>
      candidateLevel.reachableOpenTiles >= MIN_REACHABLE_OPEN_TILES
  );
  const unfilteredPool =
    roomyUnfiltered.length >= targets.unfiltered
      ? roomyUnfiltered
      : sortedByTier.unfiltered;

  const selectedUnfiltered = unfilteredPool.slice(0, targets.unfiltered);
  const selectedMedium = sortedByTier.medium.slice(0, targets.medium);
  const selectedHard = sortedByTier.hard.slice(0, targets.hard);

  return [...selectedUnfiltered, ...selectedMedium, ...selectedHard].slice(
    0,
    safeLimit
  );
}

export function applyShipSourceIndexBlocklist(
  levels: readonly CampaignLevel[]
): CampaignLevel[] {
  const blockedSourceIndices = new Set<number>(SHIP_BLOCKED_SOURCE_INDICES);
  if (blockedSourceIndices.size === 0) {
    return [...levels];
  }

  return levels.filter(
    (candidateLevel) => !blockedSourceIndices.has(candidateLevel.sourceIndex)
  );
}

export function createFallbackCampaignLevel(): CampaignLevel {
  const fallbackLevelData = parseLevel(FALLBACK_LEVEL_ROWS);
  return {
    ...fallbackLevelData,
    id: "fallback-000",
    sourceIndex: 0,
    tier: "unfiltered",
    complexity: 0,
    reachableOpenTiles: countReachableOpenTiles(fallbackLevelData),
  };
}

export const fallbackCampaignLevel = createFallbackCampaignLevel();

export function createBoxobanCampaign(
  sourceFiles: readonly PackedLevelFile[] = boxobanSourceFiles,
  levelLimit = BOXOBAN_LEVEL_LIMIT
): CampaignLevel[] {
  const parsedCampaignLevels = buildBoxobanCampaign(sourceFiles, levelLimit);
  const curatedCampaignLevels =
    applyShipSourceIndexBlocklist(parsedCampaignLevels);
  return curatedCampaignLevels.length > 0
    ? curatedCampaignLevels
    : [fallbackCampaignLevel];
}

export const campaignLevels = createBoxobanCampaign();
