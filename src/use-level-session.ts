import { computed, ref, type Ref } from "vue";

import {
  buildDeadBoxSquares,
  buildGoalReachabilityByGoal,
  isLostState,
} from "./game/deadlocks";
import {
  MOVE_DELTAS_BY_DIRECTION,
  clamp,
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

type LevelSessionOptions = {
  elapsedSeconds: Ref<number>;
  startLevelTimer: () => void;
  resumeLevelTimer: () => void;
};

const LEVEL_QUERY_PARAM = "l";

export function useLevelSession({
  elapsedSeconds,
  startLevelTimer,
  resumeLevelTimer,
}: LevelSessionOptions) {
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
  const hasNextLevel = computed(
    () => levelIndex.value < totalLevels.value - 1
  );
  const goalCount = computed(() => level.value.goals.size);

  const player = ref<Coord>({ ...level.value.startPlayer });
  const facing = ref<Facing>("south");
  const boxes = ref<Set<string>>(new Set(level.value.startBoxes));
  const steps = ref(0);
  const moveHistory = ref<MoveSnapshot[]>([]);
  const redoHistory = ref<MoveSnapshot[]>([]);
  const forcedLoss = ref(false);
  let onLevelChanged = (): void => {};
  let clearWinSequence = (): void => {};

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

  const setLevelChangedHandler = (handler: () => void): void => {
    onLevelChanged = handler;
  };

  const setClearWinSequenceHandler = (handler: () => void): void => {
    clearWinSequence = handler;
  };

  const toSimpleLevelId = (levelToEncode: CampaignLevel): string => {
    return levelToEncode.sourceIndex.toString(36);
  };

  const parseSimpleLevelId = (value: string): number | null => {
    const normalized = value.trim().toLowerCase();
    if (!/^[0-9a-z]+$/.test(normalized)) {
      return null;
    }

    const parsed = Number.parseInt(normalized, 36);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return null;
    }

    return parsed;
  };

  const readLevelIndexFromUrl = (): number | null => {
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
  };

  const syncLevelQueryParam = (): void => {
    if (typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.set(LEVEL_QUERY_PARAM, toSimpleLevelId(level.value));
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(window.history.state ?? null, "", nextUrl);
  };

  const resetLevel = (): void => {
    clearWinSequence();
    player.value = { ...level.value.startPlayer };
    facing.value = "south";
    boxes.value = new Set(level.value.startBoxes);
    steps.value = 0;
    forcedLoss.value = false;
    moveHistory.value = [];
    redoHistory.value = [];
    startLevelTimer();
  };

  const setLevel = (nextLevelIndex: number): void => {
    const boundedLevelIndex = clamp(nextLevelIndex, 0, totalLevels.value - 1);
    if (boundedLevelIndex === levelIndex.value) {
      return;
    }

    levelIndex.value = boundedLevelIndex;
    onLevelChanged();
    resetLevel();
    syncLevelQueryParam();
  };

  const applyLevelFromUrl = (): void => {
    const levelFromUrl = readLevelIndexFromUrl();
    if (levelFromUrl === null) {
      return;
    }
    setLevel(levelFromUrl);
  };

  const onPopState = (): void => {
    applyLevelFromUrl();
  };

  const previousLevel = (): void => {
    setLevel(levelIndex.value - 1);
  };

  const nextLevel = (): void => {
    setLevel(levelIndex.value + 1);
  };

  const newGame = (): void => {
    if (levelIndex.value !== 0) {
      setLevel(0);
      return;
    }

    resetLevel();
    syncLevelQueryParam();
  };

  const continueAfterWin = (): void => {
    if (hasNextLevel.value) {
      nextLevel();
      return;
    }
    newGame();
  };

  const createMoveSnapshot = (): MoveSnapshot => {
    return {
      player: { ...player.value },
      facing: facing.value,
      boxes: new Set(boxes.value),
      steps: steps.value,
      elapsedSeconds: elapsedSeconds.value,
      forcedLoss: forcedLoss.value,
    };
  };

  const applyMoveSnapshot = (snapshot: MoveSnapshot): void => {
    player.value = { ...snapshot.player };
    facing.value = snapshot.facing;
    boxes.value = new Set(snapshot.boxes);
    steps.value = snapshot.steps;
    elapsedSeconds.value = snapshot.elapsedSeconds;
    forcedLoss.value = snapshot.forcedLoss;
  };

  const recordMoveSnapshot = (): void => {
    moveHistory.value.push(createMoveSnapshot());
    redoHistory.value = [];
  };

  const undoLastMove = (): void => {
    const snapshot = moveHistory.value.pop();
    if (!snapshot) {
      return;
    }

    redoHistory.value.push(createMoveSnapshot());
    applyMoveSnapshot(snapshot);
    resumeLevelTimer();
  };

  const redoLastMove = (): void => {
    const snapshot = redoHistory.value.pop();
    if (!snapshot) {
      return;
    }

    moveHistory.value.push(createMoveSnapshot());
    applyMoveSnapshot(snapshot);
    resumeLevelTimer();
  };

  const tryMove = (dx: number, dy: number): void => {
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
  };

  const moveByDirection = (direction: MoveDirection): void => {
    const delta = MOVE_DELTAS_BY_DIRECTION[direction];
    if (!delta) {
      return;
    }
    tryMove(delta.dx, delta.dy);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
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
  };

  return {
    levelIndex,
    level,
    totalLevels,
    levelNumber,
    hasPreviousLevel,
    hasNextLevel,
    player,
    facing,
    boxes,
    steps,
    hasWonLevel,
    canUndoLastMove,
    canRedoLastMove,
    isLost,
    setLevelChangedHandler,
    setClearWinSequenceHandler,
    resetLevel,
    previousLevel,
    nextLevel,
    newGame,
    continueAfterWin,
    undoLastMove,
    redoLastMove,
    moveByDirection,
    applyLevelFromUrl,
    syncLevelQueryParam,
    onPopState,
    onKeyDown,
  };
}
