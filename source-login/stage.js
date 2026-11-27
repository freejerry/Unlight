const STAGE_WIDTH = 780;
const STAGE_HEIGHT = 680;
const ART_WIDTH = 760;
const ART_HEIGHT = 680;
const canvas = document.getElementById("stage-background");

if (canvas) {
  canvas.dataset.state = "loading";
  loadBackground().catch(reportUnavailable);
  canvas.addEventListener("webglcontextlost", () => reportUnavailable());
}

async function loadBackground() {
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
    drawBackground(bitmap);
  } finally {
    bitmap.close();
  }
  canvas.dataset.state = "ready";
}

async function fetchBytes(path) {
  const response = await fetch(path);
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

function drawBackground(bitmap) {
  canvas.width = STAGE_WIDTH;
  canvas.height = STAGE_HEIGHT;
  const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, preserveDrawingBuffer: true });
  if (!gl) throw new Error("WebGL 2 is unavailable");

  const vertex = compileShader(gl, gl.VERTEX_SHADER, `#version 300 es
    out vec2 uv;
    void main() {
      vec2 p = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
      gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
      uv = vec2(p.x, 1.0 - p.y);
    }
  `);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, `#version 300 es
    precision highp float;
    uniform sampler2D background;
    in vec2 uv;
    out vec4 pixel;
    void main() {
      pixel = texture(background, uv);
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

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
  gl.disable(gl.DITHER);
  gl.clearColor(14 / 255, 12 / 255, 16 / 255, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.viewport(0, STAGE_HEIGHT - ART_HEIGHT, ART_WIDTH, ART_HEIGHT);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  if (gl.getError() !== gl.NO_ERROR) throw new Error("WebGL 2 background drawing failed");
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
  let status = document.getElementById("stage-background-status");
  if (!status) {
    status = document.createElement("p");
    status.id = "stage-background-status";
    status.setAttribute("role", "status");
    canvas.after(status);
  }
  status.textContent = "無法載入原始背景，仍可登入。";
  status.hidden = false;
  if (error) console.warn("Source background unavailable", error);
}
