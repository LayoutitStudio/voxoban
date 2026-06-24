import { computed, ref, type Ref } from "vue";

import { clamp } from "./game/coords";
import type { CampaignLevel } from "./game/types";

export type ViewMode = "isometric" | "topdown";

const DEFAULT_CAMERA_STATE = {
  viewMode: "isometric" as ViewMode,
  zoom: 1.55,
  rotX: 50,
  rotY: 60,
  pan: 0,
  tilt: 0,
};
const CAMERA_DEFAULT_EPSILON = 0.0001;
const zoomMin = 0.35;
const zoomMax = 2.4;
const rotXMin = 0;
const rotXMax = 89;
const rotateSpeed = 0.22;
const zoomWheelSpeed = 0.003;
const isometricView = {
  rotX: DEFAULT_CAMERA_STATE.rotX,
  rotY: DEFAULT_CAMERA_STATE.rotY,
};
const topDownView = { rotX: 0, rotY: 90 };
const mobileViewportMaxWidth = 640;
const mobileZoomReferenceTiles = 7.5;
const mobileZoomMinPreset = 0.42;

type CameraControlsOptions = {
  level: Ref<CampaignLevel>;
  sceneRoot: Ref<HTMLElement | null>;
  isInteractionLocked: () => boolean;
};

export function useCameraControls({
  level,
  sceneRoot,
  isInteractionLocked,
}: CameraControlsOptions) {
  const zoom = ref(DEFAULT_CAMERA_STATE.zoom);
  const rotX = ref(DEFAULT_CAMERA_STATE.rotX);
  const rotY = ref(DEFAULT_CAMERA_STATE.rotY);
  const pan = ref(DEFAULT_CAMERA_STATE.pan);
  const tilt = ref(DEFAULT_CAMERA_STATE.tilt);
  const viewMode = ref<ViewMode>(DEFAULT_CAMERA_STATE.viewMode);
  const sceneDragState = ref<{
    pointerId: number;
    lastX: number;
    lastY: number;
  } | null>(null);

  const isSceneDragging = computed(() => sceneDragState.value !== null);

  const clampZoom = (value: number): number => {
    return Math.min(zoomMax, Math.max(zoomMin, value));
  };

  const setZoom = (value: number): void => {
    zoom.value = Math.round(clampZoom(value) * 1000) / 1000;
  };

  const shouldUseMobileZoomPreset = (): boolean => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.innerWidth <= mobileViewportMaxWidth;
  };

  const computeMobileFitZoom = (): number => {
    const longestSide = Math.max(level.value.width, level.value.height, 1);
    const fitZoom = mobileZoomReferenceTiles / longestSide;
    return clampZoom(Math.max(mobileZoomMinPreset, fitZoom));
  };

  const applyMobileZoomPreset = (): void => {
    if (!shouldUseMobileZoomPreset()) {
      return;
    }
    setZoom(computeMobileFitZoom());
  };

  const getDefaultCameraZoom = (): number => {
    const defaultZoom = shouldUseMobileZoomPreset()
      ? computeMobileFitZoom()
      : DEFAULT_CAMERA_STATE.zoom;
    return Math.round(defaultZoom * 1000) / 1000;
  };

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

  const resetCamera = (): void => {
    viewMode.value = DEFAULT_CAMERA_STATE.viewMode;
    setZoom(getDefaultCameraZoom());
    rotX.value = clamp(DEFAULT_CAMERA_STATE.rotX, rotXMin, rotXMax);
    rotY.value = DEFAULT_CAMERA_STATE.rotY;
    pan.value = DEFAULT_CAMERA_STATE.pan;
    tilt.value = DEFAULT_CAMERA_STATE.tilt;
  };

  const onZoomSliderInput = (event: Event): void => {
    const input = event.target as HTMLInputElement | null;
    if (!input) {
      return;
    }
    const value = Number(input.value);
    if (!Number.isFinite(value)) {
      return;
    }
    setZoom(value);
  };

  const setView = (mode: ViewMode): void => {
    viewMode.value = mode;
    const preset = mode === "topdown" ? topDownView : isometricView;
    rotX.value = clamp(preset.rotX, rotXMin, rotXMax);
    rotY.value = preset.rotY;
    applyMobileZoomPreset();
  };

  const normalizeWheelDeltaToPixels = (event: WheelEvent): number => {
    if (event.deltaMode === 1) {
      return event.deltaY * 16;
    }
    if (event.deltaMode === 2) {
      return event.deltaY * window.innerHeight;
    }
    return event.deltaY;
  };

  const onSceneWheel = (event: WheelEvent): void => {
    if (isInteractionLocked()) {
      return;
    }

    const deltaInPixels = normalizeWheelDeltaToPixels(event);
    if (!Number.isFinite(deltaInPixels) || deltaInPixels === 0) {
      return;
    }

    event.preventDefault();
    setZoom(zoom.value - deltaInPixels * zoomWheelSpeed);
  };

  const isCubeTarget = (target: EventTarget | null): boolean => {
    return target instanceof Element && target.closest(".voxcss-cube") !== null;
  };

  const onScenePointerDown = (event: PointerEvent): void => {
    if (isInteractionLocked()) {
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
  };

  const clearSceneDrag = (pointerId?: number): void => {
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
  };

  const onScenePointerMove = (event: PointerEvent): void => {
    if (isInteractionLocked()) {
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
  };

  const onScenePointerUp = (event: PointerEvent): void => {
    clearSceneDrag(event.pointerId);
  };

  const onScenePointerCancel = (event: PointerEvent): void => {
    clearSceneDrag(event.pointerId);
  };

  return {
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
  };
}
