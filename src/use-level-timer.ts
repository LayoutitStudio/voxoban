import { computed, ref } from "vue";

type LevelTimerOptions = {
  isLevelComplete: () => boolean;
};

export function useLevelTimer({ isLevelComplete }: LevelTimerOptions) {
  const elapsedSeconds = ref(0);
  let levelTimerHandle: number | null = null;
  let levelStartedAtMs = 0;
  let pausedLevelTimerForVisibility = false;

  const formattedElapsedTime = computed(() => {
    const total = Math.max(0, elapsedSeconds.value);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
      2,
      "0"
    )}`;
  });

  const updateElapsedSeconds = (): void => {
    if (levelStartedAtMs <= 0) {
      elapsedSeconds.value = 0;
      return;
    }

    elapsedSeconds.value = Math.max(
      0,
      Math.floor((Date.now() - levelStartedAtMs) / 1000)
    );
  };

  const stopLevelTimer = (syncElapsed = false): void => {
    if (syncElapsed) {
      updateElapsedSeconds();
    }

    if (typeof window !== "undefined" && levelTimerHandle !== null) {
      window.clearInterval(levelTimerHandle);
    }
    levelTimerHandle = null;
  };

  const startLevelTimer = (): void => {
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
  };

  const ensureLevelTimerStarted = (): void => {
    if (levelTimerHandle !== null) {
      return;
    }
    startLevelTimer();
  };

  const resumeLevelTimer = (): void => {
    stopLevelTimer(false);
    pausedLevelTimerForVisibility = false;
    levelStartedAtMs = Date.now() - elapsedSeconds.value * 1000;

    if (typeof window === "undefined") {
      return;
    }

    levelTimerHandle = window.setInterval(() => {
      updateElapsedSeconds();
    }, 1000);
  };

  const onDocumentVisibilityChange = (): void => {
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
    if (isLevelComplete()) {
      return;
    }

    resumeLevelTimer();
  };

  return {
    elapsedSeconds,
    formattedElapsedTime,
    startLevelTimer,
    ensureLevelTimerStarted,
    stopLevelTimer,
    resumeLevelTimer,
    onDocumentVisibilityChange,
  };
}
