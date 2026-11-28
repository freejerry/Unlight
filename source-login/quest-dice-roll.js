import { BATTLE_CARD_ART, battleExchangeArt } from './battle-card.js';

const width = 780;
const height = 680;
const duration = 500;
const stagger = 50;
const focus = 500;
const zoom = .8;
const eyes = [2, 3, 4, 5, 6, 1, 7, 2];
const eyeRotation = [[0, -90], [0, 0], [-90, 0], [90, 0], [180, 0], [0, 90]];

const vertex = `#version 300 es
layout(location=0) in vec3 position;
layout(location=1) in vec2 coord;
uniform mat3 diceRoot, rotation, inverseCamera;
uniform vec3 world, camera;
uniform vec2 centre, halfStage;
uniform float lens;
out vec2 weightedUV;
out float weight;
void main() {
  vec3 model = diceRoot * vec3(-position.x, position.y, position.z);
  vec3 view = inverseCamera * (rotation * model + world - camera);
  float near = .01;
  float far = 5000.;
  vec2 clip = (centre * view.z + lens * view.xy) / halfStage;
  float depth = ((far + near) * view.z - 2. * far * near) / (far - near);
  gl_Position = vec4(clip, depth, view.z);
  // Papervision's BitmapMaterial maps each projected triangle affinely.
  weightedUV = vec2(coord.x, 1. - coord.y) * view.z;
  weight = view.z;
}`;

const fragment = `#version 300 es
precision highp float;
in vec2 weightedUV;
in float weight;
uniform sampler2D artwork;
out vec4 color;
void main() {
  color = texture(artwork, weightedUV / weight);
}`;

/** Convert an original wire result to the corresponding Flash die eye. */
export function questDiceEye(value) {
  return Number.isInteger(value) ? eyes[value] : undefined;
}

// Papervision DisplayObject3D feeds (Y, Z, X) into Quaternion.setFromEuler.
function orientation(x, y, z, inverse = false) {
  const radians = Math.PI / 360;
  const sx = Math.sin(x * radians), cx = Math.cos(x * radians);
  const sy = Math.sin(y * radians), cy = Math.cos(y * radians);
  const sz = Math.sin(z * radians), cz = Math.cos(z * radians);
  const qx = sx * cy * cz - cx * sy * sz;
  const qy = cx * sy * cz + sx * cy * sz;
  const qz = cx * cy * sz - sx * sy * cz;
  const qw = cx * cy * cz + sx * sy * sz;
  const m11 = 1 - 2 * (qy * qy + qz * qz);
  const m12 = 2 * (qx * qy - qz * qw);
  const m13 = 2 * (qx * qz + qy * qw);
  const m21 = 2 * (qx * qy + qz * qw);
  const m22 = 1 - 2 * (qx * qx + qz * qz);
  const m23 = 2 * (qy * qz - qx * qw);
  const m31 = 2 * (qx * qz - qy * qw);
  const m32 = 2 * (qy * qz + qx * qw);
  const m33 = 1 - 2 * (qx * qx + qy * qy);
  return inverse ? [m11, m12, m13, m21, m22, m23, m31, m32, m33]
    : [m11, m21, m31, m12, m22, m32, m13, m23, m33];
}

function bounce(t) {
  if (t < 1 / 2.75) return 7.5625 * t * t;
  if (t < 2 / 2.75) return 7.5625 * (t - 1.5 / 2.75) ** 2 + .75;
  if (t < 2.5 / 2.75) return 7.5625 * (t - 2.25 / 2.75) ** 2 + .9375;
  return 7.5625 * (t - 2.625 / 2.75) ** 2 + .984375;
}

function diceForSide(values, type) {
  return values.map((raw, i) => {
    const eye = questDiceEye(raw);
    const special = eye > 6;
    const [rx, rz] = eyeRotation[(special ? 6 : eye) - 1];
    return {
      material: special ? `${type}Special` : type,
      delay: i * stagger,
      rx, ry: eye === 1 || eye >= 6 ? 0 : Math.random() * 360, rz,
      startZ: Math.random() * 50,
      x: Math.random() * 10 + i / 3 * 20,
      z: Math.random() * 10 + i % 3 * 20,
      sounded: false,
    };
  });
}

async function decodeTexture(file) {
  if (typeof file !== 'string' || !/^dice-roll-[a-z]+\.png$/.test(file)) throw new Error('Invalid dice texture');
  const image = new Image();
  image.src = BATTLE_CARD_ART + file;
  await image.decode();
  return image;
}

function initialize(gl, { mesh }, materials, dispose) {
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    dispose.push(() => gl.deleteShader(shader));
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('Dice shader unavailable');
    return shader;
  };
  const program = gl.createProgram();
  dispose.push(() => gl.deleteProgram(program));
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Dice program unavailable');
  gl.useProgram(program);

  function buffer(target, data) {
    const id = gl.createBuffer();
    dispose.push(() => gl.deleteBuffer(id));
    gl.bindBuffer(target, id);
    gl.bufferData(target, data, gl.STATIC_DRAW);
  }

  const vao = gl.createVertexArray();
  dispose.push(() => gl.deleteVertexArray(vao));
  gl.bindVertexArray(vao);
  buffer(gl.ARRAY_BUFFER, new Float32Array(mesh.positions));
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  buffer(gl.ARRAY_BUFFER, new Float32Array(mesh.uv));
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
  buffer(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(mesh.indices));

  const textures = new Map(materials.map(([name, image]) => {
    const texture = gl.createTexture();
    dispose.push(() => gl.deleteTexture(texture));
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    return [name, texture];
  }));

  const uniforms = Object.fromEntries(['diceRoot', 'rotation', 'inverseCamera', 'world', 'camera', 'centre', 'halfStage', 'lens']
    .map(name => [name, gl.getUniformLocation(program, name)]));
  gl.uniformMatrix3fv(uniforms.diceRoot, false, orientation(-90, 180, 0));
  gl.uniformMatrix3fv(uniforms.inverseCamera, false, orientation(60, 90, 0, true));
  gl.uniform3f(uniforms.camera, -10, 120, 50);
  gl.uniform2f(uniforms.halfStage, width / 2, height / 2);
  gl.uniform1f(uniforms.lens, focus * zoom);
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0, 0, 0, 0);
  gl.viewport(0, 0, width, height);
  return (side, elapsed, onThrow, signal) => {
    if (signal?.aborted) return;
    gl.uniform2f(uniforms.centre, side.x, -side.y);
    gl.scissor(Math.max(0, side.x), Math.max(0, -side.y), width - Math.abs(side.x), height - Math.abs(side.y));
    for (const die of side.dice) {
      if (elapsed < die.delay) continue;
      if (!die.sounded) {
        die.sounded = true;
        onThrow?.();
        if (signal?.aborted) return;
      }
      const t = Math.min(1, (elapsed - die.delay) / duration);
      const slide = Math.sin(t * Math.PI / 2);
      const turn = t < .5 ? (1 - bounce(1 - 2 * t)) / 2 : (1 + bounce(2 * t - 1)) / 2;
      gl.uniform3f(uniforms.world, die.x * slide, 160 * (1 - bounce(t)), die.startZ + (die.z - die.startZ) * slide);
      gl.uniformMatrix3fv(uniforms.rotation, false,
        orientation(600 + (die.rx - 600) * turn, die.ry * turn, 600 + (die.rz - 600) * turn));
      gl.bindTexture(gl.TEXTURE_2D, textures.get(die.material));
      gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
    }
  };
}

/** Render the original DAE mesh with the supplied SC56 eyes and attack side. */
export async function playQuestDiceRoll(canvas, { playerDice, foeDice, playerAttacks }, { signal, onThrow } = {}) {
  if (signal?.aborted || typeof playerAttacks !== 'boolean' || ![playerDice, foeDice].every(list => Array.isArray(list)
      && list.length > 0 && list.every(value => questDiceEye(value) !== undefined))) return false;
  const sides = [
    { dice: diceForSide(playerDice, playerAttacks ? 'attack' : 'defense'), x: -330, y: 20 },
    { dice: diceForSide(foeDice, playerAttacks ? 'defense' : 'attack'), x: 120, y: -20 },
  ];
  const dispose = [];
  try {
    const index = (await battleExchangeArt(signal))?.diceRoll;
    if (!index || signal?.aborted) return false;
    const used = new Set(sides.flatMap(side => side.dice.map(die => die.material)));
    const materials = await Promise.all([...used].map(async name => [name, await decodeTexture(index.textures[name])]));
    if (signal?.aborted) return false;
    canvas.width = width;
    canvas.height = height;
    const gl = canvas.getContext('webgl2', { alpha: true, preserveDrawingBuffer: true });
    if (!gl) {
      canvas.dataset.state = 'unavailable';
      return false;
    }
    const draw = initialize(gl, index, materials, dispose);
    const stopAt = duration + Math.max(0, Math.max(playerDice.length, foeDice.length) - 1) * stagger;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    canvas.dataset.state = 'rolling';
    const completed = await new Promise(resolve => {
      let start;
      let frame;
      function finish(result) {
        signal?.removeEventListener('abort', cancel);
        resolve(result);
      }
      function cancel() {
        cancelAnimationFrame(frame);
        finish(false);
      }
      function tick(now) {
        if (signal?.aborted || gl.isContextLost()) return finish(false);
        start ??= now;
        const elapsed = reduced ? stopAt : Math.min(stopAt, now - start);
        try {
          canvas.style.opacity = String(Math.sin(Math.min(1, elapsed / duration) * Math.PI / 2));
          gl.disable(gl.SCISSOR_TEST);
          gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
          gl.enable(gl.SCISSOR_TEST);
          for (const side of sides) draw(side, elapsed, onThrow, signal);
        } catch {
          return finish(false);
        }
        if (signal?.aborted) return finish(false);
        if (elapsed >= stopAt) return finish(true);
        frame = requestAnimationFrame(tick);
      }
      signal?.addEventListener('abort', cancel, { once: true });
      frame = requestAnimationFrame(tick);
    });
    canvas.dataset.state = completed ? 'settled' : (signal?.aborted ? 'cancelled' : 'unavailable');
    return completed;
  } catch {
    canvas.dataset.state = signal?.aborted ? 'cancelled' : 'unavailable';
    return false;
  } finally {
    for (const release of dispose.reverse()) release();
  }
}
