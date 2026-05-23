export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededUnitInterval(seed) {
  const hash = hashString(String(seed));
  return hash / 0xffffffff;
}

export function generateIntentId() {
  const base = `${Date.now()}:${Math.random()}:${process.pid}`;
  return `intent-${hashString(base).toString(16)}`;
}

export function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function nowIso() {
  return new Date().toISOString();
}
