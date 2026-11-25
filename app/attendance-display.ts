import { absenceLabels, type Absence } from "./data.ts";

export function attendanceLabel(a: Absence) {
  const base = absenceLabels[a.type] || "연차";
  const custom = (a.label || "").trim();
  const label = custom && custom !== base ? `${base} · ${custom}` : base;
  return a.type === "flex" && a.flexTime ? `${label}(${a.flexTime})` : label;
}

// Free text does not reliably establish working hours.
export function attendanceImpact(a: Absence): "away" | "check" {
  const label = (a.label || "").trim();
  if (a.type === "flex" || a.type === "etc") return "check";
  if (label && label !== absenceLabels[a.type] && !(a.type === "annual" && ["휴가", "연차"].includes(label))) return "check";
  return "away";
}

export function memberDayStatus(absences: Absence[], memberId: string, date: string) {
  const entries = absences.filter(a => a.memberId === memberId && a.startDate <= date && a.endDate >= date);
  return entries.some(a => attendanceImpact(a) === "away") ? "away" : entries.length ? "check" : "available";
}
