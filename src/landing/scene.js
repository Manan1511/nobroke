// Landing hero scene: ported from the NoBroke landing source (src/main.js) so it runs inside React.
// mountLanding(root) starts the Three.js tubes, floating icons, GSAP intro and menu, and returns a cleanup.
import * as THREE from "three"
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"
import { gsap } from "gsap"

export function mountLanding(root) {
const disposers = []
const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); disposers.push(() => target.removeEventListener(type, fn, opts)) }
const hero = root.querySelector('#hero');
const canvas = root.querySelector('#tube-scene');
const title = root.querySelector('#wordmark');
const glitchLayer = root.querySelector('#glitch-layer');
const icons = [...root.querySelectorAll('.float-icon')];
const topbar = root.querySelector('#topbar');
const actions = [...root.querySelectorAll('.pill-button')];
const taglineWords = [...root.querySelectorAll('#tagline span')];
const menuToggle = root.querySelector('#menu-toggle');
const menuPanel = root.querySelector('#site-menu');
const menuAnnouncement = root.querySelector('#menu-announcement');
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
let reducedMotion = motionPreference.matches;
const LOOP_SECONDS = 12;

let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
    stencil: false,
    depth: true,
  });
} catch (error) {
  root.classList.add('webgl-fallback');
  canvas.style.display = 'none';
  console.warn('WebGL is unavailable; using the static NoBroke fallback.', error);
}
if (renderer) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.setClearColor(0x000000, 0);
}

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 80);
camera.position.set(0, 0, 18);
camera.lookAt(0, 0, 0);

if (renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.035).texture;
  room.dispose();
  pmrem.dispose();
}
scene.add(new THREE.HemisphereLight(0xfff7e9, 0x71311c, 0.9));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.7);
keyLight.position.set(-4, 7, 11);
scene.add(keyLight);
const orangeRim = new THREE.PointLight(0xff5a2d, 48, 24, 2);
orangeRim.position.set(5, 3, 4);
scene.add(orangeRim);
const softFill = new THREE.PointLight(0xffdbc3, 19, 26, 2);
softFill.position.set(-5, -3, 7);
scene.add(softFill);

function makeRibNormal() {
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = 256;
  textureCanvas.height = 64;
  const context = textureCanvas.getContext('2d', { willReadFrequently: true });
  const image = context.createImageData(textureCanvas.width, textureCanvas.height);
  const cycles = 24;
  for (let y = 0; y < textureCanvas.height; y += 1) {
    for (let x = 0; x < textureCanvas.width; x += 1) {
      const phase = (x / textureCanvas.width) * Math.PI * 2 * cycles;
      const slope = Math.cos(phase) * 0.42;
      const normalX = Math.round(128 + slope * 76);
      const normalY = 128;
      const normalZ = Math.round(255 * Math.sqrt(Math.max(0.16, 1 - slope * slope * 0.35)));
      const index = (y * textureCanvas.width + x) * 4;
      image.data[index] = normalX;
      image.data[index + 1] = normalY;
      image.data[index + 2] = normalZ;
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 1);
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = renderer ? Math.min(renderer.capabilities.getMaxAnisotropy(), 8) : 1;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

const ribNormal = makeRibNormal();
const tubeMaterial = new THREE.MeshPhysicalMaterial({
  color: 0xff4a1c,
  metalness: 0.04,
  roughness: 0.35,
  clearcoat: 1,
  clearcoatRoughness: 0.22,
  normalMap: ribNormal,
  normalScale: new THREE.Vector2(0.2, 0.2),
  envMapIntensity: 1.05,
});

const paths = [
  {
    radius: 0.46,
    phase: 0.28,
    points: [
      [-1.28, 0.72, 0.04, 0.05, 0.2],
      [-1.02, 0.72, 0.035, 0.045, 0.8],
      [-0.79, 0.56, 0.04, 0.07, 1.4],
      [-0.56, 0.24, 0.05, 0.055, 2.0],
      [-0.25, 0.06, 0.07, 0.06, 2.6],
      [0.08, 0.12, 0.06, 0.07, 3.1],
      [0.38, 0.39, 0.05, 0.08, 3.9],
      [0.66, 0.67, 0.04, 0.055, 4.7],
      [0.94, 0.75, 0.04, 0.05, 5.4],
    ],
  },
  {
    radius: 0.42,
    phase: 2.35,
    points: [
      [-1.18, -0.56, 0.04, 0.05, 1.0],
      [-0.93, -0.69, 0.05, 0.055, 1.7],
      [-0.66, -0.58, 0.05, 0.06, 2.3],
      [-0.41, -0.34, 0.06, 0.06, 2.9],
      [-0.11, -0.22, 0.06, 0.065, 3.6],
      [0.19, -0.29, 0.055, 0.07, 4.1],
      [0.45, -0.55, 0.05, 0.065, 4.9],
      [0.72, -0.69, 0.045, 0.055, 5.5],
      [1.18, -0.57, 0.04, 0.05, 6.1],
    ],
  },
];

function curveForPath(path, time) {
  const loopAngle = (time / LOOP_SECONDS) * Math.PI * 2;
  const aspect = hero.clientWidth / Math.max(1, hero.clientHeight);
  const halfWidth = (10 * aspect) / 2;
  const halfHeight = 5;
  const curvePoints = path.points.map(([x, y, ampX, ampY, pointPhase]) => {
    const wave = Math.sin(loopAngle + pointPhase + path.phase);
    return new THREE.Vector3(
      (x + ampX * wave) * halfWidth,
      (y + ampY * wave) * halfHeight,
      -2.4 + 0.09 * Math.sin(loopAngle + pointPhase),
    );
  });
  const curve = new THREE.CatmullRomCurve3(curvePoints, false, 'centripetal', 0.5);
  curve.arcLengthDivisions = 64;
  return curve;
}

const TUBE_SEGMENTS = 136;
const TUBE_RADIAL_SEGMENTS = 12;
let geometryNeedsReset = false;

function makeTubeState(path) {
  const curve = curveForPath(path, 0);
  const geometry = new THREE.TubeGeometry(curve, TUBE_SEGMENTS, path.radius, TUBE_RADIAL_SEGMENTS, false);
  geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
  geometry.attributes.normal.setUsage(THREE.DynamicDrawUsage);
  const basePositions = new Float32Array(geometry.attributes.position.array);
  const baseCenters = Array.from({ length: TUBE_SEGMENTS + 1 }, (_, ring) => curve.getPointAt(ring / TUBE_SEGMENTS));
  return { geometry, basePositions, baseCenters };
}

const tubeStates = paths.map(makeTubeState);
const tubeMeshes = tubeStates.map((state) => {
  const mesh = new THREE.Mesh(state.geometry, tubeMaterial);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
});
const roundedTip = new THREE.Mesh(new THREE.SphereGeometry(paths[0].radius * 0.985, 28, 22), tubeMaterial);
roundedTip.position.z = -2.3;
scene.add(roundedTip);

function fitCanvas() {
  const width = Math.max(1, hero.clientWidth);
  const height = Math.max(1, hero.clientHeight);
  if (renderer) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
  }
  const halfHeight = 5;
  const halfWidth = (width / height) * halfHeight;
  camera.left = -halfWidth;
  camera.right = halfWidth;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.updateProjectionMatrix();
  geometryNeedsReset = true;
}
fitCanvas();
const resizeObserver = new ResizeObserver(fitCanvas);
resizeObserver.observe(hero);
disposers.push(() => resizeObserver.disconnect());
geometryNeedsReset = false;

let elapsed = 0;
let rafId = 0;
let lastFrameAt = 0;
let frameCount = 0;
let droppedFrames = 0;
let longFrames = 0;
const recentFrameDeltas = [];
const clock = new THREE.Clock(false);
const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };

function resetTubeStates() {
  tubeMeshes.forEach((mesh, index) => {
    const previousGeometry = mesh.geometry;
    const state = makeTubeState(paths[index]);
    tubeStates[index] = state;
    mesh.geometry = state.geometry;
    previousGeometry.dispose();
  });
  geometryNeedsReset = false;
}

function updateTubeMesh(mesh, state, path, time) {
  const curve = curveForPath(path, time);
  const positionAttribute = state.geometry.attributes.position;
  const positions = positionAttribute.array;
  const verticesPerRing = TUBE_RADIAL_SEGMENTS + 1;
  for (let ring = 0; ring <= TUBE_SEGMENTS; ring += 1) {
    const center = curve.getPointAt(ring / TUBE_SEGMENTS);
    const baseCenter = state.baseCenters[ring];
    const dx = center.x - baseCenter.x;
    const dy = center.y - baseCenter.y;
    const dz = center.z - baseCenter.z;
    const firstVertex = ring * verticesPerRing;
    const lastVertex = firstVertex + verticesPerRing;
    for (let vertex = firstVertex; vertex < lastVertex; vertex += 1) {
      const offset = vertex * 3;
      positions[offset] = state.basePositions[offset] + dx;
      positions[offset + 1] = state.basePositions[offset + 1] + dy;
      positions[offset + 2] = state.basePositions[offset + 2] + dz;
    }
  }
  positionAttribute.needsUpdate = true;
  state.geometry.computeVertexNormals();
  return curve;
}

function renderFrame() {
  rafId = 0;
  if (document.hidden) return;
  const delta = clock.getDelta();
  elapsed += delta;
  const loopTime = elapsed % LOOP_SECONDS;
  const loopProgress = loopTime / LOOP_SECONDS;
  if (renderer) {
    if (geometryNeedsReset) resetTubeStates();
    const activeCurves = tubeMeshes.map((mesh, index) => updateTubeMesh(mesh, tubeStates[index], paths[index], loopTime));
    roundedTip.position.copy(activeCurves[0].getPointAt(1));
    ribNormal.offset.x = loopProgress;
  }

  pointer.x += (pointer.targetX - pointer.x) * 0.075;
  pointer.y += (pointer.targetY - pointer.y) * 0.075;
  icons.forEach((icon) => {
    const phase = Number(icon.dataset.phase || 0);
    const period = Number(icon.dataset.period || 5);
    const angle = (elapsed / period) * Math.PI * 2 + phase;
    const bob = reducedMotion ? 0 : Math.sin(angle) * 10;
    const tilt = reducedMotion ? 0 : Math.sin(angle + 0.8) * 4;
    const parallaxX = reducedMotion ? 0 : pointer.x * 7;
    const parallaxY = reducedMotion ? 0 : pointer.y * 7;
    icon.style.setProperty('--float-y', `${bob.toFixed(2)}px`);
    icon.style.setProperty('--float-tilt', `${tilt.toFixed(2)}deg`);
    icon.style.setProperty('--parallax-x', `${(parallaxX * (icon.classList.contains('wallet-icon') ? -1 : 1)).toFixed(2)}px`);
    icon.style.setProperty('--parallax-y', `${parallaxY.toFixed(2)}px`);
    if (icon.classList.contains('n-coin-icon')) {
      const sparkle = icon.querySelector('.sparkle');
      const twinkle = reducedMotion ? 0.82 : 0.5 + (0.5 + 0.5 * Math.sin(elapsed * 5.4 + 1.7)) * 0.5;
      sparkle.style.opacity = twinkle.toFixed(2);
      sparkle.style.transform = `scale(${(0.78 + twinkle * 0.28).toFixed(3)}) rotate(${(elapsed * 28) % 360}deg)`;
    }
  });

  if (renderer) renderer.render(scene, camera);
  frameCount += 1;
  if (lastFrameAt) {
    const frameDelta = performance.now() - lastFrameAt;
    recentFrameDeltas.push(frameDelta);
    if (recentFrameDeltas.length > 180) recentFrameDeltas.shift();
    if (frameDelta > 34) droppedFrames += 1;
    if (frameDelta > 50) longFrames += 1;
  }
  lastFrameAt = performance.now();
  if (!reducedMotion) rafId = window.requestAnimationFrame(renderFrame);
}

function startRendering() {
  if (rafId || document.hidden || reducedMotion) return;
  clock.start();
  lastFrameAt = 0;
  rafId = window.requestAnimationFrame(renderFrame);
}
function stopRendering() {
  if (rafId) window.cancelAnimationFrame(rafId);
  rafId = 0;
  clock.stop();
  lastFrameAt = 0;
}

if (reducedMotion) {
  clock.start();
  renderFrame();
  clock.stop();
} else {
  startRendering();
}
on(document, 'visibilitychange', () => {
  if (document.hidden) stopRendering();
  else startRendering();
});
on(window, 'pointermove', (event) => {
  const bounds = hero.getBoundingClientRect();
  pointer.targetX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
  pointer.targetY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
}, { passive: true });
on(hero, 'pointerleave', () => {
  pointer.targetX = 0;
  pointer.targetY = 0;
});

function createGlitchSlices() {
  glitchLayer.replaceChildren();
  const count = 24;
  const slices = [];
  for (let index = 0; index < count; index += 1) {
    const slice = document.createElement('span');
    const top = (index / count) * 100;
    const bottom = 100 - ((index + 1) / count) * 100;
    slice.className = 'glitch-slice';
    slice.textContent = 'NoBroke';
    slice.style.clipPath = `inset(${top}% ${Math.random() * 20}% ${bottom}% 0)`;
    slice.style.setProperty('--slice-nudge', `${Math.round((Math.random() - 0.5) * 30)}px`);
    glitchLayer.append(slice);
    slices.push(slice);
  }
  return slices;
}
const glitchSlices = createGlitchSlices();
const openEase = reducedMotion ? 'none' : 'back.out(2.8)';
let introFinished = false;
let introStarted = false;
let introTimeline = null;

function runIntro() {
  if (reducedMotion) {
    gsap.set([title, topbar, actions, taglineWords, icons.map((icon) => icon.querySelector('.icon-art'))], { clearProps: 'all', autoAlpha: 1, y: 0, scale: 1 });
    gsap.set(glitchSlices, { autoAlpha: 0 });
    introFinished = true;
    return;
  }
  const iconArt = icons.map((icon) => icon.querySelector('.icon-art'));
  gsap.set(title, { autoAlpha: 0 });
  gsap.set(glitchSlices, { autoAlpha: 0, x: (index) => Number.parseFloat(glitchSlices[index].style.getPropertyValue('--slice-nudge')) || 0, y: (index) => index % 2 ? 7 : -7, filter: 'blur(3px)' });
  gsap.set(iconArt, { autoAlpha: 0, scale: 0, transformOrigin: '50% 50%' });
  gsap.set(topbar, { autoAlpha: 0, y: -8 });
  gsap.set(actions, { autoAlpha: 0, y: 12 });
  gsap.set(taglineWords, { autoAlpha: 0, y: 10 });

  introTimeline = gsap.timeline({ onComplete: () => { introFinished = true; } });
  introTimeline.to(glitchSlices, {
    autoAlpha: 1,
    x: 0,
    y: 0,
    filter: 'blur(0px)',
    duration: 0.105,
    ease: 'power2.out',
    stagger: { each: 0.015, from: 'random' },
  }, 0.12);
  introTimeline.to(title, { autoAlpha: 1, duration: 0.13, ease: 'power1.out' }, 0.57);
  introTimeline.to(glitchSlices, { autoAlpha: 0, duration: 0.12, stagger: 0.002, ease: 'power1.out' }, 0.58);
  introTimeline.to(iconArt, { autoAlpha: 1, scale: 1, duration: 0.43, ease: openEase, stagger: 0.075 }, 0.62);
  introTimeline.to(topbar, { autoAlpha: 1, y: 0, duration: 0.32, ease: 'power2.out' }, 0.68);
  introTimeline.to(actions[0], { autoAlpha: 1, y: 0, duration: 0.32, ease: 'power2.out' }, 0.87);
  introTimeline.to(actions[1], { autoAlpha: 1, y: 0, duration: 0.32, ease: 'power2.out' }, 0.98);
  introTimeline.to(taglineWords, { autoAlpha: 1, y: 0, duration: 0.27, ease: 'power2.out', stagger: 0.095 }, 1.05);
}

function startIntro() {
  if (introStarted) return;
  introStarted = true;
  runIntro();
}
const fontsReady = document.fonts?.ready ?? Promise.resolve();
Promise.race([fontsReady, new Promise((resolve) => window.setTimeout(resolve, 200))]).then(startIntro);
on(motionPreference, 'change', (event) => {
  reducedMotion = event.matches;
  if (reducedMotion) {
    stopRendering();
    introTimeline?.kill();
    gsap.set([title, topbar, actions, taglineWords, icons.map((icon) => icon.querySelector('.icon-art'))], { autoAlpha: 1, x: 0, y: 0, scale: 1 });
    gsap.set(glitchSlices, { autoAlpha: 0 });
    introFinished = true;
    clock.start();
    renderFrame();
    clock.stop();
  } else {
    if (!introFinished) startIntro();
    startRendering();
  }
});

let menuOpen = false;
function setMenu(open, moveFocus = false) {
  if (menuOpen === open) return;
  menuOpen = open;
  menuToggle.classList.toggle('is-open', open);
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  menuPanel.setAttribute('aria-hidden', String(!open));
  menuPanel.inert = !open;
  menuPanel.style.pointerEvents = open ? 'auto' : 'none';
  menuAnnouncement.textContent = open ? 'Navigation menu opened.' : 'Navigation menu closed.';
  if (open) {
    gsap.killTweensOf(menuPanel);
    gsap.fromTo(menuPanel, { autoAlpha: 0, scale: reducedMotion ? 1 : 0.96, y: reducedMotion ? 0 : -5 }, {
      autoAlpha: 1, scale: 1, y: 0, duration: reducedMotion ? 0 : 0.23, ease: 'power2.out',
    });
    if (moveFocus) menuPanel.querySelector('a')?.focus({ preventScroll: true });
  } else {
    gsap.killTweensOf(menuPanel);
    menuToggle.focus({ preventScroll: true });
    gsap.to(menuPanel, {
      autoAlpha: 0, scale: reducedMotion ? 1 : 0.96, y: reducedMotion ? 0 : -5,
      duration: reducedMotion ? 0 : 0.16, ease: 'power1.in',
    });
  }
}
on(menuToggle, 'click', () => setMenu(!menuOpen, !menuOpen));
on(document, 'pointerdown', (event) => {
  if (menuOpen && !menuPanel.contains(event.target) && !menuToggle.contains(event.target)) setMenu(false);
});
on(document, 'keydown', (event) => {
  if (event.key === 'Escape' && menuOpen) setMenu(false);
});
on(menuPanel, 'keydown', (event) => {
  if (event.key !== 'Tab') return;
  const links = [...menuPanel.querySelectorAll('a[href]')];
  const first = links[0];
  const last = links[links.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus({ preventScroll: true });
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus({ preventScroll: true });
  }
});
on(menuPanel, 'click', (event) => {
  if (event.target.closest('a')) setMenu(false);
});

// Safety net: if the intro never runs (e.g. a stalled tab), show everything after 3 s.
const watchdog = window.setTimeout(() => {
  if (!introFinished) gsap.set([title, topbar, actions, taglineWords, icons.map((icon) => icon.querySelector('.icon-art'))], { autoAlpha: 1, x: 0, y: 0, scale: 1 })
}, 3000);

return () => {
  window.clearTimeout(watchdog);
  stopRendering();
  introTimeline?.kill();
  gsap.killTweensOf(menuPanel);
  disposers.forEach((d) => d());
  tubeMeshes.forEach((mesh) => mesh.geometry.dispose());
  roundedTip.geometry.dispose();
  tubeMaterial.dispose();
  ribNormal.dispose();
  scene.environment?.dispose();
  renderer?.dispose();
  glitchLayer.replaceChildren();
};
}
