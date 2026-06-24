import type { Coord, Facing, MoveDirection } from "./types";

export const CARDINAL_DIRECTIONS: Array<{ dx: number; dy: number }> = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

export const MOVE_DELTAS_BY_DIRECTION: Record<
  MoveDirection,
  { dx: number; dy: number }
> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: 1, dy: 0 },
  right: { dx: -1, dy: 0 },
};

export function toKey(coord: Coord): string {
  return `${coord.x},${coord.y}`;
}

export function fromKey(value: string): Coord {
  const [xRaw, yRaw] = value.split(",");
  return {
    x: Number(xRaw),
    y: Number(yRaw),
  };
}

export function manhattanDistance(a: Coord, b: Coord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function directionFromDelta(dx: number, dy: number): Facing {
  if (dy < 0) {
    return "north";
  }
  if (dy > 0) {
    return "south";
  }
  if (dx < 0) {
    return "west";
  }
  return "east";
}
