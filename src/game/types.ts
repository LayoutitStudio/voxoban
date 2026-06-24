export type Coord = {
  x: number;
  y: number;
};

export type LevelTier = "unfiltered" | "medium" | "hard";
export type Facing = "north" | "south" | "west" | "east";
export type MoveDirection = "up" | "down" | "left" | "right";

export type ParsedLevel = {
  width: number;
  height: number;
  walls: Set<string>;
  goals: Set<string>;
  startBoxes: Set<string>;
  startPlayer: Coord;
};

export type CampaignLevel = ParsedLevel & {
  id: string;
  sourceIndex: number;
  tier: LevelTier;
  complexity: number;
  reachableOpenTiles: number;
};

export type MoveSnapshot = {
  player: Coord;
  facing: Facing;
  boxes: Set<string>;
  steps: number;
  elapsedSeconds: number;
  forcedLoss: boolean;
};
