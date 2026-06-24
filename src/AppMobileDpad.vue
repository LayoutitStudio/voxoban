<script setup lang="ts">
import type { MoveDirection } from "./game/types";

defineProps<{
  isLost: boolean;
  hasWonLevel: boolean;
  canUndoLastMove: boolean;
}>();

const emit = defineEmits<{
  undo: [];
  move: [direction: MoveDirection];
}>();
</script>

<template>
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
      @pointerdown.prevent="emit('undo')"
    >
      <svg class="mobile-dpad__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 14L5 10m0 0 4-4m-4 4h11a4 4 0 1 1 0 8h-1" />
      </svg>
    </button>
    <button
      type="button"
      class="mobile-dpad__button mobile-dpad__up"
      aria-label="Move up"
      @pointerdown.prevent="emit('move', 'up')"
    >
      &#9650;
    </button>
    <button
      type="button"
      class="mobile-dpad__button mobile-dpad__left"
      aria-label="Move left"
      @pointerdown.prevent="emit('move', 'left')"
    >
      &#9664;
    </button>
    <span class="mobile-dpad__center" aria-hidden="true" />
    <button
      type="button"
      class="mobile-dpad__button mobile-dpad__right"
      aria-label="Move right"
      @pointerdown.prevent="emit('move', 'right')"
    >
      &#9654;
    </button>
    <button
      type="button"
      class="mobile-dpad__button mobile-dpad__down"
      aria-label="Move down"
      @pointerdown.prevent="emit('move', 'down')"
    >
      &#9660;
    </button>
  </div>
</template>

<style scoped>
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
</style>
