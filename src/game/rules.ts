import {
  CARDINAL_DIRECTIONS,
  directionFromDelta,
  toKey,
} from "./coords";
import type { Coord, Facing, ParsedLevel } from "./types";

export type MoveResult = {
  moved: boolean;
  player: Coord;
  facing: Facing;
  boxes: Set<string>;
  pushedBoxCoord: Coord | null;
  pushedBoxKey: string | null;
};

export function isOutOfBounds(level: ParsedLevel, coord: Coord): boolean {
  return (
    coord.x < 0 ||
    coord.y < 0 ||
    coord.x >= level.width ||
    coord.y >= level.height
  );
}

export function isWall(level: ParsedLevel, coord: Coord): boolean {
  return isOutOfBounds(level, coord) || level.walls.has(toKey(coord));
}

export function hasBox(boxes: ReadonlySet<string>, coord: Coord): boolean {
  return boxes.has(toKey(coord));
}

export function isBlockedCell(
  level: ParsedLevel,
  boxes: ReadonlySet<string>,
  coord: Coord
): boolean {
  return isWall(level, coord) || hasBox(boxes, coord);
}

export function reachableOpenTiles(
  level: ParsedLevel,
  boxes: ReadonlySet<string>,
  start: Coord
): Set<string> {
  const visited = new Set<string>();
  const startKey = toKey(start);
  if (isWall(level, start) || hasBox(boxes, start)) {
    return visited;
  }

  const queue: Coord[] = [{ ...start }];
  visited.add(startKey);

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
      const neighborKey = toKey(neighbor);
      if (visited.has(neighborKey)) {
        continue;
      }
      if (isWall(level, neighbor) || hasBox(boxes, neighbor)) {
        continue;
      }
      visited.add(neighborKey);
      queue.push(neighbor);
    }
  }

  return visited;
}

export function hasAnyLegalPushAvailable(
  level: ParsedLevel,
  boxes: ReadonlySet<string>,
  player: Coord
): boolean {
  const reachable = reachableOpenTiles(level, boxes, player);

  for (const boxKey of boxes) {
    const [xRaw, yRaw] = boxKey.split(",");
    const boxCoord = { x: Number(xRaw), y: Number(yRaw) };
    for (const direction of CARDINAL_DIRECTIONS) {
      const stance = {
        x: boxCoord.x - direction.dx,
        y: boxCoord.y - direction.dy,
      };
      const target = {
        x: boxCoord.x + direction.dx,
        y: boxCoord.y + direction.dy,
      };

      if (!reachable.has(toKey(stance))) {
        continue;
      }
      if (isWall(level, target) || hasBox(boxes, target)) {
        continue;
      }

      return true;
    }
  }

  return false;
}

export function reachableOpenTilesWithSingleBox(
  level: ParsedLevel,
  start: Coord,
  boxCoord: Coord
): Set<string> {
  const visited = new Set<string>();
  if (
    isWall(level, start) ||
    (start.x === boxCoord.x && start.y === boxCoord.y)
  ) {
    return visited;
  }

  const queue: Coord[] = [{ ...start }];
  visited.add(toKey(start));

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
      if (isWall(level, neighbor)) {
        continue;
      }
      if (neighbor.x === boxCoord.x && neighbor.y === boxCoord.y) {
        continue;
      }

      const neighborKey = toKey(neighbor);
      if (visited.has(neighborKey)) {
        continue;
      }

      visited.add(neighborKey);
      queue.push(neighbor);
    }
  }

  return visited;
}

export function canSingleBoxReachAnyGoalFromState(
  level: ParsedLevel,
  boxStart: Coord,
  playerStart: Coord
): boolean {
  const startStateKey = `${toKey(boxStart)}|${toKey(playerStart)}`;
  const visitedStates = new Set<string>([startStateKey]);
  const queue: Array<{ box: Coord; player: Coord }> = [
    { box: { ...boxStart }, player: { ...playerStart } },
  ];

  let queueIndex = 0;
  while (queueIndex < queue.length) {
    const state = queue[queueIndex];
    queueIndex += 1;
    if (!state) {
      continue;
    }

    const boxKey = toKey(state.box);
    if (level.goals.has(boxKey)) {
      return true;
    }

    const reachable = reachableOpenTilesWithSingleBox(
      level,
      state.player,
      state.box
    );

    for (const direction of CARDINAL_DIRECTIONS) {
      const stance = {
        x: state.box.x - direction.dx,
        y: state.box.y - direction.dy,
      };
      const stanceKey = toKey(stance);
      if (!reachable.has(stanceKey)) {
        continue;
      }

      const target = {
        x: state.box.x + direction.dx,
        y: state.box.y + direction.dy,
      };
      if (isWall(level, target)) {
        continue;
      }

      const nextStateKey = `${toKey(target)}|${boxKey}`;
      if (visitedStates.has(nextStateKey)) {
        continue;
      }

      visitedStates.add(nextStateKey);
      queue.push({
        box: target,
        player: state.box,
      });
    }
  }

  return false;
}

export function tryMoveOnBoard(
  level: ParsedLevel,
  player: Coord,
  boxes: ReadonlySet<string>,
  dx: number,
  dy: number
): MoveResult {
  const next = {
    x: player.x + dx,
    y: player.y + dy,
  };
  const facing = directionFromDelta(dx, dy);

  if (isWall(level, next)) {
    return {
      moved: false,
      player,
      facing,
      boxes: new Set(boxes),
      pushedBoxCoord: null,
      pushedBoxKey: null,
    };
  }

  if (hasBox(boxes, next)) {
    const pushTarget = {
      x: next.x + dx,
      y: next.y + dy,
    };

    if (isWall(level, pushTarget) || hasBox(boxes, pushTarget)) {
      return {
        moved: false,
        player,
        facing,
        boxes: new Set(boxes),
        pushedBoxCoord: null,
        pushedBoxKey: null,
      };
    }

    const nextBoxes = new Set(boxes);
    nextBoxes.delete(toKey(next));
    nextBoxes.add(toKey(pushTarget));
    return {
      moved: true,
      player: next,
      facing,
      boxes: nextBoxes,
      pushedBoxCoord: pushTarget,
      pushedBoxKey: toKey(pushTarget),
    };
  }

  return {
    moved: true,
    player: next,
    facing,
    boxes: new Set(boxes),
    pushedBoxCoord: null,
    pushedBoxKey: null,
  };
}
