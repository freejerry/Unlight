const vertexSource = `#version 300 es
out vec2 uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const fragmentSource = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 color;
uniform float time;
uniform float aspect;
uniform float current;
uniform float flash;
uniform vec3 flashColor;

void main() {
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
  float d = length(p);
  float angle = atan(p.y, p.x);
  float rings = (1.0 - smoothstep(0.0, 0.025, abs(sin(d * 17.5)))) * (1.0 - smoothstep(0.12, 0.54, d));
  float sweepAngle = fract((angle + 6.283 + time * 0.22) / 6.283);
  float sweep = exp(-sweepAngle * 37.0) * (1.0 - smoothstep(0.03, 0.54, d));
  float waves = sin(p.y * 24.0 + sin(p.x * 5.0 - time * 0.35) * 2.5 + time * 0.41);
  float crests = smoothstep(0.82, 1.0, waves) * (0.35 + 0.65 * sin(p.x * 3.0 + time * 0.16) * sin(p.x * 3.0 + time * 0.16));
  vec3 aqua = vec3(0.33, 0.76, 0.73);
  float signal = 0.19 * rings + mix(0.035, 0.2, current) * sweep + 0.075 * crests;
  float impact = flash * (0.09 + 0.29 * exp(-abs(d - (1.0 - flash) * 0.5) * 26.0));
  float alpha = signal + impact;
  color = vec4(mix(aqua, flashColor, impact / max(alpha, 0.001)), alpha);
}`;

export type Ocean = {
  setActive(active: boolean): void;
  pulse(kind: string): void;
};

const palette: Partial<Record<string, [number, number, number]>> = {
  attack: [0.97, 0.61, 0.32],
  repair: [0.43, 0.91, 0.67],
  guard: [0.38, 0.80, 0.98],
  surge: [0.75, 0.62, 0.95],
};
const teal: [number, number, number] = [0.45, 0.86, 0.82];

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  const label = type === gl.VERTEX_SHADER ? 'vertex' : 'fragment';
  if (!shader) {
    console.warn(`WebGL2: could not allocate ${label} shader.`);
    return null;
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  console.warn(`WebGL2: ${label} shader compilation failed.`, gl.getShaderInfoLog(shader));
  gl.deleteShader(shader);
  return null;
}

function createProgram(gl: WebGL2RenderingContext) {
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (program && vertex && fragment) {
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
  }
  if (vertex) gl.deleteShader(vertex);
  if (fragment) gl.deleteShader(fragment);
  if (program && gl.getProgramParameter(program, gl.LINK_STATUS)) return program;
  if (program) {
    if (vertex && fragment) console.warn('WebGL2: shader program failed to link.', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
  } else {
    console.warn('WebGL2: could not allocate the shader program.');
  }
  return null;
}

function buildSurface(canvas: HTMLCanvasElement) {
  let gl: WebGL2RenderingContext | null;
  try {
    gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false, antialias: false, depth: false });
  } catch (error) {
    canvas.dataset.rendererError = 'context';
    console.warn('WebGL2: browser refused context creation.', error);
    return null;
  }
  if (!gl) {
    canvas.dataset.rendererError = 'context';
    console.warn('WebGL2: no context available; using CSS surfaces.');
    return null;
  }

  const program = createProgram(gl);
  if (!program) {
    canvas.dataset.rendererError = 'program';
    return null;
  }
  delete canvas.dataset.rendererError;
  gl.useProgram(program);
  const time = gl.getUniformLocation(program, 'time');
  const aspect = gl.getUniformLocation(program, 'aspect');
  const current = gl.getUniformLocation(program, 'current');
  const flash = gl.getUniformLocation(program, 'flash');
  const flashColor = gl.getUniformLocation(program, 'flashColor');

  return (seconds: number, active: boolean, strength: number, tint: [number, number, number]) => {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.uniform1f(time, seconds);
    gl.uniform1f(aspect, width / height);
    gl.uniform1f(current, active ? 1 : 0);
    gl.uniform1f(flash, strength);
    gl.uniform3f(flashColor, ...tint);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
}

export function startOcean(canvas: HTMLCanvasElement): Ocean {
  canvas.addEventListener('webglcontextcreationerror', (event) => {
    const details = (event as WebGLContextEvent).statusMessage;
    console.warn('WebGL2: context creation error.', details);
  });
  let draw = buildSurface(canvas);
  let frame = 0;
  let active = false;
  let flashedAt = -Infinity;
  let tint = teal;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const start = performance.now();

  const render = (now: number) => {
    frame = 0;
    if (!draw) return;
    const seconds = reducedMotion.matches ? 0 : (now - start) / 1000;
    const strength = reducedMotion.matches ? 0 : Math.max(0, 1 - (now - flashedAt) / 800);
    draw(seconds, active, strength, tint);
    if (!reducedMotion.matches) frame = requestAnimationFrame(render);
  };

  const requestRender = () => {
    if (!frame && draw) frame = requestAnimationFrame(render);
  };

  canvas.dataset.renderer = draw ? 'webgl2' : 'css';
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    cancelAnimationFrame(frame);
    frame = 0;
    draw = null;
    canvas.dataset.renderer = 'css';
    canvas.dataset.rendererError = 'context-lost';
  });
  canvas.addEventListener('webglcontextrestored', () => {
    draw = buildSurface(canvas);
    canvas.dataset.renderer = draw ? 'webgl2' : 'css';
    requestRender();
  });
  reducedMotion.addEventListener('change', requestRender);
  new ResizeObserver(requestRender).observe(canvas);
  requestRender();

  return {
    setActive(next) {
      active = next;
      requestRender();
    },
    pulse(kind) {
      tint = palette[kind] ?? teal;
      flashedAt = performance.now();
      requestRender();
    },
  };
}
