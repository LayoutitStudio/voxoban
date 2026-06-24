<script setup lang="ts">
import type { ViewMode } from "./use-camera-controls";

defineProps<{
  isCameraAtDefault: boolean;
  hasWonLevel: boolean;
  viewMode: ViewMode;
  zoom: number;
  zoomMin: number;
  zoomMax: number;
}>();

const emit = defineEmits<{
  resetCamera: [];
  setView: [mode: ViewMode];
  zoomInput: [event: Event];
}>();
</script>

<template>
  <div class="zoom-dock">
    <div v-if="!isCameraAtDefault && !hasWonLevel" class="dock-row">
      <button
        type="button"
        class="camera-reset-button"
        @click="emit('resetCamera')"
      >
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
            @change="emit('setView', 'isometric')"
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
            @change="emit('setView', 'topdown')"
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
        @input="emit('zoomInput', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
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

@media (max-width: 640px) {
  .zoom-dock {
    left: 15px;
    bottom: 12px;
  }

  .zoom-slider {
    width: 96px;
  }
}
</style>
