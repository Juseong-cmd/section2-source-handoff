import type { Absence } from "./data";

const nextDay = (iso: string) => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

// Merge only consecutive periods with identical displayed attendance details.
export function mergedAttendance(absences: Absence[]) {
  const merged: (Absence & { sourceIds: string[] })[] = [];
  const sorted = [...absences].sort((a, b) => a.memberId.localeCompare(b.memberId) || a.type.localeCompare(b.type) || (a.label || "").localeCompare(b.label || "") || (a.flexTime || "").localeCompare(b.flexTime || "") || a.startDate.localeCompare(b.startDate));
  for (const item of sorted) {
    const prev = merged.at(-1);
    if (prev && prev.memberId === item.memberId && prev.type === item.type && (prev.label || "") === (item.label || "") && (prev.flexTime || "") === (item.flexTime || "") && (prev.memo || "") === (item.memo || "") && item.startDate <= nextDay(prev.endDate)) {
      prev.endDate = prev.endDate > item.endDate ? prev.endDate : item.endDate;
      prev.sourceIds.push(item.id);
    } else merged.push({ ...item, sourceIds: [item.id] });
  }
  return merged;
}

export function attendanceLanes(absences: Absence[], days: string[]) {
  const merged = mergedAttendance(absences);
  const segments = merged.filter(a => a.startDate <= days[6] && a.endDate >= days[0]).map(a => ({ absence: a, start: Math.max(0, days.findIndex(d => d >= a.startDate)), end: days.filter(d => d <= a.endDate).length - 1, lane: 0 })).sort((a, b) => a.start - b.start || b.end - a.end || a.absence.memberId.localeCompare(b.absence.memberId));
  const ends: number[] = [];
  for (const segment of segments) {
    let lane = ends.findIndex(end => end < segment.start);
    if (lane < 0) lane = ends.length;
    segment.lane = lane;
    ends[lane] = segment.end;
  }
  return { segments, count: ends.length };
}
