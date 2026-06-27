const SESSION_KEY = "crag_session_id";

export function getOrCreateSessionId(): string {
  const existing = window.sessionStorage.getItem(SESSION_KEY);
  if (existing) {
    return existing;
  }

  const generated = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `session_${Math.random().toString(36).slice(2)}_${Date.now()}`;

  window.sessionStorage.setItem(SESSION_KEY, generated);
  return generated;
}
