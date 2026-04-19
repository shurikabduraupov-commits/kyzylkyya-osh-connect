let titleInterval: ReturnType<typeof setInterval> | null = null;
let originalTitle: string | null = null;

function clearTitleFlash() {
  if (titleInterval) {
    clearInterval(titleInterval);
    titleInterval = null;
  }
  if (originalTitle != null) {
    document.title = originalTitle;
    originalTitle = null;
  }
}

export function flashTitle(text: string) {
  if (typeof document === "undefined") return;
  if (!document.hidden) return;
  clearTitleFlash();
  originalTitle = document.title;
  let on = true;
  titleInterval = setInterval(() => {
    document.title = on ? text : originalTitle || "";
    on = !on;
  }, 1000);
  const stop = () => {
    if (!document.hidden) {
      clearTitleFlash();
      document.removeEventListener("visibilitychange", stop);
      window.removeEventListener("focus", stop);
    }
  };
  document.addEventListener("visibilitychange", stop);
  window.addEventListener("focus", stop);
}

export function vibrate(pattern: number | number[] = [200, 100, 200]) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    /* ignore */
  }
}

let audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!audioCtx) {
      const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
      if (!Ctor) return null;
      audioCtx = new Ctor();
    }
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

function tone(freq: number, startOffsetMs: number, durationMs: number, gain = 0.18) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const t0 = ctx.currentTime + startOffsetMs / 1000;
  const t1 = t0 + durationMs / 1000;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t1);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t1 + 0.05);
}

export function playSuccessSound() {
  tone(880, 0, 180);
  tone(1175, 180, 220);
  tone(1568, 400, 280);
}

export function playWarningSound() {
  tone(660, 0, 220);
  tone(440, 240, 320);
}

export function primeAudio() {
  getAudioCtx();
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    const result = await Notification.requestPermission();
    return result === "granted";
  } catch {
    return false;
  }
}

export function showNotification(title: string, body: string) {
  try {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    if (!document.hidden) return;
    const n = new Notification(title, { body, tag: "mak-ride-status", renotify: true } as NotificationOptions & { renotify?: boolean });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* ignore */
  }
}

export function alertSuccess(title: string, body: string) {
  playSuccessSound();
  vibrate([180, 80, 180, 80, 320]);
  showNotification(title, body);
  flashTitle(`🟢 ${title}`);
}

export function alertWarning(title: string, body: string) {
  playWarningSound();
  vibrate([300, 120, 300]);
  showNotification(title, body);
  flashTitle(`⚠️ ${title}`);
}
