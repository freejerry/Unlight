const stage = document.getElementById("stage");
const defaultVolume = 0.5; // Original Option.as defaults BGM and SE volume to 50.
const theme = "/public/sound/bgm/ulbgm01.mp3";
const sceneTracks = {
  tutorial: "/public/sound/bgm/bgm011.mp3",
  lobby: "/public/sound/bgm/ulbgm02.mp3",
};
const music = titleAudio(theme);
const clickSound = titleAudio("/public/sound/se/ulse01.mp3");
const alertBytes = fetch("/public/sound/se/ulse02.mp3", { redirect: "error" })
  .then(response => {
    if (!response.ok) throw new Error(`Title alert returned HTTP ${response.status}`);
    return response.arrayBuffer();
  }).catch(error => {
    reportAudioError(error);
    return null;
  });
music.hidden = true;
music.loop = true;
stage.append(music);

let active = true;
let musicOutput;
let warmingMusic = false;
let musicRequest = 0;
let alertPlayback;
const entryObserver = new MutationObserver(playSceneMusic);

function titleAudio(path) {
  const audio = document.createElement("audio");
  audio.preload = "auto";
  audio.volume = defaultVolume;
  audio.src = path;
  return audio;
}

function reportAudioError(error) {
  if (error.name !== "NotAllowedError" && error.name !== "AbortError") {
    console.warn("Title audio unavailable", error);
  }
}

function playAudio(audio, onPlaying, onError = reportAudioError) {
  try {
    void Promise.resolve(audio.play()).then(onPlaying).catch(onError);
  } catch (error) {
    onError(error);
  }
}

function sceneEntered() {
  return stage.dataset.screen !== "title" || stage.dataset.entry === "entering" || stage.dataset.entry === "ready";
}

function confirmMusicPlaying() {
  if (!active || !sceneEntered() || music.paused || music.seeking || music.readyState < music.HAVE_FUTURE_DATA) return;
  if (musicOutput) {
    if (musicOutput.context.state !== "running") return;
    musicOutput.gain.gain.value = defaultVolume;
  }
  stage.dataset.musicState = "playing";
}

function requestMusic() {
  const request = ++musicRequest;
  const entered = sceneEntered();
  playAudio(music, confirmMusicPlaying, error => {
    if (!active || request !== musicRequest) return;
    if (entered && error.name === "NotAllowedError") stage.dataset.musicState = "blocked";
    reportAudioError(error);
  });
}

function playSceneMusic() {
  if (!active || !sceneEntered()) return;
  entryObserver.disconnect();
  const wasWarming = warmingMusic;
  warmingMusic = false;
  const path = sceneTracks[stage.dataset.soundscape] ?? theme;
  if (music.getAttribute("src") !== path) {
    musicRequest += 1;
    music.pause();
    music.src = path;
    delete stage.dataset.musicState;
  } else if (wasWarming) {
    music.currentTime = 0;
  }
  resumeMusicOutput();
  if ((music.paused || wasWarming) && !music.error) requestMusic();
}

function warmMusic() {
  if (music.error || typeof AudioContext !== "function") return;
  if (!musicOutput) {
    // Attenuate in the audio graph so an early gesture stays silent on iOS too.
    let context;
    try {
      context = new AudioContext();
      const gain = context.createGain();
      gain.gain.value = 0;
      gain.connect(context.destination);
      void context.resume().catch(reportAudioError);
      context.createMediaElementSource(music).connect(gain);
      music.volume = 1;
      musicOutput = { context, gain };
      context.addEventListener("statechange", confirmMusicPlaying);
    } catch (error) {
      void context?.close().catch(reportAudioError);
      reportAudioError(error);
      return;
    }
  } else {
    resumeMusicOutput();
  }
  warmingMusic = true;
  if (music.paused) requestMusic();
}

function resumeMusicOutput() {
  const context = musicOutput?.context;
  if (!context || context.state === "running") return;
  try {
    void context.resume().catch(reportAudioError);
  } catch (error) {
    reportAudioError(error);
  }
}

function armTitleAlert() {
  if (alertPlayback || typeof AudioContext !== "function") return;

  const context = new AudioContext();
  const gain = context.createGain();
  gain.gain.value = defaultVolume;
  gain.connect(context.destination);
  // The login reply can arrive after the button's browser activation expires.
  const buffer = Promise.all([
    context.resume(),
    alertBytes.then(bytes => bytes && context.decodeAudioData(bytes.slice(0))),
  ]).then(([, decoded]) => decoded).catch(error => {
    if (alertPlayback?.context === context) reportAudioError(error);
    return null;
  });
  alertPlayback = { context, gain, buffer };
}

export function playTitleAlert() {
  const playback = alertPlayback;
  if (!active || !playback) return;
  void playback.buffer.then(buffer => {
    if (playback !== alertPlayback || !buffer) return;
    const sound = playback.context.createBufferSource();
    sound.buffer = buffer;
    sound.connect(playback.gain);
    sound.onended = () => sound.disconnect();
    sound.start();
  }).catch(reportAudioError);
}

function watchEntry() {
  entryObserver.observe(stage, { attributes: true, attributeFilter: ["data-entry"] });
  playSceneMusic();
}

function playOnGesture(event) {
  if (!active || !event.isTrusted) return;
  if (event.type === "pointerdown" && event.pointerType !== "mouse") return;
  if (event.type === "pointerup" && event.pointerType === "mouse") return;
  if (sceneEntered()) playSceneMusic();
  else if (navigator.userActivation?.isActive !== false) warmMusic();
}

for (const event of ["pointerdown", "pointerup", "touchend", "keydown", "click"]) {
  window.addEventListener(event, playOnGesture, { capture: true, passive: true });
}
music.addEventListener("playing", confirmMusicPlaying);
music.addEventListener("seeked", confirmMusicPlaying);
stage.addEventListener("game-screen-change", playSceneMusic);
document.getElementById("login-submit").addEventListener("click", event => {
  if (!active || !event.isTrusted) return;
  try {
    armTitleAlert();
  } catch (error) {
    reportAudioError(error);
  }
  if (!clickSound.error) {
    clickSound.currentTime = 0;
    playAudio(clickSound);
  }
});
window.addEventListener("pagehide", () => {
  active = false;
  musicRequest += 1;
  warmingMusic = false;
  delete stage.dataset.musicState;
  if (musicOutput) musicOutput.gain.gain.value = 0;
  entryObserver.disconnect();
  music.pause();
  clickSound.pause();
  const playback = alertPlayback;
  alertPlayback = null;
  void playback?.context.close().catch(reportAudioError);
});
window.addEventListener("pageshow", event => {
  if (event.persisted) {
    active = true;
    watchEntry();
  }
});

watchEntry();
