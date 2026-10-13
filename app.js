import * as THREE from "three";
import { TrackballControls } from "three/addons/controls/TrackballControls.js";
import {
  createMaskedNiftiArrayBuffer,
  decodeNiftiFile,
  getNiftiDisplayLabel,
  isNiftiFile,
} from "./nifti_adapter.js";

window.__APP_BOOTED__ = true;
window.dispatchEvent(new Event("app-booted"));

const dicomParser = window.dicomParser;

const folderInput = document.getElementById("folderInput");
const niftiInput = document.getElementById("niftiInput");
const niftiDatasetSelect = document.getElementById("niftiDatasetSelect");
const niftiDilationInput = document.getElementById("niftiDilationInput");
const niftiDilationValue = document.getElementById("niftiDilationValue");
const applyNiftiDilationBtn = document.getElementById("applyNiftiDilationBtn");
const exportNiftiMaskedBtn = document.getElementById("exportNiftiMaskedBtn");
const thresholdInput = document.getElementById("threshold");
const thresholdValue = document.getElementById("thresholdValue");
const sampleStepInput = document.getElementById("sampleStep");
const sampleStepValue = document.getElementById("sampleStepValue");
const xScaleInput = document.getElementById("xScale");
const xScaleValue = document.getElementById("xScaleValue");
const yScaleInput = document.getElementById("yScale");
const yScaleValue = document.getElementById("yScaleValue");
const zScaleInput = document.getElementById("zScale");
const zScaleValue = document.getElementById("zScaleValue");
const viewLockInput = document.getElementById("viewLock");
const autoRotateAxisSelect = document.getElementById("autoRotateAxis");
const maxPointsInput = document.getElementById("maxPoints");
const maxPointsValue = document.getElementById("maxPointsValue");
const exportDicomBtn = document.getElementById("exportDicomBtn");
const waterDbscanEpsInput = document.getElementById("waterDbscanEps");
const waterDbscanEpsValue = document.getElementById("waterDbscanEpsValue");
const waterDbscanMinPtsInput = document.getElementById("waterDbscanMinPts");
const waterDbscanMinPtsValue = document.getElementById("waterDbscanMinPtsValue");
const waterBandRatioInput = document.getElementById("waterBandRatio");
const waterBandRatioValue = document.getElementById("waterBandRatioValue");
const waterBandRatioXInput = document.getElementById("waterBandRatioX");
const waterBandRatioXValue = document.getElementById("waterBandRatioXValue");
const waterRuleModeYSelect = document.getElementById("waterRuleModeY");
const waterRuleModeXSelect = document.getElementById("waterRuleModeX");
const waterRuleModeBlueSelect = document.getElementById("waterRuleModeBlue");
const waterConflictModeSelect = document.getElementById("waterConflictMode");
const obliqueAngleDegInput = document.getElementById("obliqueAngleDeg");
const obliqueAngleDegValue = document.getElementById("obliqueAngleDegValue");
const autoDetectObliqueBtn = document.getElementById("autoDetectObliqueBtn");
const obliqueStartZRatioInput = document.getElementById("obliqueStartZRatio");
const obliqueStartZRatioValue = document.getElementById("obliqueStartZRatioValue");
const bluePatternModeSelect = document.getElementById("bluePatternMode");
const bluePlaneThicknessRatioInput = document.getElementById("bluePlaneThicknessRatio");
const bluePlaneThicknessRatioValue = document.getElementById("bluePlaneThicknessRatioValue");
const zSliceInput = document.getElementById("zSlice");
const zSliceValue = document.getElementById("zSliceValue");
const ySliceInput = document.getElementById("ySlice");
const ySliceValue = document.getElementById("ySliceValue");
const xSliceInput = document.getElementById("xSlice");
const xSliceValue = document.getElementById("xSliceValue");
const tabBtnCloud = document.getElementById("tabBtnCloud");
const tabBtnGaussian = document.getElementById("tabBtnGaussian");
const tabBtnSlice = document.getElementById("tabBtnSlice");
const tabBtnXray = document.getElementById("tabBtnXray");
const tabPanelCloud = document.getElementById("tabPanelCloud");
const tabPanelSlice = document.getElementById("tabPanelSlice");
const tabPanelXray = document.getElementById("tabPanelXray");
const axisViewButtons = Array.from(document.querySelectorAll("[data-axis-view]"));
const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const canvas = document.getElementById("viewer");
const sliceXYCanvas = document.getElementById("sliceXY");
const sliceXZCanvas = document.getElementById("sliceXZ");
const sliceYZCanvas = document.getElementById("sliceYZ");
const sliceXrayYCanvas = document.getElementById("sliceXrayY");
const sliceXYCtx = sliceXYCanvas ? sliceXYCanvas.getContext("2d") : null;
const sliceXZCtx = sliceXZCanvas ? sliceXZCanvas.getContext("2d") : null;
const sliceYZCtx = sliceYZCanvas ? sliceYZCanvas.getContext("2d") : null;
const sliceXrayYCtx = sliceXrayYCanvas ? sliceXrayYCanvas.getContext("2d") : null;
const xrayImageInput = document.getElementById("xrayImageInput");
const xrayReferenceImg = document.getElementById("xrayReferenceImg");
const xrayReferenceHint = document.getElementById("xrayReferenceHint");
const offscreenCanvases = {
  XY: document.createElement("canvas"),
  XZ: document.createElement("canvas"),
  YZ: document.createElement("canvas"),
  XRAYY: document.createElement("canvas"),
};
const sliceViewState = {
  XY: { srcW: 0, srcH: 0, fitCss: null },
  XZ: { srcW: 0, srcH: 0, fitCss: null },
  YZ: { srcW: 0, srcH: 0, fitCss: null },
  XRAYY: { srcW: 0, srcH: 0, fitCss: null },
};
const sliceTextureState = {
  XY: { token: null },
  XZ: { token: null },
  YZ: { token: null },
  XRAYY: { token: null },
};

let xrayReferenceUrl = "";

let parserReady = false;
const desktopBridge = window.dicomDesktop || null;

const uiLogs = [];
const APP_BUILD = "20260414c";
function pushLog(message) {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  uiLogs.push(`[${hh}:${mm}:${ss}] ${message}`);
  if (uiLogs.length > 120) {
    uiLogs.shift();
  }
  if (logEl) {
    logEl.textContent = uiLogs.join("\n");
    logEl.scrollTop = logEl.scrollHeight;
  }
}

function bindRangeControl(rangeEl, outputEl, formatValue, onValue, debugName) {
  if (!rangeEl || !outputEl) return false;
  const apply = (sourceEvent = "init") => {
    const formatted = formatValue(rangeEl.value);
    outputEl.textContent = formatted;
    if (sourceEvent !== "init") {
      onValue?.();
    }
    if (sourceEvent === "change") {
      pushLog(`[控件] ${debugName}=${formatted}`);
    }
  };
  apply("init");
  rangeEl.addEventListener("input", () => apply("input"));
  rangeEl.addEventListener("change", () => apply("change"));
  return true;
}

if (thresholdInput && thresholdValue) {
  thresholdInput.addEventListener("input", () => {
    thresholdValue.textContent = thresholdInput.value;
    scheduleRebuild();
  });
}

if (sampleStepInput && sampleStepValue) {
  sampleStepInput.addEventListener("input", () => {
    sampleStepValue.textContent = sampleStepInput.value;
    scheduleRebuild();
  });
}

if (xScaleInput && xScaleValue) {
  xScaleInput.addEventListener("input", () => {
    xScaleValue.textContent = xScaleInput.value;
    const applied = applySpatialScaleImmediate();
    if (!applied) {
      scheduleRebuild();
    }
  });
}

if (yScaleInput && yScaleValue) {
  yScaleInput.addEventListener("input", () => {
    yScaleValue.textContent = yScaleInput.value;
    const applied = applySpatialScaleImmediate();
    if (!applied) {
      scheduleRebuild();
    }
  });
}

if (zScaleInput && zScaleValue) {
  zScaleInput.addEventListener("input", () => {
    zScaleValue.textContent = zScaleInput.value;
    const applied = applySpatialScaleImmediate();
    if (!applied) {
      scheduleRebuild();
    }
  });
}

if (maxPointsInput && maxPointsValue) {
  maxPointsValue.textContent = Number(maxPointsInput.value).toLocaleString();
  maxPointsInput.addEventListener("input", () => {
    maxPointsValue.textContent = Number(maxPointsInput.value).toLocaleString();
    scheduleRebuild();
  });
}

bindRangeControl(
  waterBandRatioInput,
  waterBandRatioValue,
  (v) => Number(v).toFixed(2),
  () => scheduleWaterSurfaceDetection(false),
  "规则Y阈值",
);

bindRangeControl(
  waterBandRatioXInput,
  waterBandRatioXValue,
  (v) => Number(v).toFixed(2),
  () => scheduleWaterSurfaceDetection(false),
  "规则X阈值",
);

bindRangeControl(
  obliqueAngleDegInput,
  obliqueAngleDegValue,
  (v) => `${Math.round(Number(v))}°`,
  () => scheduleWaterSurfaceDetection(false),
  "蓝色斜向角度",
);

bindRangeControl(
  obliqueStartZRatioInput,
  obliqueStartZRatioValue,
  (v) => Number(v).toFixed(2),
  () => scheduleWaterSurfaceDetection(false),
  "蓝色起点Z占比",
);

bindRangeControl(
  bluePlaneThicknessRatioInput,
  bluePlaneThicknessRatioValue,
  (v) => Number(v).toFixed(2),
  () => scheduleWaterSurfaceDetection(false),
  "蓝色平面厚度",
);

if (exportDicomBtn) {
  exportDicomBtn.addEventListener("click", () => {
    void exportDeletedVoxelDicomSeries();
  });
}

if (autoDetectObliqueBtn) {
  autoDetectObliqueBtn.addEventListener("click", () => {
    void autoDetectObliqueLineY();
  });
}

if (bluePatternModeSelect) {
  bluePatternModeSelect.addEventListener("change", () => {
    pushLog(`[控件] 蓝色规则形态=${bluePatternModeSelect.value}`);
    scheduleWaterSurfaceDetection(false);
  });
}

if (waterRuleModeYSelect) {
  waterRuleModeYSelect.addEventListener("change", () => {
    pushLog(`[控件] Y规则显示模式=${waterRuleModeYSelect.value}`);
    scheduleRebuild();
    scheduleSliceRender();
    requestRenderIfNotRequested();
  });
}

if (waterRuleModeXSelect) {
  waterRuleModeXSelect.addEventListener("change", () => {
    pushLog(`[控件] X规则显示模式=${waterRuleModeXSelect.value}`);
    scheduleRebuild();
    scheduleSliceRender();
    requestRenderIfNotRequested();
  });
}

if (waterRuleModeBlueSelect) {
  waterRuleModeBlueSelect.addEventListener("change", () => {
    pushLog(`[控件] 蓝色规则显示模式=${waterRuleModeBlueSelect.value}`);
    scheduleRebuild();
    scheduleSliceRender();
    requestRenderIfNotRequested();
  });
}

if (waterConflictModeSelect) {
  waterConflictModeSelect.addEventListener("change", () => {
    pushLog(`[控件] 冲突颜色策略=${waterConflictModeSelect.value}`);
    scheduleRebuild();
    scheduleSliceRender();
    requestRenderIfNotRequested();
  });
}

if (viewLockInput) {
  viewLockInput.addEventListener("change", () => {
    if (controls) {
      controls.enabled = !viewLockInput.checked;
      requestRenderIfNotRequested();
    }
  });
}

if (autoRotateAxisSelect) {
  autoRotateAxisSelect.addEventListener("change", () => {
    const axis = autoRotateAxisSelect.value;
    autoRotateAxis = axis === "x" || axis === "y" || axis === "z" ? axis : "none";
    requestRenderIfNotRequested();
  });
}

if (zSliceInput) {
  zSliceInput.addEventListener("input", () => {
    setMprIndex({ z: Number(zSliceInput.value) });
  });
}

if (ySliceInput) {
  ySliceInput.addEventListener("input", () => {
    setMprIndex({ y: Number(ySliceInput.value) });
  });
}

if (xSliceInput) {
  xSliceInput.addEventListener("input", () => {
    setMprIndex({ x: Number(xSliceInput.value) });
  });
}

tabBtnCloud?.addEventListener("click", () => {
  preferred3DMode = "volume";
  switchTab("cloud");
  scheduleRebuild();
});

tabBtnGaussian?.addEventListener("click", () => {
  preferred3DMode = "gaussian";
  switchTab("gaussian");
  scheduleRebuild();
});

tabBtnSlice?.addEventListener("click", () => {
  switchTab("slice");
});

tabBtnXray?.addEventListener("click", () => {
  switchTab("xray");
});

if (xrayImageInput && xrayReferenceImg) {
  xrayImageInput.addEventListener("change", () => {
    const file = xrayImageInput.files?.[0];
    if (!file) return;

    if (xrayReferenceUrl) {
      URL.revokeObjectURL(xrayReferenceUrl);
      xrayReferenceUrl = "";
    }

    xrayReferenceUrl = URL.createObjectURL(file);
    xrayReferenceImg.src = xrayReferenceUrl;
    xrayReferenceImg.style.display = "block";
    if (xrayReferenceHint) {
      xrayReferenceHint.textContent = `已加载：${file.name}`;
    }

    // Image load changes panel layout; force a follow-up redraw so simulated XRay
    // re-measures the canvas and avoids CSS stretch artifacts.
    xrayReferenceImg.addEventListener("load", () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scheduleSliceRender();
        });
      });
    }, { once: true });

    scheduleSliceRender();
  });
}

if (typeof ResizeObserver !== "undefined" && tabPanelXray) {
  const xrayLayoutObserver = new ResizeObserver(() => {
    if (tabPanelXray.classList.contains("active")) {
      scheduleSliceRender();
    }
  });
  xrayLayoutObserver.observe(tabPanelXray);
}

let renderer = null;
let controls = null;
let rendererBackend = "unknown";
const basePixelRatio = Math.min(window.devicePixelRatio, 2);
let adaptiveRenderScale = 1.0;
const enableAdaptiveResolution = false;
let currentInteractionRenderScale = 1.0;
let smoothFrameMs = 16.7;
let frameSampleCount = 0;
let autoRotateAxis = "none";
const autoRotateSpeedRad = 0.22;
const renderClock = new THREE.Clock();
const rendererSizeCache = new THREE.Vector2();
let lastFrameTimeMs = 0;
let isUserInteracting = false;
let currentVolumeBaseSteps = 320;
let currentVolumeBaseDensity = 22;
let renderRequested = false;
let postInteractionRenderUntilMs = 0;
let isWebglContextLost = false;
let maxGpu3DTextureSize = 0;
let volumeSamplingLogToken = "";
let currentVolumeTextureShape = { cols: 1, rows: 1, depth: 1, stepX: 1, stepY: 1, stepZ: 1 };

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050d14);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 20000);
camera.position.set(0, -220, 240);

async function initRendererAndControls() {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  rendererBackend = renderer.capabilities?.isWebGL2 ? "webgl2" : "webgl1";

  const gl = renderer.getContext?.();
  maxGpu3DTextureSize = gl?.MAX_3D_TEXTURE_SIZE ? Number(gl.getParameter(gl.MAX_3D_TEXTURE_SIZE) || 0) : 0;

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    isWebglContextLost = true;
    renderRequested = false;
    pushLog("WebGL 上下文丢失：暂停渲染，等待浏览器恢复。 ");
    setStatusOnly("检测到 WebGL 上下文丢失，正在自动恢复... ");
  });

  canvas.addEventListener("webglcontextrestored", () => {
    isWebglContextLost = false;
    volumeTextureRevision = -1;
    gaussianBuildRevision = -1;
    pushLog("WebGL 上下文已恢复：将自动重建体素纹理。 ");
    scheduleRebuild();
    requestRenderIfNotRequested();
  });

  applyRendererScale();
  renderer.setSize(canvas.clientWidth || 1200, canvas.clientHeight || 800, false);

  controls = new TrackballControls(camera, renderer.domElement);
  controls.rotateSpeed = 2.4;
  controls.zoomSpeed = 1.3;
  controls.panSpeed = 0.9;
  controls.dynamicDampingFactor = 0.05;
  controls.staticMoving = true;
  controls.noRotate = false;
  controls.noPan = false;
  controls.noZoom = false;
  controls.target.set(0, 0, 0);
  controls.enabled = !(viewLockInput?.checked);
  controls.addEventListener("start", () => {
    isUserInteracting = true;
    postInteractionRenderUntilMs = performance.now() + 300;
    requestRenderIfNotRequested();
  });
  controls.addEventListener("change", () => {
    requestRenderIfNotRequested();
  });
  controls.addEventListener("end", () => {
    isUserInteracting = false;
    postInteractionRenderUntilMs = performance.now() + 280;
    requestRenderIfNotRequested();
  });

  if (autoRotateAxisSelect) {
    const axis = autoRotateAxisSelect.value;
    autoRotateAxis = axis === "x" || axis === "y" || axis === "z" ? axis : "none";
  }

  const label = rendererBackend === "webgl2"
    ? "WebGL2（自定义 Shader 稳定路径）"
    : "WebGL1（功能受限）";
  pushLog(`3D 渲染后端：${label}`);
}

function supportsGpuVolumeRendering() {
  return rendererBackend === "webgl2" && !isWebglContextLost;
}

function buildVolumeSamplingPlan(slices) {
  const depth = Math.max(1, slices.length);
  const rows = Math.max(1, slices[0].rows);
  const cols = Math.max(1, slices[0].cols);
  const max2D = Number(renderer?.capabilities?.maxTextureSize || 2048);
  const max3D = Math.max(1, Number(maxGpu3DTextureSize || max2D));
  const edgeLimit = Math.max(1, Math.min(max2D, max3D));

  let stepX = 1;
  let stepY = 1;
  let stepZ = 1;

  while (Math.ceil(cols / stepX) > edgeLimit) stepX *= 2;
  while (Math.ceil(rows / stepY) > edgeLimit) stepY *= 2;
  while (Math.ceil(depth / stepZ) > edgeLimit) stepZ *= 2;

  const targetVoxels = 28_000_000;
  const dims = () => ({
    cols: Math.max(1, Math.ceil(cols / stepX)),
    rows: Math.max(1, Math.ceil(rows / stepY)),
    depth: Math.max(1, Math.ceil(depth / stepZ)),
  });

  let d = dims();
  while (d.cols * d.rows * d.depth > targetVoxels) {
    if (d.cols >= d.rows && d.cols >= d.depth) {
      stepX *= 2;
    } else if (d.rows >= d.cols && d.rows >= d.depth) {
      stepY *= 2;
    } else {
      stepZ *= 2;
    }
    d = dims();
  }

  return {
    cols: d.cols,
    rows: d.rows,
    depth: d.depth,
    stepX,
    stepY,
    stepZ,
    edgeLimit,
    targetVoxels,
  };
}

function applyRendererScale() {
  if (!renderer) return;
  renderer.setPixelRatio(basePixelRatio * adaptiveRenderScale);
}

function tuneAdaptiveQuality(frameMs) {
  if (!enableAdaptiveResolution) {
    return;
  }
  smoothFrameMs = smoothFrameMs * 0.9 + frameMs * 0.1;
  frameSampleCount += 1;
  if (frameSampleCount < 20) return;
  frameSampleCount = 0;

  if (preferred3DMode !== "volume" || !supportsGpuVolumeRendering()) {
    return;
  }

  let nextScale = adaptiveRenderScale;
  if (smoothFrameMs > 21) {
    nextScale *= 0.92;
  } else if (smoothFrameMs < 13) {
    nextScale *= 1.04;
  }

  nextScale = Math.max(0.55, Math.min(1.25, nextScale));
  if (Math.abs(nextScale - adaptiveRenderScale) > 0.015) {
    adaptiveRenderScale = nextScale;
    applyRendererScale();
    resizeRendererToDisplaySize();
  }
}

function applyAutoRotate(deltaSec) {
  if (!controls || autoRotateAxis === "none") return;

  const axis = autoRotateAxis === "x"
    ? new THREE.Vector3(1, 0, 0)
    : autoRotateAxis === "y"
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(0, 0, 1);

  const offset = camera.position.clone().sub(controls.target);
  offset.applyAxisAngle(axis, autoRotateSpeedRad * deltaSec);
  camera.position.copy(controls.target.clone().add(offset));
  camera.lookAt(controls.target);
}

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const keyLight = new THREE.DirectionalLight(0x9fdfff, 0.85);
keyLight.position.set(220, -180, 260);
scene.add(keyLight);
scene.add(new THREE.AxesHelper(60));

let loadedSlices = [];
let currentPoints = null;
let currentVolumeMesh = null;
let currentVolumeMaterial = null;
let currentVolumeTexture = null;
let currentWaterMaskTexture = null;
let currentNiftiMaskMeshes = [];
let currentGaussianPoints = null;
let currentGaussianMaterial = null;
let loadedSourceFolderName = "";
let loadedSourceFolderPath = "";
let loadedVolumeSourceType = "dicom";
const niftiVolumes = new Map();
let activeNiftiLabel = "";
let niftiDilationRadius = 2;
let niftiDilationMaskSlices = null;
let niftiOverlayRevision = 0;
let gaussianBuildRevision = -1;
let gaussianBuildSampleStep = -1;
let gaussianBuildMaxPoints = -1;
let gaussianPointCount = 0;
let volumeDataRevision = 0;
let volumeTextureRevision = -1;
let volumeWaterMaskRevision = -1;
let currentBounds = { x: 1, y: 1, z: 1 };
let rebuildTimer = null;
let isRebuilding = false;
let pendingRebuild = false;
let globalValueRange = { min: 0, max: 1 };
let renderValueRange = { min: 0, max: 1 };
let volumeMeta = { depth: 0, rows: 0, cols: 0 };
let sliceRenderRafId = 0;
let mprIndex = { x: 0, y: 0, z: 0 };
let preferred3DMode = "volume";
let pointCloudBakedScale = { x: 1, y: 1, z: 1 };
let gaussianBuildRuleModeY = "color";
let gaussianBuildRuleModeX = "color";
let gaussianBuildRuleModeBlue = "color";
let gaussianBuildWaterMaskRevision = -1;
let waterMaskRevision = 0;
let waterDetectionTaskId = 0;
let waterDetectionScheduled = false;
let waterDetectionInProgress = false;
let xrayYProjectionCache = {
  token: null,
  values: null,
  width: 0,
  height: 0,
  min: 0,
  max: 1,
    displayMin: 0,
    displayMax: 1,
};
const AXIS_DIRECTION = Object.freeze({ x: -1, y: -1, z: -1 });
const RULE_COLOR_X = Object.freeze({ r: 1.0, g: 0.16, b: 0.16 });
const RULE_COLOR_Y = Object.freeze({ r: 0.18, g: 0.95, b: 0.28 });
const RULE_COLOR_OBLIQUE = Object.freeze({ r: 0.20, g: 0.56, b: 1.0 });
const RULE_MASK_Y = 1;
const RULE_MASK_X = 2;
const RULE_MASK_OBLIQUE = 4;

function invalidateSliceTextureCache() {
  sliceTextureState.XY.token = null;
  sliceTextureState.XZ.token = null;
  sliceTextureState.YZ.token = null;
  sliceTextureState.XRAYY.token = null;
  xrayYProjectionCache.token = null;
}

function switchTab(tabName) {
  const isCloud = tabName === "cloud";
  const isGaussian = tabName === "gaussian";
  const isSlice = tabName === "slice";
  const isXray = tabName === "xray";

  tabBtnCloud?.classList.toggle("active", isCloud);
  tabBtnGaussian?.classList.toggle("active", isGaussian);
  tabBtnSlice?.classList.toggle("active", isSlice);
  tabBtnXray?.classList.toggle("active", isXray);

  // Cloud and Gaussian share the same 3D viewport panel but use different render modes.
  tabPanelCloud?.classList.toggle("active", isCloud || isGaussian);
  tabPanelSlice?.classList.toggle("active", isSlice);
  tabPanelXray?.classList.toggle("active", isXray);

  if (isSlice || isXray) {
    scheduleSliceRender();
  } else {
    scheduleRebuild();
  }
  requestRenderIfNotRequested();
}

function summarizeReasonMap(reasonMap, limit = 5) {
  return Array.from(reasonMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([msg, count]) => `${count}x ${msg}`)
    .join("；");
}

function adjustAutoDetectedObliqueParameters(bestZStartRatio, bestThetaDeg, depth) {
  const safeDepth = Math.max(1, Math.floor(Number(depth) || 1));
  const detectedZStart = Math.max(0, Math.min(safeDepth - 1, Math.floor(safeDepth * Number(bestZStartRatio || 0))));
  const adjustedZStart = Math.min(safeDepth - 1, detectedZStart + 1);
  return {
    obliqueStartZRatio: adjustedZStart / safeDepth,
    obliqueAngleDeg: Math.min(89, Number(bestThetaDeg || 0) + 1),
  };
}

function getWaterSurfaceConfig() {
  const modeY = waterRuleModeYSelect?.value;
  const modeX = waterRuleModeXSelect?.value;
  const modeBlue = waterRuleModeBlueSelect?.value;
  const bluePatternMode = bluePatternModeSelect?.value;
  const conflictMode = waterConflictModeSelect?.value;
  return {
    ruleYRatio: Math.max(0.05, Math.min(0.95, Number(waterBandRatioInput?.value || 0.05))),
    ruleXRatio: Math.max(0.05, Math.min(0.95, Number(waterBandRatioXInput?.value || 0.15))),
    obliqueAngleDeg: Math.max(0, Math.min(89, Number(obliqueAngleDegInput?.value || 51))),
    obliqueStartZRatio: Math.max(0, Math.min(0.95, Number(obliqueStartZRatioInput?.value || 0.72))),
    bluePlaneThicknessRatio: Math.max(0.01, Math.min(0.95, Number(bluePlaneThicknessRatioInput?.value || 0.07))),
    bluePatternMode: bluePatternMode === "oblique" || bluePatternMode === "plane" || bluePatternMode === "both"
      ? bluePatternMode
      : "both",
    ruleModeY: modeY === "none" || modeY === "hide" || modeY === "color" ? modeY : "none",
    ruleModeX: modeX === "none" || modeX === "hide" || modeX === "color" ? modeX : "none",
    ruleModeBlue: modeBlue === "none" || modeBlue === "hide" || modeBlue === "color" ? modeBlue : "none",
    conflictMode: conflictMode === "x" || conflictMode === "y" || conflictMode === "mix" ? conflictMode : "mix",
  };
}

function getProcessingWaterSurfaceConfig() {
  const config = getWaterSurfaceConfig();
  return {
    ...config,
    ruleModeY: config.ruleModeY === "none" ? "color" : config.ruleModeY,
    ruleModeX: config.ruleModeX === "none" ? "color" : config.ruleModeX,
    ruleModeBlue: config.ruleModeBlue === "none" ? "color" : config.ruleModeBlue,
  };
}

function resetWaterMask(slices) {
  for (const s of slices) {
    s.waterMask = new Uint8Array(s.rows * s.cols);
  }
  waterMaskRevision += 1;
}

function isWaterVoxel(slice, idx) {
  return (slice?.waterMask?.[idx] || 0) > 0;
}

function getRuleMask(slice, idx) {
  return slice?.waterMask?.[idx] || 0;
}

function shouldHideByRule(mask, config) {
  const yHit = (mask & RULE_MASK_Y) !== 0;
  const xHit = (mask & RULE_MASK_X) !== 0;
  const bHit = (mask & RULE_MASK_OBLIQUE) !== 0;
  return (yHit && config.ruleModeY === "hide")
    || (xHit && config.ruleModeX === "hide")
    || (bHit && config.ruleModeBlue === "hide");
}

function colorFromRuleMask(mask, base, config = null) {
  const obliqueHit = (mask & RULE_MASK_OBLIQUE) !== 0;
  const yHit = (mask & RULE_MASK_Y) !== 0;
  const xHit = (mask & RULE_MASK_X) !== 0;
  const blueMode = config?.ruleModeBlue === "none" || config?.ruleModeBlue === "hide" || config?.ruleModeBlue === "color"
    ? config.ruleModeBlue
    : "color";
  if (obliqueHit && blueMode === "color") return RULE_COLOR_OBLIQUE;
  const conflictMode = config?.conflictMode === "x" || config?.conflictMode === "y" || config?.conflictMode === "mix"
    ? config.conflictMode
    : "mix";
  if (xHit && yHit) {
    if (conflictMode === "x") return RULE_COLOR_X;
    if (conflictMode === "y") return RULE_COLOR_Y;
    return {
      r: Math.max(RULE_COLOR_X.r, RULE_COLOR_Y.r),
      g: Math.max(RULE_COLOR_X.g, RULE_COLOR_Y.g),
      b: Math.max(RULE_COLOR_X.b, RULE_COLOR_Y.b),
    };
  }
  if (yHit) return RULE_COLOR_Y;
  if (xHit) return RULE_COLOR_X;
  return base;
}

async function yieldToUi() {
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

function isNonImageSopClassUid(uid) {
  if (!uid) return false;
  if (uid === "1.2.840.10008.1.3.10") return true;
  const nonImagePrefixes = [
    "1.2.840.10008.5.1.4.1.1.88.",
    "1.2.840.10008.5.1.4.1.1.481.",
    "1.2.840.10008.5.1.4.1.1.11.",
    "1.2.840.10008.5.1.4.1.1.9.",
    "1.2.840.10008.5.1.4.1.1.66.",
    "1.2.840.10008.5.1.4.1.1.67",
  ];
  return nonImagePrefixes.some((p) => uid.startsWith(p));
}

async function parseQuickMeta(file) {
  const arrayBuffer = await file.arrayBuffer();
  const byteArray = new Uint8Array(arrayBuffer);
  const dataSet = dicomParser.parseDicom(byteArray, { untilTag: "x7fe00010" });

  const sopClassUid = dataSet?.string?.("x00080016") || dataSet?.string?.("x00020002") || "";
  const seriesInstanceUid = dataSet?.string?.("x0020000e") || "";
  const rows = tagNumber(dataSet, "x00280010", 0);
  const cols = tagNumber(dataSet, "x00280011", 0);

  return { sopClassUid, seriesInstanceUid, rows, cols };
}

async function prescanAndSelectSeries(files) {
  const candidates = [];
  const skipReasons = new Map();
  const seriesCounts = new Map();
  const concurrency = Math.max(4, Math.min(16, (navigator.hardwareConcurrency || 4) * 2));

  let completed = 0;
  let nextIndex = 0;
  let lastProgressAt = 0;

  function countReason(reason) {
    const prev = skipReasons.get(reason) || 0;
    skipReasons.set(reason, prev + 1);
  }

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= files.length) {
        return;
      }

      const file = files[index];
      try {
        const meta = await parseQuickMeta(file);
        if (isNonImageSopClassUid(meta.sopClassUid)) {
          countReason("非图像 DICOM（SR/RT/PR/DICOMDIR 等）");
        } else {
          const seriesUid = meta.seriesInstanceUid || "__unknown_series__";
          candidates.push({ file, seriesUid });
          seriesCounts.set(seriesUid, (seriesCounts.get(seriesUid) || 0) + 1);
          if (!meta.rows || !meta.cols) {
            countReason("候选文件缺少图像尺寸标签（已保留，待正式解码判定）");
          }
        }
      } catch (error) {
        countReason("预扫描失败或非 DICOM 文件");
      }

      completed += 1;
      const now = performance.now();
      if (completed === files.length || now - lastProgressAt > 180) {
        lastProgressAt = now;
        setStatus(`预扫描中：${completed}/${files.length}，候选 ${candidates.length}`);
      }
    }
  }

  const workers = [];
  for (let i = 0; i < concurrency; i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);

  if (!candidates.length) {
    return {
      selectedFiles: [],
      skipReasons,
      selectedSeriesUid: "",
      selectedSeriesCount: 0,
      totalCandidates: 0,
    };
  }

  let selectedSeriesUid = "";
  let selectedSeriesCount = 0;
  for (const [uid, count] of seriesCounts.entries()) {
    if (count > selectedSeriesCount) {
      selectedSeriesUid = uid;
      selectedSeriesCount = count;
    }
  }

  const selectedFiles = candidates
    .filter((c) => c.seriesUid === selectedSeriesUid)
    .map((c) => c.file);

  return {
    selectedFiles,
    skipReasons,
    selectedSeriesUid,
    selectedSeriesCount,
    totalCandidates: candidates.length,
  };
}

function getParseConcurrency() {
  const cores = navigator.hardwareConcurrency || 4;
  return Math.max(2, Math.min(6, cores));
}

function updateExportButtonState() {
  if (exportDicomBtn) {
    exportDicomBtn.disabled = loadedVolumeSourceType !== "dicom"
      || !loadedSlices.length
      || waterDetectionInProgress
      || waterDetectionScheduled;
  }
}

function getActiveDeletionMask(config) {
  let mask = 0;
  if (config.ruleModeY !== "none") mask |= RULE_MASK_Y;
  if (config.ruleModeX !== "none") mask |= RULE_MASK_X;
  if (config.ruleModeBlue !== "none") mask |= RULE_MASK_OBLIQUE;
  return mask;
}

function triggerFileDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function hasDesktopWriteAccess() {
  return Boolean(
    desktopBridge
    && typeof desktopBridge.getDefaultOutputDir === "function"
    && typeof desktopBridge.writeDicomFile === "function",
  );
}

function pathBasename(filePath) {
  if (!filePath) return "";
  const cleaned = String(filePath).replace(/[\\/]+$/, "");
  const parts = cleaned.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || "";
}

function pathDirname(filePath) {
  if (!filePath) return "";
  return String(filePath).replace(/[\\/][^\\/]*$/, "");
}

function inferSourceFolderPath(file) {
  const absolutePath = typeof file?.path === "string" ? file.path : "";
  if (!absolutePath) return "";

  const absoluteDir = pathDirname(absolutePath);
  const relPath = typeof file?.webkitRelativePath === "string" ? file.webkitRelativePath : "";
  const relParts = relPath.split(/[\\/]/).filter(Boolean);
  const upCount = Math.max(0, relParts.length - 2);
  let folderPath = absoluteDir;
  for (let i = 0; i < upCount; i += 1) {
    const parent = pathDirname(folderPath);
    if (!parent || parent === folderPath) break;
    folderPath = parent;
  }
  return folderPath;
}

function zeroMaskedPixelsInDicomBytes(bytes, slice, deletionMask) {
  const pixelStart = slice.pixelDataOffset;
  const pixelLength = slice.pixelDataLength;
  const bytesPerSample = slice.bitsAllocated === 8 ? 1 : 2;
  const bytesPerPixel = bytesPerSample * Math.max(1, slice.samplesPerPixel || 1);
  const pixelBytes = new Uint8Array(bytes.buffer, bytes.byteOffset + pixelStart, pixelLength);
  const cols = slice.cols;
  const rows = slice.rows;
  for (let y = 0; y < rows; y += 1) {
    const rowOffset = y * cols;
    for (let x = 0; x < cols; x += 1) {
      const idx = rowOffset + x;
      const mask = slice.waterMask?.[idx] || 0;
      if ((mask & deletionMask) === 0) continue;
      const pixelByteOffset = idx * bytesPerPixel;
      for (let b = 0; b < bytesPerPixel; b += 1) {
        pixelBytes[pixelByteOffset + b] = 0;
      }
    }
  }
}

async function autoDetectObliqueLineY() {
  if (!loadedSlices || loadedSlices.length === 0) {
    setStatus("请先加载 DICOM 文件以便进行自动检测。");
    return;
  }

  setStatusOnly("开始针对 YZ 中心切面特征搜寻直线...");
  pushLog("开启自动检测蓝色斜向...");

  await yieldToUi();

  const depth = loadedSlices.length;
  const rows = loadedSlices[0].rows;
  const cols = loadedSlices[0].cols;

  const xMid = Math.floor(cols / 2);
  const yzPlane = new Float32Array(rows * depth);

  for (let z = 0; z < depth; z++) {
    const slice = loadedSlices[z];
    const pixels = slice.pixels;
    for (let y = 0; y < rows; y++) {
      yzPlane[y * depth + z] = pixels[y * cols + xMid];
    }
  }

  const gradient = new Float32Array(rows * depth);
  const step = 2;
  for (let y = step; y < rows - step; y++) {
    for (let z = step; z < depth - step; z++) {
      const idx = y * depth + z;
      const dy = yzPlane[(y + step) * depth + z] - yzPlane[(y - step) * depth + z];
      const dz = yzPlane[y * depth + (z + step)] - yzPlane[y * depth + (z - step)];
      gradient[idx] = Math.sqrt(dy * dy + dz * dz);
    }
  }

  let bestScore = -1;
  let bestZStartRatio = 0.72;
  let bestThetaDeg = 51;

  for (let zRatio = 0.1; zRatio <= 0.95; zRatio += 0.02) {
    const zStart = Math.floor(depth * zRatio);
    for (let theta = 5; theta <= 85; theta += 1) {
      const tanTheta = Math.tan((theta * Math.PI) / 180);

      let score = 0;
      let count = 0;

      for (let z = 0; z <= zStart; z++) {
        const dz = zStart - z;
        const yLine = (rows - 1) - tanTheta * dz;
        const y = Math.round(yLine);

        if (y >= step && y < rows - step) {
          score += gradient[y * depth + z];
          count++;
        }
      }

      if (count > zStart * 0.25) {
        const avgScore = score / count;
        const finalScore = avgScore * Math.sqrt(count);

        if (finalScore > bestScore) {
          bestScore = finalScore;
          bestZStartRatio = zRatio;
          bestThetaDeg = theta;
        }
      }
    }
  }

  const adjusted = adjustAutoDetectedObliqueParameters(bestZStartRatio, bestThetaDeg, loadedSlices.length);
  pushLog(
    `自动检测完成：Z 占比=${bestZStartRatio.toFixed(2)} -> ${adjusted.obliqueStartZRatio.toFixed(2)}，`
    + `角度=${bestThetaDeg}° -> ${adjusted.obliqueAngleDeg}°，得分=${bestScore.toFixed(2)}`,
  );

  if (obliqueStartZRatioInput) {
    obliqueStartZRatioInput.value = adjusted.obliqueStartZRatio;
    obliqueStartZRatioInput.dispatchEvent(new Event("input"));
  }
  if (obliqueAngleDegInput) {
    obliqueAngleDegInput.value = adjusted.obliqueAngleDeg;
    obliqueAngleDegInput.dispatchEvent(new Event("input"));
  }

  scheduleWaterSurfaceDetection(false);
  setStatus("直线自动检测完成并已更新设值。");
}

async function exportDeletedVoxelDicomSeries() {
  if (!loadedSlices.length) {
    setStatus("没有可导出的体数据，请先加载并完成重建。 ");
    return;
  }

  const config = getWaterSurfaceConfig();
  const deletionMask = getActiveDeletionMask(config);
  if (deletionMask === 0) {
    setStatus("当前三态都为不处理，没有需要删除的体素。 ");
    return;
  }

  const sourceFolderBase = loadedSourceFolderName || "dicom";
  const outputFolderName = `${sourceFolderBase}_clean`;

  if (waterDetectionInProgress || waterDetectionScheduled) {
    setStatusOnly("正在等待当前规则标记完成后再导出...");
    while (waterDetectionInProgress || waterDetectionScheduled) {
      await yieldToUi();
    }
  }

  const isDesktopMode = hasDesktopWriteAccess() && loadedSourceFolderPath;
  let desktopOutputDir = "";
  if (isDesktopMode) {
    desktopOutputDir = await desktopBridge.getDefaultOutputDir(loadedSourceFolderPath);
    if (!desktopOutputDir) {
      throw new Error("桌面模式下无法计算输出目录，请检查输入目录路径");
    }
    setStatusOnly(`桌面模式导出中：将直接写入 ${outputFolderName} ...`);
  }

  let dirHandle = null;
  if (!isDesktopMode) {
    const canPickDir = typeof window.showDirectoryPicker === "function";
    if (canPickDir) {
      try {
        setStatusOnly(`请选择原始目录的同级父目录，程序将自动创建 ${outputFolderName}...`);
        const parentHandle = await window.showDirectoryPicker({ mode: "readwrite" });
        dirHandle = await parentHandle.getDirectoryHandle(outputFolderName, { create: true });
      } catch (err) {
        if (err?.name === "AbortError") {
          setStatus("已取消导出。 ");
          return;
        }
        pushLog(`目录选择失败，将使用浏览器逐文件下载：${err?.message || String(err)}`);
      }
    }
  }

  const exportedNames = [];
  for (let i = 0; i < loadedSlices.length; i += 1) {
    const slice = loadedSlices[i];
    if (!slice.sourceFile || slice.pixelDataOffset == null || slice.pixelDataLength == null) {
      throw new Error(`切片 ${slice.fileName} 缺少导出所需的原始文件或像素偏移信息`);
    }

    const buffer = await slice.sourceFile.arrayBuffer();
    const bytes = new Uint8Array(buffer.slice(0));
    zeroMaskedPixelsInDicomBytes(bytes, slice, deletionMask);

    const exportName = slice.fileName;
    exportedNames.push(exportName);

    if (desktopOutputDir) {
      await desktopBridge.writeDicomFile(desktopOutputDir, exportName, bytes);
    } else if (dirHandle) {
      const fileHandle = await dirHandle.getFileHandle(exportName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(bytes);
      await writable.close();
    } else {
      triggerFileDownload(new Blob([bytes], { type: "application/dicom" }), exportName);
      await yieldToUi();
    }
  }

  if (desktopOutputDir) {
    setStatus(`导出完成：${exportedNames.length} 个 DICOM 文件已写入 ${desktopOutputDir}`);
  } else {
    setStatus(`导出完成：${exportedNames.length} 个 DICOM 文件已保存。`);
  }
  pushLog(`导出完成：${exportedNames.join("；")}`);
}

async function parseFilesWithConcurrency(files) {
  const concurrency = getParseConcurrency();
  const parsed = [];
  let failCount = 0;
  const failReasonCounts = new Map();
  const failLogLimit = 40;
  let hiddenFailLogs = 0;
  let completed = 0;
  let nextIndex = 0;
  let lastProgressAt = 0;

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= files.length) {
        return;
      }

      const file = files[index];
      try {
        const slice = await parseDicomFile(file);
        parsed.push(slice);
      } catch (err) {
        failCount += 1;
        const message = err?.message ? String(err.message) : "未知错误";
        const prev = failReasonCounts.get(message) || 0;
        failReasonCounts.set(message, prev + 1);
        if (failCount <= failLogLimit) {
          pushLog(`解析失败: ${file.name} -> ${message}`);
        } else {
          hiddenFailLogs += 1;
          if (hiddenFailLogs === 1) {
            pushLog("失败日志过多，已省略后续逐文件错误显示，仅保留汇总。");
          }
        }
      }

      completed += 1;
      const now = performance.now();
      if (completed === files.length || now - lastProgressAt > 160) {
        lastProgressAt = now;
        setStatus(`解析中：${completed}/${files.length}，成功 ${parsed.length}，失败 ${failCount}`);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    }
  }

  const workers = [];
  for (let i = 0; i < concurrency; i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return { parsed, failCount, failReasonCounts };
}

function setStatus(message) {
  statusEl.textContent = message;
  pushLog(message);
}

function setStatusOnly(message) {
  statusEl.textContent = message;
}

function resizeRendererToDisplaySize() {
  if (!renderer) return;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width === 0 || height === 0) {
    return;
  }
  renderer.getSize(rendererSizeCache);
  const needResize = rendererSizeCache.x !== width || rendererSizeCache.y !== height;
  if (needResize) {
    renderer.setSize(width, height, false);
    if (typeof controls?.handleResize === "function") {
      controls.handleResize();
    }
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}

function applyRealtimeVolumeQuality() {
  const targetScale = isUserInteracting ? 0.78 : 1.0;
  if (Math.abs(targetScale - currentInteractionRenderScale) > 0.01) {
    currentInteractionRenderScale = targetScale;
    renderer.setPixelRatio(basePixelRatio * adaptiveRenderScale * currentInteractionRenderScale);
    resizeRendererToDisplaySize();
  }

  if (!currentVolumeMaterial) return;

  const targetSteps = isUserInteracting
    ? Math.max(72, Math.round(currentVolumeBaseSteps * 0.32))
    : currentVolumeBaseSteps;
  const targetDensity = isUserInteracting
    ? currentVolumeBaseDensity * 0.74
    : currentVolumeBaseDensity;

  const uniforms = currentVolumeMaterial.uniforms;
  if (Math.abs(uniforms.uSteps.value - targetSteps) > 1) {
    uniforms.uSteps.value = targetSteps;
  }
  if (Math.abs(uniforms.uDensity.value - targetDensity) > 0.05) {
    uniforms.uDensity.value = targetDensity;
  }
}

function getRenderIntervalMs() {
  if (document.hidden) return 1000;
  if (autoRotateAxis !== "none") return 1000 / 30;
  if (isUserInteracting) return 1000 / 60;
  if (performance.now() < postInteractionRenderUntilMs) return 1000 / 40;
  return 1000 / 8;
}

function shouldContinueRendering(nowMs) {
  if (!renderer || !controls) return false;
  if (document.hidden) return false;
  if (autoRotateAxis !== "none") return true;
  if (isUserInteracting) return true;
  return nowMs < postInteractionRenderUntilMs;
}

function renderFrame(nowMs = performance.now()) {
  renderRequested = false;
  if (!renderer || !controls) return;
  if (isWebglContextLost) return;

  const minInterval = getRenderIntervalMs();
  if (nowMs - lastFrameTimeMs < minInterval) {
    if (shouldContinueRendering(nowMs)) {
      requestRenderIfNotRequested();
    }
    return;
  }
  lastFrameTimeMs = nowMs;

  const delta = renderClock.getDelta();
  applyAutoRotate(delta);
  resizeRendererToDisplaySize();
  controls.update();
  applyRealtimeVolumeQuality();
  renderer.render(scene, camera);
  tuneAdaptiveQuality(delta * 1000);

  if (shouldContinueRendering(nowMs)) {
    requestRenderIfNotRequested();
  }
}

function requestRenderIfNotRequested() {
  if (isWebglContextLost) return;
  if (renderRequested) return;
  renderRequested = true;
  requestAnimationFrame(renderFrame);
}

function initParserStack() {
  if (!dicomParser) {
    setStatus("解析依赖未加载：dicom-parser。请检查网络后刷新。");
    return false;
  }
  setStatus("解析器初始化完成（dicom-parser），等待选择目录...");
  return true;
}

function tagNumber(dataSet, tag, fallback = undefined) {
  if (!dataSet) return fallback;

  const numericReaders = [
    () => dataSet.uint16?.(tag),
    () => dataSet.int16?.(tag),
    () => dataSet.uint32?.(tag),
    () => dataSet.int32?.(tag),
    () => dataSet.float?.(tag),
    () => dataSet.double?.(tag),
  ];

  for (const read of numericReaders) {
    try {
      const v = read();
      if (v !== undefined && v !== null && Number.isFinite(Number(v))) {
        return Number(v);
      }
    } catch (error) {
      // Try next reader.
    }
  }

  const stringReaders = [
    () => dataSet.intString?.(tag),
    () => dataSet.floatString?.(tag),
    () => dataSet.string?.(tag),
  ];

  for (const read of stringReaders) {
    try {
      const value = read();
      if (value === undefined || value === null || value === "") {
        continue;
      }
      const n = Number(value);
      if (Number.isFinite(n)) {
        return n;
      }
    } catch (error) {
      // Try next reader.
    }
  }

  return fallback;
}

function tagVector(dataSet, tag) {
  const raw = dataSet?.string?.(tag);
  if (!raw) {
    return null;
  }
  return raw.split("\\").map((s) => Number(s));
}

function normalizePixelsToScalar(pixelArray, rows, cols, samplesPerPixel) {
  const pixelCount = rows * cols;
  const calibrated = new Float32Array(pixelCount);

  if (samplesPerPixel === 1 && pixelArray.length >= pixelCount) {
    for (let i = 0; i < pixelCount; i += 1) {
      calibrated[i] = pixelArray[i];
    }
    return calibrated;
  }

  const stride = Math.max(3, Math.floor(pixelArray.length / pixelCount));
  if (stride < 3) {
    throw new Error(`不支持的像素组织，samplesPerPixel=${samplesPerPixel}, stride=${stride}`);
  }

  for (let i = 0; i < pixelCount; i += 1) {
    const base = i * stride;
    const r = pixelArray[base] ?? 0;
    const g = pixelArray[base + 1] ?? 0;
    const b = pixelArray[base + 2] ?? 0;
    calibrated[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return calibrated;
}

function getRawPixelDataFromDataSet(dataSet, rows, cols, samplesPerPixel, bitsAllocated, pixelRepresentation, transferSyntaxUid) {
  const pixelElement = dataSet?.elements?.x7fe00010;
  if (!pixelElement) {
    throw new Error("缺少 PixelData (7FE0,0010)");
  }

  const pixelCount = rows * cols * samplesPerPixel;
  const isBigEndian = transferSyntaxUid === "1.2.840.10008.1.2.2";

  if (bitsAllocated === 8) {
    const byteOffset = dataSet.byteArray.byteOffset + pixelElement.dataOffset;
    const pixelBytes = new Uint8Array(dataSet.byteArray.buffer, byteOffset, pixelElement.length);
    if (pixelBytes.length < pixelCount) {
      throw new Error("PixelData 长度不足（8 位）");
    }
    return pixelBytes.slice(0, pixelCount);
  }

  if (bitsAllocated === 16) {
    const byteOffset = dataSet.byteArray.byteOffset + pixelElement.dataOffset;
    const pixelBytes = new Uint8Array(dataSet.byteArray.buffer, byteOffset, pixelElement.length);
    const view = new DataView(pixelBytes.buffer, pixelBytes.byteOffset, pixelBytes.byteLength);
    if (pixelBytes.length < pixelCount * 2) {
      throw new Error("PixelData 长度不足（16 位）");
    }
    const out = pixelRepresentation === 0 ? new Uint16Array(pixelCount) : new Int16Array(pixelCount);
    for (let i = 0; i < pixelCount; i += 1) {
      const offset = i * 2;
      out[i] = pixelRepresentation === 0
        ? view.getUint16(offset, !isBigEndian)
        : view.getInt16(offset, !isBigEndian);
    }
    return out;
  }

  throw new Error(`不支持 BitsAllocated=${bitsAllocated}`);
}

async function parseDicomFileWithDicomParser(file) {
  const arrayBuffer = await file.arrayBuffer();
  const byteArray = new Uint8Array(arrayBuffer);
  const dataSet = dicomParser.parseDicom(byteArray);
  const pixelElement = dataSet?.elements?.x7fe00010;

  const rows = tagNumber(dataSet, "x00280010", 0);
  const cols = tagNumber(dataSet, "x00280011", 0);
  if (!rows || !cols) {
    const sopClassUid = dataSet?.string?.("x00080016") || "unknown";
    const tsUid = dataSet?.string?.("x00020010") || "unknown";
    throw new Error(`无法读取图像尺寸 (SOP=${sopClassUid}, TS=${tsUid})`);
  }

  const transferSyntaxUid = dataSet?.string?.("x00020010") || "1.2.840.10008.1.2";
  const compressedSyntaxPrefixes = [
    "1.2.840.10008.1.2.4.",
    "1.2.840.10008.1.2.5",
  ];
  const isCompressed = compressedSyntaxPrefixes.some((prefix) => transferSyntaxUid.startsWith(prefix));
  if (isCompressed) {
    throw new Error(`该文件为压缩传输语法（${transferSyntaxUid}），当前仅支持未压缩 DICOM`);
  }

  const samplesPerPixel = tagNumber(dataSet, "x00280002", 1);
  const bitsAllocated = tagNumber(dataSet, "x00280100", 16);
  const pixelRepresentation = tagNumber(dataSet, "x00280103", 0);

  const slope = tagNumber(dataSet, "x00281053", 1);
  const intercept = tagNumber(dataSet, "x00281052", 0);
  const photometric = (dataSet?.string?.("x00280004") || "MONOCHROME2").toUpperCase();
  const spacing = tagVector(dataSet, "x00280030") || [1, 1];
  const ipp = tagVector(dataSet, "x00200032");
  const instanceNumber = tagNumber(dataSet, "x00200013", 0);

  const rawPixels = getRawPixelDataFromDataSet(
    dataSet,
    rows,
    cols,
    samplesPerPixel,
    bitsAllocated,
    pixelRepresentation,
    transferSyntaxUid,
  );
  const scalarPixels = normalizePixelsToScalar(rawPixels, rows, cols, samplesPerPixel);

  const calibrated = new Float32Array(rows * cols);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < calibrated.length; i += 1) {
    let value = scalarPixels[i] * slope + intercept;
    if (photometric === "MONOCHROME1") {
      value = -value;
    }
    calibrated[i] = value;
    if (value < min) min = value;
    if (value > max) max = value;
  }

  return {
    fileName: file.name,
    sourceFile: file,
    rows,
    cols,
    spacingY: Number(spacing[0]) || 1,
    spacingX: Number(spacing[1]) || 1,
    ipp,
    instanceNumber,
    zHint: ipp && Number.isFinite(ipp[2]) ? ipp[2] : null,
    sliceThickness: tagNumber(dataSet, "x00180050", null),
    spacingBetweenSlices: tagNumber(dataSet, "x00180088", null),
    transferSyntaxUid,
    bitsAllocated,
    pixelRepresentation,
    samplesPerPixel,
    pixelDataOffset: pixelElement.dataOffset,
    pixelDataLength: pixelElement.length,
    min,
    max,
    pixels: calibrated,
  };
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const r = Math.max(0, Math.min(1, ratio));
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * r)));
  return sorted[idx];
}

async function runDbscanAsync(points, eps = 2.6, minPts = 10, isCancelled = null) {
  const n = points.length;
  const labels = new Int32Array(n);
  labels.fill(-2); // -2: unvisited, -1: noise, >=0: cluster id
  if (!n) {
    return { labels, clusterCount: 0 };
  }

  const invCell = 1 / Math.max(1e-6, eps);
  const eps2 = eps * eps;
  const grid = new Map();
  const visited = new Uint8Array(n);

  const cellKey = (x, y, z) => `${x}|${y}|${z}`;
  for (let i = 0; i < n; i += 1) {
    if (isCancelled?.()) {
      return null;
    }
    const p = points[i];
    const cx = Math.floor(p.x * invCell);
    const cy = Math.floor(p.y * invCell);
    const cz = Math.floor(p.z * invCell);
    const key = cellKey(cx, cy, cz);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
    if (i > 0 && i % 8000 === 0) {
      await yieldToUi();
    }
  }

  function regionQuery(index) {
    const p = points[index];
    const cx = Math.floor(p.x * invCell);
    const cy = Math.floor(p.y * invCell);
    const cz = Math.floor(p.z * invCell);
    const neighbors = [];

    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const cell = grid.get(cellKey(cx + dx, cy + dy, cz + dz));
          if (!cell) continue;
          for (const j of cell) {
            const q = points[j];
            const ddx = q.x - p.x;
            const ddy = q.y - p.y;
            const ddz = q.z - p.z;
            if (ddx * ddx + ddy * ddy + ddz * ddz <= eps2) {
              neighbors.push(j);
            }
          }
        }
      }
    }
    return neighbors;
  }

  let clusterId = 0;
  for (let i = 0; i < n; i += 1) {
    if (isCancelled?.()) {
      return null;
    }
    if (visited[i]) continue;
    visited[i] = 1;
    const neighbors = regionQuery(i);
    if (neighbors.length < minPts) {
      labels[i] = -1;
      continue;
    }

    labels[i] = clusterId;
    const queue = neighbors.slice();
    let expanded = 0;
    while (queue.length) {
      const j = queue.pop();

      if (!visited[j]) {
        visited[j] = 1;
        const n2 = regionQuery(j);
        if (n2.length >= minPts) {
          for (const k of n2) {
            if (labels[k] === -2 || labels[k] === -1) {
              queue.push(k);
            }
          }
        }
      }

      if (labels[j] === -2 || labels[j] === -1) {
        labels[j] = clusterId;
      }

      expanded += 1;
      if (expanded % 3000 === 0) {
        if (isCancelled?.()) {
          return null;
        }
        await yieldToUi();
      }
    }

    clusterId += 1;
    if (clusterId % 2 === 0) {
      await yieldToUi();
    }
  }

  return { labels, clusterCount: clusterId };
}

function fillMissingWithNearest(values, valid) {
  const n = values.length;
  let lastValid = -1;
  for (let i = 0; i < n; i += 1) {
    if (valid[i]) {
      lastValid = i;
      continue;
    }
    let right = i + 1;
    while (right < n && !valid[right]) right += 1;
    if (lastValid < 0 && right < n) {
      values[i] = values[right];
    } else if (right >= n && lastValid >= 0) {
      values[i] = values[lastValid];
    } else if (lastValid >= 0 && right < n) {
      values[i] = (i - lastValid <= right - i) ? values[lastValid] : values[right];
    }
  }
}

async function detectWaterSurfaceByDbscanAsync(slices, config, runId) {
  const isCancelled = () => runId !== waterDetectionTaskId;
  if (!slices.length) {
    return { enabled: false, reason: "empty" };
  }

  const depth = slices.length;
  const rows = slices[0].rows;
  const cols = slices[0].cols;
  const range = Math.max(1e-6, renderValueRange.max - renderValueRange.min);
  const bandEnd = Math.min(rows - 1, Math.floor(rows * config.bandRatio)); // reversed side: smaller row index
  const sampleStep = 2;

  resetWaterMask(slices);

  const sampledNorm = [];
  for (let z = 0; z < depth; z += 1) {
    if (isCancelled()) return null;
    const pixels = slices[z].pixels;
    for (let y = 0; y <= bandEnd; y += sampleStep) {
      const rowOffset = y * cols;
      for (let x = 0; x < cols; x += sampleStep) {
        const norm = (pixels[rowOffset + x] - renderValueRange.min) / range;
        sampledNorm.push(Math.max(0, Math.min(1, norm)));
      }
    }
    if (z > 0 && z % 6 === 0) {
      await yieldToUi();
    }
  }

  if (sampledNorm.length < 64) {
    return { enabled: false, reason: "few_samples", bandEnd };
  }

  const thresholdNorm = Math.max(0.62, percentile(sampledNorm, 0.92));
  const points = [];
  for (let z = 0; z < depth; z += 1) {
    if (isCancelled()) return null;
    const pixels = slices[z].pixels;
    for (let y = 0; y <= bandEnd; y += sampleStep) {
      const rowOffset = y * cols;
      for (let x = 0; x < cols; x += sampleStep) {
        const norm = Math.max(0, Math.min(1, (pixels[rowOffset + x] - renderValueRange.min) / range));
        if (norm < thresholdNorm) continue;
        points.push({ x, y, z, norm });
      }
    }
    if (z > 0 && z % 6 === 0) {
      await yieldToUi();
    }
  }

  if (points.length < 120) {
    return { enabled: false, reason: "few_candidates", bandEnd, thresholdNorm };
  }

  const dbscan = await runDbscanAsync(points, config.eps, config.minPts, isCancelled);
  if (!dbscan) return null;
  const { labels, clusterCount } = dbscan;
  if (clusterCount <= 0) {
    return { enabled: false, reason: "no_cluster", bandEnd, thresholdNorm };
  }

  const stats = Array.from({ length: clusterCount }, () => ({ size: 0, ySum: 0 }));
  for (let i = 0; i < points.length; i += 1) {
    if (isCancelled()) return null;
    const c = labels[i];
    if (c < 0) continue;
    stats[c].size += 1;
    stats[c].ySum += points[i].y;
    if (i > 0 && i % 12000 === 0) {
      await yieldToUi();
    }
  }

  let bestCluster = -1;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let c = 0; c < clusterCount; c += 1) {
    if (stats[c].size < 50) continue;
    const meanY = stats[c].ySum / Math.max(1, stats[c].size);
    const score = (rows - meanY) * 2.0 + Math.log(stats[c].size + 1);
    if (score > bestScore) {
      bestScore = score;
      bestCluster = c;
    }
  }

  if (bestCluster < 0) {
    return { enabled: false, reason: "cluster_too_small", bandEnd, thresholdNorm };
  }

  const yCenter = new Float32Array(depth);
  const yCount = new Uint16Array(depth);
  const xMin = new Float32Array(depth);
  const xMax = new Float32Array(depth);
  xMin.fill(Number.POSITIVE_INFINITY);
  xMax.fill(Number.NEGATIVE_INFINITY);

  for (let i = 0; i < points.length; i += 1) {
    if (labels[i] !== bestCluster) continue;
    const p = points[i];
    yCenter[p.z] += p.y;
    yCount[p.z] += 1;
    if (p.x < xMin[p.z]) xMin[p.z] = p.x;
    if (p.x > xMax[p.z]) xMax[p.z] = p.x;
  }

  const yValid = new Uint8Array(depth);
  const xValid = new Uint8Array(depth);
  for (let z = 0; z < depth; z += 1) {
    if (yCount[z] > 0) {
      yCenter[z] /= yCount[z];
      yValid[z] = 1;
      xValid[z] = 1;
    }
  }
  fillMissingWithNearest(yCenter, yValid);
  fillMissingWithNearest(xMin, xValid);
  fillMissingWithNearest(xMax, xValid);

  let markedVoxelCount = 0;
  const markThreshold = thresholdNorm * 0.82;
  for (let z = 0; z < depth; z += 1) {
    if (isCancelled()) return null;
    const pixels = slices[z].pixels;
    const mask = slices[z].waterMask;
    const yc = yCenter[z];
    const xl = xMin[z];
    const xr = xMax[z];
    const y0 = Math.max(0, Math.floor(yc - 3));
    const y1 = Math.min(bandEnd, Math.ceil(yc + 3));
    const x0 = Math.max(0, Math.floor(xl - 8));
    const x1 = Math.min(cols - 1, Math.ceil(xr + 8));

    for (let y = y0; y <= y1; y += 1) {
      const rowOffset = y * cols;
      for (let x = x0; x <= x1; x += 1) {
        const idx = rowOffset + x;
        const norm = Math.max(0, Math.min(1, (pixels[idx] - renderValueRange.min) / range));
        if (norm < markThreshold) continue;
        if (!mask[idx]) {
          mask[idx] = 1;
          markedVoxelCount += 1;
        }
      }
    }
    if (z > 0 && z % 4 === 0) {
      await yieldToUi();
    }
  }

  waterMaskRevision += 1;

  return {
    enabled: true,
    bandEnd,
    thresholdNorm,
    clusterPointCount: stats[bestCluster].size,
    markedVoxelCount,
    yPositiveDirection: "已切换反方向：当前聚类在较小 y 行索引侧执行",
  };
}

function scheduleWaterSurfaceDetection(immediate = false) {
  if (loadedVolumeSourceType !== "dicom" || !loadedSlices.length) return;

  waterDetectionScheduled = true;
  if (immediate) {
    void startWaterSurfaceDetectionAsync();
    return;
  }

  window.setTimeout(() => {
    if (!waterDetectionScheduled) return;
    void startWaterSurfaceDetectionAsync();
  }, 120);
}

async function applyRuleBasedWaterMaskAsync(slices, config, runId) {
  if (!slices.length) {
    return { enabled: false, reason: "empty" };
  }

  const isCancelled = () => runId !== waterDetectionTaskId;
  const rows = slices[0].rows;
  const cols = slices[0].cols;
  const depth = slices.length;
  const yMax = Math.max(0, Math.min(rows - 1, Math.floor(rows * config.ruleYRatio)));
  const xMax = Math.max(0, Math.min(cols - 1, Math.floor(cols * config.ruleXRatio)));
  const xMin = Math.max(0, cols - 1 - xMax);
  const zStart = Math.max(0, Math.min(depth - 1, Math.floor(depth * config.obliqueStartZRatio)));
  const bluePlaneThickness = Math.max(1, Math.min(rows, Math.floor(rows * config.bluePlaneThicknessRatio)));
  const bluePlaneYMin = Math.max(0, rows - bluePlaneThickness);
  const tanTheta = Math.tan((config.obliqueAngleDeg * Math.PI) / 180);
  const enableObliqueBlue = config.bluePatternMode === "oblique" || config.bluePatternMode === "both";
  const enablePlaneBlue = config.bluePatternMode === "plane" || config.bluePatternMode === "both";

  resetWaterMask(slices);

  let markedVoxelCountY = 0;
  let markedVoxelCountX = 0;
  let markedVoxelCountBlue = 0;
  for (let z = 0; z < slices.length; z += 1) {
    if (isCancelled()) return null;
    const mask = slices[z].waterMask;
    for (let y = 0; y <= yMax; y += 1) {
      const rowOffset = y * cols;
      for (let x = 0; x < cols; x += 1) {
        const idx = rowOffset + x;
        const prev = mask[idx];
        const next = prev | RULE_MASK_Y;
        if (next !== prev) {
          mask[idx] = next;
        }
      }
    }

    for (let y = 0; y < rows; y += 1) {
      const rowOffset = y * cols;
      for (let x = xMin; x < cols; x += 1) {
        const idx = rowOffset + x;
        const prev = mask[idx];
        const next = prev | RULE_MASK_X;
        if (next !== prev) {
          mask[idx] = next;
        }
      }
    }

    // Enforce exclusive axis color assignment: overlap voxels are split into Y-only or X-only.
    // This guarantees no yellow mixed color in any rendering path.
    for (let y = 0; y < rows; y += 1) {
      const rowOffset = y * cols;
      for (let x = 0; x < cols; x += 1) {
        const idx = rowOffset + x;
        const current = mask[idx];
        const hasY = (current & RULE_MASK_Y) !== 0;
        const hasX = (current & RULE_MASK_X) !== 0;

        if (hasY && hasX) {
          const distToYPositive = y;
          const distToXPositive = (cols - 1) - x;
          mask[idx] = distToYPositive <= distToXPositive ? RULE_MASK_Y : RULE_MASK_X;
        }

        if ((mask[idx] & RULE_MASK_Y) !== 0) markedVoxelCountY += 1;
        if ((mask[idx] & RULE_MASK_X) !== 0) markedVoxelCountX += 1;
      }
    }

    // Blue planar fill on the opposite side of current +Y axis: y from bottom side upward.
    if (enablePlaneBlue) {
      for (let y = bluePlaneYMin; y < rows; y += 1) {
        const rowOffset = y * cols;
        for (let x = 0; x < cols; x += 1) {
          const idx = rowOffset + x;
          const prev = mask[idx];
          const next = prev | RULE_MASK_OBLIQUE;
          if (next !== prev) {
            mask[idx] = next;
            markedVoxelCountBlue += 1;
          }
        }
      }
    }

    // World +Z maps to decreasing z-index in current scene transform.
    if (enableObliqueBlue && z <= zStart) {
      const dz = zStart - z;
      // Start from the opposite side of current +Y axis and rotate toward +Y.
      const yLine = (rows - 1) - tanTheta * dz;
      const yTop = Math.max(0, Math.min(rows - 1, Math.ceil(yLine)));
      // Fill full region: top boundary is current oblique line, bottom is volume bottom edge.
      for (let y = yTop; y < rows; y += 1) {
        const rowOffset = y * cols;
        for (let x = 0; x < cols; x += 1) {
          const idx = rowOffset + x;
          const prev = mask[idx];
          const next = prev | RULE_MASK_OBLIQUE;
          if (next !== prev) {
            mask[idx] = next;
            markedVoxelCountBlue += 1;
          }
        }
      }
    }

    if (z > 0 && z % 8 === 0) {
      await yieldToUi();
    }
  }

  waterMaskRevision += 1;
  return {
    enabled: true,
    markedVoxelCount: markedVoxelCountY + markedVoxelCountX,
    markedVoxelCountY,
    markedVoxelCountX,
    markedVoxelCountBlue,
    yMax,
    xMax,
    zStart,
    obliqueAngleDeg: config.obliqueAngleDeg,
    bluePatternMode: config.bluePatternMode,
    bluePlaneThicknessRatio: config.bluePlaneThicknessRatio,
    bluePlaneYMin,
    ratioY: config.ruleYRatio,
    ratioX: config.ruleXRatio,
    xMin,
  };
}

async function startWaterSurfaceDetectionAsync() {
  if (!loadedSlices.length || waterDetectionInProgress === true && !waterDetectionScheduled) {
    return;
  }

  if (waterDetectionInProgress) {
    waterDetectionTaskId += 1;
    return;
  }

  waterDetectionInProgress = true;
  waterDetectionScheduled = false;
  const runId = waterDetectionTaskId + 1;
  waterDetectionTaskId = runId;
  const cfg = getProcessingWaterSurfaceConfig();

  setStatusOnly("体素已完成，后台正在按规则标记体素（不阻塞交互）...");
  const result = await applyRuleBasedWaterMaskAsync(loadedSlices, cfg, runId);

  if (runId !== waterDetectionTaskId || !result) {
    waterDetectionInProgress = false;
    if (waterDetectionScheduled) {
      void startWaterSurfaceDetectionAsync();
    }
    return;
  }

  if (result.enabled) {
    pushLog(
      `规则标记完成：Y<${result.yMax}(ratio=${result.ratioY.toFixed(2)}) count=${result.markedVoxelCountY}；`
      + `X>=${result.xMin}(ratio=${result.ratioX.toFixed(2)}) count=${result.markedVoxelCountX}；`
      + `蓝色 mode=${result.bluePatternMode}, planeY>=${result.bluePlaneYMin}(ratio=${result.bluePlaneThicknessRatio.toFixed(2)}), `
      + `oblique(zStart=${result.zStart}, angle=${result.obliqueAngleDeg.toFixed(1)}°) count=${result.markedVoxelCountBlue}；`
      + `重叠区已拆分为单轴颜色（无黄）`,
    );
  } else {
    pushLog(`规则标记未启用：${result.reason || "unknown"}`);
  }

  scheduleRebuild();
  scheduleSliceRender();
  requestRenderIfNotRequested();

  waterDetectionInProgress = false;
  updateExportButtonState();
  if (waterDetectionScheduled) {
    void startWaterSurfaceDetectionAsync();
  }
}

async function parseDicomFile(file) {
  if (!parserReady) {
    throw new Error("解析器未就绪，请刷新页面后重试");
  }
  return parseDicomFileWithDicomParser(file);
}

function sortSlices(slices) {
  const hasZ = slices.every((s) => s.zHint !== null);
  if (hasZ) {
    return slices.sort((a, b) => a.zHint - b.zHint);
  }
  return slices.sort((a, b) => {
    if (a.instanceNumber !== b.instanceNumber) {
      return a.instanceNumber - b.instanceNumber;
    }
    return a.fileName.localeCompare(b.fileName);
  });
}

function estimateZSpacing(slices) {
  if (slices.length < 2) {
    return slices[0]?.spacingBetweenSlices || slices[0]?.sliceThickness || 1;
  }

  const zValues = slices.map((s) => s.zHint).filter((z) => z !== null);
  if (zValues.length >= 2) {
    const diffs = [];
    for (let i = 1; i < zValues.length; i += 1) {
      diffs.push(Math.abs(zValues[i] - zValues[i - 1]));
    }
    const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    if (avg > 0) {
      return avg;
    }
  }

  return slices[0].spacingBetweenSlices || slices[0].sliceThickness || 1;
}

function computeVolumeBounds(slices, xScale, yScale, zScale) {
  const first = slices[0];
  const depth = slices.length;
  const rows = first.rows;
  const cols = first.cols;
  const zSpacing = estimateZSpacing(slices);
  const xExtent = cols * first.spacingX;
  const yExtent = rows * first.spacingY;
  const zExtent = depth * zSpacing;
  const niftiDisplayZScale = loadedVolumeSourceType === "nifti"
    ? Math.max(1, Math.max(xExtent, yExtent) / Math.max(1e-6, zExtent))
    : 1;
  return {
    x: xExtent * xScale,
    y: yExtent * yScale,
    z: zExtent * zScale * niftiDisplayZScale,
  };
}

function isNiftiMaskDisplay() {
  return loadedVolumeSourceType === "nifti" && (activeNiftiLabel === "gt" || activeNiftiLabel === "pred");
}

function clearNiftiMaskRender() {
  for (const mesh of currentNiftiMaskMeshes) {
    scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
  currentNiftiMaskMeshes = [];
}

function createNiftiMaskMesh(slices, label, color, maskSlices = null) {
  const first = slices[0];
  const depth = slices.length;
  const rows = first.rows;
  const cols = first.cols;
  const xScale = Number(xScaleInput?.value || 1);
  const yScale = Number(yScaleInput?.value || 1);
  const zScale = Number(zScaleInput?.value || 1);
  const zSpacing = estimateZSpacing(loadedSlices);
  const xExtent = cols * first.spacingX;
  const yExtent = rows * first.spacingY;
  const zExtent = depth * zSpacing;
  const displayZScale = Math.max(1, Math.max(xExtent, yExtent) / Math.max(1e-6, zExtent));
  const voxelSize = {
    x: first.spacingX * xScale,
    y: first.spacingY * yScale,
    z: zSpacing * zScale * displayZScale,
  };
  const positiveVoxels = [];
  for (let z = 0; z < depth; z += 1) {
    const pixels = slices[z].pixels;
    const maskPixels = maskSlices?.[z];
    for (let y = 0; y < rows; y += 1) {
      const rowOffset = y * cols;
      for (let x = 0; x < cols; x += 1) {
        const value = maskPixels ? maskPixels[rowOffset + x] : pixels[rowOffset + x];
        if (value > 0.5) positiveVoxels.push({ x, y, z });
      }
    }
  }

  if (!positiveVoxels.length) return null;

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.72,
    metalness: 0.04,
    transparent: true,
    opacity: 0.64,
    depthWrite: false,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, positiveVoxels.length);
  const instance = new THREE.Object3D();
  for (let index = 0; index < positiveVoxels.length; index += 1) {
    const voxel = positiveVoxels[index];
    instance.position.set(
      (cols / 2 - voxel.x - 0.5) * voxelSize.x,
      (rows / 2 - voxel.y - 0.5) * voxelSize.y,
      (depth / 2 - voxel.z - 0.5) * voxelSize.z,
    );
    instance.scale.set(voxelSize.x, voxelSize.y, voxelSize.z);
    instance.updateMatrix();
    mesh.setMatrixAt(index, instance.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.renderOrder = label === "pred" ? 3 : 2;
  return { mesh, count: positiveVoxels.length, xExtent, yExtent, zExtent, displayZScale };
}

function rebuildNiftiMaskRendering() {
  if (!loadedSlices.length) return false;
  clearVolumeRender();
  clearPointCloud();
  clearGaussianRender();

  const result = createNiftiMaskMesh(
    loadedSlices,
    activeNiftiLabel,
    activeNiftiLabel === "pred" ? 0xff4d6d : 0x45e0a3,
  );
  if (!result) {
    setStatus(`NIfTI ${activeNiftiLabel} 没有检测到前景体素。`);
    return true;
  }
  currentNiftiMaskMeshes = [result.mesh];
  currentBounds = {
    x: result.xExtent * Number(xScaleInput?.value || 1),
    y: result.yExtent * Number(yScaleInput?.value || 1),
    z: result.zExtent * Number(zScaleInput?.value || 1) * result.displayZScale,
  };
  scene.add(result.mesh);
  refitCamera();
  pushLog(`NIfTI ${activeNiftiLabel} 使用实体体素渲染：${result.count.toLocaleString()} 个前景体素，Z 视觉补偿 x${result.displayZScale.toFixed(1)}。`);
  return true;
}

function rebuildNiftiOverlayRendering() {
  const gt = niftiVolumes.get("gt");
  const pred = niftiVolumes.get("pred");
  if (!gt || !pred) return;

  clearNiftiMaskRender();
  const gtResult = createNiftiMaskMesh(gt.slices, "gt", 0x45e0a3);
  const predResult = createNiftiMaskMesh(
    pred.slices,
    "pred",
    0xff4d6d,
    niftiDilationMaskSlices,
  );
  for (const result of [gtResult, predResult]) {
    if (!result) continue;
    currentNiftiMaskMeshes.push(result.mesh);
    scene.add(result.mesh);
  }
  pushLog(
    `NIfTI 叠加显示：GT=${gtResult?.count?.toLocaleString() || 0}，`
    + `Pred=${predResult?.count?.toLocaleString() || 0} 个前景体素。`,
  );
}

function clearVolumeRender() {
  if (currentVolumeMesh) {
    scene.remove(currentVolumeMesh);
    currentVolumeMesh.geometry.dispose();
    if (currentVolumeMesh.material?.dispose) {
      currentVolumeMesh.material.dispose();
    }
    currentVolumeMesh = null;
  }
  currentVolumeMaterial = null;

  if (currentVolumeTexture) {
    currentVolumeTexture.dispose();
    currentVolumeTexture = null;
  }
  if (currentWaterMaskTexture) {
    currentWaterMaskTexture.dispose();
    currentWaterMaskTexture = null;
  }
  clearNiftiMaskRender();

  // Clearing the volume resources must also invalidate the texture revision.
  // Otherwise switching back from Gaussian mode may reuse a null texture.
  volumeTextureRevision = -1;
  volumeWaterMaskRevision = -1;
  currentVolumeTextureShape = { cols: 1, rows: 1, depth: 1, stepX: 1, stepY: 1, stepZ: 1 };
}

function buildVolumeTextureFromSlices(slices, sampling = null) {
  const srcDepth = slices.length;
  const srcRows = slices[0].rows;
  const srcCols = slices[0].cols;
  const stepX = Math.max(1, sampling?.stepX || 1);
  const stepY = Math.max(1, sampling?.stepY || 1);
  const stepZ = Math.max(1, sampling?.stepZ || 1);
  const depth = Math.max(1, Math.ceil(srcDepth / stepZ));
  const rows = Math.max(1, Math.ceil(srcRows / stepY));
  const cols = Math.max(1, Math.ceil(srcCols / stepX));
  const windowMin = Number.isFinite(renderValueRange.min) ? renderValueRange.min : globalValueRange.min;
  const windowMax = Number.isFinite(renderValueRange.max) ? renderValueRange.max : globalValueRange.max;
  const range = Math.max(1e-6, windowMax - windowMin);
  const voxels = new Uint8Array(depth * rows * cols);
  const waterMask = new Uint8Array(depth * rows * cols);

  let write = 0;
  for (let z = 0; z < depth; z += 1) {
    const srcZ = Math.min(srcDepth - 1, z * stepZ);
    const pixels = slices[srcZ].pixels;
    const srcMask = slices[srcZ].waterMask;
    for (let y = 0; y < rows; y += 1) {
      const srcY = Math.min(srcRows - 1, y * stepY);
      const rowOffset = srcY * srcCols;
      for (let x = 0; x < cols; x += 1) {
        const srcX = Math.min(srcCols - 1, x * stepX);
        const srcIdx = rowOffset + srcX;
        const norm = (pixels[srcIdx] - windowMin) / range;
        voxels[write] = Math.max(0, Math.min(255, Math.round(norm * 255)));
        // Keep axis label (0/1/2) so volume shader can distinguish X vs Y correctly.
        waterMask[write] = srcMask?.[srcIdx] || 0;
        write += 1;
      }
    }
  }

  const volumeTex = new THREE.Data3DTexture(voxels, cols, rows, depth);
  volumeTex.format = THREE.RedFormat;
  volumeTex.type = THREE.UnsignedByteType;
  volumeTex.minFilter = THREE.LinearFilter;
  volumeTex.magFilter = THREE.LinearFilter;
  volumeTex.unpackAlignment = 1;
  volumeTex.needsUpdate = true;

  const waterTex = new THREE.Data3DTexture(waterMask, cols, rows, depth);
  waterTex.format = THREE.RedFormat;
  waterTex.type = THREE.UnsignedByteType;
  waterTex.minFilter = THREE.NearestFilter;
  waterTex.magFilter = THREE.NearestFilter;
  waterTex.unpackAlignment = 1;
  waterTex.needsUpdate = true;

  return { volumeTex, waterTex };
}

function createVolumeMaterial(volumeTexture, waterMaskTexture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uVolume: { value: volumeTexture },
      uWaterMask: { value: waterMaskTexture },
      uYRuleMode: { value: 1.0 },
      uXRuleMode: { value: 1.0 },
      uBRuleMode: { value: 1.0 },
      uConflictMode: { value: 0.0 },
      uThreshold: { value: 0.55 },
      uSteps: { value: 320.0 },
      uDensity: { value: 22.0 },
      uTexelSize: { value: new THREE.Vector3(1, 1, 1) },
    },
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      varying vec3 vOrigin;
      varying vec3 vDirection;

      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vOrigin = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
        vDirection = position - vOrigin;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      precision highp float;
      precision highp sampler3D;

      uniform sampler3D uVolume;
      uniform sampler3D uWaterMask;
      uniform float uYRuleMode;
      uniform float uXRuleMode;
      uniform float uBRuleMode;
      uniform float uConflictMode;
      uniform float uThreshold;
      uniform float uSteps;
      uniform float uDensity;
      uniform vec3 uTexelSize;

      varying vec3 vOrigin;
      varying vec3 vDirection;

      vec2 hitBox(vec3 orig, vec3 dir) {
        vec3 boxMin = vec3(-0.5);
        vec3 boxMax = vec3(0.5);
        vec3 invDir = 1.0 / dir;
        vec3 tMinTemp = (boxMin - orig) * invDir;
        vec3 tMaxTemp = (boxMax - orig) * invDir;
        vec3 tMin = min(tMinTemp, tMaxTemp);
        vec3 tMax = max(tMinTemp, tMaxTemp);
        float t0 = max(max(tMin.x, tMin.y), tMin.z);
        float t1 = min(min(tMax.x, tMax.y), tMax.z);
        return vec2(t0, t1);
      }

      void main() {
        vec3 rayDir = normalize(vDirection);
        vec2 bounds = hitBox(vOrigin, rayDir);
        if (bounds.x > bounds.y) discard;

        float t = max(bounds.x, 0.0);
        float tEnd = bounds.y;
        float steps = clamp(uSteps, 64.0, 1024.0);
        float dt = max((tEnd - t) / steps, 0.0005);
        vec4 acc = vec4(0.0);

        for (int i = 0; i < 1024; i += 1) {
          if (float(i) >= steps || t > tEnd) {
            break;
          }

          vec3 p = vOrigin + rayDir * t;
          // Flip all axes in texture sampling so volume mode matches point modes.
          vec3 texPos = vec3(1.0) - (p + vec3(0.5));
          float value = texture(uVolume, texPos).r;
          float tag = floor(texture(uWaterMask, texPos).r * 255.0 + 0.5);
          float yHit = step(0.5, mod(tag, 2.0));
          float xHit = step(0.5, mod(floor(tag / 2.0), 2.0));
          float bHit = step(0.5, mod(floor(tag / 4.0), 2.0));

          bool yHide = uYRuleMode > 1.5;
          bool xHide = uXRuleMode > 1.5;
          bool bHide = uBRuleMode > 1.5;
          bool yColor = (uYRuleMode > 0.5 && uYRuleMode < 1.5);
          bool xColor = (uXRuleMode > 0.5 && uXRuleMode < 1.5);
          bool bColor = (uBRuleMode > 0.5 && uBRuleMode < 1.5) && (bHit > 0.5);
          if ((yHide && yHit > 0.5) || (xHide && xHit > 0.5) || (bHide && bHit > 0.5)) {
            t += dt;
            continue;
          }
          float boosted = pow(clamp(value, 0.0, 1.0), 0.72);

          // Threshold only filters voxels. Kept voxels are remapped to [0,1]
          // so threshold changes do not globally shift brightness.
          float denom = max(1e-5, 1.0 - uThreshold);
          float remapped = (boosted - uThreshold) / denom;
          if ((yColor && yHit > 0.5) || (xColor && xHit > 0.5) || bColor) {
            remapped = max(remapped, 0.58);
          }
          if (remapped <= 0.0) {
            t += dt;
            continue;
          }
          remapped = clamp(remapped, 0.0, 1.0);
          float thresholdGain = clamp(1.0 / sqrt(denom), 1.0, 4.0);
          float alpha = smoothstep(0.02, 1.0, remapped) * (uDensity / steps) * thresholdGain;
          if ((yColor && yHit > 0.5) || (xColor && xHit > 0.5) || bColor) {
            alpha = max(alpha, 0.08 * (uDensity / steps) * thresholdGain);
          }

          vec3 grad;
          grad.x = texture(uVolume, texPos + vec3(uTexelSize.x, 0.0, 0.0)).r
            - texture(uVolume, texPos - vec3(uTexelSize.x, 0.0, 0.0)).r;
          grad.y = texture(uVolume, texPos + vec3(0.0, uTexelSize.y, 0.0)).r
            - texture(uVolume, texPos - vec3(0.0, uTexelSize.y, 0.0)).r;
          grad.z = texture(uVolume, texPos + vec3(0.0, 0.0, uTexelSize.z)).r
            - texture(uVolume, texPos - vec3(0.0, 0.0, uTexelSize.z)).r;

          vec3 normal = normalize(grad + vec3(1e-6));
          vec3 lightDir = normalize(vec3(0.42, -0.35, 0.84));
          float ndl = max(dot(normal, lightDir), 0.0);
          float shade = 0.36 + 0.64 * ndl;
          vec3 baseColor = vec3(pow(remapped, 0.88));
          vec3 color = baseColor * shade + vec3(0.06) * pow(remapped, 1.6);
          if (bColor) {
            color = mix(color, vec3(0.20, 0.56, 1.0), 1.0);
          } else {
            bool bothHit = (xHit > 0.5) && (yHit > 0.5);
            if (bothHit && xColor && yColor) {
              if (uConflictMode > 1.5) {
                color = mix(color, vec3(1.0, 0.16, 0.16), 1.0);
              } else if (uConflictMode > 0.5) {
                color = mix(color, vec3(0.18, 0.95, 0.28), 1.0);
              } else {
                color = mix(color, vec3(1.0, 0.95, 0.28), 1.0);
              }
            } else {
              if (xColor && xHit > 0.5) {
                color = mix(color, vec3(1.0, 0.16, 0.16), 1.0);
              }
              if (yColor && yHit > 0.5) {
                color = mix(color, vec3(0.18, 0.95, 0.28), 1.0);
              }
            }
          }
          color *= pow(thresholdGain, 0.35);

          acc.rgb += (1.0 - acc.a) * alpha * color;
          acc.a += (1.0 - acc.a) * alpha;

          if (acc.a > 0.985) {
            break;
          }
          t += dt;
        }

        float lum = dot(acc.rgb, vec3(0.3333));
        float alphaGate = smoothstep(0.015, 0.18, lum);
        float outAlpha = acc.a * alphaGate;
        if (outAlpha <= 0.001) discard;
        gl_FragColor = vec4(acc.rgb, outAlpha);
      }
    `,
  });
}

function updateVolumeUniformsAndScale(slices) {
  if (!currentVolumeMaterial || !currentVolumeMesh || !slices.length) return;

  const threshold = Number(thresholdInput?.value || 0.55);
  const sampleStep = Number(sampleStepInput?.value || 2);
  const xScale = Number(xScaleInput?.value || 1);
  const yScale = Number(yScaleInput?.value || 1);
  const zScale = Number(zScaleInput?.value || 1);
  const config = getWaterSurfaceConfig();

  const texCols = Math.max(1, currentVolumeTextureShape.cols || slices[0].cols);
  const texRows = Math.max(1, currentVolumeTextureShape.rows || slices[0].rows);
  const texDepth = Math.max(1, currentVolumeTextureShape.depth || slices.length);
  const stepBase = Math.max(96, Math.min(860, Math.round(texDepth * 2.2)));
  const steps = Math.max(96, Math.min(stepBase, Math.round(stepBase / Math.max(1, sampleStep))));
  // Keep ray-march density independent from threshold to avoid global dimming.
  const density = 16;
  currentVolumeBaseSteps = steps;
  currentVolumeBaseDensity = density;

  currentVolumeMaterial.uniforms.uThreshold.value = Math.max(0, Math.min(1, threshold));
  currentVolumeMaterial.uniforms.uYRuleMode.value = config.ruleModeY === "hide" ? 2 : config.ruleModeY === "color" ? 1 : 0;
  currentVolumeMaterial.uniforms.uXRuleMode.value = config.ruleModeX === "hide" ? 2 : config.ruleModeX === "color" ? 1 : 0;
  currentVolumeMaterial.uniforms.uBRuleMode.value = config.ruleModeBlue === "hide" ? 2 : config.ruleModeBlue === "color" ? 1 : 0;
  currentVolumeMaterial.uniforms.uConflictMode.value = config.conflictMode === "x" ? 2 : config.conflictMode === "y" ? 1 : 0;
  currentVolumeMaterial.uniforms.uSteps.value = steps;
  currentVolumeMaterial.uniforms.uDensity.value = density;
  currentVolumeMaterial.uniforms.uTexelSize.value.set(1 / texCols, 1 / texRows, 1 / texDepth);

  currentBounds = computeVolumeBounds(slices, xScale, yScale, zScale);
  currentVolumeMesh.scale.set(currentBounds.x, currentBounds.y, currentBounds.z);
}

function getCurrentScaleValues() {
  return {
    x: Number(xScaleInput?.value || 1),
    y: Number(yScaleInput?.value || 1),
    z: Number(zScaleInput?.value || 1),
  };
}

function applySpatialScaleImmediate() {
  if (!loadedSlices.length) return false;
  const { x, y, z } = getCurrentScaleValues();
  let updated = false;

  if (currentVolumeMesh && currentVolumeMaterial) {
    updateVolumeUniformsAndScale(loadedSlices);
    updated = true;
  }

  if (currentGaussianPoints) {
    currentBounds = computeVolumeBounds(loadedSlices, x, y, z);
    // Gaussian uses rebuilt geometry to change voxel spacing instead of object stretch.
  }

  if (currentPoints) {
    currentBounds = computeVolumeBounds(loadedSlices, x, y, z);
    // Point cloud uses rebuilt geometry to change voxel spacing instead of object stretch.
  }

  if (updated) {
    requestRenderIfNotRequested();
  }

  return updated;
}

function applyVolumeScaleImmediate() {
  applySpatialScaleImmediate();
}

function rebuildVolumeRendering() {
  if (!loadedSlices.length) return false;
  if (isNiftiMaskDisplay()) {
    return rebuildNiftiMaskRendering();
  }
  clearNiftiMaskRender();
  if (!supportsGpuVolumeRendering()) {
    pushLog("当前浏览器 GPU 体渲染能力不可用，已回退到点云模式。");
    return false;
  }

  if (volumeTextureRevision !== volumeDataRevision || volumeWaterMaskRevision !== waterMaskRevision) {
    if (currentVolumeTexture) {
      currentVolumeTexture.dispose();
      currentVolumeTexture = null;
    }
    if (currentWaterMaskTexture) {
      currentWaterMaskTexture.dispose();
      currentWaterMaskTexture = null;
    }
    const sampling = buildVolumeSamplingPlan(loadedSlices);
    const textures = buildVolumeTextureFromSlices(loadedSlices, sampling);
    currentVolumeTexture = textures.volumeTex;
    currentWaterMaskTexture = textures.waterTex;
    currentVolumeTextureShape = {
      cols: sampling.cols,
      rows: sampling.rows,
      depth: sampling.depth,
      stepX: sampling.stepX,
      stepY: sampling.stepY,
      stepZ: sampling.stepZ,
    };
    const samplingToken = `${volumeDataRevision}|${sampling.stepX}|${sampling.stepY}|${sampling.stepZ}`;
    if (volumeSamplingLogToken !== samplingToken) {
      volumeSamplingLogToken = samplingToken;
      if (sampling.stepX > 1 || sampling.stepY > 1 || sampling.stepZ > 1) {
        pushLog(
          `体素模式自动优化：采样步长 x${sampling.stepX}/y${sampling.stepY}/z${sampling.stepZ}，`
          + `纹理 ${sampling.cols}x${sampling.rows}x${sampling.depth}（上限边长 ${sampling.edgeLimit}）`,
        );
      }
    }
    volumeTextureRevision = volumeDataRevision;
    volumeWaterMaskRevision = waterMaskRevision;

    if (currentVolumeMesh) {
      scene.remove(currentVolumeMesh);
      currentVolumeMesh.geometry.dispose();
      if (currentVolumeMesh.material?.dispose) {
        currentVolumeMesh.material.dispose();
      }
      currentVolumeMesh = null;
      currentVolumeMaterial = null;
    }
  }

  let createdNow = false;
  if (!currentVolumeMesh) {
    currentVolumeMaterial = createVolumeMaterial(currentVolumeTexture, currentWaterMaskTexture);
    const box = new THREE.BoxGeometry(1, 1, 1);
    currentVolumeMesh = new THREE.Mesh(box, currentVolumeMaterial);
    scene.add(currentVolumeMesh);
    createdNow = true;
  }

  clearPointCloud();
  clearGaussianRender();
  updateVolumeUniformsAndScale(loadedSlices);
  if (activeNiftiLabel === "overlay") {
    rebuildNiftiOverlayRendering();
  }
  if (createdNow || volumeTextureRevision === volumeDataRevision) {
    // Keep camera stable during scale tweaks so axis stretch is visually obvious.
    if (createdNow) {
      refitCamera();
    }
  }
  return true;
}

function clearGaussianRender() {
  if (!currentGaussianPoints) return;
  scene.remove(currentGaussianPoints);
  currentGaussianPoints.geometry.dispose();
  if (currentGaussianPoints.material?.dispose) {
    currentGaussianPoints.material.dispose();
  }
  currentGaussianPoints = null;
  currentGaussianMaterial = null;
  gaussianPointCount = 0;
}

function createGaussianSplatMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uThreshold: { value: 0.55 },
      uSoftness: { value: 0.06 },
      uOpacity: { value: 0.88 },
      uConflictMode: { value: 0.0 },
      uPointScale: { value: 16.0 },
      uBrightness: { value: 1.58 },
      uGamma: { value: 0.82 },
      uDetailBoost: { value: 0.35 },
      uExtinction: { value: 4.2 },
      uSharpness: { value: 13.0 },
    },
    vertexShader: `
      attribute float aIntensity;
      attribute float aWater;
      varying float vIntensity;
      varying float vWater;

      uniform float uPointScale;

      void main() {
        vIntensity = aIntensity;
        vWater = aWater;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float dist = max(1.0, -mvPosition.z);
        gl_PointSize = max(1.0, uPointScale / dist);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      precision highp float;
      varying float vIntensity;
      varying float vWater;

      uniform float uThreshold;
      uniform float uSoftness;
      uniform float uOpacity;
      uniform float uConflictMode;
      uniform float uBrightness;
      uniform float uGamma;
      uniform float uDetailBoost;
      uniform float uExtinction;
      uniform float uSharpness;

      void main() {
        vec2 p = gl_PointCoord - vec2(0.5);
        float r = length(p) * 2.0;
        if (r > 1.0) discard;

        float r2 = r * r;
        float radial = exp(-r2 * uSharpness);
        float thickness = 2.0 * sqrt(max(0.0, 1.0 - r2));
        float response = smoothstep(uThreshold - uSoftness, uThreshold + uSoftness, vIntensity);
        float density = radial * thickness * response * uOpacity;
        float alpha = 1.0 - exp(-uExtinction * density);
        if (alpha < 0.01) discard;

        float localContrast = (vIntensity - uThreshold) * (1.0 + uDetailBoost) + 0.55;
        float boosted = clamp(localContrast + radial * uDetailBoost * 0.35, 0.0, 1.0);
        float tonal = pow(boosted, uGamma);
        float lum = clamp(tonal * uBrightness, 0.0, 1.0);
        vec3 color = vec3(lum);
        float tag = floor(vWater + 0.5);
        float yHit = step(0.5, mod(tag, 2.0));
        float xHit = step(0.5, mod(floor(tag / 2.0), 2.0));
        float bHit = step(0.5, mod(floor(tag / 4.0), 2.0));

        if (bHit > 0.5) {
          color = mix(color, vec3(0.20, 0.56, 1.0), 1.0);
        } else if (xHit > 0.5 && yHit > 0.5) {
          if (uConflictMode > 1.5) {
            color = mix(color, vec3(1.0, 0.16, 0.16), 1.0);
          } else if (uConflictMode > 0.5) {
            color = mix(color, vec3(0.18, 0.95, 0.28), 1.0);
          } else {
            color = mix(color, vec3(1.0, 0.95, 0.28), 1.0);
          }
        } else if (xHit > 0.5) {
          color = mix(color, vec3(1.0, 0.16, 0.16), 1.0);
        } else if (yHit > 0.5) {
          color = mix(color, vec3(0.18, 0.95, 0.28), 1.0);
        }
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
  });
}

function buildGaussianSplatGeometry(slices, sampleStep, maxPoints, xScale, yScale, zScale, config) {
  const first = slices[0];
  const depth = slices.length;
  const rows = first.rows;
  const cols = first.cols;
  const zSpacing = estimateZSpacing(slices);
  const windowMin = Number.isFinite(renderValueRange.min) ? renderValueRange.min : globalValueRange.min;
  const windowMax = Number.isFinite(renderValueRange.max) ? renderValueRange.max : globalValueRange.max;
  const range = Math.max(1e-6, windowMax - windowMin);

  let candidateCount = 0;
  const geomStep = Math.max(1, Math.floor(sampleStep * 0.75));

  for (let z = 0; z < depth; z += geomStep) {
    const slice = slices[z];
    for (let y = 0; y < rows; y += geomStep) {
      for (let x = 0; x < cols; x += geomStep) {
        const idx = y * cols + x;
        const mask = getRuleMask(slice, idx);
        if (shouldHideByRule(mask, config)) continue;
        const norm = (slice.pixels[idx] - windowMin) / range;
        if (norm <= 0.001) continue;
        candidateCount += 1;
      }
    }
  }

  const keepEvery = Math.max(1, Math.ceil(candidateCount / Math.max(1, maxPoints)));
  const keptCount = Math.max(0, Math.ceil(candidateCount / keepEvery));
  const positions = new Float32Array(keptCount * 3);
  const intensity = new Float32Array(keptCount);
  const water = new Float32Array(keptCount);

  let writeIndex = 0;
  let accepted = 0;
  for (let z = 0; z < depth; z += geomStep) {
    const slice = slices[z];
    for (let y = 0; y < rows; y += geomStep) {
      for (let x = 0; x < cols; x += geomStep) {
        const idx = y * cols + x;
        const mask = getRuleMask(slice, idx);
        if (shouldHideByRule(mask, config)) continue;
        const norm = (slice.pixels[idx] - windowMin) / range;
        if (norm <= 0.001) continue;
        accepted += 1;
        if ((accepted - 1) % keepEvery !== 0) continue;

        const base = writeIndex * 3;
        positions[base] = AXIS_DIRECTION.x * (x - cols * 0.5) * first.spacingX * xScale;
        positions[base + 1] = AXIS_DIRECTION.y * (-(y - rows * 0.5) * first.spacingY * yScale);
        positions[base + 2] = AXIS_DIRECTION.z * (z - depth * 0.5) * zSpacing * zScale;
        intensity[writeIndex] = Math.max(0, Math.min(1, norm));
        const finalMask = getRuleMask(slice, idx);
        const yHit = (finalMask & RULE_MASK_Y) !== 0;
        const xHit = (finalMask & RULE_MASK_X) !== 0;
        const bHit = (finalMask & RULE_MASK_OBLIQUE) !== 0;
        const colorY = config.ruleModeY === "color" && yHit;
        const colorX = config.ruleModeX === "color" && xHit;
        const colorBlue = config.ruleModeBlue === "color" && bHit;
        let maskBits = 0;
        if (colorY) maskBits |= RULE_MASK_Y;
        if (colorX) maskBits |= RULE_MASK_X;
        if (colorBlue) maskBits |= RULE_MASK_OBLIQUE;
        water[writeIndex] = maskBits;
        writeIndex += 1;
      }
    }
  }

  const finalPos = writeIndex === keptCount ? positions : positions.slice(0, writeIndex * 3);
  const finalIntensity = writeIndex === keptCount ? intensity : intensity.slice(0, writeIndex);
  const finalWater = writeIndex === keptCount ? water : water.slice(0, writeIndex);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(finalPos, 3));
  geometry.setAttribute("aIntensity", new THREE.BufferAttribute(finalIntensity, 1));
  geometry.setAttribute("aWater", new THREE.BufferAttribute(finalWater, 1));
  return { geometry, pointCount: writeIndex };
}

function updateGaussianUniformsAndScale() {
  if (!currentGaussianMaterial || !currentGaussianPoints || !loadedSlices.length) return;

  const threshold = Number(thresholdInput?.value || 0.55);
  const sampleStep = Number(sampleStepInput?.value || 2);
  const xScale = Number(xScaleInput?.value || 1);
  const yScale = Number(yScaleInput?.value || 1);
  const zScale = Number(zScaleInput?.value || 1);
  const config = getWaterSurfaceConfig();

  currentGaussianMaterial.uniforms.uThreshold.value = Math.max(0, Math.min(1, threshold));
  currentGaussianMaterial.uniforms.uConflictMode.value = config.conflictMode === "x" ? 2 : config.conflictMode === "y" ? 1 : 0;
  currentGaussianMaterial.uniforms.uSoftness.value = Math.max(0.05, Math.min(0.22, 0.04 * sampleStep));
  currentGaussianMaterial.uniforms.uOpacity.value = Math.max(0.42, Math.min(0.9, 0.5 + (1.0 - threshold) * 0.28));
  currentGaussianMaterial.uniforms.uPointScale.value = Math.max(8.0, 13.0 + sampleStep * 6.5);
  currentGaussianMaterial.uniforms.uBrightness.value = Math.max(1.2, Math.min(2.55, 1.4 + (1.0 - threshold) * 1.25));
  currentGaussianMaterial.uniforms.uGamma.value = Math.max(0.62, Math.min(0.95, 0.9 - (1.0 - threshold) * 0.25));
  currentGaussianMaterial.uniforms.uDetailBoost.value = Math.max(0.14, Math.min(0.75, 0.28 + (1.0 - threshold) * 0.4));
  currentGaussianMaterial.uniforms.uExtinction.value = Math.max(2.4, Math.min(7.2, 3.2 + (1.0 - threshold) * 4.0));
  currentGaussianMaterial.uniforms.uSharpness.value = Math.max(6.0, Math.min(14.0, 8.0 + sampleStep * 1.3));

  currentBounds = computeVolumeBounds(loadedSlices, xScale, yScale, zScale);
  currentGaussianPoints.scale.set(1, 1, 1);
}

function rebuildGaussianSplatRendering() {
  if (!loadedSlices.length) return false;

  const sampleStep = Math.max(1, Number(sampleStepInput?.value || 2));
  const maxPoints = Math.max(120000, Math.min(2500000, Math.round(Number(maxPointsInput?.value || 250000) * 4)));
  const config = getWaterSurfaceConfig();
  const xScale = Number(xScaleInput?.value || 1);
  const yScale = Number(yScaleInput?.value || 1);
  const zScale = Number(zScaleInput?.value || 1);
  const needsGeometry =
    !currentGaussianPoints ||
    gaussianBuildRevision !== volumeDataRevision ||
    gaussianBuildSampleStep !== sampleStep ||
    gaussianBuildMaxPoints !== maxPoints ||
    gaussianBuildRuleModeY !== config.ruleModeY ||
    gaussianBuildRuleModeX !== config.ruleModeX ||
    gaussianBuildRuleModeBlue !== config.ruleModeBlue ||
    gaussianBuildWaterMaskRevision !== waterMaskRevision ||
    pointCloudBakedScale.x !== xScale ||
    pointCloudBakedScale.y !== yScale ||
    pointCloudBakedScale.z !== zScale;

  if (needsGeometry) {
    clearGaussianRender();
    const { geometry, pointCount } = buildGaussianSplatGeometry(
      loadedSlices,
      sampleStep,
      maxPoints,
      xScale,
      yScale,
      zScale,
      config,
    );
    currentGaussianMaterial = createGaussianSplatMaterial();
    currentGaussianPoints = new THREE.Points(geometry, currentGaussianMaterial);
    currentGaussianPoints.frustumCulled = false;
    scene.add(currentGaussianPoints);
    gaussianPointCount = pointCount;

    gaussianBuildRevision = volumeDataRevision;
    gaussianBuildSampleStep = sampleStep;
    gaussianBuildMaxPoints = maxPoints;
    gaussianBuildRuleModeY = config.ruleModeY;
    gaussianBuildRuleModeX = config.ruleModeX;
    gaussianBuildRuleModeBlue = config.ruleModeBlue;
    gaussianBuildWaterMaskRevision = waterMaskRevision;
    pointCloudBakedScale = { x: xScale, y: yScale, z: zScale };
  }

  clearPointCloud();
  clearVolumeRender();
  updateGaussianUniformsAndScale();
  refitCamera();
  return true;
}

function clearPointCloud() {
  if (!currentPoints) return;
  scene.remove(currentPoints);
  currentPoints.geometry.dispose();
  currentPoints.material.dispose();
  currentPoints = null;
  pointCloudBakedScale = { x: 1, y: 1, z: 1 };
}

function buildPointCloudGeometry(slices, threshold, sampleStep, xScale, yScale, zScale, config) {
  const first = slices[0];
  const depth = slices.length;
  const rows = first.rows;
  const cols = first.cols;

  const globalMin = Number.isFinite(renderValueRange.min) ? renderValueRange.min : globalValueRange.min;
  const globalMax = Number.isFinite(renderValueRange.max) ? renderValueRange.max : globalValueRange.max;

  const dynamicRange = Math.max(1e-6, globalMax - globalMin);
  const zSpacing = estimateZSpacing(slices);
  const maxPoints = maxPointsInput ? Number(maxPointsInput.value) : 250000;
  let candidateCount = 0;

  for (let z = 0; z < depth; z += 1) {
    const slice = slices[z];
    for (let y = 0; y < rows; y += sampleStep) {
      for (let x = 0; x < cols; x += sampleStep) {
        const idx = y * cols + x;
        const mask = getRuleMask(slice, idx);
        if (shouldHideByRule(mask, config)) continue;
        const raw = slice.pixels[idx];
        const norm = (raw - globalMin) / dynamicRange;
        if (norm < threshold) continue;
        candidateCount += 1;
      }
    }
  }

  const keepEvery = Math.max(1, Math.ceil(candidateCount / Math.max(1, maxPoints)));
  const keptCount = Math.max(0, Math.ceil(candidateCount / keepEvery));
  const pos = new Float32Array(keptCount * 3);
  const col = new Float32Array(keptCount * 3);
  let writeIndex = 0;
  let acceptedIndex = 0;

  for (let z = 0; z < depth; z += 1) {
    const slice = slices[z];
    for (let y = 0; y < rows; y += sampleStep) {
      for (let x = 0; x < cols; x += sampleStep) {
        const idx = y * cols + x;
        const mask = getRuleMask(slice, idx);
        if (shouldHideByRule(mask, config)) continue;
        const raw = slice.pixels[idx];
        const norm = (raw - globalMin) / dynamicRange;
        if (norm < threshold) continue;
        acceptedIndex += 1;
        if ((acceptedIndex - 1) % keepEvery !== 0) continue;

        const px = AXIS_DIRECTION.x * (x - cols / 2) * slice.spacingX * xScale;
        const py = AXIS_DIRECTION.y * (-(y - rows / 2) * slice.spacingY * yScale);
        const pz = AXIS_DIRECTION.z * (z - depth / 2) * zSpacing * zScale;

        const base = writeIndex * 3;
        pos[base] = px;
        pos[base + 1] = py;
        pos[base + 2] = pz;
        const finalMask = getRuleMask(slice, idx);
        const yHit = (finalMask & RULE_MASK_Y) !== 0;
        const xHit = (finalMask & RULE_MASK_X) !== 0;
        const bHit = (finalMask & RULE_MASK_OBLIQUE) !== 0;
        const shouldColorY = config.ruleModeY === "color" && yHit;
        const shouldColorX = config.ruleModeX === "color" && xHit;
        const shouldColorBlue = config.ruleModeBlue === "color" && bHit;
        if (shouldColorY || shouldColorX || shouldColorBlue) {
          const mixed = colorFromRuleMask(
            (shouldColorY ? RULE_MASK_Y : 0)
            | (shouldColorX ? RULE_MASK_X : 0)
            | (shouldColorBlue ? RULE_MASK_OBLIQUE : 0),
            { r: norm, g: norm, b: norm },
            config,
          );
          col[base] = mixed.r;
          col[base + 1] = mixed.g;
          col[base + 2] = mixed.b;
        } else {
          col[base] = norm;
          col[base + 1] = norm;
          col[base + 2] = norm;
        }
        writeIndex += 1;
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  const finalPos = writeIndex === keptCount ? pos : pos.slice(0, writeIndex * 3);
  const finalCol = writeIndex === keptCount ? col : col.slice(0, writeIndex * 3);
  geometry.setAttribute("position", new THREE.BufferAttribute(finalPos, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(finalCol, 3));

  currentBounds = {
    x: cols * first.spacingX * xScale,
    y: rows * first.spacingY * yScale,
    z: depth * zSpacing * zScale,
  };

  return geometry;
}

function updateGlobalRangeFromSlices(slices) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const s of slices) {
    if (s.min < min) min = s.min;
    if (s.max > max) max = s.max;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    globalValueRange = { min: 0, max: 1 };
    return;
  }
  globalValueRange = { min, max };
}

function updateRenderRangeFromSlices(slices) {
  const globalMin = globalValueRange.min;
  const globalMax = globalValueRange.max;
  const globalRange = Math.max(1e-6, globalMax - globalMin);
  if (!Number.isFinite(globalMin) || !Number.isFinite(globalMax) || globalRange <= 1e-6) {
    renderValueRange = { ...globalValueRange };
    return;
  }

  const targetSamples = 600000;
  const totalVoxels = slices.reduce((acc, s) => acc + s.pixels.length, 0);
  const sampleStride = Math.max(1, Math.floor(totalVoxels / targetSamples));
  const bins = 2048;
  const hist = new Uint32Array(bins);
  let sampled = 0;

  for (const slice of slices) {
    const pixels = slice.pixels;
    for (let i = 0; i < pixels.length; i += sampleStride) {
      const norm = (pixels[i] - globalMin) / globalRange;
      const clamped = Math.max(0, Math.min(0.999999, norm));
      const bin = Math.floor(clamped * bins);
      hist[bin] += 1;
      sampled += 1;
    }
  }

  if (sampled < 32) {
    renderValueRange = { ...globalValueRange };
    return;
  }

  const lowRank = Math.floor(sampled * 0.01);
  const highRank = Math.floor(sampled * 0.995);

  let cumulative = 0;
  let lowBin = 0;
  let highBin = bins - 1;

  for (let b = 0; b < bins; b += 1) {
    cumulative += hist[b];
    if (cumulative >= lowRank) {
      lowBin = b;
      break;
    }
  }

  cumulative = 0;
  for (let b = 0; b < bins; b += 1) {
    cumulative += hist[b];
    if (cumulative >= highRank) {
      highBin = b;
      break;
    }
  }

  const low = globalMin + (lowBin / bins) * globalRange;
  const high = globalMin + ((highBin + 1) / bins) * globalRange;
  if (!Number.isFinite(low) || !Number.isFinite(high) || high - low < 1e-6) {
    renderValueRange = { ...globalValueRange };
    return;
  }

  renderValueRange = { min: low, max: high };
}

function clampIndex(value, maxInclusive) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(Math.round(n), 0), maxInclusive);
}

function normToGray(value) {
  const range = Math.max(1e-6, globalValueRange.max - globalValueRange.min);
  const norm = (value - globalValueRange.min) / range;
  return Math.max(0, Math.min(255, Math.round(norm * 255)));
}

function updateSliceControlRanges() {
  if (!loadedSlices.length) return;
  invalidateSliceTextureCache();
  const depth = loadedSlices.length;
  const rows = loadedSlices[0].rows;
  const cols = loadedSlices[0].cols;
  volumeMeta = { depth, rows, cols };

  zSliceInput.max = String(Math.max(0, depth - 1));
  ySliceInput.max = String(Math.max(0, rows - 1));
  xSliceInput.max = String(Math.max(0, cols - 1));

  setMprIndex({
    x: Math.floor((cols - 1) / 2),
    y: Math.floor((rows - 1) / 2),
    z: Math.floor((depth - 1) / 2),
  }, false);
}

function setMprIndex(next, triggerRender = true) {
  if (!volumeMeta.depth || !volumeMeta.rows || !volumeMeta.cols) return;
  let changed = false;

  if (next.x !== undefined) {
    const nextX = clampIndex(next.x, volumeMeta.cols - 1);
    if (nextX !== mprIndex.x) {
      mprIndex.x = nextX;
      changed = true;
    }
  }
  if (next.y !== undefined) {
    const nextY = clampIndex(next.y, volumeMeta.rows - 1);
    if (nextY !== mprIndex.y) {
      mprIndex.y = nextY;
      changed = true;
    }
  }
  if (next.z !== undefined) {
    const nextZ = clampIndex(next.z, volumeMeta.depth - 1);
    if (nextZ !== mprIndex.z) {
      mprIndex.z = nextZ;
      changed = true;
    }
  }

  xSliceInput.value = String(mprIndex.x);
  ySliceInput.value = String(mprIndex.y);
  zSliceInput.value = String(mprIndex.z);
  xSliceValue.textContent = String(mprIndex.x);
  ySliceValue.textContent = String(mprIndex.y);
  zSliceValue.textContent = String(mprIndex.z);

  if (triggerRender && changed) {
    scheduleSliceRender();
  }
}

function getFitRect(srcW, srcH, dstW, dstH, displayW = srcW, displayH = srcH) {
  const safeDisplayW = Math.max(1e-6, Number(displayW) || srcW);
  const safeDisplayH = Math.max(1e-6, Number(displayH) || srcH);
  const scale = Math.min(dstW / safeDisplayW, dstH / safeDisplayH);
  const w = safeDisplayW * scale;
  const h = safeDisplayH * scale;
  const x = (dstW - w) / 2;
  const y = (dstH - h) / 2;
  return { x, y, w, h, scale };
}

function drawSliceToCanvas(
  ctx,
  canvasEl,
  width,
  height,
  valueAt,
  waterAt,
  key,
  crossX,
  crossY,
  sliceToken,
  displayW = width,
  displayH = height,
  config = { ruleModeY: "color", ruleModeX: "color" },
) {
  if (!ctx || !canvasEl || width <= 0 || height <= 0) return;

  const cssW = Math.max(1, Math.floor(canvasEl.clientWidth || 420));
  const cssH = Math.max(1, Math.floor(canvasEl.clientHeight || 420));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const dstW = Math.floor(cssW * dpr);
  const dstH = Math.floor(cssH * dpr);

  if (canvasEl.width !== dstW || canvasEl.height !== dstH) {
    canvasEl.width = dstW;
    canvasEl.height = dstH;
  }

  const offscreen = offscreenCanvases[key];
  const textureState = sliceTextureState[key];
  const resized = offscreen.width !== width || offscreen.height !== height;
  if (resized) {
    offscreen.width = width;
    offscreen.height = height;
  }

  const overlayToken = `${sliceToken}|nifti-overlay:${niftiOverlayRevision}`;
  if (resized || textureState.token !== overlayToken) {
    const offCtx = offscreen.getContext("2d");
    const imageData = offCtx.createImageData(width, height);
    const data = imageData.data;
    let p = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const mask = waterAt?.(x, y) || 0;
        const yHit = (mask & RULE_MASK_Y) !== 0;
        const xHit = (mask & RULE_MASK_X) !== 0;
        const bHit = (mask & RULE_MASK_OBLIQUE) !== 0;
        const hide = (yHit && config.ruleModeY === "hide")
          || (xHit && config.ruleModeX === "hide")
          || (bHit && config.ruleModeBlue === "hide");
        const colorMask = (yHit && config.ruleModeY === "color" ? RULE_MASK_Y : 0)
          | (xHit && config.ruleModeX === "color" ? RULE_MASK_X : 0)
          | (bHit && config.ruleModeBlue === "color" ? RULE_MASK_OBLIQUE : 0);
        let gray = normToGray(valueAt(x, y));
        if (hide) {
          gray = 0;
        }

        if (colorMask !== 0) {
          const c = colorFromRuleMask(colorMask, { r: gray / 255, g: gray / 255, b: gray / 255 }, config);
          data[p] = Math.round(c.r * 255);
          data[p + 1] = Math.round(c.g * 255);
          data[p + 2] = Math.round(c.b * 255);
        } else {
          data[p] = gray;
          data[p + 1] = gray;
          data[p + 2] = gray;
        }
        const overlay = key === "XY" || key === "XZ" || key === "YZ"
          ? getNiftiOverlayColor(key, x, y)
          : null;
        if (overlay) {
          const alpha = overlay.alpha;
          data[p] = Math.round(data[p] * (1 - alpha) + overlay.r * 255 * alpha);
          data[p + 1] = Math.round(data[p + 1] * (1 - alpha) + overlay.g * 255 * alpha);
          data[p + 2] = Math.round(data[p + 2] * (1 - alpha) + overlay.b * 255 * alpha);
        }
        data[p + 3] = 255;
        p += 4;
      }
    }
    offCtx.putImageData(imageData, 0, 0);
    textureState.token = overlayToken;
  }

  ctx.save();
  ctx.clearRect(0, 0, dstW, dstH);
  ctx.fillStyle = "#02080d";
  ctx.fillRect(0, 0, dstW, dstH);

  const fit = getFitRect(width, height, dstW, dstH, displayW, displayH);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(offscreen, 0, 0, width, height, fit.x, fit.y, fit.w, fit.h);

  const crossPx = fit.x + ((crossX + 0.5) / width) * fit.w;
  const crossPy = fit.y + ((crossY + 0.5) / height) * fit.h;
  ctx.strokeStyle = "rgba(255, 120, 120, 0.95)";
  ctx.lineWidth = Math.max(1, dpr);
  ctx.beginPath();
  ctx.moveTo(fit.x, crossPy);
  ctx.lineTo(fit.x + fit.w, crossPy);
  ctx.moveTo(crossPx, fit.y);
  ctx.lineTo(crossPx, fit.y + fit.h);
  ctx.stroke();

  ctx.strokeStyle = "rgba(180, 235, 255, 0.45)";
  ctx.strokeRect(fit.x, fit.y, fit.w, fit.h);
  ctx.restore();

  sliceViewState[key] = {
    srcW: width,
    srcH: height,
    fitCss: {
      x: fit.x / dpr,
      y: fit.y / dpr,
      w: fit.w / dpr,
      h: fit.h / dpr,
    },
  };
}

function updateMprFromPointer(viewKey, event) {
  const map = {
    XY: sliceXYCanvas,
    XZ: sliceXZCanvas,
    YZ: sliceYZCanvas,
  };
  const targetCanvas = map[viewKey];
  const view = sliceViewState[viewKey];
  if (!targetCanvas || !view?.fitCss) return;

  const rect = targetCanvas.getBoundingClientRect();
  const px = event.clientX - rect.left;
  const py = event.clientY - rect.top;
  const fit = view.fitCss;
  if (px < fit.x || px > fit.x + fit.w || py < fit.y || py > fit.y + fit.h) {
    return;
  }

  const u = clampIndex(((px - fit.x) / Math.max(1e-6, fit.w)) * (view.srcW - 1), view.srcW - 1);
  const v = clampIndex(((py - fit.y) / Math.max(1e-6, fit.h)) * (view.srcH - 1), view.srcH - 1);

  if (viewKey === "XY") {
    setMprIndex({ x: u, y: v });
  } else if (viewKey === "XZ") {
    setMprIndex({ x: u, z: v });
  } else if (viewKey === "YZ") {
    setMprIndex({ z: u, y: v });
  }
}

function bindSlicePointerInteraction(canvasEl, viewKey) {
  if (!canvasEl) return;
  let dragging = false;
  canvasEl.addEventListener("pointerdown", (event) => {
    dragging = true;
    canvasEl.setPointerCapture(event.pointerId);
    updateMprFromPointer(viewKey, event);
  });
  canvasEl.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    updateMprFromPointer(viewKey, event);
  });
  const endDrag = (event) => {
    if (!dragging) return;
    dragging = false;
    try {
      canvasEl.releasePointerCapture(event.pointerId);
    } catch (e) {
      // Ignore release errors.
    }
  };
  canvasEl.addEventListener("pointerup", endDrag);
  canvasEl.addEventListener("pointercancel", endDrag);
}

function renderSliceViews() {
  if (!loadedSlices.length) return;
  const depth = volumeMeta.depth;
  const rows = volumeMeta.rows;
  const cols = volumeMeta.cols;
  if (!depth || !rows || !cols) return;

  const zIndex = mprIndex.z;
  const yIndex = mprIndex.y;
  const xIndex = mprIndex.x;
  const first = loadedSlices[0];
  const config = getWaterSurfaceConfig();
  const spacingX = Math.max(1e-6, Number(first?.spacingX) || 1);
  const spacingY = Math.max(1e-6, Number(first?.spacingY) || 1);
  const spacingZ = Math.max(1e-6, estimateZSpacing(loadedSlices));

  drawSliceToCanvas(sliceXYCtx, sliceXYCanvas, cols, rows, (x, y) => {
    const slice = loadedSlices[zIndex];
    return slice.pixels[y * cols + x];
  }, (x, y) => {
    const slice = loadedSlices[zIndex];
    return getRuleMask(slice, y * cols + x);
  }, "XY", xIndex, yIndex, `z:${zIndex}|wm:${waterMaskRevision}|my:${config.ruleModeY}|mx:${config.ruleModeX}`, cols * spacingX, rows * spacingY, config);

  drawSliceToCanvas(sliceXZCtx, sliceXZCanvas, cols, depth, (x, z) => {
    const slice = loadedSlices[z];
    return slice.pixels[yIndex * cols + x];
  }, (x, z) => {
    const slice = loadedSlices[z];
    return getRuleMask(slice, yIndex * cols + x);
  }, "XZ", xIndex, zIndex, `y:${yIndex}|wm:${waterMaskRevision}|my:${config.ruleModeY}|mx:${config.ruleModeX}`, cols * spacingX, depth * spacingZ, config);

  drawSliceToCanvas(sliceYZCtx, sliceYZCanvas, depth, rows, (z, y) => {
    const slice = loadedSlices[z];
    return slice.pixels[y * cols + xIndex];
  }, (z, y) => {
    const slice = loadedSlices[z];
    return getRuleMask(slice, y * cols + xIndex);
  }, "YZ", zIndex, yIndex, `x:${xIndex}|wm:${waterMaskRevision}|my:${config.ruleModeY}|mx:${config.ruleModeX}`, depth * spacingZ, rows * spacingY, config);
}

function renderXrayTabView() {
  if (!loadedSlices.length || !volumeMeta.depth || !volumeMeta.rows || !volumeMeta.cols) return;
  const depth = volumeMeta.depth;
  const cols = volumeMeta.cols;
  const first = loadedSlices[0];
  const spacingX = Math.max(1e-6, Number(first?.spacingX) || 1);
  const spacingZ = Math.max(1e-6, estimateZSpacing(loadedSlices));
  renderXrayYProjection(cols, depth, mprIndex.x, mprIndex.z, spacingX, spacingZ);
}

function renderActiveMprViews() {
  if (tabPanelSlice?.classList.contains("active")) {
    renderSliceViews();
  }
  if (tabPanelXray?.classList.contains("active")) {
    renderXrayTabView();
  }
}

function ensureXrayYProjection() {
  if (!loadedSlices.length || !volumeMeta.depth || !volumeMeta.rows || !volumeMeta.cols) {
    return null;
  }

  const token = [
    volumeDataRevision,
    renderValueRange.min,
    renderValueRange.max,
    volumeMeta.depth,
    volumeMeta.rows,
    volumeMeta.cols,
  ].join("|");

  if (xrayYProjectionCache.token === token && xrayYProjectionCache.values) {
    return xrayYProjectionCache;
  }

  const depth = volumeMeta.depth;
  const rows = volumeMeta.rows;
  const cols = volumeMeta.cols;
  const values = new Float32Array(depth * cols);
  const windowMin = Number.isFinite(renderValueRange.min) ? renderValueRange.min : globalValueRange.min;
  const windowMax = Number.isFinite(renderValueRange.max) ? renderValueRange.max : globalValueRange.max;
  const range = Math.max(1e-6, windowMax - windowMin);
  const spacingY = Math.max(1e-6, Number(loadedSlices[0]?.spacingY) || 1);

  const smoothstep = (edge0, edge1, x) => {
    if (x <= edge0) return 0;
    if (x >= edge1) return 1;
    const t = (x - edge0) / Math.max(1e-6, edge1 - edge0);
    return t * t * (3 - 2 * t);
  };

  // Estimate robust intensity percentiles to build a bone-priority attenuation model.
  const sampleHistBins = 512;
  const sampleHist = new Uint32Array(sampleHistBins);
  const totalVoxelCount = depth * rows * cols;
  const sampleStride = Math.max(1, Math.floor(totalVoxelCount / 450000));
  let sampledCount = 0;
  for (let z = 0; z < depth; z += 1) {
    const pixels = loadedSlices[z].pixels;
    for (let i = 0; i < pixels.length; i += sampleStride) {
      const norm = Math.max(0, Math.min(0.999999, (pixels[i] - windowMin) / range));
      const bin = Math.floor(norm * sampleHistBins);
      sampleHist[bin] += 1;
      sampledCount += 1;
    }
  }

  const pickPercentile = (ratio) => {
    const target = Math.floor(sampledCount * ratio);
    let csum = 0;
    for (let b = 0; b < sampleHistBins; b += 1) {
      csum += sampleHist[b];
      if (csum >= target) {
        return b / sampleHistBins;
      }
    }
    return 1;
  };

  const q60 = pickPercentile(0.60);
  const q85 = pickPercentile(0.85);
  const q95 = pickPercentile(0.95);

  // Soft tissue gets a small coefficient; dense structures get a much larger one.
  const softStart = Math.max(0.15, q60 * 0.90);
  const softEnd = Math.min(0.90, Math.max(softStart + 0.08, q85 * 0.90));
  const boneStart = Math.min(0.96, Math.max(softEnd + 0.03, q85 * 0.98));
  const boneEnd = Math.min(0.995, Math.max(boneStart + 0.05, q95 * 1.02));

  let minProj = Number.POSITIVE_INFINITY;
  let maxProj = Number.NEGATIVE_INFINITY;

  for (let z = 0; z < depth; z += 1) {
    const slice = loadedSlices[z];
    for (let x = 0; x < cols; x += 1) {
      let opticalDepth = 0.0;

      // Beer-Lambert attenuation along +Y -> -Y ray.
      for (let y = rows - 1; y >= 0; y -= 1) {
        const raw = slice.pixels[y * cols + x];
        const norm = Math.max(0, Math.min(1, (raw - windowMin) / range));

        const softTissue = smoothstep(softStart, softEnd, norm);
        const bone = Math.pow(smoothstep(boneStart, boneEnd, norm), 1.2);
        let mu = softTissue * 0.045 + bone * 1.25;

        // Cortical boundaries are usually informative in radiographs.
        if (y > 0) {
          const below = slice.pixels[(y - 1) * cols + x];
          const belowNorm = Math.max(0, Math.min(1, (below - windowMin) / range));
          const grad = Math.abs(norm - belowNorm);
          mu += bone * Math.min(0.32, grad * 0.9);
        }

        if (mu <= 1e-4) {
          continue;
        }

        opticalDepth += mu * spacingY * 0.72;
        if (opticalDepth >= 12.0) {
          break;
        }
      }

      // Use absorbed energy instead of transmitted intensity for display:
      // stronger attenuation -> brighter structure in the synthetic X-ray image.
      const projection = 1.0 - Math.exp(-opticalDepth);

      const outIndex = z * cols + x;
      values[outIndex] = projection;
      if (projection < minProj) minProj = projection;
      if (projection > maxProj) maxProj = projection;
    }
  }

  if (!Number.isFinite(minProj) || !Number.isFinite(maxProj) || maxProj <= minProj) {
    minProj = 0;
    maxProj = 1;
  }

  let displayMin = minProj;
  let displayMax = maxProj;
  if (values.length > 16 && maxProj > minProj) {
    const bins = 1024;
    const hist = new Uint32Array(bins);
    const inv = 1 / (maxProj - minProj);
    for (let i = 0; i < values.length; i += 1) {
      const t = Math.max(0, Math.min(0.999999, (values[i] - minProj) * inv));
      const b = Math.floor(t * bins);
      hist[b] += 1;
    }

    const lowRank = Math.floor(values.length * 0.02);
    const highRank = Math.floor(values.length * 0.995);
    let csum = 0;
    let lowBin = 0;
    let highBin = bins - 1;

    for (let b = 0; b < bins; b += 1) {
      csum += hist[b];
      if (csum >= lowRank) {
        lowBin = b;
        break;
      }
    }

    csum = 0;
    for (let b = 0; b < bins; b += 1) {
      csum += hist[b];
      if (csum >= highRank) {
        highBin = b;
        break;
      }
    }

    displayMin = minProj + (lowBin / bins) * (maxProj - minProj);
    displayMax = minProj + ((highBin + 1) / bins) * (maxProj - minProj);
    if (!(displayMax > displayMin)) {
      displayMin = minProj;
      displayMax = maxProj;
    }
  }

  xrayYProjectionCache = {
    token,
    values,
    width: cols,
    height: depth,
    min: minProj,
    max: maxProj,
    displayMin,
    displayMax,
  };
  return xrayYProjectionCache;
}

function renderXrayYProjection(cols, depth, xIndex, zIndex, spacingX, spacingZ) {
  if (!sliceXrayYCtx || !sliceXrayYCanvas) return;
  const projection = ensureXrayYProjection();
  if (!projection) return;
  const projRange = Math.max(1e-6, projection.displayMax - projection.displayMin);

  drawSliceToCanvas(
    sliceXrayYCtx,
    sliceXrayYCanvas,
    projection.width,
    projection.height,
    (x, z) => {
      const value = projection.values[z * projection.width + x];
      // Percentile windowing keeps major structures visible while suppressing outliers.
      const normalized = Math.max(0, Math.min(1, (value - projection.displayMin) / projRange));
      return globalValueRange.min + normalized * (globalValueRange.max - globalValueRange.min);
    },
    null,
    "XRAYY",
    xIndex,
    zIndex,
    `xray-y:${projection.token}`,
    cols * spacingX,
    depth * spacingZ,
  );
}

function scheduleSliceRender() {
  if (!loadedSlices.length) return;
  if (sliceRenderRafId) {
    cancelAnimationFrame(sliceRenderRafId);
  }
  sliceRenderRafId = requestAnimationFrame(() => {
    sliceRenderRafId = 0;
    renderActiveMprViews();
    requestRenderIfNotRequested();
  });
}

bindSlicePointerInteraction(sliceXYCanvas, "XY");
bindSlicePointerInteraction(sliceXZCanvas, "XZ");
bindSlicePointerInteraction(sliceYZCanvas, "YZ");

function refitCamera() {
  const radius = Math.max(currentBounds.x, currentBounds.y, currentBounds.z) * 0.9;
  camera.near = Math.max(0.1, radius / 200);
  camera.far = Math.max(1000, radius * 30);
  camera.updateProjectionMatrix();

  camera.position.set(radius * 0.9, -radius * 1.2, radius * 1.1);
  controls.target.set(0, 0, 0);
  controls.update();
}

function setCameraFacingAxis(axis) {
  if (!controls || !camera) return;
  const radius = Math.max(currentBounds.x, currentBounds.y, currentBounds.z) * 1.45;
  const distance = Math.max(120, radius);

  if (axis === "x") {
    camera.up.set(0, 0, 1);
    camera.position.set(-AXIS_DIRECTION.x * distance, 0, 0);
  } else if (axis === "y") {
    camera.up.set(0, 0, 1);
    camera.position.set(0, -AXIS_DIRECTION.y * distance, 0);
  } else if (axis === "z") {
    camera.up.set(0, 1, 0);
    camera.position.set(0, 0, -AXIS_DIRECTION.z * distance);
  } else {
    return;
  }

  controls.target.set(0, 0, 0);
  camera.lookAt(controls.target);
  controls.update();
  requestRenderIfNotRequested();
}

function bindAxisLegendInteractions() {
  if (!axisViewButtons.length) return;
  for (const button of axisViewButtons) {
    button.addEventListener("click", () => {
      const axis = button.dataset.axisView;
      setCameraFacingAxis(axis);
    });
  }
}

function rebuildPointCloud() {
  if (!loadedSlices.length) return;
  if (isRebuilding) {
    pendingRebuild = true;
    return;
  }

  isRebuilding = true;

  if (rebuildTimer) {
    window.clearTimeout(rebuildTimer);
  }

  rebuildTimer = window.setTimeout(() => {
    if (preferred3DMode === "gaussian") {
      if (rebuildGaussianSplatRendering()) {
        setStatus(`高斯点云渲染完成：${loadedSlices.length} 张切片，${gaussianPointCount.toLocaleString()} 个高斯体素。`);
        requestRenderIfNotRequested();
        isRebuilding = false;
        if (pendingRebuild) {
          pendingRebuild = false;
          scheduleRebuild();
        }
        return;
      }
      if (rebuildVolumeRendering()) {
        setStatus(`体素体渲染回退完成：${loadedSlices.length} 张切片（GPU 光线步进）。`);
        requestRenderIfNotRequested();
        isRebuilding = false;
        if (pendingRebuild) {
          pendingRebuild = false;
          scheduleRebuild();
        }
        return;
      }
    } else {
      if (rebuildVolumeRendering()) {
        setStatus(`体素体渲染完成：${loadedSlices.length} 张切片（GPU 光线步进）。`);
        requestRenderIfNotRequested();
        isRebuilding = false;
        if (pendingRebuild) {
          pendingRebuild = false;
          scheduleRebuild();
        }
        return;
      }
      if (rebuildGaussianSplatRendering()) {
        setStatus(`高斯点云回退完成：${loadedSlices.length} 张切片，${gaussianPointCount.toLocaleString()} 个高斯体素。`);
        requestRenderIfNotRequested();
        isRebuilding = false;
        if (pendingRebuild) {
          pendingRebuild = false;
          scheduleRebuild();
        }
        return;
      }
    }

    clearVolumeRender();
    const threshold = Number(thresholdInput.value);
    const sampleStep = Number(sampleStepInput.value);
    const xScale = Number(xScaleInput.value);
    const yScale = Number(yScaleInput.value);
    const zScale = Number(zScaleInput.value);
    const maxPoints = maxPointsInput ? Number(maxPointsInput.value) : 250000;
    const config = getWaterSurfaceConfig();

    clearPointCloud();
    const geometry = buildPointCloudGeometry(
      loadedSlices,
      threshold,
      sampleStep,
      xScale,
      yScale,
      zScale,
      config,
    );

    const material = new THREE.PointsMaterial({
      size: Math.max(0.5, sampleStep * 0.4),
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      sizeAttenuation: true,
    });

    currentPoints = new THREE.Points(geometry, material);
    scene.add(currentPoints);
    pointCloudBakedScale = { x: xScale, y: yScale, z: zScale };
    currentPoints.scale.set(1, 1, 1);
    refitCamera();

    const pointCount = geometry.getAttribute("position").count;
    setStatus(`点云重建完成：${loadedSlices.length} 张切片，${pointCount.toLocaleString()} 个点（上限 ${maxPoints.toLocaleString()}）。`);
    requestRenderIfNotRequested();
    isRebuilding = false;
    if (pendingRebuild) {
      pendingRebuild = false;
      scheduleRebuild();
    }
  }, 120);
}

function scheduleRebuild() {
  if (!loadedSlices.length) return;
  if (rebuildTimer) {
    window.clearTimeout(rebuildTimer);
  }
  rebuildTimer = window.setTimeout(() => {
    rebuildPointCloud();
  }, 240);
}

function getNiftiOverlayColor(viewKey, viewX, viewY) {
  if (activeNiftiLabel !== "overlay" || !["XY", "XZ", "YZ"].includes(viewKey)) return null;
  const image = niftiVolumes.get("image");
  const gt = niftiVolumes.get("gt");
  const pred = niftiVolumes.get("pred");
  if (!image || !gt || !pred) return null;

  let x = viewX;
  let y = viewY;
  let z = mprIndex.z;
  if (viewKey === "XZ") {
    z = viewY;
    y = mprIndex.y;
  } else if (viewKey === "YZ") {
    z = viewX;
    x = mprIndex.x;
  }
  if (x < 0 || x >= image.cols || y < 0 || y >= image.rows || z < 0 || z >= image.depth) return null;
  const index = y * image.cols + x;
  const gtHit = gt.slices[z]?.pixels[index] > 0.5;
  const predHit = pred.slices[z]?.pixels[index] > 0.5;
  const dilatedHit = niftiDilationMaskSlices?.[z]?.[index] > 0;
  const expandedHit = dilatedHit && !predHit;
  if (!gtHit && !predHit && !expandedHit) return null;

  let red = 0;
  let green = 0;
  let blue = 0;
  let layers = 0;
  if (gtHit) {
    red += 0.18;
    green += 0.95;
    blue += 0.45;
    layers += 1;
  }
  if (predHit) {
    red += 1;
    green += 0.18;
    blue += 0.35;
    layers += 1;
  }
  if (expandedHit) {
    red += 1;
    green += 0.72;
    blue += 0.08;
    layers += 1;
  }
  return { r: red / layers, g: green / layers, b: blue / layers, alpha: 0.62 };
}

function createNiftiMaskedSlices(volume, maskSlices) {
  if (!volume || !maskSlices || maskSlices.length !== volume.depth) return volume?.slices || [];
  return volume.slices.map((slice, z) => {
    const mask = maskSlices[z];
    const pixels = new Float32Array(slice.pixels.length);
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < pixels.length; index += 1) {
      const value = mask[index] > 0 ? slice.pixels[index] : 0;
      pixels[index] = value;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    return { ...slice, pixels, min, max };
  });
}

if (folderInput) {
async function executeDirectoryProcessing(files, dirName, dirPath) {
  try {
    loadedVolumeSourceType = "dicom";
    loadedSourceFolderName = dirName;
    loadedSourceFolderPath = dirPath;
    if (loadedSourceFolderPath) {
      pushLog(`[目录] 当前输入目录: ${loadedSourceFolderPath}`);
    }

    setStatus(`开始预扫描 ${files.length} 个文件（过滤非图像并按序列分组）...`);
    const prescan = await prescanAndSelectSeries(files);
    const prescanSummary = summarizeReasonMap(prescan.skipReasons, 4);

    if (!prescan.selectedFiles.length) {
      setStatus(`预扫描后没有可解码图像文件。\n过滤汇总：${prescanSummary || "无"}`);
      return;
    }

    const droppedBySeries = prescan.totalCandidates - prescan.selectedSeriesCount;
    pushLog(`预扫描完成：候选 ${prescan.totalCandidates}，选中序列 ${prescan.selectedSeriesCount}，跨序列剔除 ${droppedBySeries}`);
    if (prescanSummary) {
      pushLog(`预扫描过滤汇总：${prescanSummary}`);
    }
    setStatus(`预扫描完成：候选 ${prescan.totalCandidates}，同序列保留 ${prescan.selectedSeriesCount}。`);

    const concurrency = getParseConcurrency();
    setStatus(`开始解析选中序列 ${prescan.selectedSeriesCount} 个文件（并发 ${concurrency}）...`);

    const { parsed, failCount, failReasonCounts } = await parseFilesWithConcurrency(prescan.selectedFiles);

    const reasonSummary = summarizeReasonMap(failReasonCounts, 5);

    if (!parsed.length) {
      setStatus(`未能成功解析任何文件。\n失败汇总：${reasonSummary || "无可用错误信息"}`);
      return;
    }

    const shapeMismatch = parsed.some((s) => s.rows !== parsed[0].rows || s.cols !== parsed[0].cols);
    if (shapeMismatch) {
      setStatus(`切片尺寸不一致，无法重建同一体数据。\n失败汇总：${reasonSummary || "无"}`);
      return;
    }

    loadedSlices = sortSlices(parsed);
    volumeDataRevision += 1;
    volumeTextureRevision = -1;
    gaussianBuildRevision = -1;
    gaussianBuildSampleStep = -1;
    gaussianBuildMaxPoints = -1;
    gaussianBuildRuleModeY = "color";
    gaussianBuildRuleModeX = "color";
    gaussianBuildRuleModeBlue = "color";
    gaussianBuildWaterMaskRevision = -1;
    volumeWaterMaskRevision = -1;
    resetWaterMask(loadedSlices);
    updateGlobalRangeFromSlices(loadedSlices);
    updateRenderRangeFromSlices(loadedSlices);
    pushLog("体素基础渲染已就绪，后台开始按规则标记体素（异步执行，已停用聚类）。");
    pushLog(
      `3D 强度窗位：global=[${globalValueRange.min.toFixed(2)}, ${globalValueRange.max.toFixed(2)}], `
      + `render=[${renderValueRange.min.toFixed(2)}, ${renderValueRange.max.toFixed(2)}]`,
    );
    updateSliceControlRanges();
    renderActiveMprViews();
    rebuildPointCloud();
    scheduleWaterSurfaceDetection(true);
    updateExportButtonState();
    if (failCount > 0) {
      setStatus(`重建完成：${loadedSlices.length} 张切片，另有 ${failCount} 个文件失败。\n失败汇总：${reasonSummary || "无"}`);
    } else {
      setStatus(`重建完成：${loadedSlices.length} 张切片。预扫描候选 ${prescan.totalCandidates}，同序列保留 ${prescan.selectedSeriesCount}。`);
    }
  } catch (fatalErr) {
    const message = fatalErr?.message ? String(fatalErr.message) : "未知致命错误";
    setStatus(`处理过程中发生致命错误：${message}`);
    pushLog(`致命错误堆栈：${fatalErr?.stack || "无"}`);
  }
}

function buildPredDilationMask(radius) {
  const pred = niftiVolumes.get("pred");
  if (!pred) return null;
  const safeRadius = Math.max(0, Math.min(12, Math.round(Number(radius) || 0)));
  const offsets = [];
  for (let dy = -safeRadius; dy <= safeRadius; dy += 1) {
    for (let dx = -safeRadius; dx <= safeRadius; dx += 1) {
      if (dx * dx + dy * dy <= safeRadius * safeRadius) offsets.push([dx, dy]);
    }
  }

  const rows = pred.rows;
  const cols = pred.cols;
  const result = [];
  for (let z = 0; z < pred.depth; z += 1) {
    const source = pred.slices[z].pixels;
    const dilated = new Uint8Array(rows * cols);
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        if (source[y * cols + x] <= 0.5) continue;
        for (const [dx, dy] of offsets) {
          const targetX = x + dx;
          const targetY = y + dy;
          if (targetX >= 0 && targetX < cols && targetY >= 0 && targetY < rows) {
            dilated[targetY * cols + targetX] = 1;
          }
        }
      }
    }
    result.push(dilated);
  }
  return result;
}

function getNiftiMaskValue(slices, x, y, z, cols) {
  const slice = slices?.[z];
  if (!slice || x < 0 || y < 0 || z < 0 || x >= cols || y >= slice.rows) return 0;
  return slice.pixels[y * cols + x] > 0.5 ? 1 : 0;
}

function applyNiftiDilation() {
  if (!niftiVolumes.has("pred")) {
    setStatus("请先加载包含 pred 的 NIfTI 数据。");
    return;
  }
  niftiDilationRadius = Math.max(0, Math.min(12, Number(niftiDilationInput?.value || 0)));
  niftiDilationMaskSlices = buildPredDilationMask(niftiDilationRadius);
  niftiOverlayRevision += 1;
  renderActiveMprViews();
  if (activeNiftiLabel === "masked") {
    installNiftiVolume("masked");
  } else if (activeNiftiLabel === "overlay" || activeNiftiLabel === "pred") {
    scheduleRebuild();
  }
  setStatus(`Pred XY 膨胀已应用：半径 ${niftiDilationRadius} 像素。`);
}

function updateNiftiExportButtonState() {
  if (exportNiftiMaskedBtn) {
    exportNiftiMaskedBtn.disabled = !niftiVolumes.has("image") || !niftiVolumes.has("pred");
  }
}

async function exportNiftiMaskedImage() {
  const image = niftiVolumes.get("image");
  if (!image?.sourceFile || !niftiVolumes.has("pred")) {
    setStatus("请先加载 image 和 pred NIfTI 文件。");
    return;
  }
  if (!niftiDilationMaskSlices) {
    niftiDilationMaskSlices = buildPredDilationMask(niftiDilationRadius);
  }
  try {
    setStatus("正在导出 Pred 区域保留版原图...");
    const buffer = await createMaskedNiftiArrayBuffer(image.sourceFile, niftiDilationMaskSlices);
    const baseName = image.fileName.replace(/\.nii\.gz$/i, "").replace(/\.nii$/i, "");
    triggerFileDownload(
      new Blob([buffer], { type: "application/octet-stream" }),
      `${baseName}_pred_dilated_masked.nii`,
    );
    setStatus("Pred 区域保留版原图已导出。 ");
  } catch (error) {
    setStatus(`NIfTI 导出失败：${error?.message || String(error)}`);
  }
}

function updateNiftiDatasetOptions(selectedLabel = "") {
  if (!niftiDatasetSelect) return;
  niftiDatasetSelect.replaceChildren();
  const availableLabels = Array.from(niftiVolumes.keys());
  const hasImage = niftiVolumes.has("image");
  const hasGt = niftiVolumes.has("gt");
  const hasPred = niftiVolumes.has("pred");
  pushLog(`[NIfTI] 已识别数据集：${availableLabels.join(", ") || "无"}`);
  if (hasImage && hasGt && hasPred) {
    const overlayOption = document.createElement("option");
    overlayOption.value = "overlay";
    overlayOption.textContent = "原图 + GT + Pred（叠加）";
    overlayOption.selected = selectedLabel === "overlay";
    niftiDatasetSelect.appendChild(overlayOption);
    const maskedOption = document.createElement("option");
    maskedOption.value = "masked";
    maskedOption.textContent = "Pred 膨胀区域保留原图";
    maskedOption.selected = selectedLabel === "masked";
    niftiDatasetSelect.appendChild(maskedOption);
  } else {
    pushLog(`[NIfTI] 叠加选项不可用：image=${hasImage}, gt=${hasGt}, pred=${hasPred}`);
  }
  for (const [label, volume] of niftiVolumes) {
    const option = document.createElement("option");
    option.value = label;
    option.textContent = `${label}（${volume.fileName}）`;
    option.selected = label === selectedLabel;
    niftiDatasetSelect.appendChild(option);
  }
  niftiDatasetSelect.disabled = niftiVolumes.size <= 1;
}

function installNiftiVolume(label) {
  const sourceLabel = label === "overlay" || label === "masked" ? "image" : label;
  const volume = niftiVolumes.get(sourceLabel);
  if (!volume) return;

  loadedVolumeSourceType = "nifti";
  activeNiftiLabel = label;
  niftiOverlayRevision += 1;
  loadedSourceFolderName = volume.stem || label;
  loadedSourceFolderPath = "";
  if (label === "masked") {
    niftiDilationMaskSlices = niftiDilationMaskSlices || buildPredDilationMask(niftiDilationRadius);
    loadedSlices = createNiftiMaskedSlices(volume, niftiDilationMaskSlices);
  } else {
    loadedSlices = volume.slices;
  }
  volumeDataRevision += 1;
  volumeTextureRevision = -1;
  gaussianBuildRevision = -1;
  gaussianBuildSampleStep = -1;
  gaussianBuildMaxPoints = -1;
  gaussianBuildRuleModeY = "none";
  gaussianBuildRuleModeX = "none";
  gaussianBuildRuleModeBlue = "none";
  gaussianBuildWaterMaskRevision = -1;
  volumeWaterMaskRevision = -1;
  waterDetectionTaskId += 1;
  waterDetectionScheduled = false;
  waterDetectionInProgress = false;
  resetWaterMask(loadedSlices);
  updateGlobalRangeFromSlices(loadedSlices);
  updateRenderRangeFromSlices(loadedSlices);
  updateSliceControlRanges();
  renderActiveMprViews();
  updateExportButtonState();
  rebuildPointCloud();
  setStatus(`NIfTI 已加载：${volume.fileName}，${volume.cols}×${volume.rows}×${volume.depth}。`);
  pushLog(`NIfTI 显示源：${label}，已跳过 DICOM 预扫描、规则检测和导出逻辑。`);
}

async function loadNiftiFiles(files) {
  const niftiFiles = files.filter(isNiftiFile);
  if (!niftiFiles.length) {
    setStatus("未检测到 .nii 或 .nii.gz 文件。");
    return;
  }

  niftiVolumes.clear();
  setStatus(`正在解码 NIfTI：0/${niftiFiles.length}...`);
  for (let index = 0; index < niftiFiles.length; index += 1) {
    const file = niftiFiles[index];
    try {
      const volume = await decodeNiftiFile(file);
      const baseLabel = getNiftiDisplayLabel(file);
      let label = baseLabel;
      let duplicateIndex = 2;
      while (niftiVolumes.has(label)) {
        label = `${baseLabel}-${duplicateIndex}`;
        duplicateIndex += 1;
      }
      niftiVolumes.set(label, volume);
      pushLog(`NIfTI 解码完成：${file.name} -> ${volume.cols}×${volume.rows}×${volume.depth}`);
    } catch (error) {
      pushLog(`NIfTI 解码失败：${file.name} -> ${error?.message || String(error)}`);
    }
    setStatus(`正在解码 NIfTI：${index + 1}/${niftiFiles.length}...`);
    await yieldToUi();
  }

  if (!niftiVolumes.size) {
    setStatus("没有成功解码的 NIfTI 体数据，请检查文件格式。");
    return;
  }

  niftiDilationMaskSlices = buildPredDilationMask(niftiDilationRadius);
  niftiOverlayRevision += 1;
  updateNiftiExportButtonState();
  const preferredLabel = niftiVolumes.has("image") ? "image" : niftiVolumes.keys().next().value;
  updateNiftiDatasetOptions(preferredLabel);
  installNiftiVolume(preferredLabel);
}

if (niftiInput) {
  niftiInput.addEventListener("change", async (event) => {
    const files = Array.from(event.target.files || []).filter((file) => file.size > 0);
    await loadNiftiFiles(files);
  });
}

if (niftiDatasetSelect) {
  niftiDatasetSelect.addEventListener("change", () => {
    installNiftiVolume(niftiDatasetSelect.value);
  });
}

if (niftiDilationInput && niftiDilationValue) {
  niftiDilationInput.addEventListener("input", () => {
    niftiDilationValue.textContent = `${niftiDilationInput.value} 像素`;
  });
}

if (applyNiftiDilationBtn) {
  applyNiftiDilationBtn.addEventListener("click", applyNiftiDilation);
}

if (exportNiftiMaskedBtn) {
  exportNiftiMaskedBtn.addEventListener("click", () => {
    void exportNiftiMaskedImage();
  });
}

if (folderInput) {
  folderInput.addEventListener("change", async (event) => {
    pushLog("收到目录选择事件，开始扫描文件...");
    const files = Array.from(event.target.files || []).filter((f) => f.size > 0 && !isNiftiFile(f));
    if (!files.length) {
      setStatus("未检测到可读取文件，请重新选择目录。");
      return;
    }

    let dirName = (files[0]?.webkitRelativePath || "")
      .split(/[\\/]/)
      .filter(Boolean)[0]
      || "dicom";
    let dirPath = inferSourceFolderPath(files[0]);
    if (!dirName && dirPath) {
      dirName = pathBasename(dirPath) || "dicom";
    }

    await executeDirectoryProcessing(files, dirName, dirPath);
  });
}

const desktopDirBtnRow = document.getElementById("desktopDirBtnRow");
const selectDesktopDirBtn = document.getElementById("selectDesktopDirBtn");
const batchProcessBtn = document.getElementById("batchProcessBtn");
const webDirPicker = document.getElementById("webDirPicker");

if (desktopBridge && desktopDirBtnRow && webDirPicker) {
  desktopDirBtnRow.style.display = "block";
  webDirPicker.style.display = "none";
}

if (selectDesktopDirBtn && desktopBridge) {
  selectDesktopDirBtn.addEventListener("click", async () => {
    try {
      pushLog("请求原生目录选择对话框...");
      const result = await desktopBridge.selectDirectory();
      if (!result) {
        pushLog("已取消目录选择。");
        return;
      }

      const { dirPath, files } = result;
      pushLog(`收到目录选择事件，开始扫描文件...`);

      if (!files || !files.length) {
        setStatus("未检测到可读取文件，请重新选择目录。");
        return;
      }

      const mockFiles = files.map(f => ({
        name: f.name,
        size: f.size,
        path: f.path,
        webkitRelativePath: f.name,
        arrayBuffer: async () => {
          const buf = await desktopBridge.readFile(f.path);
          return buf.buffer ? buf.buffer : buf;
        }
      }));

      const dirName = pathBasename(dirPath) || "dicom";
      await executeDirectoryProcessing(mockFiles, dirName, dirPath);
    } catch (err) {
      console.error(err);
      setStatus("读取目录失败: " + err.message);
    }
  });
}

if (batchProcessBtn && desktopBridge) {
  batchProcessBtn.addEventListener("click", async () => {
    try {
      pushLog("请求原生批量目录选择对话框...");
      setStatusOnly("请选择包含切片存放子文件夹的父目录（将扫描深层文件夹，并自动跳过 _clean 文件夹）。");

      const result = await desktopBridge.findDicomDirectories();
      if (!result) {
        pushLog("已取消批量目录选择。");
        return;
      }

      const { rootDir, directories } = result;
      if (!directories || directories.length === 0) {
         setStatus("未在选定目录下找到任何有效的 DICOM 子文件夹！");
         return;
      }
      
      pushLog(`=========== 批量任务启动 ===========\n在 ${rootDir} 下共找到 ${directories.length} 个目标子目录。\n开始全自动化流水线处理...`);
      
      let successCount = 0;
      let failCount = 0;
      const batchLog = [];

      const MAX_WORKERS = navigator.hardwareConcurrency ? Math.max(2, navigator.hardwareConcurrency - 1) : 4;
      const outputConfig = getProcessingWaterSurfaceConfig();
      
      let dirIndex = 0;
      
      // Worker function to process one directory
      async function processDirWorker(dPath, workerId) {
         const dName = pathBasename(dPath) || "dicom";
         
         const rawFiles = await desktopBridge.readDirectoryFiles(dPath);
         if (!rawFiles || !rawFiles.length) {
            batchLog.push(`[跳过] ${dName}: (空文件夹/无图像)`);
            pushLog(`[线程 ${workerId}] 跳过子目录 ${dName} (无有效文件)`);
            return;
         }
         
         const filesWithBuffers = [];
         for (const f of rawFiles) {
             const buf = await desktopBridge.readFile(f.path);
           const uint8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
           const uniqueBuf = uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength);
             filesWithBuffers.push({
                 name: f.name,
             buffer: uniqueBuf
             });
         }

         return new Promise((resolve) => {
            const worker = new Worker("worker_dicom_batch.js");
            worker.onmessage = async (e) => {
               const res = e.data;
               if (res.success) {
                  // Export the files natively
                  const outDir = await desktopBridge.getDefaultOutputDir(dPath);
                await desktopBridge.prepareOutputDir(outDir);
                  for (const outf of res.files) {
                     const bytes = new Uint8Array(outf.buffer);
                     await desktopBridge.writeDicomFile(outDir, outf.fileName, bytes);
                  }
                  batchLog.push(`[成功] ${dName}: (Z比=${res.bestZStartRatio.toFixed(2)}, 角度=${res.bestThetaDeg}°) -> 共输出 ${res.files.length} 张`);
                  successCount++;
               } else {
                  if (res.error && (res.error.includes("非图像DICOM") || res.error.includes("后缀拦截"))) {
                     batchLog.push(`[跳过] ${dName}: (无有效图像) ${res.error}`);
                  } else {
                     batchLog.push(`[异常] ${dName}: Worker 解析失败 - ${res.error}`);
                     failCount++;
                  }
               }
               worker.terminate();
               resolve();
            };
            
            worker.onerror = (err) => {
               batchLog.push(`[异常] ${dName}: Worker 运行崩溃`);
               failCount++;
               worker.terminate();
               resolve();
            };

            const transferables = filesWithBuffers.map(fb => fb.buffer);
            worker.postMessage({ files: filesWithBuffers, config: outputConfig }, transferables);
         });
      }

      // Worker pool orchestrator
      async function workerPoolLoop(workerId) {
          while (dirIndex < directories.length) {
              const currentIdx = dirIndex++;
              const dPath = directories[currentIdx];
              const dName = pathBasename(dPath) || "dicom";
              setStatusOnly(`[批量进度 ${currentIdx+1}/${directories.length}] (线程${workerId}) 正在处理: ${dName} ...`);
              await processDirWorker(dPath, workerId);
          }
      }

      const poolExecutors = [];
      for (let i = 0; i < MAX_WORKERS; i++) {
          poolExecutors.push(workerPoolLoop(i + 1));
      }
      
      await Promise.all(poolExecutors);

      setStatus(`批量无界面多线程执行结束！总计：成功 ${successCount}，失败或跳过 ${directories.length - successCount}。`);
      pushLog(`============= 批量运行报告 =============\n` + batchLog.join("\n") + `\n========================================`);
      
    } catch(err) {
      console.error(err);
      setStatus("批量执行遇到致命异常: " + err.message);
    }
  });
}
}

if (!folderInput) {
  setStatus("页面缺少 folderInput 控件，无法选择目录。请检查 HTML。 ");
} else {
  pushLog("目录选择监听器已绑定。");
}

updateExportButtonState();

async function bootstrapApp() {
  try {
    await initRendererAndControls();
    bindAxisLegendInteractions();
    requestRenderIfNotRequested();

    setStatusOnly("页面已加载，正在初始化解析器...");
    parserReady = initParserStack();
    if (parserReady) {
      pushLog("当前解析模式：dicom-parser");
    }
    pushLog(`[版本] app.js ${APP_BUILD}`);
    pushLog(
      `[控件挂载] ruleY=${Boolean(waterBandRatioInput)} modeY=${Boolean(waterRuleModeYSelect)} modeX=${Boolean(waterRuleModeXSelect)} modeBlue=${Boolean(waterRuleModeBlueSelect)}`,
    );
    switchTab("cloud");
  } catch (err) {
    const message = err?.message ? String(err.message) : "未知初始化错误";
    setStatus(`渲染器初始化失败：${message}`);
  }
}

bootstrapApp();

window.addEventListener("resize", () => {
  requestRenderIfNotRequested();
  scheduleSliceRender();
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    requestRenderIfNotRequested();
  }
});

window.addEventListener("error", (event) => {
  const message = event?.error?.message || event?.message || "未知脚本错误";
  pushLog(`全局错误: ${message}`);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event?.reason?.message || String(event?.reason || "未知 Promise 错误");
  pushLog(`未捕获 Promise 错误: ${reason}`);
});
