import type { SceneState } from "@layoutit/voxcss";

import { fromKey, toKey } from "./game/coords";
import type { CampaignLevel, Coord } from "./game/types";

type Voxel = SceneState["voxels"][number];
type PlayerRenderVoxel = Voxel & {
  noCull?: boolean;
  renderPass?: number;
};

const FLOOR_TILE_TEXTURE = "/floortile.png";

type SceneVoxelInput = {
  level: CampaignLevel;
  boxes: ReadonlySet<string>;
  player: Coord;
};

function createUnitCube(
  x: number,
  y: number,
  z: number,
  props: Omit<Partial<Voxel>, "x" | "y" | "z" | "x2" | "y2"> = {}
): Voxel {
  const gridX = x + 1;
  const gridY = y + 1;
  const gridArea = `${gridX} / ${gridY} / ${gridX + 1} / ${gridY + 1}`;

  return {
    x: gridX,
    y: gridY,
    z,
    x2: gridX + 1,
    y2: gridY + 1,
    shape: "cube",
    ...props,
    data: {
      ...(props.data ?? {}),
      gridArea,
      footprint: "1x1",
    },
  };
}

export function buildSceneVoxels({
  level,
  boxes,
  player,
}: SceneVoxelInput): SceneState["voxels"] {
  const nextVoxels: SceneState["voxels"] = [];

  for (let y = 0; y < level.height; y += 1) {
    for (let x = 0; x < level.width; x += 1) {
      const coord = { x, y };
      const key = toKey(coord);

      if (level.goals.has(key)) {
        nextVoxels.push(
          createUnitCube(x, y, 0, {
            color: "#9fca86",
          })
        );
      } else {
        nextVoxels.push(
          createUnitCube(x, y, 0, {
            color: "#d8d2c7",
            texture: FLOOR_TILE_TEXTURE,
          })
        );
      }

      if (level.walls.has(key)) {
        nextVoxels.push(createUnitCube(x, y, 1, { color: "#737f8b" }));
      }
    }
  }

  for (const boxKey of boxes) {
    const boxCoord = fromKey(boxKey);
    nextVoxels.push(
      createUnitCube(boxCoord.x, boxCoord.y, 1, {
        color: "#b77d44",
      })
    );
  }

  const playerBodyCube = createUnitCube(player.x, player.y, 1, {
    color: "#d0c3b2",
  }) as PlayerRenderVoxel;
  playerBodyCube.noCull = true;
  playerBodyCube.renderPass = 100;
  nextVoxels.push(playerBodyCube);

  const playerHeadCube = createUnitCube(player.x, player.y, 2, {
    color: "#d9d9d9",
  }) as PlayerRenderVoxel;
  playerHeadCube.noCull = true;
  playerHeadCube.renderPass = 100;
  nextVoxels.push(playerHeadCube);

  return nextVoxels;
}
