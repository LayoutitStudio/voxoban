import { fromKey } from "./game/coords";
import type { CampaignLevel, Coord, Facing } from "./game/types";

type CubeFaceKey = "t" | "b" | "fr" | "fl" | "bl" | "br";
type LocalSide = "front" | "back" | "left" | "right";
type WorldSide = "north" | "south" | "west" | "east";
type LateralFaceKey = Exclude<CubeFaceKey, "t" | "b">;
type SpriteTextureSet = Partial<Record<LocalSide | "top", string>>;

type ActorTextureContext = {
  root: HTMLElement | null;
  level: CampaignLevel;
  boxes: ReadonlySet<string>;
  player: Coord;
  facing: Facing;
};

type ActorTextureScheduler = {
  schedule: () => void;
  cancel: () => void;
};

const BOX_TOP_TEXTURE = "/boxtop.png";
const BOX_SIDE_TEXTURE = "/boxside.png";
const PLAYER_HEAD_SIDE_TEXTURES: SpriteTextureSet = {
  front: "/spacedrome-character/face-front.svg",
  back: "/spacedrome-character/face-back.svg",
  left: "/spacedrome-character/face-left.svg",
  right: "/spacedrome-character/face-right.svg",
  top: "/spacedrome-character/face-top.svg",
};

const PLAYER_BODY_SIDE_TEXTURES: SpriteTextureSet = {
  front: "/spacedrome-character/face-front-b.svg",
  back: "/spacedrome-character/face-back-b.svg",
  left: "/spacedrome-character/face-left-b.svg",
  right: "/spacedrome-character/face-right-b.svg",
};

const VOX_FACE_LAYER_CLASS = "voxoban-face-layer";
const LOCAL_SIDES: LocalSide[] = ["front", "back", "left", "right"];
const BOX_ON_GOAL_CLASS = "voxoban-box-on-goal";
const ACTOR_CUBE_CLASS = "voxoban-actor-cube";
const BOX_CUBE_CLASS = "voxoban-box-cube";
const VOXCSS_CUBE_CLASS = "voxcss-cube";
const PLAYER_BODY_CUBE_CLASS = "voxoban-player-body-cube";
const PLAYER_HEAD_CUBE_CLASS = "voxoban-player-head-cube";
const PLAYER_BODY_FALLBACK_CLASS = "voxoban-player-body-fallback";
const PLAYER_HEAD_FALLBACK_CLASS = "voxoban-player-head-fallback";
const SYNTHETIC_FACE_CLASS = "voxoban-synthetic-face";

const WORLD_SIDE_BY_FACE: Record<LateralFaceKey, WorldSide> = {
  fr: "south",
  fl: "east",
  bl: "north",
  br: "west",
};

const LOCAL_TO_WORLD_BY_FACING: Record<Facing, Record<LocalSide, WorldSide>> = {
  south: {
    front: "south",
    back: "north",
    left: "east",
    right: "west",
  },
  north: {
    front: "north",
    back: "south",
    left: "west",
    right: "east",
  },
  east: {
    front: "east",
    back: "west",
    left: "north",
    right: "south",
  },
  west: {
    front: "west",
    back: "east",
    left: "south",
    right: "north",
  },
};

const FACE_IMAGE_ROTATION_DEG: Partial<Record<CubeFaceKey, number>> = {
  fr: -90,
  bl: -90,
  fl: 180,
  br: 180,
  t: 0,
};
const PLAYER_HEAD_TOP_ROTATION_BY_FACING: Record<Facing, number> = {
  east: 180,
  south: 90,
  west: 0,
  north: 270,
};
const FACE_TEXTURE_BRIGHTNESS: Record<CubeFaceKey, number> = {
  t: 1,
  b: 1,
  fr: 0.925,
  fl: 0.875,
  bl: 0.8,
  br: 0.85,
};
const BOX_FACE_TEXTURE_MAP: Partial<Record<CubeFaceKey, string>> = {
  t: BOX_TOP_TEXTURE,
  fr: BOX_SIDE_TEXTURE,
  fl: BOX_SIDE_TEXTURE,
  bl: BOX_SIDE_TEXTURE,
  br: BOX_SIDE_TEXTURE,
};

export function createActorTextureScheduler(
  getContext: () => ActorTextureContext
): ActorTextureScheduler {
  let rafId: number | null = null;

  const apply = () => {
    applyActorTextures(getContext());
  };

  const cancel = () => {
    if (rafId === null) {
      return;
    }

    if (typeof window !== "undefined") {
      window.cancelAnimationFrame(rafId);
    }
    rafId = null;
  };

  const schedule = () => {
    if (typeof window === "undefined") {
      apply();
      return;
    }

    cancel();
    apply();

    // VoxCSS can swap face nodes during and right after camera updates.
    rafId = window.requestAnimationFrame(() => {
      apply();
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        apply();
      });
    });
  };

  return {
    schedule,
    cancel,
  };
}

function applyActorTextures(context: ActorTextureContext): void {
  const { root } = context;
  if (!root) {
    return;
  }

  applyActorCubeClasses(root, context);
  applyBoxTextures(root, context);
  applyBoxGoalHighlights(root, context);

  const resolvedPlayerCubes = resolvePlayerCubeCandidates(
    root,
    context.player
  );
  let bodyCubes = [...resolvedPlayerCubes.bodyCubes];
  let headCubes = [...resolvedPlayerCubes.headCubes];
  let bodyCube = bodyCubes[0] ?? null;
  let headCube = headCubes[0] ?? null;

  if (bodyCubes.length === 0 && headCubes.length === 0) {
    return;
  }

  if (!bodyCube && headCube) {
    const fallbackBodyCube = createBodyFallbackCube(root, headCube);
    if (fallbackBodyCube) {
      bodyCubes = [fallbackBodyCube];
      bodyCube = fallbackBodyCube;
    }
  }
  if (!headCube && bodyCube) {
    const fallbackHeadCube = createHeadFallbackCube(root, bodyCube);
    if (fallbackHeadCube) {
      headCubes = [fallbackHeadCube];
    }
  }

  const headFaceTextureMap = buildFaceTextureMap(
    PLAYER_HEAD_SIDE_TEXTURES,
    context.facing
  );
  const bodyFaceTextureMap = buildFaceTextureMap(
    PLAYER_BODY_SIDE_TEXTURES,
    context.facing
  );
  const headFaceRotationOverrides = getPlayerHeadFaceRotationOverrides(
    context.facing
  );
  const headFaceScaleXOverrides: Partial<Record<CubeFaceKey, number>> = {};
  const headFaceScaleYOverrides: Partial<Record<CubeFaceKey, number>> = {};
  if (context.facing === "east") {
    for (const [face, texture] of Object.entries(headFaceTextureMap) as Array<
      [CubeFaceKey, string]
    >) {
      if (face === "bl") {
        continue;
      }
      if (
        texture === PLAYER_HEAD_SIDE_TEXTURES.left ||
        texture === PLAYER_HEAD_SIDE_TEXTURES.right
      ) {
        headFaceScaleXOverrides[face] = -1;
      }
    }
    // Left-facing: mirror the back-left face in face space.
    headFaceScaleXOverrides.bl = -1;
  }
  for (const cube of headCubes) {
    applyCubeFaceTextureMap(cube, headFaceTextureMap, {
      forceMissingTexturedFaces: true,
      forceAllFaces: true,
      forceCubeVisible: true,
      preferSyntheticFaces: true,
      hideNativeTexturedFaces: true,
      faceRotationOverrides: headFaceRotationOverrides,
      faceScaleXOverrides: headFaceScaleXOverrides,
      faceScaleYOverrides: headFaceScaleYOverrides,
    });
  }

  for (const cube of bodyCubes) {
    applyCubeFaceTextureMap(cube, bodyFaceTextureMap, {
      forceMissingTexturedFaces: true,
      forceAllFaces: true,
      forceCubeVisible: true,
      preferSyntheticFaces: true,
      hideNativeTexturedFaces: true,
    });
  }
}

function findCubesAt(
  root: HTMLElement,
  x: number,
  y: number
): Array<{ z: number; cube: HTMLElement }> {
  const parseLayerDepth = (
    layer: HTMLElement,
    fallbackDepth: number
  ): number => {
    const transformValue = layer.style.transform ?? "";
    const match = transformValue.match(/translateZ\(([-+]?\d*\.?\d+)px\)/);
    if (!match) {
      return fallbackDepth;
    }

    const parsed = Number.parseFloat(match[1] ?? "");
    return Number.isFinite(parsed) ? parsed : fallbackDepth;
  };

  const layers = Array.from(
    root.querySelectorAll<HTMLElement>(".voxcss-layer")
  );
  const gridX = x + 1;
  const gridY = y + 1;
  const targetGridArea = `${gridX} / ${gridY} / ${gridX + 1} / ${gridY + 1}`;

  const matches: Array<{ z: number; cube: HTMLElement }> = [];
  for (let z = 0; z < layers.length; z += 1) {
    const layer = layers[z];
    if (!layer) {
      continue;
    }
    const layerDepth = parseLayerDepth(layer, z);

    const layerEntries = Array.from(layer.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement
    );
    for (const cube of layerEntries) {
      if (cube.style.gridArea === targetGridArea) {
        matches.push({ z: layerDepth, cube });
      }
    }
  }

  return matches;
}

function buildFaceTextureMap(
  sideTextures: SpriteTextureSet,
  facingDirection: Facing
): Partial<Record<CubeFaceKey, string>> {
  const localToWorld = LOCAL_TO_WORLD_BY_FACING[facingDirection];
  const worldTextureBySide: Partial<Record<WorldSide, string>> = {};
  const faceTextureMap: Partial<Record<CubeFaceKey, string>> = {};

  for (const localSide of LOCAL_SIDES) {
    const texture = sideTextures[localSide];
    if (!texture) {
      continue;
    }
    const worldSide = localToWorld[localSide];
    worldTextureBySide[worldSide] = texture;
  }

  for (const [face, worldSide] of Object.entries(WORLD_SIDE_BY_FACE) as Array<
    [LateralFaceKey, WorldSide]
  >) {
    const texture = worldTextureBySide[worldSide];
    if (texture) {
      faceTextureMap[face] = texture;
    }
  }

  const topTexture = sideTextures.top;
  if (topTexture) {
    faceTextureMap.t = topTexture;
  }

  return faceTextureMap;
}

function getPlayerHeadFaceRotationOverrides(
  facingDirection: Facing
): Partial<Record<CubeFaceKey, number>> {
  const sideRotationOffsetDeg = facingDirection === "west" ? 180 : 0;
  return {
    t: PLAYER_HEAD_TOP_ROTATION_BY_FACING[facingDirection] ?? 0,
    fr: ((FACE_IMAGE_ROTATION_DEG.fr ?? 0) + sideRotationOffsetDeg + 360) % 360,
    fl: ((FACE_IMAGE_ROTATION_DEG.fl ?? 0) + sideRotationOffsetDeg + 360) % 360,
    bl: ((FACE_IMAGE_ROTATION_DEG.bl ?? 0) + sideRotationOffsetDeg + 360) % 360,
    br: ((FACE_IMAGE_ROTATION_DEG.br ?? 0) + sideRotationOffsetDeg + 360) % 360,
  };
}

function ensureFaceLayer(faceElement: HTMLElement): HTMLElement {
  let layer = faceElement.querySelector<HTMLElement>(
    `.${VOX_FACE_LAYER_CLASS}`
  );
  if (layer) {
    return layer;
  }

  layer = faceElement.ownerDocument.createElement("div");
  layer.className = VOX_FACE_LAYER_CLASS;
  faceElement.appendChild(layer);
  return layer;
}

function ensureCubeFaceElement(
  cube: HTMLElement,
  face: CubeFaceKey,
  options: {
    forceCreate?: boolean;
    syntheticOnly?: boolean;
  } = {}
): HTMLElement | null {
  const forceCreate = options.forceCreate === true;
  const syntheticOnly = options.syntheticOnly === true;

  if (syntheticOnly) {
    const syntheticSelector = `.voxcss-cube-face--${face}.${SYNTHETIC_FACE_CLASS}`;
    const existingSynthetic =
      cube.querySelector<HTMLElement>(syntheticSelector);
    if (existingSynthetic) {
      return existingSynthetic;
    }

    if (!forceCreate) {
      return null;
    }

    const doc = cube.ownerDocument ?? document;
    const createdSynthetic = doc.createElement("div");
    createdSynthetic.className = `voxcss-cube-face voxcss-cube-face--${face} ${SYNTHETIC_FACE_CLASS}`;
    cube.appendChild(createdSynthetic);
    return createdSynthetic;
  }

  const selector = `.voxcss-cube-face--${face}`;
  const existing = cube.querySelector<HTMLElement>(selector);
  if (existing) {
    return existing;
  }

  if (!forceCreate) {
    return null;
  }

  const doc = cube.ownerDocument ?? document;
  const created = doc.createElement("div");
  created.className = `voxcss-cube-face voxcss-cube-face--${face} ${SYNTHETIC_FACE_CLASS}`;
  cube.appendChild(created);
  return created;
}

function hideNativeCubeFace(cube: HTMLElement, face: CubeFaceKey): void {
  const nativeFaces = Array.from(
    cube.querySelectorAll<HTMLElement>(
      `.voxcss-cube-face--${face}:not(.${SYNTHETIC_FACE_CLASS})`
    )
  );
  for (const nativeFace of nativeFaces) {
    nativeFace.style.display = "none";
    nativeFace.style.visibility = "hidden";
  }
}

function restoreNativeCubeFaces(cube: HTMLElement): void {
  const nativeFaces = Array.from(
    cube.querySelectorAll<HTMLElement>(
      `.voxcss-cube-face:not(.${SYNTHETIC_FACE_CLASS})`
    )
  );
  for (const nativeFace of nativeFaces) {
    nativeFace.style.removeProperty("display");
    nativeFace.style.removeProperty("visibility");
  }
}

function applyCubeFaceTextureMap(
  cube: HTMLElement,
  faceTextureMap: Partial<Record<CubeFaceKey, string>>,
  options: {
    forceMissingTexturedFaces?: boolean;
    forceAllFaces?: boolean;
    forceCubeVisible?: boolean;
    preferSyntheticFaces?: boolean;
    hideNativeTexturedFaces?: boolean;
    faceRotationOverrides?: Partial<Record<CubeFaceKey, number>>;
    faceScaleXOverrides?: Partial<Record<CubeFaceKey, number>>;
    faceScaleYOverrides?: Partial<Record<CubeFaceKey, number>>;
    faceScreenScaleXOverrides?: Partial<Record<CubeFaceKey, number>>;
    faceScreenScaleYOverrides?: Partial<Record<CubeFaceKey, number>>;
  } = {}
): void {
  const forceMissingTexturedFaces = options.forceMissingTexturedFaces === true;
  const forceAllFaces = options.forceAllFaces === true;
  const forceCubeVisible = options.forceCubeVisible === true;
  const preferSyntheticFaces = options.preferSyntheticFaces === true;
  const hideNativeTexturedFaces = options.hideNativeTexturedFaces === true;
  const allFaces: CubeFaceKey[] = ["t", "b", "fr", "fl", "bl", "br"];

  if (forceCubeVisible) {
    // VoxCSS can set fully-culled cubes to display:none.
    // When we synthesize faces, keep the cube visible.
    cube.style.display = "";
  }

  for (const face of allFaces) {
    const texture = faceTextureMap[face];
    const shouldForceCreate =
      forceAllFaces ||
      (forceMissingTexturedFaces && Boolean(texture) && face !== "b");
    const useSyntheticFace = preferSyntheticFaces && Boolean(texture);
    const faceElement = ensureCubeFaceElement(cube, face, {
      forceCreate: shouldForceCreate || useSyntheticFace,
      syntheticOnly: useSyntheticFace,
    });
    if (!faceElement) {
      continue;
    }

    if (hideNativeTexturedFaces && texture) {
      hideNativeCubeFace(cube, face);
    }

    faceElement.style.backgroundImage = "none";
    faceElement.style.display = "";
    faceElement.style.visibility = "visible";
    faceElement.style.opacity = "1";

    const layer = ensureFaceLayer(faceElement);
    if (!texture) {
      layer.style.backgroundImage = "none";
      layer.style.display = "none";
      layer.style.transform = "";
      layer.style.removeProperty("--voxoban-face-brightness");
      continue;
    }

    const rotationDeg =
      options.faceRotationOverrides?.[face] ??
      FACE_IMAGE_ROTATION_DEG[face] ??
      0;
    const scaleX = options.faceScaleXOverrides?.[face] ?? 1;
    const scaleY = options.faceScaleYOverrides?.[face] ?? 1;
    const screenScaleX = options.faceScreenScaleXOverrides?.[face] ?? 1;
    const screenScaleY = options.faceScreenScaleYOverrides?.[face] ?? 1;
    const brightness = FACE_TEXTURE_BRIGHTNESS[face] ?? 1;
    layer.style.display = "block";
    layer.style.backgroundImage = `url("${texture}")`;
    layer.style.backgroundRepeat = "no-repeat";
    layer.style.backgroundSize = "100% 100%";
    layer.style.backgroundPosition = "center";
    layer.style.transform = `scale(${screenScaleX}, ${screenScaleY}) rotate(${rotationDeg}deg) scale(${scaleX}, ${scaleY})`;
    layer.style.setProperty("--voxoban-face-brightness", String(brightness));
  }
}

function clearBoxGoalHighlights(root: HTMLElement): void {
  const highlightedCubes = Array.from(
    root.querySelectorAll<HTMLElement>(`.${BOX_ON_GOAL_CLASS}`)
  );
  for (const cube of highlightedCubes) {
    cube.classList.remove(BOX_ON_GOAL_CLASS);
  }
}

function applyBoxGoalHighlights(
  root: HTMLElement,
  context: ActorTextureContext
): void {
  clearBoxGoalHighlights(root);

  for (const boxKey of context.boxes) {
    if (!context.level.goals.has(boxKey)) {
      continue;
    }

    const boxCoord = fromKey(boxKey);
    const cubesAtBox = findCubesAt(root, boxCoord.x, boxCoord.y)
      .filter((entry) => entry.z > 0)
      .sort((a, b) => a.z - b.z);
    const boxCube = cubesAtBox[cubesAtBox.length - 1]?.cube ?? null;
    if (!boxCube) {
      continue;
    }

    boxCube.classList.add(BOX_ON_GOAL_CLASS);
  }
}

function applyBoxTextures(root: HTMLElement, context: ActorTextureContext): void {
  for (const boxKey of context.boxes) {
    const boxCoord = fromKey(boxKey);
    const cubesAtBox = findCubesAt(root, boxCoord.x, boxCoord.y)
      .filter((entry) => entry.z > 0)
      .sort((a, b) => a.z - b.z);
    const boxCube = cubesAtBox[cubesAtBox.length - 1]?.cube ?? null;
    if (!boxCube) {
      continue;
    }

    applyCubeFaceTextureMap(boxCube, BOX_FACE_TEXTURE_MAP, {
      forceMissingTexturedFaces: true,
      preferSyntheticFaces: true,
      hideNativeTexturedFaces: true,
    });
  }
}

function clearActorCubeClasses(root: HTMLElement): void {
  const fallbackBodyCubes = Array.from(
    root.querySelectorAll<HTMLElement>(`.${PLAYER_BODY_FALLBACK_CLASS}`)
  );
  for (const fallbackCube of fallbackBodyCubes) {
    fallbackCube.remove();
  }

  const fallbackHeadCubes = Array.from(
    root.querySelectorAll<HTMLElement>(`.${PLAYER_HEAD_FALLBACK_CLASS}`)
  );
  for (const fallbackCube of fallbackHeadCubes) {
    fallbackCube.remove();
  }

  const actorCubes = Array.from(
    root.querySelectorAll<HTMLElement>(`.${ACTOR_CUBE_CLASS}`)
  );
  for (const cube of actorCubes) {
    restoreNativeCubeFaces(cube);
    cube.classList.remove(ACTOR_CUBE_CLASS);
    cube.classList.remove(BOX_CUBE_CLASS);
    cube.classList.remove(PLAYER_BODY_CUBE_CLASS);
    cube.classList.remove(PLAYER_HEAD_CUBE_CLASS);
  }

  const syntheticFaces = Array.from(
    root.querySelectorAll<HTMLElement>(`.${SYNTHETIC_FACE_CLASS}`)
  );
  for (const face of syntheticFaces) {
    face.remove();
  }
}

function createBodyFallbackCube(
  root: HTMLElement,
  headCube: HTMLElement
): HTMLElement | null {
  const layers = Array.from(
    root.querySelectorAll<HTMLElement>(".voxcss-layer")
  );
  const bodyLayer = layers[1];
  if (!bodyLayer) {
    return null;
  }

  const doc = root.ownerDocument ?? document;
  const fallbackCube = doc.createElement("div");
  fallbackCube.className = [
    VOXCSS_CUBE_CLASS,
    ACTOR_CUBE_CLASS,
    PLAYER_BODY_CUBE_CLASS,
    PLAYER_BODY_FALLBACK_CLASS,
  ].join(" ");
  fallbackCube.style.gridArea = headCube.style.gridArea;
  fallbackCube.style.setProperty(
    "--voxcss-side-offset-x",
    headCube.style.getPropertyValue("--voxcss-side-offset-x")
  );
  fallbackCube.style.setProperty(
    "--voxcss-side-offset-y",
    headCube.style.getPropertyValue("--voxcss-side-offset-y")
  );
  fallbackCube.style.setProperty(
    "--voxcss-fr-offset",
    headCube.style.getPropertyValue("--voxcss-fr-offset")
  );

  bodyLayer.appendChild(fallbackCube);
  return fallbackCube;
}

function createHeadFallbackCube(
  root: HTMLElement,
  bodyCube: HTMLElement
): HTMLElement | null {
  const layers = Array.from(
    root.querySelectorAll<HTMLElement>(".voxcss-layer")
  );
  const headLayer = layers[2];
  if (!headLayer) {
    return null;
  }

  const doc = root.ownerDocument ?? document;
  const fallbackCube = doc.createElement("div");
  fallbackCube.className = [
    VOXCSS_CUBE_CLASS,
    ACTOR_CUBE_CLASS,
    PLAYER_HEAD_CUBE_CLASS,
    PLAYER_HEAD_FALLBACK_CLASS,
  ].join(" ");
  fallbackCube.style.gridArea = bodyCube.style.gridArea;
  fallbackCube.style.setProperty(
    "--voxcss-side-offset-x",
    bodyCube.style.getPropertyValue("--voxcss-side-offset-x")
  );
  fallbackCube.style.setProperty(
    "--voxcss-side-offset-y",
    bodyCube.style.getPropertyValue("--voxcss-side-offset-y")
  );
  fallbackCube.style.setProperty(
    "--voxcss-fr-offset",
    bodyCube.style.getPropertyValue("--voxcss-fr-offset")
  );

  headLayer.appendChild(fallbackCube);
  return fallbackCube;
}

function ensureCubeHostClass(cube: HTMLElement): void {
  cube.classList.add(VOXCSS_CUBE_CLASS);
}

function resolvePlayerCubeCandidates(
  root: HTMLElement,
  player: Coord
): {
  bodyCubes: HTMLElement[];
  headCubes: HTMLElement[];
  entries: Array<{ z: number; cube: HTMLElement }>;
} {
  const entries = findCubesAt(root, player.x, player.y)
    .filter((entry) => entry.z > 0)
    .sort((a, b) => a.z - b.z);

  if (entries.length === 0) {
    return {
      bodyCubes: [],
      headCubes: [],
      entries,
    };
  }

  const minZ = entries[0]?.z ?? 0;
  const maxZ = entries[entries.length - 1]?.z ?? minZ;

  const bodyCubes = entries
    .filter((entry) => entry.z === minZ)
    .map((entry) => entry.cube);
  const headCubes =
    maxZ > minZ
      ? entries.filter((entry) => entry.z === maxZ).map((entry) => entry.cube)
      : [];

  return {
    bodyCubes: Array.from(new Set(bodyCubes)),
    headCubes: Array.from(new Set(headCubes)),
    entries,
  };
}

function applyActorCubeClasses(
  root: HTMLElement,
  context: ActorTextureContext
): void {
  clearActorCubeClasses(root);

  for (const boxKey of context.boxes) {
    const boxCoord = fromKey(boxKey);
    const cubesAtBox = findCubesAt(root, boxCoord.x, boxCoord.y)
      .filter((entry) => entry.z > 0)
      .sort((a, b) => a.z - b.z);
    const boxCube = cubesAtBox[cubesAtBox.length - 1]?.cube ?? null;
    if (!boxCube) {
      continue;
    }
    ensureCubeHostClass(boxCube);
    boxCube.classList.add(ACTOR_CUBE_CLASS);
    boxCube.classList.add(BOX_CUBE_CLASS);
  }

  const { bodyCubes, headCubes } = resolvePlayerCubeCandidates(
    root,
    context.player
  );
  for (const bodyCube of bodyCubes) {
    ensureCubeHostClass(bodyCube);
    bodyCube.classList.add(ACTOR_CUBE_CLASS);
    bodyCube.classList.add(PLAYER_BODY_CUBE_CLASS);
  }
  for (const headCube of headCubes) {
    ensureCubeHostClass(headCube);
    headCube.classList.add(ACTOR_CUBE_CLASS);
    headCube.classList.add(PLAYER_HEAD_CUBE_CLASS);
  }
}
