<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

import AppCameraDock from "./AppCameraDock.vue";
import AppLevelClearedOverlay from "./AppLevelClearedOverlay.vue";
import AppMobileDpad from "./AppMobileDpad.vue";
import AppSidebar from "./AppSidebar.vue";
import { createActorTextureScheduler } from "./actor-textures";
import { buildSceneVoxels } from "./scene-voxels";
import { createSceneRuntime } from "./scene-runtime";
import { useVoxobanSeo } from "./seo";
import { useCameraControls } from "./use-camera-controls";
import { useLevelSession } from "./use-level-session";
import { useLevelTimer } from "./use-level-timer";
import { useWinSequence } from "./use-win-sequence";

const { logoUrl } = useVoxobanSeo();
const sceneRoot = ref<HTMLElement | null>(null);

let isLevelComplete = (): boolean => false;
const levelTimer = useLevelTimer({
  isLevelComplete: () => isLevelComplete(),
});
const levelSession = useLevelSession({
  elapsedSeconds: levelTimer.elapsedSeconds,
  startLevelTimer: levelTimer.startLevelTimer,
  resumeLevelTimer: levelTimer.resumeLevelTimer,
});
isLevelComplete = () => levelSession.hasWonLevel.value;

const cameraControls = useCameraControls({
  level: levelSession.level,
  sceneRoot,
  isInteractionLocked: () => levelSession.hasWonLevel.value,
});
const winSequence = useWinSequence({
  rotY: cameraControls.rotY,
  hasWonLevel: () => levelSession.hasWonLevel.value,
  clearSceneDrag: () => cameraControls.clearSceneDrag(),
});

levelSession.setLevelChangedHandler(cameraControls.applyMobileZoomPreset);
levelSession.setClearWinSequenceHandler(winSequence.clearWinSequence);

const actorTextureScheduler = createActorTextureScheduler(() => ({
  root: sceneRoot.value,
  level: levelSession.level.value,
  boxes: levelSession.boxes.value,
  player: levelSession.player.value,
  facing: levelSession.facing.value,
}));

const voxels = computed(() =>
  buildSceneVoxels({
    level: levelSession.level.value,
    boxes: levelSession.boxes.value,
    player: levelSession.player.value,
  })
);

const sceneRuntime = createSceneRuntime({
  sceneRoot,
  voxels,
  camera: {
    zoom: cameraControls.zoom,
    pan: cameraControls.pan,
    tilt: cameraControls.tilt,
    rotX: cameraControls.rotX,
    rotY: cameraControls.rotY,
  },
  actorTextureScheduler,
});

const {
  totalLevels,
  levelNumber,
  hasNextLevel,
  facing,
  steps,
  hasWonLevel,
  canUndoLastMove,
  canRedoLastMove,
  isLost,
  resetLevel,
  newGame,
  continueAfterWin,
  undoLastMove,
  redoLastMove,
  moveByDirection,
  applyLevelFromUrl,
  syncLevelQueryParam,
  onPopState,
  onKeyDown,
} = levelSession;

const {
  formattedElapsedTime,
  ensureLevelTimerStarted,
  stopLevelTimer,
  onDocumentVisibilityChange,
} = levelTimer;

const {
  zoom,
  rotX,
  rotY,
  pan,
  tilt,
  zoomMin,
  zoomMax,
  viewMode,
  isSceneDragging,
  isCameraAtDefault,
  applyMobileZoomPreset,
  resetCamera,
  setView,
  onZoomSliderInput,
  onSceneWheel,
  onScenePointerDown,
  onScenePointerMove,
  onScenePointerUp,
  onScenePointerCancel,
  clearSceneDrag,
} = cameraControls;

const {
  isWinSequenceActive,
  showLevelClearedOverlay,
  startWinSequence,
  clearWinSequence,
  mountReducedMotionPreference,
  destroyWinSequence,
} = winSequence;

watch(
  [zoom, pan, tilt, rotX, rotY],
  () => {
    sceneRuntime.syncCamera();
  },
  { flush: "post" }
);

watch(
  voxels,
  () => {
    sceneRuntime.mountScene();
    sceneRuntime.syncCamera();
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

onMounted(() => {
  mountReducedMotionPreference();
  applyLevelFromUrl();
  applyMobileZoomPreset();
  ensureLevelTimerStarted();
  syncLevelQueryParam();
  sceneRuntime.mountScene();
  sceneRuntime.syncCamera();
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("popstate", onPopState);
  document.addEventListener("visibilitychange", onDocumentVisibilityChange);
  onDocumentVisibilityChange();
});

onBeforeUnmount(() => {
  destroyWinSequence();
  clearSceneDrag();
  actorTextureScheduler.cancel();
  stopLevelTimer(false);
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("popstate", onPopState);
  document.removeEventListener("visibilitychange", onDocumentVisibilityChange);
  sceneRuntime.destroyScene();
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

    <AppSidebar
      :logo-url="logoUrl"
      :level-number="levelNumber"
      :total-levels="totalLevels"
      :formatted-elapsed-time="formattedElapsedTime"
      :steps="steps"
      :is-lost="isLost"
      :has-won-level="hasWonLevel"
      :can-undo-last-move="canUndoLastMove"
      :can-redo-last-move="canRedoLastMove"
      @new-game="newGame"
      @reset-level="resetLevel"
      @undo="undoLastMove"
      @redo="redoLastMove"
    />

    <AppCameraDock
      :is-camera-at-default="isCameraAtDefault"
      :has-won-level="hasWonLevel"
      :view-mode="viewMode"
      :zoom="zoom"
      :zoom-min="zoomMin"
      :zoom-max="zoomMax"
      @reset-camera="resetCamera"
      @set-view="setView"
      @zoom-input="onZoomSliderInput"
    />

    <AppMobileDpad
      :is-lost="isLost"
      :has-won-level="hasWonLevel"
      :can-undo-last-move="canUndoLastMove"
      @undo="undoLastMove"
      @move="moveByDirection"
    />

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

    <AppLevelClearedOverlay
      :show="showLevelClearedOverlay"
      :level-number="levelNumber"
      :steps="steps"
      :formatted-elapsed-time="formattedElapsedTime"
      :has-next-level="hasNextLevel"
      @continue="continueAfterWin"
    />
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

@media (prefers-reduced-motion: reduce) {
  .scene {
    transition: none;
  }
}
</style>
