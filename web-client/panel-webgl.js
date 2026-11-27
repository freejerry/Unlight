import { panelLayout } from './panel.js';

const VERTEX_SOURCE = `#version 300 es
layout(location=0) in vec2 aPosition;
layout(location=1) in vec2 aTexture;
uniform vec2 uSize;
out vec2 vTexture;
void main() {
  vec2 point = aPosition / uSize;
  gl_Position = vec4(point.x * 2.0 - 1.0, 1.0 - point.y * 2.0, 0.0, 1.0);
  vTexture = aTexture;
}`;

const FRAGMENT_SOURCE = `#version 300 es
precision highp float;
uniform sampler2D uImage;
in vec2 vTexture;
out vec4 color;
void main() {
  color = texture(uImage, vTexture);
}`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Unable to create a panel shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    throw new Error('Unable to compile a panel shader');
  }
  return shader;
}

function createProgram(gl) {
  const program = gl.createProgram();
  if (!program) throw new Error('Unable to create the panel shader program');
  let vertex;
  let fragment;
  try {
    vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
    fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE);
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error('Unable to link the panel shader program');
    }
    return program;
  } catch (error) {
    gl.deleteProgram(program);
    throw error;
  } finally {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
  }
}

function growExtent(current, required, maximum) {
  return Math.min(maximum, Math.max(required, Math.ceil(current * 1.25)));
}

export function createWebGLPanelRenderer(onContextLost) {
  const surface = document.createElement('canvas');
  surface.width = 1;
  surface.height = 1;
  const gl = surface.getContext('webgl2', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: true,
  });
  if (!gl) throw new Error('WebGL2 is unavailable');

  const program = createProgram(gl);
  const buffer = gl.createBuffer();
  const texture = gl.createTexture();
  if (!buffer || !texture) {
    gl.deleteBuffer(buffer);
    gl.deleteTexture(texture);
    gl.deleteProgram(program);
    throw new Error('Unable to allocate WebGL panel resources');
  }
  gl.useProgram(program);
  const sizeUniform = gl.getUniformLocation(program, 'uSize');
  gl.uniform1i(gl.getUniformLocation(program, 'uImage'), 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.disable(gl.DITHER);
  gl.enable(gl.SCISSOR_TEST);
  const [viewportWidth, viewportHeight] = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
  const maxSurfaceSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
  const maxWidth = Math.min(viewportWidth, maxSurfaceSize);
  const maxHeight = Math.min(viewportHeight, maxSurfaceSize);
  let uploadedImage;
  let uploadedSource;
  let disposed = false;

  function handleLoss() {
    onContextLost?.();
  }
  surface.addEventListener('webglcontextlost', handleLoss);

  function drawPanels(panels, image, guides, pixelRatio) {
    if (panels.length === 0) return;
    if (disposed || gl.isContextLost()) throw new Error('WebGL panel context is unavailable');
    const output = [];
    const vertices = [];
    let batchWidth = 0;
    let batchHeight = 0;
    for (const { canvas, width, height } of panels) {
      const { pixelWidth, pixelHeight, imageWidth, imageHeight, slices } =
        panelLayout(image, width, height, guides, pixelRatio);
      const offsetY = batchHeight;
      batchWidth = Math.max(batchWidth, pixelWidth);
      batchHeight += pixelHeight;
      if (batchWidth > maxWidth || batchHeight > maxHeight) {
        throw new RangeError('Panel batch exceeds the WebGL viewport limit');
      }

      for (const { source: [sx, sy, sw, sh], destination: [dx, dy, dw, dh] } of slices) {
        const u0 = sx / imageWidth;
        const v0 = sy / imageHeight;
        const u1 = (sx + sw) / imageWidth;
        const v1 = (sy + sh) / imageHeight;
        const y0 = offsetY + dy;
        const x1 = dx + dw;
        const y1 = y0 + dh;
        vertices.push(
          dx, y0, u0, v0, x1, y0, u1, v0, dx, y1, u0, v1,
          dx, y1, u0, v1, x1, y0, u1, v0, x1, y1, u1, v1,
        );
      }
      output.push({ canvas, pixelWidth, pixelHeight, offsetY });
    }

    if (surface.width < batchWidth) surface.width = growExtent(surface.width, batchWidth, maxWidth);
    if (surface.height < batchHeight) surface.height = growExtent(surface.height, batchHeight, maxHeight);
    if (gl.drawingBufferWidth !== surface.width || gl.drawingBufferHeight !== surface.height) {
      throw new Error('Unable to resize the WebGL panel surface');
    }

    const source = image.currentSrc;
    // Decoded gallery images reuse their texture. Sources without a URL are uploaded per batch.
    if (!source || uploadedImage !== image || uploadedSource !== source) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      uploadedImage = image;
      uploadedSource = source;
    }

    gl.viewport(0, 0, batchWidth, batchHeight);
    gl.scissor(0, 0, batchWidth, batchHeight);
    gl.uniform2f(sizeUniform, batchWidth, batchHeight);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 4);
    if (gl.getError() !== gl.NO_ERROR || gl.isContextLost()) {
      uploadedImage = null;
      throw new Error('Unable to render the WebGL panel batch');
    }

    // WebGL draws from the bottom-left; Canvas2D crops from the top-left of the full surface.
    const batchTop = surface.height - batchHeight;
    for (const { canvas, pixelWidth, pixelHeight, offsetY } of output) {
      const resized = canvas.width !== pixelWidth || canvas.height !== pixelHeight;
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas2D is unavailable for panel output');
      if (!resized) {
        if (typeof context.reset === 'function') context.reset();
        else canvas.width = pixelWidth;
      }
      context.drawImage(surface, 0, batchTop + offsetY, pixelWidth, pixelHeight,
        0, 0, pixelWidth, pixelHeight);
    }
  }

  return {
    drawPanels,
    dispose() {
      if (disposed) return;
      disposed = true;
      surface.removeEventListener('webglcontextlost', handleLoss);
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      uploadedImage = null;
    },
  };
}
