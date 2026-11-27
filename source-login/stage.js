import { decodeVectorMovie, parseVectorMovie } from "./swf-vector.js";
import { createTitleMotion } from "./title-motion.js";

const STAGE_WIDTH = 780;
const STAGE_HEIGHT = 680;
const ART_WIDTH = 760;
const ART_HEIGHT = 680;
const GLOW_RECT_Y = 340;
const GLOW_RECT_HEIGHT = 50;
const GLOW_BLUR_Y = 110;
const GLOW_STRENGTH = 4;
const GLOW_TOP = GLOW_RECT_Y - GLOW_BLUR_Y / 2;
const GLOW_HEIGHT = GLOW_RECT_HEIGHT + GLOW_BLUR_Y;
const TITLE_FADE_MS = 800 / 1.7;
const ROSE_IN_MS = 1000;
const ROSE_HOLD_MS = 4000;
const ROSE_OUT_MS = 300;
const canvas = document.getElementById("stage-background");
const stage = document.getElementById("stage");
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
let loadingMovie;
let beginLoginTransition;

if (canvas) {
  canvas.dataset.state = "loading";
  loadStage().catch(reportUnavailable);
  canvas.addEventListener("webglcontextlost", () => reportUnavailable());
}

async function loadStage() {
  stage.dataset.entry = "loading";
  const renderer = createStageRenderer();
  const assets = Promise.allSettled([loadBackground(renderer), loadTitle(renderer)]);
  if (!reduced.matches) {
    try {
      const movie = await loadLoadingMovie();
      await playLoading(renderer, movie, assets);
    } catch (error) {
      console.warn("Source loading animation unavailable", error);
    }
  }
  const [background, title] = await assets;
  if (canvas.dataset.state === "error") return;
  if (background.status === "rejected") throw background.reason;
  canvas.dataset.state = "ready";
  canvas.dataset.titleState = title.status === "fulfilled" ? "ready" : "error";
  if (title.status === "rejected") reportStatus("標題動畫無法載入，仍可登入。", title.reason);
  showTitle(renderer, background.value, title.status === "fulfilled" ? title.value : null);
}

async function loadBackground(renderer) {
  const [swf, decoder] = await Promise.all([
    fetchBytes("/source-login/assets/event_title.swf"),
    fetchBytes("/source-login/asset-decoder.wasm")
      .then(bytes => WebAssembly.instantiate(bytes))
      .then(({ instance }) => instance.exports),
  ]);
  const movie = await decompressSwf(swf, decoder.input_capacity());
  const input = new Uint8Array(decoder.memory.buffer, decoder.input_ptr(), movie.length);
  input.set(movie);
  const range = decoder.find_jpeg(movie.length);
  const offset = Number(range >> 32n);
  const length = Number(range & 0xffffffffn);
  if (!length || offset + length > movie.length) {
    throw new Error("The original SWF does not contain a complete JPEG");
  }

  const bitmap = await createImageBitmap(new Blob([movie.subarray(offset, offset + length)], {
    type: "image/jpeg",
  }));
  try {
    if (bitmap.width !== ART_WIDTH || bitmap.height !== ART_HEIGHT) {
      throw new Error("Unexpected background image dimensions");
    }
    return renderer.upload(bitmap, "nearest");
  } finally {
    bitmap.close();
  }
}

async function loadVector(filename) {
  const source = await fetchBytes(`/source-login/assets/${filename}`);
  return decompressSwf(source, 1024 * 1024);
}

function loadLoadingMovie() {
  loadingMovie ??= loadVector("loading.swf").then(parseVectorMovie).catch(error => {
    loadingMovie = undefined;
    throw error;
  });
  return loadingMovie;
}

function roseFrame(elapsed) {
  // The embedded movie's frame-100 script jumps to authored frame 23.
  const tick = Math.floor(Math.max(0, elapsed) * 24 / 1000);
  return tick < 99 ? tick : 22 + (tick - 99) % 77;
}

async function loadTitle(renderer) {
  const loadFrames = async filename => {
    const movie = await loadVector(filename);
    return decodeVectorMovie(movie).frames.map(({ image, ...frame }) => ({
      ...frame,
      texture: renderer.upload(image),
    }));
  };
  const [logo, butterfly] = await Promise.all([
    loadVector("logo.swf").then(parseVectorMovie), loadFrames("ageha.swf"),
  ]);
  if (logo.frameCount !== 1 || butterfly.length !== 4) throw new Error("Unexpected title asset timeline");
  // Antialias the vector directly in its authored stage position to avoid a second resampling.
  const { pixelRatio } = renderer;
  const scaleX = canvas.width / STAGE_WIDTH;
  const scaleY = canvas.height / STAGE_HEIGHT;
  const { image, x, y, width, height } = logo.rasterize(0, {
    scale: 0.7 * pixelRatio, x: 390 * scaleX, y: 370 * scaleY,
  });
  return {
    logo: {
      x: x / scaleX, y: y / scaleY, width: width / scaleX, height: height / scaleY,
      texture: renderer.upload(image, "nearest"),
    },
    butterfly,
    glow: renderer.upload(createLogoGlow()),
  };
}

function playLoading(renderer, movie, assets) {
  // Main.as retains the original loading layer for four seconds and fades it out.
  const start = performance.now();
  let previous = -1;
  let frame;
  let exit = null;
  let ready = false;
  void assets.then(() => { ready = true; });
  return new Promise((resolve, reject) => {
    function draw(timestamp) {
      if (reduced.matches || canvas.dataset.state === "error") {
        if (frame) renderer.release(frame.texture);
        delete canvas.dataset.loadingFrame;
        resolve();
        return;
      }
      const elapsed = Math.max(0, timestamp - start);
      const index = roseFrame(elapsed);
      try {
        if (index !== previous) {
          const { image, ...bounds } = movie.rasterize(index);
          frame = { ...bounds, texture: renderer.upload(image, "linear", frame?.texture) };
          previous = index;
          canvas.dataset.loadingFrame = String(index);
        }
        if (ready && elapsed >= 4000) exit ??= timestamp;
        const fade = exit === null ? 1 : Math.cos(Math.min((timestamp - exit) / 300, 1) * Math.PI / 2);
        renderer.paint(drawLayer => drawAsset(drawLayer, frame, 0, 0, 1, fade));
        if (exit !== null && timestamp - exit >= 300) {
          renderer.release(frame.texture);
          delete canvas.dataset.loadingFrame;
          resolve();
        } else requestAnimationFrame(draw);
      } catch (error) {
        if (frame) renderer.release(frame.texture);
        delete canvas.dataset.loadingFrame;
        reject(error);
      }
    }
    requestAnimationFrame(draw);
  });
}

export function startLoginTransition({ signal } = {}) {
  if (beginLoginTransition && !signal?.aborted && !reduced.matches &&
      stage.dataset.screen === "title" && canvas.dataset.state === "ready") {
    return beginLoginTransition(signal);
  }
  let cancelled = false;
  let result;
  return {
    reveal(showDestination) {
      result ??= Promise.resolve().then(() => {
        if (cancelled || signal?.aborted) return false;
        showDestination();
        return true;
      });
      return result;
    },
    cancel() { cancelled = true; },
  };
}

function playLoginTransition(renderer, drawDeparture, restore, signal) {
  const startedAt = performance.now();
  let request;
  let roseAt;
  let readyAt;
  let destination;
  let resolveReveal;
  let rejectReveal;
  let movie;
  let frame;
  let previous = -1;
  let animating = true;
  let cancelled = false;
  let revealed = false;
  const result = new Promise((resolve, reject) => { resolveReveal = resolve; rejectReveal = reject; });

  function stop() {
    if (!animating) return;
    animating = false;
    cancelAnimationFrame(request);
    signal?.removeEventListener("abort", cancel);
    if (frame) renderer.release(frame.texture);
    delete stage.dataset.loginTransition;
    delete canvas.dataset.loadingFrame;
    canvas.style.removeProperty("opacity");
    restore();
  }

  function cancel() {
    cancelled = true;
    stop();
    resolveReveal(false);
  }

  function mountDestination() {
    if (!destination || cancelled || signal?.aborted || revealed) return;
    if (animating) stage.dataset.loginTransition = "revealing";
    try {
      destination();
      revealed = true;
      resolveReveal(true);
    } catch (error) {
      stop();
      rejectReveal(error);
    }
  }

  function skip() {
    stop();
    mountDestination();
  }

  function draw(timestamp) {
    if (reduced.matches || canvas.dataset.state === "error") {
      skip();
      return;
    }
    try {
      const departure = Math.min(1, Math.max(0, (timestamp - startedAt) / TITLE_FADE_MS));
      if (departure < 1) {
        drawDeparture(timestamp, departure);
      } else {
        if (roseAt === undefined) {
          roseAt = timestamp;
          stage.dataset.loginTransition = "rose";
        }
        const elapsed = timestamp - roseAt;
        const opacity = Math.sin(Math.min(elapsed / ROSE_IN_MS, 1) * Math.PI / 2);
        if (movie) {
          const index = roseFrame(elapsed);
          if (index !== previous) {
            const { image, ...bounds } = movie.rasterize(index);
            frame = { ...bounds, texture: renderer.upload(image, "linear", frame?.texture) };
            previous = index;
            canvas.dataset.loadingFrame = String(index);
          }
        }
        renderer.paint(frame ? drawLayer => drawAsset(drawLayer, frame, 0, 0, 1, opacity) : null, true);
        if (elapsed >= ROSE_IN_MS) mountDestination();
        if (revealed) {
          const cleanupAt = Math.max(readyAt + ROSE_HOLD_MS, roseAt + ROSE_IN_MS);
          const exiting = Math.max(0, (timestamp - cleanupAt) / ROSE_OUT_MS);
          if (exiting >= 1) stop();
          else if (exiting > 0) canvas.style.opacity = String(Math.cos(exiting * Math.PI / 2));
        }
      }
      if (animating) request = requestAnimationFrame(draw);
    } catch (error) {
      console.warn("Source login transition unavailable", error);
      skip();
    }
  }

  stage.dataset.loginTransition = "leaving";
  signal?.addEventListener("abort", cancel, { once: true });
  void loadLoadingMovie().then(value => { movie = value; }, error => {
    if (!animating) return;
    console.warn("Source login transition unavailable", error);
    skip();
  });
  request = requestAnimationFrame(draw);
  return {
    reveal(showDestination) {
      if (signal?.aborted) cancel();
      if (!cancelled && !destination) {
        readyAt = performance.now();
        destination = showDestination;
        if (!animating) mountDestination();
      }
      return result;
    },
    get revealed() { return revealed; },
    cancel,
    skip,
  };
}

function showTitle(renderer, background, title) {
  const butterfly = title?.butterfly ?? [];
  const motion = createTitleMotion(butterfly.length);
  const start = performance.now();
  const login = document.getElementById("login");
  const news = document.getElementById("news");
  const credits = document.querySelector(".attribution");
  let pointer = null;
  let request = 0;
  let activeTransition;
  let latestMotion;
  stage.dataset.entry = "entering";

  stage.addEventListener("pointermove", event => {
    if (stage.dataset.screen !== "title") return;
    const bounds = canvas.getBoundingClientRect();
    pointer = {
      x: (event.clientX - bounds.left) * STAGE_WIDTH / bounds.width,
      y: (event.clientY - bounds.top) * STAGE_HEIGHT / bounds.height,
    };
  });

  function paintTitle(timestamp, departure = 0, frozenMotion) {
    const elapsed = Math.max(0, timestamp - start);
    const intro = reduced.matches ? 1 : Math.sin(Math.min(elapsed / TITLE_FADE_MS, 1) * Math.PI / 2);
    const faded = 1 - Math.sin(departure * Math.PI / 2);
    const state = frozenMotion ?? motion(elapsed, pointer, reduced.matches);
    latestMotion = state;
    if (stage.dataset.entry === "entering" || departure > 0) {
      login.style.opacity = String(intro * faded);
      news.style.opacity = String(intro * faded * 0.8);
      credits.style.opacity = String(intro * faded);
      if (intro === 1) stage.dataset.entry = "ready";
    }
    renderer.paint(drawLayer => {
      drawLayer(background, 0, 0, ART_WIDTH, ART_HEIGHT, intro * faded);
      if (!title) return;
      drawLayer(title.glow, 0, GLOW_TOP, ART_WIDTH, GLOW_HEIGHT, state.glowOpacity * faded);
      drawAsset(drawLayer, title.logo, 0, 0, 1, state.logoOpacity * Math.cos(departure * Math.PI / 2));
      if (state.butterfly) {
        const { x, y, frame } = state.butterfly;
        const departY = y + (-200 - y) * Math.sin(departure * (0.8 / 5) * Math.PI / 2);
        const wing = frozenMotion ? Math.floor(elapsed * 24 / 1000) % butterfly.length : frame;
        drawAsset(drawLayer, butterfly[wing], x, departY, 0.9, 1);
      }
    }, departure > 0);
    return intro;
  }
  function draw(timestamp) {
    const intro = paintTitle(timestamp);
    if (!reduced.matches && (title || intro < 1)) request = requestAnimationFrame(draw);
  }
  function stop() {
    cancelAnimationFrame(request);
  }
  function resume() {
    stop();
    if (!activeTransition && stage.dataset.screen === "title" && canvas.dataset.state === "ready") {
      request = requestAnimationFrame(draw);
    }
  }
  beginLoginTransition = signal => {
    activeTransition?.cancel();
    stop();
    const frozenMotion = latestMotion;
    activeTransition = playLoginTransition(renderer, (time, fade) => paintTitle(time, fade, frozenMotion), () => {
      activeTransition = undefined;
      login.style.opacity = "1";
      news.style.opacity = "0.8";
      credits.style.opacity = "1";
      resume();
    }, signal);
    return activeTransition;
  };
  canvas.addEventListener("webglcontextlost", () => {
    activeTransition?.skip();
    stop();
  }, { once: true });
  stage.addEventListener("game-screen-change", () => {
    pointer = null;
    if (stage.dataset.screen !== "title") credits.style.opacity = "1";
    if (stage.dataset.screen === "title" && activeTransition?.revealed) activeTransition.cancel();
    resume();
  });
  window.addEventListener("pagehide", () => {
    activeTransition?.cancel();
    stop();
  });
  window.addEventListener("pageshow", resume);
  reduced.addEventListener("change", () => {
    if (reduced.matches) activeTransition?.skip();
    resume();
  });
  resume();
}

function drawAsset(drawLayer, frame, x, y, scale, alpha) {
  drawLayer(frame.texture, x + frame.x * scale, y + frame.y * scale,
    frame.width * scale, frame.height * scale, alpha);
}

function createLogoGlow() {
  // Logo.as applies one vertical blur pass, then multiplies its alpha by strength.
  const image = document.createElement("canvas");
  image.width = 1;
  image.height = GLOW_HEIGHT;
  const context = image.getContext("2d");
  const pixels = context.createImageData(1, image.height);
  const radius = GLOW_BLUR_Y / 2;
  const taps = GLOW_BLUR_Y + 1; // Both endpoints of the 110-pixel filter span.
  const rectBottom = GLOW_RECT_Y + GLOW_RECT_HEIGHT;
  for (let row = 0; row < image.height; row += 1) {
    const y = GLOW_TOP + row + 0.5;
    const overlap = Math.min(rectBottom, y + radius) - Math.max(GLOW_RECT_Y, y - radius);
    const blurredAlpha = Math.round(255 * overlap / taps);
    const alpha = Math.min(255, blurredAlpha * GLOW_STRENGTH);
    pixels.data.set([238, 238, 238, alpha], row * 4);
  }
  context.putImageData(pixels, 0, 0);
  return image;
}

function flexGutter() {
  // Same authored Halo gray bands as the stage edge in the lobby.
  const bandEnds = [3, 48, 93, 138, 183, 228, 274, 319, 364, 409, 454, 499, 545, 590, 635, 680];
  const pixels = new ImageData(1, STAGE_HEIGHT);
  let band = 0;
  for (let row = 0; row < STAGE_HEIGHT; row += 1) {
    if (row === bandEnds[band]) band += 1;
    const gray = 15 - band;
    pixels.data.set([gray, gray, gray, 255], row * 4);
  }
  return pixels;
}

async function fetchBytes(path) {
  const response = await fetch(path, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Unable to load ${path} (${response.status})`);
  return new Uint8Array(await response.arrayBuffer());
}

async function decompressSwf(swf, capacity) {
  if (swf.length < 8 || swf.length > capacity ||
      swf[0] !== 0x43 || swf[1] !== 0x57 || swf[2] !== 0x53) {
    throw new Error("Invalid compressed SWF header");
  }
  const length = new DataView(swf.buffer).getUint32(4, true);
  if (length < 8 || length > capacity) throw new Error("Invalid SWF length");

  const movie = new Uint8Array(length);
  movie.set(swf.subarray(0, 8));
  movie[0] = 0x46; // FWS marks the decoded byte stream for the Rust tag reader.
  const reader = new Blob([swf.subarray(8)]).stream()
    .pipeThrough(new DecompressionStream("deflate")).getReader();
  let offset = 8;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.length > length) {
        await reader.cancel();
        throw new Error("Decompressed SWF exceeds the declared length");
      }
      movie.set(value, offset);
      offset += value.length;
    }
  } finally {
    reader.releaseLock();
  }
  if (offset !== length) throw new Error("Decompressed SWF is incomplete");
  return movie;
}

function createStageRenderer() {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(STAGE_WIDTH * pixelRatio);
  canvas.height = Math.round(STAGE_HEIGHT * pixelRatio);
  const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, preserveDrawingBuffer: true });
  if (!gl) throw new Error("WebGL 2 is unavailable");

  const vertex = compileShader(gl, gl.VERTEX_SHADER, `#version 300 es
    uniform vec4 bounds;
    out vec2 uv;
    void main() {
      uv = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
      vec2 position = bounds.xy + uv * bounds.zw;
      gl_Position = vec4(position.x * 2.0 - 1.0, 1.0 - position.y * 2.0, 0.0, 1.0);
    }
  `);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, `#version 300 es
    precision highp float;
    uniform sampler2D layer;
    uniform float opacity;
    in vec2 uv;
    out vec4 pixel;
    void main() {
      vec4 color = texture(layer, uv);
      pixel = vec4(color.rgb, color.a * opacity);
    }
  `);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program));
  }
  gl.useProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  const bounds = gl.getUniformLocation(program, "bounds");
  const opacity = gl.getUniformLocation(program, "opacity");
  gl.disable(gl.DITHER);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  let gutter;

  function upload(image, mode = "linear", texture = gl.createTexture()) {
    const filter = mode === "nearest" ? gl.NEAREST : gl.LINEAR;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    if (gl.getError() !== gl.NO_ERROR) throw new Error("WebGL 2 texture upload failed");
    return texture;
  }

  function draw(texture, x, y, width, height, alpha) {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform4f(bounds, x / STAGE_WIDTH, y / STAGE_HEIGHT, width / STAGE_WIDTH, height / STAGE_HEIGHT);
    gl.uniform1f(opacity, alpha);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  return { pixelRatio, upload, release: texture => gl.deleteTexture(texture), paint(drawLayers, transitionMatte = false) {
    if (transitionMatte) gl.clearColor(0, 0, 0, 1);
    else gl.clearColor(14 / 255, 12 / 255, 16 / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (transitionMatte) {
      gutter ??= upload(flexGutter(), "nearest");
      draw(gutter, ART_WIDTH, 0, STAGE_WIDTH - ART_WIDTH, STAGE_HEIGHT, 1);
    }
    drawLayers?.(draw);
  } };
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader));
  }
  return shader;
}

function reportUnavailable(error) {
  canvas.dataset.state = "error";
  stage.dataset.entry = "ready";
  reportStatus("無法載入原始背景，仍可登入。", error);
}

function reportStatus(message, error) {
  let status = document.getElementById("stage-background-status");
  if (!status) {
    status = document.createElement("p");
    status.id = "stage-background-status";
    status.setAttribute("role", "status");
    canvas.after(status);
  }
  status.textContent = message;
  status.hidden = false;
  if (error) console.warn("Source background unavailable", error);
}
