const RESULT_TOAST_DISMISSED_KEY = 'compat_prompt_result_toast_dismissed_at';
const RESULT_INLINE_DISMISSED_KEY = 'compat_prompt_result_inline_dismissed_at';
const SESSION_SHOWN_KEY = 'compat_prompt_session_shown';

const DAY_MS = 24 * 60 * 60 * 1000;
const RESULT_TOAST_COOLDOWN_DAYS = 7;
const RESULT_INLINE_COOLDOWN_DAYS = 3;

function getTimestamp(key: string): number | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function withinCooldown(key: string, days: number): boolean {
  const timestamp = getTimestamp(key);
  if (!timestamp) return false;
  return Date.now() - timestamp < days * DAY_MS;
}

export function shouldShowResultInlinePrompt(): boolean {
  return !withinCooldown(RESULT_INLINE_DISMISSED_KEY, RESULT_INLINE_COOLDOWN_DAYS);
}

export function dismissResultInlinePrompt(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(RESULT_INLINE_DISMISSED_KEY, String(Date.now()));
}

export function shouldShowResultToastPrompt(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.sessionStorage.getItem(SESSION_SHOWN_KEY)) return false;
  return !withinCooldown(RESULT_TOAST_DISMISSED_KEY, RESULT_TOAST_COOLDOWN_DAYS);
}

export function markResultToastShown(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(SESSION_SHOWN_KEY, '1');
}

export function dismissResultToastPrompt(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(RESULT_TOAST_DISMISSED_KEY, String(Date.now()));
  markResultToastShown();
}
