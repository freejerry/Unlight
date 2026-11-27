import { decodeVectorMovie, parseVectorMovie } from "./swf-vector.js";
import { createTitleMotion } from "./title-motion.js";

const STAGE_WIDTH = 780;
const STAGE_HEIGHT = 680;
const ART_WIDTH = 760;
const ART_HEIGHT = 680;
const canvas = document.getElementById("stage-background");
const stage = document.getElementById("stage");
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

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
      const movie = parseVectorMovie(await loadVector("loading.swf"));
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

async function loadTitle(renderer) {
  const loadFrames = async filename => {
    const movie = await loadVector(filename);
    return decodeVectorMovie(movie).frames.map(({ image, ...frame }) => ({
      ...frame,
      texture: renderer.upload(image),
    }));
  };
  const [logo, butterfly] = await Promise.all([loadFrames("logo.swf"), loadFrames("ageha.swf")]);
  if (logo.length !== 1 || butterfly.length !== 4) throw new Error("Unexpected title asset timeline");
  return { logo: logo[0], butterfly, glow: renderer.upload(createLogoGlow()) };
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
      const index = Math.floor(elapsed * 24 / 1000) % movie.frameCount;
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

function showTitle(renderer, background, title) {
  const butterfly = title?.butterfly ?? [];
  const motion = createTitleMotion(butterfly.length);
  const start = performance.now();
  const login = document.getElementById("login");
  const news = document.getElementById("news");
  const credits = document.querySelector(".attribution");
  let pointer = null;
  let request = 0;
  stage.dataset.entry = "entering";

  stage.addEventListener("pointermove", event => {
    const bounds = canvas.getBoundingClientRect();
    pointer = {
      x: (event.clientX - bounds.left) * STAGE_WIDTH / bounds.width,
      y: (event.clientY - bounds.top) * STAGE_HEIGHT / bounds.height,
    };
  });

  function draw(timestamp) {
    const elapsed = Math.max(0, timestamp - start);
    const intro = reduced.matches ? 1 : Math.sin(Math.min(elapsed / (800 / 1.7), 1) * Math.PI / 2);
    const state = motion(elapsed, pointer, reduced.matches);
    if (stage.dataset.entry === "entering") {
      login.style.opacity = String(intro);
      news.style.opacity = String(intro * 0.8);
      credits.style.opacity = String(intro);
      if (intro === 1) stage.dataset.entry = "ready";
    }
    renderer.paint(drawLayer => {
      drawLayer(background, 0, 0, ART_WIDTH, ART_HEIGHT, intro);
      if (!title) return;
      drawLayer(title.glow, 0, 285, ART_WIDTH, 160, state.glowOpacity);
      drawAsset(drawLayer, title.logo, 390, 370, 0.7, state.logoOpacity);
      if (state.butterfly) {
        const { x, y, frame } = state.butterfly;
        drawAsset(drawLayer, butterfly[frame], x, y, 0.9, 1);
      }
    });
    if (!reduced.matches && (title || intro < 1)) request = requestAnimationFrame(draw);
  }
  function stop() {
    cancelAnimationFrame(request);
  }
  function resume() {
    stop();
    if (canvas.dataset.state === "ready") request = requestAnimationFrame(draw);
  }
  canvas.addEventListener("webglcontextlost", stop, { once: true });
  window.addEventListener("pagehide", stop);
  window.addEventListener("pageshow", resume);
  reduced.addEventListener("change", resume);
  resume();
}

function drawAsset(drawLayer, frame, x, y, scale, alpha) {
  drawLayer(frame.texture, x + frame.x * scale, y + frame.y * scale,
    frame.width * scale, frame.height * scale, alpha);
}

function createLogoGlow() {
  // Logo.as applies a vertical GlowFilter to a 760 × 50 rectangle at y=340.
  const image = document.createElement("canvas");
  image.width = 1;
  image.height = 160;
  const context = image.getContext("2d");
  const glow = context.createLinearGradient(0, 0, 0, image.height);
  glow.addColorStop(0, "rgba(238, 238, 238, 0)");
  glow.addColorStop(55 / 160, "#eee");
  glow.addColorStop(105 / 160, "#eee");
  glow.addColorStop(1, "rgba(238, 238, 238, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, image.width, image.height);
  return image;
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
  canvas.width = STAGE_WIDTH;
  canvas.height = STAGE_HEIGHT;
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
  gl.clearColor(14 / 255, 12 / 255, 16 / 255, 1);

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

  return { upload, release: texture => gl.deleteTexture(texture), paint(drawLayers) {
    gl.clear(gl.COLOR_BUFFER_BIT);
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
