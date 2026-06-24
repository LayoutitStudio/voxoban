<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import {
  createCamera,
  renderScene,
  type HeadlessCameraHandle,
  type HeadlessRenderHandle,
  type SceneState,
} from "@layoutit/voxcss";
import {
  buildDeadBoxSquares,
  buildGoalReachabilityByGoal,
  isLostState,
} from "./game/deadlocks";
import {
  MOVE_DELTAS_BY_DIRECTION,
  clamp,
  fromKey,
  toKey,
} from "./game/coords";
import {
  canSingleBoxReachAnyGoalFromState,
  tryMoveOnBoard,
} from "./game/rules";
import type {
  CampaignLevel,
  Coord,
  Facing,
  MoveDirection,
  MoveSnapshot,
} from "./game/types";
import { campaignLevels, fallbackCampaignLevel } from "./levels/boxoban";

type ViewMode = "isometric" | "topdown";
type CubeFaceKey = "t" | "b" | "fr" | "fl" | "bl" | "br";
type LocalSide = "front" | "back" | "left" | "right";
type WorldSide = "north" | "south" | "west" | "east";
type LateralFaceKey = Exclude<CubeFaceKey, "t" | "b">;
type SpriteTextureSet = Partial<Record<LocalSide | "top", string>>;
const LEVEL_QUERY_PARAM = "l";

const siteName = "Voxoban";
const pageTitle = "Voxoban - 3D Sokoban Puzzle Game";
const pageDescription =
  "Play Voxoban, a browser-based 3D Sokoban-style puzzle game.";
const logoUrl = "/voxoban-logo.png";
const socialImagePath = "/voxoban-social.png";
const socialImageWidth = "2874";
const socialImageHeight = "1796";
const socialImageAlt =
  "Voxoban gameplay preview showing voxel crates and goal tiles on a Sokoban board.";
const FLOOR_TILE_TEXTURE = "/floortile.png";
const BOX_TOP_TEXTURE = "/boxtop.png";
const BOX_SIDE_TEXTURE = "/boxside.png";
const DEFAULT_CAMERA_STATE = {
  viewMode: "isometric" as ViewMode,
  zoom: 1.55,
  rotX: 50,
  rotY: 60,
  pan: 0,
  tilt: 0,
};
const CAMERA_DEFAULT_EPSILON = 0.0001;
const route = useRoute();
const runtimeConfig = useRuntimeConfig();
const siteUrl = computed(() => {
  const raw =
    (runtimeConfig.public.siteUrl as string | undefined)?.trim() ?? "";
  return raw ? raw.replace(/\/+$/, "") : "";
});
const canonicalUrl = computed(() => {
  if (!siteUrl.value) {
    return undefined;
  }
  const path = route.path === "/" ? "" : route.path;
  return `${siteUrl.value}${path}`;
});
const socialImageUrl = computed(() => {
  if (!siteUrl.value) {
    return socialImagePath;
  }
  return `${siteUrl.value}${socialImagePath}`;
});
const jsonLd = computed(() => ({
  "@context": "https://schema.org",
  "@type": "VideoGame",
  "@id": `${canonicalUrl.value ?? siteUrl.value ?? "https://voxoban.com"}#game`,
  name: siteName,
  description: pageDescription,
  applicationCategory: "Game",
  genre: "Puzzle",
  gamePlatform: "Web Browser",
  operatingSystem: "Any",
  inLanguage: "en",
  isAccessibleForFree: true,
  image: socialImageUrl.value,
  ...(canonicalUrl.value ? { url: canonicalUrl.value } : {}),
  publisher: {
    "@type": "Organization",
    name: siteName,
  },
}));
const websiteJsonLd = computed(() => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${canonicalUrl.value ?? siteUrl.value ?? "https://voxoban.com"}#website`,
  name: siteName,
  description: pageDescription,
  inLanguage: "en",
  ...(siteUrl.value ? { url: siteUrl.value } : {}),
}));

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

useSeoMeta({
  title: pageTitle,
  description: pageDescription,
  applicationName: siteName,
  googlebot:
    "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1",
  robots:
    "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1",
  ogTitle: pageTitle,
  ogDescription: pageDescription,
  ogType: "website",
  ogSiteName: siteName,
  ogLocale: "en_US",
  ogUrl: () => canonicalUrl.value,
  ogImage: () => socialImageUrl.value,
  ogImageAlt: socialImageAlt,
  ogImageWidth: socialImageWidth,
  ogImageHeight: socialImageHeight,
  twitterCard: "summary_large_image",
  twitterTitle: pageTitle,
  twitterDescription: pageDescription,
  twitterImage: () => socialImageUrl.value,
  twitterImageAlt: socialImageAlt,
});

useHead(() => ({
  link: canonicalUrl.value
    ? [
        { rel: "canonical", href: canonicalUrl.value },
        { rel: "alternate", hreflang: "en", href: canonicalUrl.value },
      ]
    : [],
  script: [
    {
      key: "voxoban-jsonld",
      type: "application/ld+json",
      children: JSON.stringify(jsonLd.value),
    },
    {
      key: "voxoban-website-jsonld",
      type: "application/ld+json",
      children: JSON.stringify(websiteJsonLd.value),
    },
  ],
}));

const levelIndex = ref(0);
const level = computed<CampaignLevel>(() => {
  return (
    campaignLevels[levelIndex.value] ??
    campaignLevels[0] ??
    fallbackCampaignLevel
  );
});
const totalLevels = computed(() => campaignLevels.length);
const levelNumber = computed(() => levelIndex.value + 1);
const hasPreviousLevel = computed(() => levelIndex.value > 0);
const hasNextLevel = computed(() => levelIndex.value < totalLevels.value - 1);
const goalCount = computed(() => level.value.goals.size);

const player = ref<Coord>({ ...level.value.startPlayer });
const facing = ref<Facing>("south");
const boxes = ref<Set<string>>(new Set(level.value.startBoxes));
const steps = ref(0);
const elapsedSeconds = ref(0);
const moveHistory = ref<MoveSnapshot[]>([]);
const redoHistory = ref<MoveSnapshot[]>([]);
const forcedLoss = ref(false);

const sceneRoot = ref<HTMLElement | null>(null);

const zoom = ref(DEFAULT_CAMERA_STATE.zoom);
const rotX = ref(DEFAULT_CAMERA_STATE.rotX);
const rotY = ref(DEFAULT_CAMERA_STATE.rotY);
const pan = ref(DEFAULT_CAMERA_STATE.pan);
const tilt = ref(DEFAULT_CAMERA_STATE.tilt);
const zoomMin = 0.35;
const zoomMax = 2.4;
const rotXMin = 0;
const rotXMax = 89;
const rotateSpeed = 0.22;
const zoomWheelSpeed = 0.003;
const winBoardRotationDegrees = 360;
const winBoardRotationDurationMs = 1240;
const isometricView = {
  rotX: DEFAULT_CAMERA_STATE.rotX,
  rotY: DEFAULT_CAMERA_STATE.rotY,
};
const topDownView = { rotX: 0, rotY: 90 };
const viewMode = ref<ViewMode>(DEFAULT_CAMERA_STATE.viewMode);
const mobileViewportMaxWidth = 640;
const mobileZoomReferenceTiles = 7.5;
const mobileZoomMinPreset = 0.42;

const sceneDragState = ref<{
  pointerId: number;
  lastX: number;
  lastY: number;
} | null>(null);
const isSceneDragging = computed(() => sceneDragState.value !== null);

let cameraHandle: HeadlessCameraHandle | null = null;
let renderHandle: HeadlessRenderHandle | null = null;
let cameraElement: HTMLElement | null = null;
let playerTextureApplyRafId: number | null = null;
let isApplyingPlayerTextures = false;
let levelTimerHandle: number | null = null;
let levelStartedAtMs = 0;
let pausedLevelTimerForVisibility = false;
let winRotationRafId: number | null = null;
const prefersReducedMotion = ref(false);
let reducedMotionMediaQuery: MediaQueryList | null = null;

const filledGoals = computed(() => {
  let count = 0;
  for (const goalKey of level.value.goals) {
    if (boxes.value.has(goalKey)) {
      count += 1;
    }
  }
  return count;
});

const hasWonLevel = computed(() => filledGoals.value === goalCount.value);
const isWinSequenceActive = ref(false);
const showLevelClearedOverlay = ref(false);
const canUndoLastMove = computed(() => moveHistory.value.length > 0);
const canRedoLastMove = computed(() => redoHistory.value.length > 0);
const goalReachabilityByGoal = computed(() =>
  buildGoalReachabilityByGoal(level.value)
);
const deadBoxSquares = computed(() =>
  buildDeadBoxSquares(level.value, goalReachabilityByGoal.value)
);
const isLost = computed(() =>
  isLostState(
    level.value,
    boxes.value,
    player.value,
    forcedLoss.value,
    hasWonLevel.value,
    deadBoxSquares.value,
    goalReachabilityByGoal.value
  )
);
const formattedElapsedTime = computed(() => {
  const total = Math.max(0, elapsedSeconds.value);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0"
  )}`;
});
const isCameraAtDefault = computed(() => {
  const isClose = (actual: number, expected: number) =>
    Math.abs(actual - expected) <= CAMERA_DEFAULT_EPSILON;
  const isDefaultViewPreset =
    (viewMode.value === "isometric" &&
      isClose(rotX.value, isometricView.rotX) &&
      isClose(rotY.value, isometricView.rotY)) ||
    (viewMode.value === "topdown" &&
      isClose(rotX.value, topDownView.rotX) &&
      isClose(rotY.value, topDownView.rotY));
  return (
    isDefaultViewPreset &&
    isClose(zoom.value, getDefaultCameraZoom()) &&
    isClose(pan.value, DEFAULT_CAMERA_STATE.pan) &&
    isClose(tilt.value, DEFAULT_CAMERA_STATE.tilt)
  );
});

function clampZoom(value: number): number {
  return Math.min(zoomMax, Math.max(zoomMin, value));
}

function setZoom(value: number): void {
  zoom.value = Math.round(clampZoom(value) * 1000) / 1000;
}

function shouldUseMobileZoomPreset(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.innerWidth <= mobileViewportMaxWidth;
}

function computeMobileFitZoom(): number {
  const longestSide = Math.max(level.value.width, level.value.height, 1);
  const fitZoom = mobileZoomReferenceTiles / longestSide;
  return clampZoom(Math.max(mobileZoomMinPreset, fitZoom));
}

function applyMobileZoomPreset(): void {
  if (!shouldUseMobileZoomPreset()) {
    return;
  }
  setZoom(computeMobileFitZoom());
}

function getDefaultCameraZoom(): number {
  const defaultZoom = shouldUseMobileZoomPreset()
    ? computeMobileFitZoom()
    : DEFAULT_CAMERA_STATE.zoom;
  return Math.round(defaultZoom * 1000) / 1000;
}

function updateElapsedSeconds(): void {
  if (levelStartedAtMs <= 0) {
    elapsedSeconds.value = 0;
    return;
  }

  elapsedSeconds.value = Math.max(
    0,
    Math.floor((Date.now() - levelStartedAtMs) / 1000)
  );
}

function cancelWinSequenceAnimation(): void {
  if (winRotationRafId === null) {
    return;
  }
  if (typeof window !== "undefined") {
    window.cancelAnimationFrame(winRotationRafId);
  }
  winRotationRafId = null;
}

function clearWinSequence(): void {
  cancelWinSequenceAnimation();
  isWinSequenceActive.value = false;
  showLevelClearedOverlay.value = false;
}

function onReducedMotionPreferenceChange(event: MediaQueryListEvent): void {
  prefersReducedMotion.value = event.matches;
}

function startWinSequence(): void {
  cancelWinSequenceAnimation();
  clearSceneDrag();
  isWinSequenceActive.value = true;
  showLevelClearedOverlay.value = false;
  const initialRotY = rotY.value;

  if (prefersReducedMotion.value) {
    isWinSequenceActive.value = false;
    showLevelClearedOverlay.value = true;
    return;
  }

  if (typeof window === "undefined") {
    rotY.value = initialRotY + winBoardRotationDegrees;
    isWinSequenceActive.value = false;
    showLevelClearedOverlay.value = true;
    return;
  }

  let startedAtMs = 0;
  const animate = (timestamp: number): void => {
    if (!hasWonLevel.value) {
      clearWinSequence();
      return;
    }

    if (startedAtMs === 0) {
      startedAtMs = timestamp;
    }

    const elapsedMs = timestamp - startedAtMs;
    const progress = Math.min(1, elapsedMs / winBoardRotationDurationMs);
    const easedProgress = 1 - Math.pow(1 - progress, 3);
    rotY.value = initialRotY + winBoardRotationDegrees * easedProgress;

    if (progress < 1) {
      winRotationRafId = window.requestAnimationFrame(animate);
      return;
    }

    winRotationRafId = null;
    isWinSequenceActive.value = false;
    showLevelClearedOverlay.value = true;
  };

  winRotationRafId = window.requestAnimationFrame(animate);
}

function continueAfterWin(): void {
  if (hasNextLevel.value) {
    nextLevel();
    return;
  }
  newGame();
}

function resetCamera(): void {
  viewMode.value = DEFAULT_CAMERA_STATE.viewMode;
  setZoom(getDefaultCameraZoom());
  rotX.value = clamp(DEFAULT_CAMERA_STATE.rotX, rotXMin, rotXMax);
  rotY.value = DEFAULT_CAMERA_STATE.rotY;
  pan.value = DEFAULT_CAMERA_STATE.pan;
  tilt.value = DEFAULT_CAMERA_STATE.tilt;
}

function stopLevelTimer(syncElapsed = false): void {
  if (syncElapsed) {
    updateElapsedSeconds();
  }

  if (typeof window !== "undefined" && levelTimerHandle !== null) {
    window.clearInterval(levelTimerHandle);
  }
  levelTimerHandle = null;
}

function startLevelTimer(): void {
  stopLevelTimer(false);
  pausedLevelTimerForVisibility = false;
  levelStartedAtMs = Date.now();
  elapsedSeconds.value = 0;

  if (typeof window === "undefined") {
    return;
  }

  levelTimerHandle = window.setInterval(() => {
    updateElapsedSeconds();
  }, 1000);
}

function resumeLevelTimer(): void {
  stopLevelTimer(false);
  pausedLevelTimerForVisibility = false;
  levelStartedAtMs = Date.now() - elapsedSeconds.value * 1000;

  if (typeof window === "undefined") {
    return;
  }

  levelTimerHandle = window.setInterval(() => {
    updateElapsedSeconds();
  }, 1000);
}

function onDocumentVisibilityChange(): void {
  if (typeof document === "undefined") {
    return;
  }

  if (document.visibilityState === "hidden") {
    if (levelTimerHandle === null) {
      return;
    }

    stopLevelTimer(true);
    pausedLevelTimerForVisibility = true;
    return;
  }

  if (!pausedLevelTimerForVisibility) {
    return;
  }

  pausedLevelTimerForVisibility = false;
  if (hasWonLevel.value) {
    return;
  }

  resumeLevelTimer();
}

function toSimpleLevelId(levelToEncode: CampaignLevel): string {
  return levelToEncode.sourceIndex.toString(36);
}

function parseSimpleLevelId(value: string): number | null {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-z]+$/.test(normalized)) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 36);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function readLevelIndexFromUrl(): number | null {
  if (typeof window === "undefined") {
    return null;
  }

  const url = new URL(window.location.href);
  const levelParam = url.searchParams.get(LEVEL_QUERY_PARAM);
  if (!levelParam) {
    return null;
  }

  const sourceIndex = parseSimpleLevelId(levelParam);
  if (sourceIndex === null) {
    return null;
  }

  const matchedIndex = campaignLevels.findIndex(
    (candidate) => candidate.sourceIndex === sourceIndex
  );
  return matchedIndex >= 0 ? matchedIndex : null;
}

function syncLevelQueryParam(): void {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set(LEVEL_QUERY_PARAM, toSimpleLevelId(level.value));
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state ?? null, "", nextUrl);
}

function applyLevelFromUrl(): void {
  const levelFromUrl = readLevelIndexFromUrl();
  if (levelFromUrl === null) {
    return;
  }
  setLevel(levelFromUrl);
}

function onPopState(): void {
  applyLevelFromUrl();
}

function setLevel(nextLevelIndex: number): void {
  const boundedLevelIndex = clamp(nextLevelIndex, 0, totalLevels.value - 1);
  if (boundedLevelIndex === levelIndex.value) {
    return;
  }

  levelIndex.value = boundedLevelIndex;
  applyMobileZoomPreset();
  resetLevel();
  syncLevelQueryParam();
}

function previousLevel(): void {
  setLevel(levelIndex.value - 1);
}

function nextLevel(): void {
  setLevel(levelIndex.value + 1);
}

function newGame(): void {
  if (levelIndex.value !== 0) {
    setLevel(0);
    return;
  }

  resetLevel();
  syncLevelQueryParam();
}

type Voxel = SceneState["voxels"][number];
type PlayerRenderVoxel = Voxel & {
  noCull?: boolean;
  renderPass?: number;
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

function resetLevel(): void {
  clearWinSequence();
  player.value = { ...level.value.startPlayer };
  facing.value = "south";
  boxes.value = new Set(level.value.startBoxes);
  steps.value = 0;
  forcedLoss.value = false;
  moveHistory.value = [];
  redoHistory.value = [];
  startLevelTimer();
}

function createMoveSnapshot(): MoveSnapshot {
  return {
    player: { ...player.value },
    facing: facing.value,
    boxes: new Set(boxes.value),
    steps: steps.value,
    elapsedSeconds: elapsedSeconds.value,
    forcedLoss: forcedLoss.value,
  };
}

function applyMoveSnapshot(snapshot: MoveSnapshot): void {
  player.value = { ...snapshot.player };
  facing.value = snapshot.facing;
  boxes.value = new Set(snapshot.boxes);
  steps.value = snapshot.steps;
  elapsedSeconds.value = snapshot.elapsedSeconds;
  forcedLoss.value = snapshot.forcedLoss;
}

function recordMoveSnapshot(): void {
  moveHistory.value.push(createMoveSnapshot());
  redoHistory.value = [];
}

function undoLastMove(): void {
  const snapshot = moveHistory.value.pop();
  if (!snapshot) {
    return;
  }

  redoHistory.value.push(createMoveSnapshot());
  applyMoveSnapshot(snapshot);
  resumeLevelTimer();
}

function redoLastMove(): void {
  const snapshot = redoHistory.value.pop();
  if (!snapshot) {
    return;
  }

  moveHistory.value.push(createMoveSnapshot());
  applyMoveSnapshot(snapshot);
  resumeLevelTimer();
}

function tryMove(dx: number, dy: number): void {
  if (hasWonLevel.value) {
    return;
  }

  const moveResult = tryMoveOnBoard(
    level.value,
    player.value,
    boxes.value,
    dx,
    dy
  );
  if (!moveResult.moved) {
    return;
  }

  recordMoveSnapshot();
  boxes.value = moveResult.boxes;
  player.value = moveResult.player;
  facing.value = moveResult.facing;
  steps.value += 1;

  if (
    moveResult.pushedBoxCoord &&
    moveResult.pushedBoxKey &&
    !level.value.goals.has(moveResult.pushedBoxKey)
  ) {
    if (deadBoxSquares.value.has(moveResult.pushedBoxKey)) {
      forcedLoss.value = true;
    } else if (
      !canSingleBoxReachAnyGoalFromState(
        level.value,
        moveResult.pushedBoxCoord,
        moveResult.player
      )
    ) {
      forcedLoss.value = true;
    }
  }
}

function moveByDirection(direction: MoveDirection): void {
  const delta = MOVE_DELTAS_BY_DIRECTION[direction];
  if (!delta) {
    return;
  }
  tryMove(delta.dx, delta.dy);
}

function onKeyDown(event: KeyboardEvent): void {
  switch (event.key) {
    case "ArrowUp":
    case "w":
    case "W":
      event.preventDefault();
      moveByDirection("up");
      return;
    case "ArrowDown":
    case "s":
    case "S":
      event.preventDefault();
      moveByDirection("down");
      return;
    case "ArrowLeft":
    case "a":
    case "A":
      event.preventDefault();
      moveByDirection("left");
      return;
    case "ArrowRight":
    case "d":
    case "D":
      event.preventDefault();
      moveByDirection("right");
      return;
    case "r":
    case "R":
      event.preventDefault();
      resetLevel();
      return;
    case "u":
    case "U":
      event.preventDefault();
      undoLastMove();
      return;
    case "e":
    case "E":
      event.preventDefault();
      redoLastMove();
      return;
    case "p":
    case "P":
      event.preventDefault();
      previousLevel();
      return;
    case "n":
    case "N":
      event.preventDefault();
      newGame();
      return;
    case "l":
    case "L":
      event.preventDefault();
      nextLevel();
      return;
    default:
      return;
  }
}

function onZoomSliderInput(event: Event): void {
  const input = event.target as HTMLInputElement | null;
  if (!input) {
    return;
  }
  const value = Number(input.value);
  if (!Number.isFinite(value)) {
    return;
  }
  setZoom(value);
}

function setView(mode: ViewMode): void {
  viewMode.value = mode;
  const preset = mode === "topdown" ? topDownView : isometricView;
  rotX.value = clamp(preset.rotX, rotXMin, rotXMax);
  rotY.value = preset.rotY;
  applyMobileZoomPreset();
}

function normalizeWheelDeltaToPixels(event: WheelEvent): number {
  if (event.deltaMode === 1) {
    return event.deltaY * 16;
  }
  if (event.deltaMode === 2) {
    return event.deltaY * window.innerHeight;
  }
  return event.deltaY;
}

function onSceneWheel(event: WheelEvent): void {
  if (hasWonLevel.value) {
    return;
  }

  const deltaInPixels = normalizeWheelDeltaToPixels(event);
  if (!Number.isFinite(deltaInPixels) || deltaInPixels === 0) {
    return;
  }

  event.preventDefault();
  setZoom(zoom.value - deltaInPixels * zoomWheelSpeed);
}

function isCubeTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(".voxcss-cube") !== null;
}

function onScenePointerDown(event: PointerEvent): void {
  if (hasWonLevel.value) {
    return;
  }

  if (event.button !== 0) {
    return;
  }

  if (isCubeTarget(event.target)) {
    return;
  }

  sceneDragState.value = {
    pointerId: event.pointerId,
    lastX: event.clientX,
    lastY: event.clientY,
  };

  try {
    sceneRoot.value?.setPointerCapture(event.pointerId);
  } catch {
    // Ignore capture failures.
  }

  event.preventDefault();
}

function onScenePointerMove(event: PointerEvent): void {
  if (hasWonLevel.value) {
    clearSceneDrag(event.pointerId);
    return;
  }

  const drag = sceneDragState.value;
  if (!drag || drag.pointerId !== event.pointerId) {
    return;
  }

  const deltaX = event.clientX - drag.lastX;
  const deltaY = event.clientY - drag.lastY;

  if (deltaX !== 0 || deltaY !== 0) {
    rotY.value -= deltaX * rotateSpeed;
    rotX.value = clamp(rotX.value - deltaY * rotateSpeed, rotXMin, rotXMax);
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
  }

  event.preventDefault();
}

function clearSceneDrag(pointerId?: number): void {
  const drag = sceneDragState.value;
  if (!drag) {
    return;
  }
  if (pointerId !== undefined && drag.pointerId !== pointerId) {
    return;
  }

  try {
    sceneRoot.value?.releasePointerCapture(drag.pointerId);
  } catch {
    // Ignore release failures.
  }

  sceneDragState.value = null;
}

function onScenePointerUp(event: PointerEvent): void {
  clearSceneDrag(event.pointerId);
}

function onScenePointerCancel(event: PointerEvent): void {
  clearSceneDrag(event.pointerId);
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

function applyBoxGoalHighlights(root: HTMLElement): void {
  clearBoxGoalHighlights(root);

  for (const boxKey of boxes.value) {
    if (!level.value.goals.has(boxKey)) {
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

function applyBoxTextures(root: HTMLElement): void {
  for (const boxKey of boxes.value) {
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

function resolvePlayerCubeCandidates(root: HTMLElement): {
  bodyCubes: HTMLElement[];
  headCubes: HTMLElement[];
  entries: Array<{ z: number; cube: HTMLElement }>;
} {
  const entries = findCubesAt(root, player.value.x, player.value.y)
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

function applyActorCubeClasses(root: HTMLElement): void {
  clearActorCubeClasses(root);

  for (const boxKey of boxes.value) {
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

  const { bodyCubes, headCubes } = resolvePlayerCubeCandidates(root);
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

function applyPlayerSpriteTextures(): void {
  const root = sceneRoot.value;
  if (!root) {
    return;
  }

  isApplyingPlayerTextures = true;
  try {
    applyActorCubeClasses(root);
    applyBoxTextures(root);
    applyBoxGoalHighlights(root);

    const resolvedPlayerCubes = resolvePlayerCubeCandidates(root);
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
        headCube = fallbackHeadCube;
      }
    }

    const headFaceTextureMap = buildFaceTextureMap(
      PLAYER_HEAD_SIDE_TEXTURES,
      facing.value
    );
    const bodyFaceTextureMap = buildFaceTextureMap(
      PLAYER_BODY_SIDE_TEXTURES,
      facing.value
    );
    const headFaceRotationOverrides = getPlayerHeadFaceRotationOverrides(
      facing.value
    );
    const headFaceScaleXOverrides: Partial<Record<CubeFaceKey, number>> = {};
    const headFaceScaleYOverrides: Partial<Record<CubeFaceKey, number>> = {};
    if (facing.value === "east") {
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
  } finally {
    isApplyingPlayerTextures = false;
  }
}

function cancelScheduledPlayerTextureApply(): void {
  if (playerTextureApplyRafId === null) {
    return;
  }

  if (typeof window !== "undefined") {
    window.cancelAnimationFrame(playerTextureApplyRafId);
  }
  playerTextureApplyRafId = null;
}

function schedulePlayerTextureApply(): void {
  if (typeof window === "undefined") {
    applyPlayerSpriteTextures();
    return;
  }

  cancelScheduledPlayerTextureApply();
  applyPlayerSpriteTextures();

  // VoxCSS can swap face nodes during and right after camera updates.
  playerTextureApplyRafId = window.requestAnimationFrame(() => {
    applyPlayerSpriteTextures();
    playerTextureApplyRafId = window.requestAnimationFrame(() => {
      playerTextureApplyRafId = null;
      applyPlayerSpriteTextures();
    });
  });
}

const voxels = computed<SceneState["voxels"]>(() => {
  const nextVoxels: SceneState["voxels"] = [];

  for (let y = 0; y < level.value.height; y += 1) {
    for (let x = 0; x < level.value.width; x += 1) {
      const coord = { x, y };
      const key = toKey(coord);

      if (level.value.goals.has(key)) {
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

      if (level.value.walls.has(key)) {
        nextVoxels.push(createUnitCube(x, y, 1, { color: "#737f8b" }));
      }
    }
  }

  for (const boxKey of boxes.value) {
    const boxCoord = fromKey(boxKey);
    nextVoxels.push(
      createUnitCube(boxCoord.x, boxCoord.y, 1, {
        color: "#b77d44",
      })
    );
  }

  const playerBodyCube = createUnitCube(player.value.x, player.value.y, 1, {
    color: "#d0c3b2",
  }) as PlayerRenderVoxel;
  playerBodyCube.noCull = true;
  playerBodyCube.renderPass = 100;
  nextVoxels.push(playerBodyCube);

  const playerHeadCube = createUnitCube(player.value.x, player.value.y, 2, {
    color: "#d9d9d9",
  }) as PlayerRenderVoxel;
  playerHeadCube.noCull = true;
  playerHeadCube.renderPass = 100;
  nextVoxels.push(playerHeadCube);

  return nextVoxels;
});

function buildSceneState(nextVoxels: SceneState["voxels"]): SceneState {
  return {
    voxels: nextVoxels,
    projection: "dimetric",
    showFloor: false,
    showWalls: false,
    mergeVoxels: false,
  };
}

function syncCamera(): void {
  if (!cameraHandle) {
    return;
  }

  const nextCameraState = {
    zoom: zoom.value,
    pan: pan.value,
    tilt: tilt.value,
    rotX: rotX.value,
    rotY: rotY.value,
    interactive: false,
    animate: false,
    perspective: 8000,
  };

  cameraHandle.update(nextCameraState);

  schedulePlayerTextureApply();
}

function clearStaleSceneCameras(root: HTMLElement | null): void {
  if (!root) {
    return;
  }

  const staleCameras = Array.from(
    root.querySelectorAll<HTMLElement>(".voxcss-camera")
  );
  for (const node of staleCameras) {
    node.remove();
  }
}

function destroyScene(): void {
  if (renderHandle) {
    renderHandle.destroy();
    renderHandle = null;
    cameraHandle = null;
  } else if (cameraHandle) {
    cameraHandle.destroy();
    cameraHandle = null;
  }

  if (cameraElement?.parentElement) {
    cameraElement.parentElement.removeChild(cameraElement);
  }
  cameraElement = null;

  clearStaleSceneCameras(sceneRoot.value);
}

function mountScene(): void {
  const root = sceneRoot.value;
  if (!root) {
    return;
  }

  destroyScene();
  const doc = root.ownerDocument ?? document;
  cameraElement = doc.createElement("div");

  cameraHandle = createCamera({
    element: cameraElement,
    zoom: zoom.value,
    pan: pan.value,
    tilt: tilt.value,
    rotX: rotX.value,
    rotY: rotY.value,
    interactive: false,
    animate: false,
    perspective: 8000,
  });

  renderHandle = renderScene({
    element: root,
    camera: cameraHandle,
    scene: buildSceneState(voxels.value),
  });

  schedulePlayerTextureApply();
}

watch(
  [zoom, pan, tilt, rotX, rotY],
  () => {
    syncCamera();
  },
  { flush: "post" }
);

watch(
  voxels,
  () => {
    mountScene();
    syncCamera();
  },
  { flush: "post" }
);

watch(
  hasWonLevel,
  (won) => {
    if (won) {
      stopLevelTimer(true);
      startWinSequence();
      return;
    }

    clearWinSequence();
  },
  { flush: "post" }
);

watch(prefersReducedMotion, (reducedMotion) => {
  if (!reducedMotion || !hasWonLevel.value || !isWinSequenceActive.value) {
    return;
  }
  cancelWinSequenceAnimation();
  isWinSequenceActive.value = false;
  showLevelClearedOverlay.value = true;
});

onMounted(() => {
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    reducedMotionMediaQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );
    prefersReducedMotion.value = reducedMotionMediaQuery.matches;
    reducedMotionMediaQuery.addEventListener(
      "change",
      onReducedMotionPreferenceChange
    );
  }

  applyLevelFromUrl();
  applyMobileZoomPreset();
  if (levelTimerHandle === null) {
    startLevelTimer();
  }
  syncLevelQueryParam();
  mountScene();
  syncCamera();
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("popstate", onPopState);
  document.addEventListener("visibilitychange", onDocumentVisibilityChange);
  onDocumentVisibilityChange();
});

onBeforeUnmount(() => {
  clearWinSequence();
  clearSceneDrag();
  cancelScheduledPlayerTextureApply();
  stopLevelTimer(false);
  reducedMotionMediaQuery?.removeEventListener(
    "change",
    onReducedMotionPreferenceChange
  );
  reducedMotionMediaQuery = null;
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("popstate", onPopState);
  document.removeEventListener("visibilitychange", onDocumentVisibilityChange);
  destroyScene();
});
</script>

<template>
  <main
    class="app"
    :class="{
      'is-deadlocked': isLost && !hasWonLevel,
    }"
  >
    <section
      ref="sceneRoot"
      class="scene"
      :class="{
        'is-dragging': isSceneDragging,
        'is-winning': isWinSequenceActive,
        'is-won': showLevelClearedOverlay,
        'is-facing-west': facing === 'west',
      }"
      @pointerdown.capture="onScenePointerDown"
      @pointermove.capture="onScenePointerMove"
      @pointerup.capture="onScenePointerUp"
      @pointercancel.capture="onScenePointerCancel"
      @wheel.capture="onSceneWheel"
    />

    <header class="sidebar">
      <div class="brand">
        <h1 class="sr-only">Voxoban</h1>
        <div class="brand-mark">
          <img class="logo" :src="logoUrl" alt="Voxoban" />
          <span class="logo-version">v0.1</span>
        </div>
      </div>

      <div class="controls">
        <button type="button" class="chip chip--button" @click="newGame">
          <span class="chip-button-label"
            ><span class="chip-shortcut">N</span>ew Game</span
          >
          <span class="chip-button-suit" aria-hidden="true">&hearts;</span>
        </button>
        <button type="button" class="chip chip--button" @click="resetLevel">
          <span class="chip-button-label"
            ><span class="chip-shortcut">R</span>estart</span
          >
        </button>
        <div class="control-row">
          <button
            type="button"
            class="chip chip--button"
            :disabled="!canUndoLastMove"
            @click="undoLastMove"
          >
            <span class="chip-button-label"
              ><span class="chip-shortcut">U</span>ndo</span
            >
          </button>
          <span class="chip-divider" aria-hidden="true">/</span>
          <button
            type="button"
            class="chip chip--button"
            :disabled="!canRedoLastMove"
            @click="redoLastMove"
          >
            <span class="chip-button-label"
              >R<span class="chip-shortcut">e</span>do</span
            >
          </button>
        </div>

        <article class="chip chip--stat">
          <strong>Level:</strong>
          <span class="chip-value">{{ levelNumber }}/{{ totalLevels }}</span>
        </article>
        <article class="chip chip--timer">
          <strong>Time:</strong>
          <span class="chip-value">{{ formattedElapsedTime }}</span>
        </article>
        <article class="chip chip--stat">
          <strong>Moves:</strong>
          <span class="chip-value">{{ steps }}</span>
        </article>
        <article v-if="isLost && !hasWonLevel" class="chip chip--status-loss">
          <strong>Likely deadlocked!</strong>
        </article>
      </div>
    </header>

    <div class="zoom-dock">
      <div v-if="!isCameraAtDefault && !hasWonLevel" class="dock-row">
        <button type="button" class="camera-reset-button" @click="resetCamera">
          Reset camera
        </button>
      </div>
      <div class="dock-row">
        <span class="zoom-label">View:</span>
        <div class="view-options" role="radiogroup" aria-label="View">
          <label
            class="view-option"
            :class="{ 'is-active': viewMode === 'isometric' }"
          >
            <input
              class="view-radio"
              type="radio"
              name="view-mode"
              value="isometric"
              :checked="viewMode === 'isometric'"
              @change="setView('isometric')"
            />
            <span>Isometric</span>
          </label>
          <span class="view-separator">/</span>
          <label
            class="view-option"
            :class="{ 'is-active': viewMode === 'topdown' }"
          >
            <input
              class="view-radio"
              type="radio"
              name="view-mode"
              value="topdown"
              :checked="viewMode === 'topdown'"
              @change="setView('topdown')"
            />
            <span>Top Down</span>
          </label>
        </div>
      </div>
      <div class="dock-row">
        <label class="zoom-label" for="zoom-slider">Zoom:</label>
        <input
          id="zoom-slider"
          class="zoom-slider"
          type="range"
          :min="zoomMin"
          :max="zoomMax"
          step="0.01"
          :value="zoom"
          aria-label="Zoom"
          @input="onZoomSliderInput"
        />
      </div>
    </div>

    <div
      v-if="!hasWonLevel"
      class="mobile-dpad"
      role="group"
      aria-label="Move player"
    >
      <button
        v-if="isLost && !hasWonLevel"
        type="button"
        class="mobile-dpad__button mobile-dpad__undo"
        :disabled="!canUndoLastMove"
        aria-label="Undo move"
        @pointerdown.prevent="undoLastMove"
      >
        <svg class="mobile-dpad__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 14L5 10m0 0 4-4m-4 4h11a4 4 0 1 1 0 8h-1" />
        </svg>
      </button>
      <button
        type="button"
        class="mobile-dpad__button mobile-dpad__up"
        aria-label="Move up"
        @pointerdown.prevent="moveByDirection('up')"
      >
        &#9650;
      </button>
      <button
        type="button"
        class="mobile-dpad__button mobile-dpad__left"
        aria-label="Move left"
        @pointerdown.prevent="moveByDirection('left')"
      >
        &#9664;
      </button>
      <span class="mobile-dpad__center" aria-hidden="true" />
      <button
        type="button"
        class="mobile-dpad__button mobile-dpad__right"
        aria-label="Move right"
        @pointerdown.prevent="moveByDirection('right')"
      >
        &#9654;
      </button>
      <button
        type="button"
        class="mobile-dpad__button mobile-dpad__down"
        aria-label="Move down"
        @pointerdown.prevent="moveByDirection('down')"
      >
        &#9660;
      </button>
    </div>

    <a
      class="btn-github"
      rel="noopener"
      target="_blank"
      aria-label="View source on GitHub"
      href="https://github.com/LayoutitStudio/voxoban"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="55"
        height="55"
        viewBox="0 0 250 250"
      >
        <path d="M0 0l115 115h15l12 27 108 108V0z" fill="#fff" />
        <path
          class="octo-arm"
          d="M128 109c-15-9-9-19-9-19 3-7 2-11 2-11-1-7 3-2 3-2 4 5 2 11 2 11-3 10 5 15 9 16"
        />
        <path
          class="octo-body"
          d="M115 115s4 2 5 0l14-14c3-2 6-3 8-3-8-11-15-24 2-41 5-5 10-7 16-7 1-2 3-7 12-11 0 0 5 3 7 16 4 2 8 5 12 9s7 8 9 12c14 3 17 7 17 7-4 8-9 11-11 11 0 6-2 11-7 16-16 16-30 10-41 2 0 3-1 7-5 11l-12 11c-1 1 1 5 1 5z"
        />
      </svg>
    </a>

    <Transition name="level-cleared">
      <div v-if="showLevelClearedOverlay" class="level-cleared-overlay">
        <section
          class="level-cleared-card"
          role="dialog"
          aria-label="Level cleared"
        >
          <h2>Level #{{ levelNumber }} cleared</h2>
          <p class="level-cleared-stat">
            <span>Moves</span>
            <strong>{{ steps }}</strong>
          </p>
          <p class="level-cleared-stat">
            <span>Time</span>
            <strong>{{ formattedElapsedTime }}</strong>
          </p>
          <button
            type="button"
            class="level-cleared-action"
            @click="continueAfterWin"
          >
            {{ hasNextLevel ? "Next Level" : "Play Again" }}
          </button>
        </section>
      </div>
    </Transition>
  </main>
</template>

<style scoped>
:global(html),
:global(body),
:global(#__nuxt) {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
  overscroll-behavior: none;
}

.app {
  --ui-font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
    "Liberation Mono", "Courier New", monospace;
  --ui-font-size: 14px;
  --ui-line-height: 1.2;
  --ui-color: #dfcc91;
  --ui-color-muted: #cdbb85;
  --ui-color-hover: #e6d39a;
  --ui-color-active: #f0e0ac;
  --ui-track: #a6945f;
  --ui-track-hover: #b8a56d;
  --ui-track-active: #c5b278;
  --ui-thumb-border: #ceb565;
  --ui-thumb-border-hover: #d9c075;
  --ui-thumb-border-active: #e1ca7d;
  --ui-thumb: #ebd796;
  --ui-thumb-hover: #f0e0ab;
  --ui-thumb-active: #f6e7b8;
  --ui-gap-s: 6px;
  --ui-gap-m: 10px;
  --bg-color-a: #1f2634;
  --bg-color-b: #0d1320;
  --bg-color-c: #02040a;
  --bg-color-b-stop: 39%;
  position: fixed;
  inset: 0;
  overflow: hidden;
  -webkit-user-select: none;
  user-select: none;
  touch-action: none;
  overscroll-behavior: none;
  background: radial-gradient(
    circle at center,
    var(--bg-color-a) 0%,
    var(--bg-color-b) var(--bg-color-b-stop),
    var(--bg-color-c) 100%
  );
}

.app.is-deadlocked {
  --bg-color-b: #22161d;
  --bg-color-b-stop: 13%;
}

.logo {
  display: block;
  height: 50px;
  width: auto;
  object-fit: contain;
  margin-left: -8px;
  margin-top: 5px;
}

.brand-mark {
  display: inline-flex;
  align-items: flex-end;
  gap: 4px;
}

.logo-version {
  font-size: 12px;
  line-height: 1;
  color: var(--ui-color-muted);
  margin-bottom: 9px;
  opacity: 0.75;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.scene {
  --win-rotation-duration: 1240ms;
  --win-rotation-ease: cubic-bezier(0.22, 0.68, 0.16, 1);
  position: absolute;
  inset: 0;
  z-index: 1;
  isolation: isolate;
  overflow: hidden;
  touch-action: none;
  cursor: grab;
  transition: opacity 220ms ease;
}

.scene.is-dragging {
  cursor: grabbing;
}

.scene.is-winning {
  pointer-events: none;
}

.scene.is-won {
  pointer-events: none;
  opacity: 0.24;
}

.scene :deep(.voxcss-camera) {
  width: 100%;
  height: 100%;
  min-height: 100%;
}

.scene :deep(.voxcss-floor-z) {
  background: transparent !important;
  background-image: none !important;
  pointer-events: none;
}

.scene :deep(.voxcss-cube-face) {
  background-size: cover;
  background-repeat: no-repeat;
  background-position: center;
  image-rendering: pixelated;
  cursor: default;
}

.scene
  :deep(
    .voxcss-cube.voxoban-actor-cube
      .voxcss-cube-face:not(.voxoban-synthetic-face)
  ) {
  background-image: none !important;
  background-color: transparent !important;
  outline: none !important;
  pointer-events: none !important;
}

.scene :deep(.voxcss-floor-z > .voxcss-layer:first-child .voxcss-cube-face) {
  outline: none;
}

.scene :deep(.voxcss-cube-face.voxoban-synthetic-face) {
  pointer-events: none;
}

.scene :deep(.voxcss-projection--dimetric .voxcss-cube.voxoban-actor-cube) {
  --voxcss-layer-elevation: 50px;
  --voxcss-layer-half: calc(var(--voxcss-layer-elevation, 50px) / 2);
  transform: translateZ(var(--voxcss-layer-half));
}

.scene
  :deep(
    .voxcss-projection--dimetric
      .voxcss-cube.voxoban-player-head-cube.voxoban-actor-cube
  ) {
  transform: translateZ(calc(var(--voxcss-layer-half) + 25px));
}

.scene
  :deep(
    .voxcss-projection--dimetric
      .voxcss-cube.voxoban-player-body-cube.voxoban-actor-cube
  ),
.scene
  :deep(
    .voxcss-projection--dimetric
      .voxcss-cube.voxoban-player-head-cube.voxoban-actor-cube
  ) {
  z-index: 4;
}

.scene
  :deep(
    .voxcss-projection--dimetric
      .voxcss-cube.voxoban-player-body-cube
      .voxcss-cube-face
  ),
.scene
  :deep(
    .voxcss-projection--dimetric
      .voxcss-cube.voxoban-player-head-cube
      .voxcss-cube-face
  ) {
  backface-visibility: visible;
}

.scene
  :deep(
    .voxcss-projection--dimetric
      .voxcss-cube.voxoban-actor-cube
      .voxcss-cube-face--t
  ) {
  transform: translateZ(var(--voxcss-layer-half));
}

.scene
  :deep(
    .voxcss-projection--dimetric
      .voxcss-cube.voxoban-actor-cube
      .voxcss-cube-face--fr
  ) {
  width: var(--voxcss-layer-elevation, 50px);
  transform: rotateY(90deg) translateZ(var(--voxcss-side-offset-y, 25px));
  transform-origin: center;
}

.scene.is-facing-west
  :deep(
    .voxcss-projection--dimetric
      .voxcss-cube.voxoban-player-head-cube
      .voxcss-cube-face--fr
  ) {
  transform: rotateY(-90deg) translateZ(-25px);
}

.scene
  :deep(
    .voxcss-projection--dimetric
      .voxcss-cube.voxoban-actor-cube
      .voxcss-cube-face--fl
  ) {
  height: var(--voxcss-layer-elevation, 50px);
  transform: rotateX(90deg)
    translateZ(calc(-1 * var(--voxcss-side-offset-x, 25px)));
  transform-origin: center;
}

.scene
  :deep(
    .voxcss-projection--dimetric
      .voxcss-cube.voxoban-actor-cube
      .voxcss-cube-face--bl
  ) {
  width: var(--voxcss-layer-elevation, 50px);
  transform: rotateY(90deg) rotateX(180deg)
    translateZ(calc(1 * var(--voxcss-layer-half)));
  transform-origin: center;
}

.scene
  :deep(
    .voxcss-projection--dimetric
      .voxcss-cube.voxoban-actor-cube
      .voxcss-cube-face--br
  ) {
  height: var(--voxcss-layer-elevation, 50px);
  transform: rotateX(90deg) translateZ(var(--voxcss-layer-half));
  transform-origin: center;
}

.scene.is-facing-west
  :deep(
    .voxcss-projection--dimetric
      .voxcss-cube.voxoban-player-head-cube
      .voxcss-cube-face--br
  ) {
  transform: rotateX(270deg) translateZ(-25px);
}

.scene :deep(.voxcss-cube.voxoban-box-on-goal .voxoban-face-layer) {
  filter: hue-rotate(62deg) saturate(0.78)
    brightness(calc(var(--voxoban-face-brightness, 1) * 0.98));
}

.scene
  :deep(
    .voxcss-cube.voxoban-box-cube:not(.voxoban-box-on-goal) .voxoban-face-layer
  ) {
  filter: hue-rotate(-2deg) saturate(0.84)
    brightness(calc(var(--voxoban-face-brightness, 1) * 0.98));
}

.scene :deep(.voxoban-face-layer) {
  position: absolute;
  inset: 0;
  transform-origin: center center;
  pointer-events: none;
  image-rendering: pixelated;
  filter: brightness(var(--voxoban-face-brightness, 1));
}

.scene :deep(.voxcss-cube.voxoban-box-cube .voxoban-face-layer) {
  inset: -0.6px;
}

.sidebar {
  --ui-color: #f4efe0;
  --ui-color-muted: #d3cdbd;
  --ui-color-hover: #fff8ea;
  --ui-color-active: #fffdf5;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ui-gap-m);
  padding: 5px 15px;
  font-family: var(--ui-font-family);
  font-size: var(--ui-font-size);
  line-height: var(--ui-line-height);
  color: var(--ui-color);
}

.btn-github {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 30;
  line-height: 0;
  color: rgb(4 5 12);
}

.btn-github svg {
  display: block;
  fill: currentColor;
}

.btn-github .octo-arm {
  transform-origin: 130px 106px;
}

.btn-github:hover .octo-arm {
  animation: octocat-wave 560ms ease-in-out;
}

@keyframes octocat-wave {
  0%,
  100% {
    transform: rotate(0);
  }
  20%,
  60% {
    transform: rotate(-26deg);
  }
  40%,
  80% {
    transform: rotate(12deg);
  }
}

.brand {
  display: grid;
  gap: var(--ui-gap-s);
  min-width: 160px;
}

.controls {
  display: grid;
  gap: var(--ui-gap-s);
  align-items: start;
  justify-items: start;
}

.control-row {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.chip-divider {
  color: var(--ui-color-muted);
}

.chip {
  border: 0;
  outline: 0;
  background: none;
  color: inherit;
  padding: 0;
  min-height: 1.4rem;
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  box-sizing: border-box;
  font-family: inherit;
  font-size: var(--ui-font-size);
  line-height: var(--ui-line-height);
  font-weight: 400;
  gap: 0.35rem;
}

.chip--button {
  appearance: none;
  cursor: pointer;
  transition: color 140ms ease, transform 100ms ease;
  color: var(--ui-color-muted);
}

.chip-button-label {
  font-weight: 700;
}

.chip-shortcut {
  text-decoration: underline;
  text-underline-offset: 2px;
  text-decoration-thickness: 1px;
  text-decoration-color: currentColor;
}

.chip-button-suit {
  text-decoration: none;
}

.chip--button:hover:not(:disabled) {
  color: var(--ui-color-hover);
  transform: translateX(1px);
}

.chip--button:hover:not(:disabled) .chip-button-label {
  text-decoration: underline;
  text-underline-offset: 2px;
  text-decoration-thickness: 1px;
  text-decoration-color: currentColor;
}

.chip--button:active:not(:disabled) {
  color: var(--ui-color-active);
  transform: translateY(1px) scale(0.99);
}

.chip--button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.chip strong {
  color: inherit;
  font-family: inherit;
  font-size: inherit;
  font-weight: 700;
}

.chip-value {
  font-weight: 400;
}

.chip--timer .chip-value {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
}

.chip--status-win {
  color: #d3f2a2;
}

.chip--status-loss {
  color: #ff3b30;
}

.hint {
  margin: 0;
  max-width: 250px;
  color: var(--ui-color-muted);
}

.zoom-dock {
  --ui-color: #f4efe0;
  --ui-color-muted: #d3cdbd;
  --ui-color-hover: #fff8ea;
  --ui-color-active: #fffdf5;
  --ui-track: rgba(244, 239, 224, 0.4);
  --ui-track-hover: rgba(244, 239, 224, 0.58);
  --ui-track-active: rgba(244, 239, 224, 0.74);
  --ui-thumb-border: #dfd8c9;
  --ui-thumb-border-hover: #ece4d4;
  --ui-thumb-border-active: #f7efe0;
  --ui-thumb: #f4efe0;
  --ui-thumb-hover: #fff8ea;
  --ui-thumb-active: #fffdf5;
  position: absolute;
  left: 15px;
  bottom: 12px;
  z-index: 20;
  display: grid;
  gap: var(--ui-gap-s);
  color: var(--ui-color);
  font-family: var(--ui-font-family);
  font-size: var(--ui-font-size);
  line-height: var(--ui-line-height);
}

.dock-row {
  display: flex;
  align-items: center;
  gap: var(--ui-gap-s);
}

.zoom-label {
  font-weight: 700;
}

.zoom-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 96px;
  height: 14px;
  margin: 0;
  background: transparent;
}

.zoom-slider:focus {
  outline: none;
}

.zoom-slider::-webkit-slider-runnable-track {
  height: 2px;
  border-radius: 999px;
  background: var(--ui-track);
}

.zoom-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-top: -4px;
  border: 1px solid var(--ui-thumb-border);
  background: var(--ui-thumb);
}

.zoom-slider:hover::-webkit-slider-runnable-track {
  background: var(--ui-track-hover);
}

.zoom-slider:hover::-webkit-slider-thumb {
  border-color: var(--ui-thumb-border-hover);
  background: var(--ui-thumb-hover);
}

.zoom-slider:active::-webkit-slider-runnable-track {
  background: var(--ui-track-active);
}

.zoom-slider:active::-webkit-slider-thumb {
  border-color: var(--ui-thumb-border-active);
  background: var(--ui-thumb-active);
}

.zoom-slider::-moz-range-track {
  height: 2px;
  border: 0;
  border-radius: 999px;
  background: var(--ui-track);
}

.zoom-slider::-moz-range-progress {
  height: 2px;
  border-radius: 999px;
  background: var(--ui-track-active);
}

.zoom-slider::-moz-range-thumb {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1px solid var(--ui-thumb-border);
  background: var(--ui-thumb);
}

.zoom-slider:hover::-moz-range-track {
  background: var(--ui-track-hover);
}

.zoom-slider:hover::-moz-range-thumb {
  border-color: var(--ui-thumb-border-hover);
  background: var(--ui-thumb-hover);
}

.view-options {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.view-option {
  display: inline-flex;
  align-items: center;
  color: var(--ui-color-muted);
  cursor: pointer;
}

.view-option:hover {
  color: var(--ui-color-hover);
}

.view-option.is-active {
  color: var(--ui-color-active);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}

.view-radio {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.view-option:focus-within {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.view-separator {
  margin: 0;
  color: var(--ui-color-muted);
}

.camera-reset-button {
  appearance: none;
  border: 0;
  background: none;
  padding: 0;
  color: var(--ui-color-muted);
  font: inherit;
  line-height: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.camera-reset-button:hover {
  color: var(--ui-color-hover);
}

.camera-reset-button:active {
  color: var(--ui-color-active);
}

.mobile-dpad {
  --dpad-cell: 48px;
  --dpad-gap: 4px;
  position: absolute;
  right: calc(10px + env(safe-area-inset-right, 0px));
  bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  z-index: 24;
  display: none;
  grid-template-columns: repeat(3, var(--dpad-cell));
  grid-template-rows: repeat(3, var(--dpad-cell));
  gap: var(--dpad-gap);
}

.mobile-dpad__button {
  --hit-top: 0px;
  --hit-right: 0px;
  --hit-bottom: 0px;
  --hit-left: 0px;
  position: relative;
  border: 1px solid rgba(245, 239, 224, 0.42);
  border-radius: 11px;
  background: rgba(18, 26, 43, 0.75);
  color: #f4efe0;
  font: inherit;
  font-size: 20px;
  line-height: 1;
  display: grid;
  place-items: center;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.mobile-dpad__icon {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.35;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: none;
}

.mobile-dpad__button::before {
  content: "";
  position: absolute;
  top: calc(-1 * var(--hit-top));
  right: calc(-1 * var(--hit-right));
  bottom: calc(-1 * var(--hit-bottom));
  left: calc(-1 * var(--hit-left));
}

.mobile-dpad__button:active {
  background: rgba(26, 39, 62, 0.88);
  transform: scale(0.97);
}

.mobile-dpad__button:disabled {
  opacity: 0.35;
  background: rgba(18, 26, 43, 0.52);
  cursor: not-allowed;
  transform: none;
}

.mobile-dpad__undo {
  grid-column: 1;
  grid-row: 1;
  --hit-top: 12px;
  --hit-right: 0px;
  --hit-bottom: 4px;
  --hit-left: 12px;
}

.mobile-dpad__up {
  grid-column: 2;
  grid-row: 1;
  --hit-top: 12px;
  --hit-right: 4px;
  --hit-bottom: 0px;
  --hit-left: 4px;
}

.mobile-dpad__left {
  grid-column: 1;
  grid-row: 2;
  --hit-top: 4px;
  --hit-right: 0px;
  --hit-bottom: 4px;
  --hit-left: 12px;
}

.mobile-dpad__center {
  grid-column: 2;
  grid-row: 2;
  width: calc(var(--dpad-cell) - 20px);
  height: calc(var(--dpad-cell) - 20px);
  place-self: center;
  border-radius: 999px;
  border: 1px solid rgba(245, 239, 224, 0.2);
  background: rgba(11, 16, 28, 0.45);
  pointer-events: none;
}

.mobile-dpad__right {
  grid-column: 3;
  grid-row: 2;
  --hit-top: 4px;
  --hit-right: 12px;
  --hit-bottom: 4px;
  --hit-left: 0px;
}

.mobile-dpad__down {
  grid-column: 2;
  grid-row: 3;
  --hit-top: 0px;
  --hit-right: 4px;
  --hit-bottom: 12px;
  --hit-left: 4px;
}

.level-cleared-overlay {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  padding: 12px;
  pointer-events: none;
}

.level-cleared-enter-active,
.level-cleared-leave-active {
  transition: opacity 240ms ease;
}

.level-cleared-enter-active .level-cleared-card,
.level-cleared-leave-active .level-cleared-card {
  transition: transform 260ms cubic-bezier(0.22, 0.7, 0.12, 1),
    opacity 260ms ease;
}

.level-cleared-enter-from,
.level-cleared-leave-to {
  opacity: 0;
}

.level-cleared-enter-from .level-cleared-card,
.level-cleared-leave-to .level-cleared-card {
  transform: translateY(10px) scale(0.97);
  opacity: 0;
}

.level-cleared-card {
  pointer-events: auto;
  box-sizing: border-box;
  width: max-content;
  padding: 16px;
  border: 1px solid rgba(142, 177, 112, 0.68);
  background: rgba(8, 26, 17, 0.92);
  color: #f6e7b8;
  font-family: var(--ui-font-family);
  display: grid;
  gap: 8px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.22);
}

.level-cleared-card h2 {
  margin: 0;
  font-size: 19px;
  font-weight: 700;
  margin-bottom: 10px;
}

.level-cleared-stat {
  margin: 0;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-variant-numeric: tabular-nums;
}

.level-cleared-stat span {
  color: rgba(246, 231, 184, 0.7);
  font-size: 13px;
}

.level-cleared-stat strong {
  font-size: 18px;
  font-weight: 700;
}

.level-cleared-action {
  width: 100%;
  margin-top: 6px;
  border: 1px solid #8eb170;
  background: #3f6b41;
  color: #f6e7b8;
  padding: 8px 10px;
  font: inherit;
  font-size: 15px;
  cursor: pointer;
}

.level-cleared-action:hover {
  background: #4a7b4c;
}

@media (prefers-reduced-motion: reduce) {
  .scene {
    transition: none;
  }

  .level-cleared-enter-active,
  .level-cleared-leave-active,
  .level-cleared-enter-active .level-cleared-card,
  .level-cleared-leave-active .level-cleared-card {
    transition: none;
  }
}

@media (pointer: coarse), (max-width: 640px) {
  .mobile-dpad {
    display: grid;
  }
}

@media (max-width: 420px) {
  .mobile-dpad {
    --dpad-cell: 44px;
    --dpad-gap: 3px;
  }

  .mobile-dpad__button {
    font-size: 18px;
  }
}

@media (max-width: 640px) {
  .brand {
    min-width: 0;
  }

  .sidebar {
    top: 0;
    padding: 5px 15px;
  }

  .zoom-dock {
    left: 15px;
    bottom: 12px;
  }

  .zoom-slider {
    width: 96px;
  }
}
</style>
