import { getPreferences, subscribePreferences } from "./preferences.js";

const stage = document.getElementById("stage");
const theme = "/public/sound/bgm/ulbgm01.mp3";
const sceneTracks = {
  tutorial: "/public/sound/bgm/bgm011.mp3",
  lobby: "/public/sound/bgm/ulbgm02.mp3",
  quest: "/public/sound/bgm/ulbgm03.mp3",
};
// DuelBGM.as uses the same castle track for stage IDs 0, 10, and 11.
const duelTracks = ["000", "001", "002", "003", "004", "005", "006", "007", "008", "009", "000", "000", "010"];
const questCueFiles = new Map([
  ["deal", "ulse06.mp3"], ["dice", "ulse07.mp3"], ["rotate", "ulse08.mp3"],
  ["slash", "ulse09.mp3"], ["bullet", "ulse10_f.mp3"], ["phase", "ulse12.mp3"],
  ["lose", "ulse15.mp3"], ["win", "ulse16.mp3"],
  ["bonus-select", "ulse17.mp3"], ["bonus-success", "ulse18.mp3"], ["bonus-failure", "ulse19.mp3"],
  ["flip", "ulse23.mp3"],
  ["reveal-locked", "ulse28.mp3"], ["reveal", "ulse29.mp3"],
]);
const questCueAudio = new Map();
const playingQuestCues = new Map();
let duelTrack = duelTracks[0];
const titleMusic = createAudio(theme, audioVolume("bgm"));
const clickSound = createAudio("/public/sound/se/ulse01.mp3", audioVolume("se"));
const alertBytes = fetch("/public/sound/se/ulse02.mp3", { redirect: "error" })
  .then(response => {
    if (!response.ok) throw new Error(`Title alert returned HTTP ${response.status}`);
    return response.arrayBuffer();
  }).catch(error => {
    reportAudioError(error);
    return null;
  });
let music = titleMusic;
let active = true;
let musicContext;
const musicOutputs = new WeakMap();
const sceneFades = new Map();
let titleFade;
let warmingMusic = false;
let musicRequest = 0;
let alertPlayback;
const entryObserver = new MutationObserver(playSceneMusic);

function audioVolume(key) {
  return getPreferences()[key] / 100;
}

function createAudio(path, volume) {
  const audio = document.createElement("audio");
  audio.preload = "auto";
  audio.volume = volume;
  audio.src = path;
  return audio;
}

function mountMusic(audio, scene) {
  audio.hidden = true;
  audio.loop = true;
  audio.dataset.bgmScene = scene;
  audio.addEventListener("playing", () => confirmMusicPlaying(audio));
  audio.addEventListener("seeked", () => confirmMusicPlaying(audio));
  stage.prepend(audio);
}

function connectMusic(audio, volume) {
  const gain = musicContext.createGain();
  gain.gain.value = volume;
  const source = musicContext.createMediaElementSource(audio);
  gain.connect(musicContext.destination);
  source.connect(gain);
  musicOutputs.set(audio, { source, gain });
  audio.volume = 1;
}

function setMusicVolume(audio, volume) {
  const output = musicOutputs.get(audio);
  if (output) output.gain.gain.value = volume;
  else audio.volume = volume;
}

function updateMusicVolume(audio) {
  const departure = audio === titleMusic ? titleFade : sceneFades.get(audio);
  const fade = (10 - (departure?.step ?? 0)) / 10;
  setMusicVolume(audio, warmingMusic ? 0 : audioVolume("bgm") * fade);
}

function discardSceneMusic(audio) {
  audio.pause();
  const output = musicOutputs.get(audio);
  output?.source.disconnect();
  output?.gain.disconnect();
  musicOutputs.delete(audio);
  audio.remove();
}

function finishSceneFade(audio) {
  clearInterval(sceneFades.get(audio)?.timer);
  sceneFades.delete(audio);
  setMusicVolume(audio, 0);
  discardSceneMusic(audio);
}

function clearSceneFades(scene) {
  for (const audio of sceneFades.keys()) {
    if (scene === undefined || scene === audio.dataset.bgmScene) finishSceneFade(audio);
  }
}

function fadeSceneMusic() {
  const audio = music;
  music = null;
  musicRequest += 1;
  delete stage.dataset.musicState;
  if (audio.paused || audio.readyState < audio.HAVE_FUTURE_DATA) {
    finishSceneFade(audio);
    return;
  }
  // LobbyCtrl and QuestCtrl delegate to BaseSound.fade(0, 2).
  const departure = { step: 0, timer: setInterval(() => {
    departure.step += 1;
    if (departure.step === 10) finishSceneFade(audio);
    else updateMusicVolume(audio);
  }, 200) };
  sceneFades.set(audio, departure);
}

function clearTitleFade() {
  clearInterval(titleFade?.timer);
  titleFade = undefined;
}

export function fadeTitleMusic() {
  if (!active || music !== titleMusic || titleFade) return;
  const departure = { step: 0 };
  titleFade = departure;
  if (!titleMusic.paused) {
    // TitleCtrl.stopBGM delegates to BaseSound.fade(0, 2), which ticks ten times.
    departure.timer = setInterval(() => {
      departure.step += 1;
      updateMusicVolume(titleMusic);
      if (departure.step === 10) {
        clearInterval(departure.timer);
        titleMusic.pause();
        if (music === titleMusic) delete stage.dataset.musicState;
      }
    }, 200);
  } else {
    departure.step = 10;
    delete stage.dataset.musicState;
  }
  return () => {
    if (titleFade !== departure || music !== titleMusic) return;
    clearTitleFade();
    updateMusicVolume(titleMusic);
    playSceneMusic();
  };
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

function confirmMusicPlaying(audio = music) {
  if (!active || !audio || audio !== music || !sceneEntered() || audio.paused || audio.seeking
      || audio.readyState < audio.HAVE_FUTURE_DATA) return;
  if (musicOutputs.has(audio) && musicContext.state !== "running") return;
  updateMusicVolume(audio);
  stage.dataset.musicState = "playing";
}

function requestMusic() {
  const request = ++musicRequest;
  const entered = sceneEntered();
  const audio = music;
  playAudio(audio, () => confirmMusicPlaying(audio), error => {
    if (!active || request !== musicRequest) return;
    if (entered && error.name === "NotAllowedError") stage.dataset.musicState = "blocked";
    reportAudioError(error);
  });
}

function prepareQuestCue(cue) {
  const file = questCueFiles.get(cue);
  if (file && !questCueAudio.has(cue)) {
    questCueAudio.set(cue, createAudio(`/public/sound/se/${file}`, audioVolume("se")));
  }
  return questCueAudio.get(cue);
}

export function selectQuestDuelMusic(stageNumber, isBoss) {
  duelTrack = isBoss ? duelTracks[12] : duelTracks[stageNumber] ?? duelTracks[0];
  for (const cue of questCueFiles.keys()) prepareQuestCue(cue);
}

export function playQuestBattleEffect(cue, signal) {
  const volume = audioVolume("se");
  if (!active || !volume || signal?.aborted) return;
  const base = prepareQuestCue(cue);
  if (!base || base.error) return;
  // The original multi-play permits successive dealt cards to overlap.
  const audio = playingQuestCues.has(base) ? base.cloneNode() : base;
  audio.volume = volume;
  audio.currentTime = 0;
  const listeners = new AbortController();
  function finish() {
    playingQuestCues.delete(audio);
    listeners.abort();
    signal?.removeEventListener("abort", stop);
  }
  function stop() {
    audio.pause();
    finish();
  }
  playingQuestCues.set(audio, stop);
  audio.addEventListener("ended", finish, { once: true, signal: listeners.signal });
  audio.addEventListener("error", finish, { once: true, signal: listeners.signal });
  signal?.addEventListener("abort", stop, { once: true });
  playAudio(audio, () => {}, error => {
    finish();
    reportAudioError(error);
  });
}

function playSceneMusic() {
  if (!active || !sceneEntered()) return;
  const scene = stage.dataset.soundscape ?? "title";
  if (scene === "quest" || scene === "lobby") prepareQuestCue("flip");
  if (scene === "title" && music === titleMusic && titleFade) return;
  entryObserver.disconnect();
  const wasWarming = warmingMusic;
  warmingMusic = false;
  const departingScene = music?.dataset.bgmScene;
  if (scene === "silent") {
    if (departingScene === "lobby" || departingScene === "quest" || departingScene === "quest-duel") fadeSceneMusic();
    else {
      musicRequest += 1;
      music?.pause();
      delete stage.dataset.musicState;
    }
    return;
  }
  if ((scene === "quest" && (departingScene === "lobby" || departingScene === "quest-duel"))
      || (departingScene === "quest" && (scene === "lobby" || scene === "quest-duel"))
      || (scene === "lobby" && departingScene === "quest-duel")) {
    fadeSceneMusic();
  }
  const path = scene === "quest-duel" ? `/public/sound/bgm/bgm${duelTrack}.mp3` : sceneTracks[scene] ?? theme;
  if (scene === "title" && music !== titleMusic) {
    musicRequest += 1;
    if (music) discardSceneMusic(music);
    clearSceneFades();
    music = titleMusic;
    clearTitleFade();
    updateMusicVolume(titleMusic);
    titleMusic.currentTime = 0;
    delete stage.dataset.musicState;
  } else if (scene !== "title" && (!music || music === titleMusic)) {
    // A scene starts at frame zero; a same-track reentry retires the previous channel.
    musicRequest += 1;
    if (music === titleMusic && !titleFade) titleMusic.pause();
    clearSceneFades(scene);
    music = createAudio(path, audioVolume("bgm"));
    if (musicContext) {
      try {
        connectMusic(music, audioVolume("bgm"));
      } catch (error) {
        reportAudioError(error);
      }
    }
    mountMusic(music, scene);
    delete stage.dataset.musicState;
  } else if (music.getAttribute("src") !== path) {
    musicRequest += 1;
    music.pause();
    music.src = path;
    delete stage.dataset.musicState;
  } else if (wasWarming) {
    music.currentTime = 0;
  }
  music.dataset.bgmScene = scene;
  resumeMusicOutput();
  if ((music.paused || wasWarming) && !music.error) requestMusic();
}

function warmMusic() {
  if (!music || music.error || typeof AudioContext !== "function") return;
  if (!musicContext) {
    // Attenuate in the audio graph so an early gesture stays silent on iOS too.
    try {
      musicContext = new AudioContext();
      connectMusic(music, 0);
      resumeMusicOutput();
      musicContext.addEventListener("statechange", () => confirmMusicPlaying());
    } catch (error) {
      void musicContext?.close().catch(reportAudioError);
      musicContext = undefined;
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
  const context = musicContext;
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
  gain.gain.value = audioVolume("se");
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
  if (!active || !playback || !audioVolume("se")) return;
  void playback.buffer.then(buffer => {
    if (playback !== alertPlayback || !buffer || !audioVolume("se")) return;
    const sound = playback.context.createBufferSource();
    sound.buffer = buffer;
    sound.connect(playback.gain);
    sound.onended = () => sound.disconnect();
    sound.start();
  }).catch(reportAudioError);
}

export function playLobbyClick() {
  if (!active || !audioVolume("se")) return;
  try {
    armTitleAlert(); // The original lobby click and alert both use Click2SE.
  } catch (error) {
    reportAudioError(error);
  }
  playTitleAlert();
}

export function playBackClick() {
  if (!active || clickSound.error || !audioVolume("se")) return;
  clickSound.currentTime = 0;
  playAudio(clickSound);
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
stage.addEventListener("game-screen-change", playSceneMusic);
document.getElementById("login-submit").addEventListener("click", event => {
  if (!active || !event.isTrusted) return;
  try {
    armTitleAlert();
  } catch (error) {
    reportAudioError(error);
  }
  playBackClick();
});
window.addEventListener("pagehide", () => {
  active = false;
  musicRequest += 1;
  warmingMusic = false;
  clearTitleFade();
  clearSceneFades();
  delete stage.dataset.musicState;
  entryObserver.disconnect();
  setMusicVolume(titleMusic, 0);
  titleMusic.pause();
  if (music && music !== titleMusic) {
    setMusicVolume(music, 0);
    music.pause();
  }
  clickSound.pause();
  for (const stop of playingQuestCues.values()) stop();
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

subscribePreferences((next, previous) => {
  if (next.bgm !== previous.bgm && active) {
    updateMusicVolume(titleMusic);
    if (music && music !== titleMusic) updateMusicVolume(music);
    for (const audio of sceneFades.keys()) updateMusicVolume(audio);
  }
  if (next.se !== previous.se) {
    clickSound.volume = audioVolume("se");
    if (alertPlayback) alertPlayback.gain.gain.value = audioVolume("se");
    for (const audio of playingQuestCues.keys()) audio.volume = audioVolume("se");
  }
});

mountMusic(titleMusic, "title");
watchEntry();
