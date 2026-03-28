'use client'

// Web Audio API synthesized sound effects
// Lightweight Duolingo-style feedback sounds — no audio files needed

const STORAGE_KEY = 'rikaquiz-sound'

let audioCtx: AudioContext | null = null

/** サウンド設定の読み取り */
export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(STORAGE_KEY) === 'on'
}

/** サウンド設定の書き込み */
export function setSoundEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off')
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!isSoundEnabled()) return null
  if (!audioCtx) {
    audioCtx = new AudioContext()
  }
  // Resume if suspended (browser autoplay policy)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume()
  }
  return audioCtx
}

/** Short sine ping — clean & bright */
function ping(freq: number, duration: number, volume = 0.15) {
  const ctx = getCtx()
  if (!ctx) return
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(volume, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration)
  osc.connect(gain).connect(ctx.destination)
  osc.start(t)
  osc.stop(t + duration)
}

/** Triangle wave — softer than sine, good for gentle tones */
function soft(freq: number, duration: number, volume = 0.12) {
  const ctx = getCtx()
  if (!ctx) return
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'triangle'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(volume, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration)
  osc.connect(gain).connect(ctx.destination)
  osc.start(t)
  osc.stop(t + duration)
}

// ─── Public API ───────────────────────────────────────

/** 正解 — 2音の上昇チャイム (ピコッ) */
export function playCorrect() {
  ping(880, 0.08, 0.12)       // A5 — short attack
  setTimeout(() => ping(1175, 0.12, 0.14), 70)  // D6 — resolve up
}

/** 不正解 — 低い2音の下降 (ボッ) */
export function playWrong() {
  soft(310, 0.12, 0.10)       // Eb4
  setTimeout(() => soft(233, 0.18, 0.08), 80)   // Bb3 — descend
}

/** コンボマイルストーン (3, 6, 10) — 3音の上昇アルペジオ */
export function playCombo() {
  ping(660, 0.08, 0.10)       // E5
  setTimeout(() => ping(880, 0.08, 0.12), 60)   // A5
  setTimeout(() => ping(1320, 0.15, 0.14), 120) // E6
}

/** パーフェクト / クイズ完了 — きらきら4音ファンファーレ */
export function playPerfect() {
  const notes = [523, 659, 784, 1047]  // C5 E5 G5 C6
  notes.forEach((freq, i) => {
    setTimeout(() => ping(freq, 0.15, 0.10 + i * 0.02), i * 80)
  })
}

/** ボタンタップ — 極小クリック音 */
export function playTap() {
  ping(600, 0.03, 0.06)
}
