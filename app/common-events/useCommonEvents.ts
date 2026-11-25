"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { startVisiblePolling } from "../visible-polling";
import type { CommonEvent, CommonResponse, EventCommand } from "./model";

export function useCommonEvents(enabled: boolean) {
  const [events, setEvents] = useState<CommonEvent[]>([]);
  const [responses, setResponses] = useState<CommonResponse[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const generation = useRef(0), saving = useRef(false);
  function receive(body: { events?: CommonEvent[]; responses?: CommonResponse[] }) {
    if (!Array.isArray(body.events) || !Array.isArray(body.responses)) return;
    setEvents(body.events); setResponses(body.responses); setLoaded(true);
  }
  const refresh = useCallback(async () => {
    if (!enabled || saving.current) return;
    const ticket = ++generation.current;
    try {
      const r = await fetch("/api/common-events", { cache: "no-store" });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "공통 일정 불러오기 실패");
      if (ticket === generation.current) { receive(body); setError(""); }
    } catch (e) { if (ticket === generation.current) setError(e instanceof Error ? e.message : "서버 연결 실패"); }
  }, [enabled]);
  useEffect(() => {
    if (!enabled) return;
    const stop = startVisiblePolling(() => void refresh(), 60_000);
    return () => { ++generation.current; stop(); };
  }, [enabled, refresh]);
  async function save(command: EventCommand): Promise<{ ok: boolean; conflict?: boolean; error?: string }> {
    if (!enabled || saving.current) return { ok: false, error: "저장 중입니다. 잠시 기다려주세요." };
    saving.current = true; ++generation.current; setBusy(true); setSaved("");
    try {
      const r = await fetch("/api/common-events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
      const body = await r.json(); receive(body);
      if (!r.ok) return { ok: false, conflict: r.status === 409, error: body.error || "저장 실패" };
      setSaved("저장되었습니다."); return { ok: true };
    } catch { return { ok: false, error: "서버 연결 실패. 입력은 유지됩니다. 다시 저장해주세요." }; }
    finally { saving.current = false; setBusy(false); }
  }
  return { events, responses, loaded, busy, error, saved, refresh, save };
}
export type CommonEventStore = ReturnType<typeof useCommonEvents>;
