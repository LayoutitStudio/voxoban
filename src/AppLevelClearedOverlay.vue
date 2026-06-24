<script setup lang="ts">
defineProps<{
  show: boolean;
  levelNumber: number;
  steps: number;
  formattedElapsedTime: string;
  hasNextLevel: boolean;
}>();

const emit = defineEmits<{
  continue: [];
}>();
</script>

<template>
  <Transition name="level-cleared">
    <div v-if="show" class="level-cleared-overlay">
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
          @click="emit('continue')"
        >
          {{ hasNextLevel ? "Next Level" : "Play Again" }}
        </button>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
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
  .level-cleared-enter-active,
  .level-cleared-leave-active,
  .level-cleared-enter-active .level-cleared-card,
  .level-cleared-leave-active .level-cleared-card {
    transition: none;
  }
}
</style>
