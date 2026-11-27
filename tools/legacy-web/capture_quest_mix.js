// Load through Playwright addInitScript in the isolated Ruffle test page.
(() => {
  const start = AudioBufferSourceNode.prototype.start;
  const chunks = [];
  const marks = [];
  const mix = window.questMix = { enabled: false, rate: 0, time: 0, errors: 0 };

  AudioBufferSourceNode.prototype.start = function (...args) {
    const result = start.apply(this, args);
    if (mix.enabled && this.buffer) {
      try {
        const context = this.context;
        const buffer = this.buffer;
        const now = context.currentTime;
        const when = Math.max(now, args[0] || 0);
        const pcm = new Int16Array(buffer.length);
        const left = buffer.getChannelData(0);
        const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
        for (let i = 0; i < pcm.length; i++) {
          const value = (left[i] + right[i]) * 0.5;
          pcm[i] = Math.round(Math.min(1, Math.max(-1, value)) * 32767);
        }
        mix.rate = buffer.sampleRate;
        mix.time = now;
        chunks.push({ when, rate: buffer.sampleRate, pcm });
        while (chunks.length > 1 && when - chunks[0].when > 75) chunks.shift();
      } catch {
        mix.errors += 1;
      }
    }
    return result;
  };
  mix.mark = (name) => marks.push({ name, time: mix.time });
  mix.drain = () => ({
    errors: mix.errors,
    marks: marks.splice(0),
    chunks: chunks.splice(0).map(({ pcm, ...chunk }) => {
      const bytes = new Uint8Array(pcm.buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      }
      return { ...chunk, pcm: btoa(binary) };
    }),
  });
})();
