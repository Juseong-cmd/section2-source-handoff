const kstDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function getKstDateParts(date = new Date()) {
  const parts = kstDateFormatter.formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.year),
    month: Number(values.month) - 1,
    day: Number(values.day),
  };
}

export function isoFromParts(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function todayIsoKst(date = new Date()) {
  const today = getKstDateParts(date);
  return isoFromParts(today.year, today.month, today.day);
}

export function isoParts(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month: month - 1, day };
}

export function weekdayFromIso(iso) {
  const { year, month, day } = isoParts(iso);
  return new Date(Date.UTC(year, month, day)).getUTCDay();
}

export function millisecondsUntilNextKstDate(date = new Date()) {
  const current = todayIsoKst(date);
  let cursor = new Date(date.getTime() + 1000);

  for (let attempt = 0; attempt < 90_000; attempt += 1) {
    if (todayIsoKst(cursor) !== current) {
      return cursor.getTime() - date.getTime();
    }
    cursor = new Date(cursor.getTime() + 1000);
  }

  return 60_000;
}
