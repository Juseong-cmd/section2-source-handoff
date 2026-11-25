"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startVisiblePolling } from "../visible-polling";
import type { BayCommand, BaySchedule } from "./model";

export function useBay(enabled: boolean) {
  const [schedules, setSchedules] = useState<BaySchedule[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState("");
  const generation = useRef(0);
  const saving = useRef(false);
  const refresh = useCallback(async () => {
    if (!enabled || saving.current) return;
    const ticket = ++generation.current;
    try {
      const response = await fetch("/api/bay", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || !Array.isArray(body.schedules)) throw new Error(body.error || "Bay 불러오기 실패");
      if (ticket === generation.current) { setSchedules(body.schedules); setLoaded(true); setError(""); }
    } catch (e) { if (ticket === generation.current) setError(e instanceof Error ? e.message : "서버 연결 실패"); }
  }, [enabled]);
  useEffect(() => {
    if (!enabled) return;
    const stop = startVisiblePolling(() => void refresh(), 60_000);
    return () => { ++generation.current; stop(); };
  }, [enabled, refresh]);

  async function save(command: BayCommand): Promise<{ ok: boolean; error?: string; conflict?: BaySchedule }> {
    if (saving.current || !enabled) return { ok: false, error: "저장 중입니다. 잠시 기다려주세요." };
    saving.current = true; ++generation.current; setBusy(true); setError("");
    try {
      const response = await fetch("/api/bay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
      const body = await response.json();
      if (body.schedule) setSchedules(current => [...current.filter(s => s.id !== body.schedule.id), body.schedule]);
      if (!response.ok) return { ok: false, error: body.error || "저장 실패", conflict: response.status === 409 ? body.schedule : undefined };
      setSavedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" }));
      return { ok: true };
    } catch { return { ok: false, error: "서버 연결 실패. 입력 내용은 유지됩니다. 다시 저장해주세요." }; }
    finally { saving.current = false; setBusy(false); }
  }
  return { schedules, loaded, busy, error, savedAt, refresh, save };
}
