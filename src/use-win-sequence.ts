import { ref, watch, type Ref } from "vue";

type WinSequenceOptions = {
  rotY: Ref<number>;
  hasWonLevel: () => boolean;
  clearSceneDrag: () => void;
};

const winBoardRotationDegrees = 360;
const winBoardRotationDurationMs = 1240;

export function useWinSequence({
  rotY,
  hasWonLevel,
  clearSceneDrag,
}: WinSequenceOptions) {
  const isWinSequenceActive = ref(false);
  const showLevelClearedOverlay = ref(false);
  const prefersReducedMotion = ref(false);
  let winRotationRafId: number | null = null;
  let reducedMotionMediaQuery: MediaQueryList | null = null;

  const cancelWinSequenceAnimation = (): void => {
    if (winRotationRafId === null) {
      return;
    }
    if (typeof window !== "undefined") {
      window.cancelAnimationFrame(winRotationRafId);
    }
    winRotationRafId = null;
  };

  const clearWinSequence = (): void => {
    cancelWinSequenceAnimation();
    isWinSequenceActive.value = false;
    showLevelClearedOverlay.value = false;
  };

  const onReducedMotionPreferenceChange = (
    event: MediaQueryListEvent
  ): void => {
    prefersReducedMotion.value = event.matches;
  };

  const startWinSequence = (): void => {
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
      if (!hasWonLevel()) {
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
  };

  const mountReducedMotionPreference = (): void => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }

    reducedMotionMediaQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );
    prefersReducedMotion.value = reducedMotionMediaQuery.matches;
    reducedMotionMediaQuery.addEventListener(
      "change",
      onReducedMotionPreferenceChange
    );
  };

  const destroyWinSequence = (): void => {
    clearWinSequence();
    reducedMotionMediaQuery?.removeEventListener(
      "change",
      onReducedMotionPreferenceChange
    );
    reducedMotionMediaQuery = null;
  };

  watch(prefersReducedMotion, (reducedMotion) => {
    if (
      !reducedMotion ||
      !hasWonLevel() ||
      !isWinSequenceActive.value
    ) {
      return;
    }
    cancelWinSequenceAnimation();
    isWinSequenceActive.value = false;
    showLevelClearedOverlay.value = true;
  });

  return {
    isWinSequenceActive,
    showLevelClearedOverlay,
    startWinSequence,
    clearWinSequence,
    mountReducedMotionPreference,
    destroyWinSequence,
  };
}
