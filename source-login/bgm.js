const stage = document.getElementById("stage");
const defaultVolume = 0.5; // Original Option.as defaults BGM and SE volume to 50.
const music = titleAudio("/public/sound/bgm/ulbgm01.mp3");
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
let alertPlayback;
const entryObserver = new MutationObserver(playAtTitle);

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

function playAudio(audio) {
  void audio.play().catch(reportAudioError);
}

function playAtTitle() {
  if (!active || (stage.dataset.entry !== "entering" && stage.dataset.entry !== "ready")) return;
  entryObserver.disconnect();
  if (music.paused && !music.error) playAudio(music);
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
  playAtTitle();
}

function playOnGesture(event) {
  if (event.isTrusted) playAtTitle();
}

window.addEventListener("pointerdown", playOnGesture, true);
window.addEventListener("keydown", playOnGesture, true);
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
