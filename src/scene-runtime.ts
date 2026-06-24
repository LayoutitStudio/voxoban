import {
  createCamera,
  renderScene,
  type HeadlessCameraHandle,
  type HeadlessRenderHandle,
  type SceneState,
} from "@layoutit/voxcss";
import type { Ref } from "vue";

type CameraRefs = {
  zoom: Ref<number>;
  pan: Ref<number>;
  tilt: Ref<number>;
  rotX: Ref<number>;
  rotY: Ref<number>;
};

type ActorTextureScheduler = {
  schedule: () => void;
};

type SceneRuntimeOptions = {
  sceneRoot: Ref<HTMLElement | null>;
  voxels: Ref<SceneState["voxels"]>;
  camera: CameraRefs;
  actorTextureScheduler: ActorTextureScheduler;
};

function buildSceneState(nextVoxels: SceneState["voxels"]): SceneState {
  return {
    voxels: nextVoxels,
    projection: "dimetric",
    showFloor: false,
    showWalls: false,
    mergeVoxels: false,
  };
}

export function createSceneRuntime({
  sceneRoot,
  voxels,
  camera,
  actorTextureScheduler,
}: SceneRuntimeOptions): {
  syncCamera: () => void;
  mountScene: () => void;
  destroyScene: () => void;
} {
  let cameraHandle: HeadlessCameraHandle | null = null;
  let renderHandle: HeadlessRenderHandle | null = null;
  let cameraElement: HTMLElement | null = null;

  const syncCamera = (): void => {
    if (!cameraHandle) {
      return;
    }

    cameraHandle.update({
      zoom: camera.zoom.value,
      pan: camera.pan.value,
      tilt: camera.tilt.value,
      rotX: camera.rotX.value,
      rotY: camera.rotY.value,
      interactive: false,
      animate: false,
      perspective: 8000,
    });

    actorTextureScheduler.schedule();
  };

  const clearStaleSceneCameras = (root: HTMLElement | null): void => {
    if (!root) {
      return;
    }

    const staleCameras = Array.from(
      root.querySelectorAll<HTMLElement>(".voxcss-camera")
    );
    for (const node of staleCameras) {
      node.remove();
    }
  };

  const destroyScene = (): void => {
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
  };

  const mountScene = (): void => {
    const root = sceneRoot.value;
    if (!root) {
      return;
    }

    destroyScene();
    const doc = root.ownerDocument ?? document;
    cameraElement = doc.createElement("div");

    cameraHandle = createCamera({
      element: cameraElement,
      zoom: camera.zoom.value,
      pan: camera.pan.value,
      tilt: camera.tilt.value,
      rotX: camera.rotX.value,
      rotY: camera.rotY.value,
      interactive: false,
      animate: false,
      perspective: 8000,
    });

    renderHandle = renderScene({
      element: root,
      camera: cameraHandle,
      scene: buildSceneState(voxels.value),
    });

    actorTextureScheduler.schedule();
  };

  return {
    syncCamera,
    mountScene,
    destroyScene,
  };
}
