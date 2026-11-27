"use strict";

const launch = document.querySelector("#launch");
const start = document.querySelector("#start");
const status = document.querySelector("#status");
const serverPorts = [12001, 12002, 12003, 12004, 12005, 12020];
const tcnDeviceFont = document.querySelector('meta[name="unlight-tcn-device-font"]')?.content;
// The historical font's internal full name is the name Ruffle registers.
const tcnFamilies = ["cwTeX 明體", "Noto Sans"];

start.addEventListener("click", async () => {
  start.disabled = true;
  status.textContent = "載入原版客戶端…";

  const gl = document.createElement("canvas").getContext("webgl2");
  if (!gl) {
    status.textContent = "這個瀏覽器目前無法使用 WebGL 2，原版動畫無法完整顯示。";
    start.disabled = false;
    return;
  }
  gl.getExtension("WEBGL_lose_context")?.loseContext();

  let player;
  try {
    player = window.RufflePlayer.newest().createPlayer();
    launch.before(player);
    await player.ruffle().load({
      url: "/Unlight.swf",
      autoplay: "on",
      preferredRenderer: "wgpu-webgl",
      unmuteOverlay: "visible",
      allowNetworking: "all",
      allowScriptAccess: false,
      openUrlMode: "deny",
      upgradeToHttps: false,
      ...(tcnDeviceFont ? {
        fontSources: [tcnDeviceFont],
        defaultFonts: {
          sans: tcnFamilies,
          serif: tcnFamilies,
          typewriter: tcnFamilies,
          japaneseMincho: tcnFamilies,
          japaneseGothic: tcnFamilies,
          japaneseGothicMono: tcnFamilies,
        },
      } : {}),
      socketProxy: serverPorts.map(port => ({
        host: "127.0.0.1",
        port,
        proxyUrl: new URL("/socket/" + port, location.href.replace(/^http/, "ws")).href,
      })),
    });
    launch.hidden = true;
  } catch {
    player?.remove();
    start.disabled = false;
    status.textContent = "客戶端載入失敗，請重試。";
  }
});
