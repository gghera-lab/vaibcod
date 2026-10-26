// Короткий ненавязчивый сигнал между главами (Web Audio, без аудиофайла). Отключается в настройках.

let ctx: AudioContext | null = null;

export function playChime(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return resolve();
      ctx ??= new AC();
      const now = ctx.currentTime;
      const notes = [659.25, 987.77]; // ми и си — мягкая чистая квинта
      notes.forEach((f, i) => {
        const osc = ctx!.createOscillator();
        const gain = ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        const t0 = now + i * 0.18;
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(0.07, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
        osc.connect(gain).connect(ctx!.destination);
        osc.start(t0);
        osc.stop(t0 + 1);
      });
      setTimeout(resolve, 1100);
    } catch {
      resolve();
    }
  });
}
