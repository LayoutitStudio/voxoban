<script setup lang="ts">
defineProps<{
  logoUrl: string;
  levelNumber: number;
  totalLevels: number;
  formattedElapsedTime: string;
  steps: number;
  isLost: boolean;
  hasWonLevel: boolean;
  canUndoLastMove: boolean;
  canRedoLastMove: boolean;
}>();

const emit = defineEmits<{
  newGame: [];
  resetLevel: [];
  undo: [];
  redo: [];
}>();
</script>

<template>
  <header class="sidebar">
    <div class="brand">
      <h1 class="sr-only">Voxoban</h1>
      <div class="brand-mark">
        <img class="logo" :src="logoUrl" alt="Voxoban" />
        <span class="logo-version">v0.1</span>
      </div>
    </div>

    <div class="controls">
      <button
        type="button"
        class="chip chip--button"
        @click="emit('newGame')"
      >
        <span class="chip-button-label"
          ><span class="chip-shortcut">N</span>ew Game</span
        >
        <span class="chip-button-suit" aria-hidden="true">&hearts;</span>
      </button>
      <button
        type="button"
        class="chip chip--button"
        @click="emit('resetLevel')"
      >
        <span class="chip-button-label"
          ><span class="chip-shortcut">R</span>estart</span
        >
      </button>
      <div class="control-row">
        <button
          type="button"
          class="chip chip--button"
          :disabled="!canUndoLastMove"
          @click="emit('undo')"
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
          @click="emit('redo')"
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
</template>

<style scoped>
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

.brand {
  display: grid;
  gap: var(--ui-gap-s);
  min-width: 160px;
}

.brand-mark {
  display: inline-flex;
  align-items: flex-end;
  gap: 4px;
}

.logo {
  display: block;
  height: 50px;
  width: auto;
  object-fit: contain;
  margin-left: -8px;
  margin-top: 5px;
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

.chip--status-loss {
  color: #ff3b30;
}

@media (max-width: 640px) {
  .brand {
    min-width: 0;
  }

  .sidebar {
    top: 0;
    padding: 5px 15px;
  }
}
</style>
