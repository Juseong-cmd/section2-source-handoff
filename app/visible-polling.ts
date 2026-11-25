export function startVisiblePolling(refresh: () => void, intervalMs: number) {
  let lastRefreshAt: number | undefined;

  function refreshIfVisible() {
    if (document.hidden) return;
    const now = Date.now();
    if (lastRefreshAt !== undefined && now - lastRefreshAt < 1000) return;
    lastRefreshAt = now;
    refresh();
  }

  function restart() {
    window.clearInterval(timer);
    if (!document.hidden) {
      refreshIfVisible();
      timer = window.setInterval(refreshIfVisible, intervalMs);
    }
  }

  let timer: number | undefined;
  restart();
  window.addEventListener("focus", refreshIfVisible);
  document.addEventListener("visibilitychange", restart);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener("focus", refreshIfVisible);
    document.removeEventListener("visibilitychange", restart);
  };
}
