import { eventDay, hasCoordinates } from './hazards.js';

export function inMapArea(item, area) {
  if (!area) return true;
  if (!item.exact) return false;
  if (area.kind === 'geographic') {
    const { latitude: lat, longitude: lon } = item.row;
    const longitude = area.west <= area.east ? lon >= area.west && lon <= area.east : lon >= area.west || lon <= area.east;
    return longitude && lat >= area.south && lat <= area.north;
  }
  const [[x0, y0], [x1, y1]] = area.bounds;
  return !!item.point && item.point[0] >= x0 && item.point[0] <= x1 && item.point[1] >= y0 && item.point[1] <= y1;
}

export function selectMapItems(items, { area = null, country = '', interval = null } = {}, { approximate = true, replay = null, cutoff = Infinity } = {}) {
  return items.filter(item => (approximate || item.exact)
    && (!country || item.row.iso === country)
    && inMapArea(item, area)
    && (!interval || (item.day !== null && item.day >= interval[0] && item.day <= interval[1] && item.day <= cutoff))
    && (!replay || (item.day !== null && item.day <= replay.date && item.day <= cutoff)));
}

// Exact locations share screen-space grid cells. Approximate records group only by country.
// Their reference points never participate in measured geographic clusters.
export function clusterMapItems(items, screenPoint, cellSize, enabled = true) {
  const buckets = new Map();
  for (const item of items) {
    if (!item.point) continue;
    const point = screenPoint(item.point);
    const key = !enabled ? item.row.id : !item.exact ? `country:${item.row.iso}` : `cell:${Math.floor(point[0] / cellSize)}:${Math.floor(point[1] / cellSize)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ item, point });
  }
  return [...buckets].map(([key, values]) => ({
    key, members: values.map(d => d.item), exact: values[0].item.exact,
    point: [values.reduce((sum, d) => sum + d.point[0], 0) / values.length, values.reduce((sum, d) => sum + d.point[1], 0) / values.length],
  }));
}

export function impactRadius(value, max, cap = 18) {
  if (!Number.isFinite(value) || value <= 0) return 3;
  return Math.max(1.5, cap * Math.sqrt(value / (max || 1)));
}

export function recordDateLabel(row) {
  const day = eventDay(row);
  if (day !== null) return new Date(day).toISOString().slice(0, 10);
  if (Number.isInteger(row.start_month) && row.start_month >= 1 && row.start_month <= 12) return `${row.year}-${String(row.start_month).padStart(2, '0')} (day unknown)`;
  return `${row.year} (month/day unknown)`;
}

export function locationLabel(row) {
  return hasCoordinates(row) ? `Source coordinate: ${row.latitude.toFixed(3)}, ${row.longitude.toFixed(3)}` : 'Event coordinates unavailable; country reference only where mapped';
}

export function replayDates(items, start, end) {
  return [...new Set(items.map(item => item.day).filter(day => Number.isFinite(day) && day >= start && day <= end))].sort((a, b) => a - b);
}

export function nextReplayDate(days, date) {
  return days[upperBound(days, date)] ?? null;
}

// Index of the first value after the cursor; also counts starts already reached.
export function upperBound(values, date, value = d => d) {
  let low = 0, high = values.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (value(values[mid]) <= date) low = mid + 1;
    else high = mid;
  }
  return low;
}

// Calendar years take the requested real duration, including leap years.
export function advanceReplayDate(date, elapsed, millisecondsPerYear) {
  const year = new Date(date).getUTCFullYear();
  const start = Date.UTC(year, 0, 1), end = Date.UTC(year + 1, 0, 1);
  const position = year + (date - start) / (end - start) + elapsed / millisecondsPerYear;
  const targetYear = Math.floor(position);
  const targetStart = Date.UTC(targetYear, 0, 1), targetEnd = Date.UTC(targetYear + 1, 0, 1);
  return targetStart + (position - targetYear) * (targetEnd - targetStart);
}

// Selection changes reveal an actual start day. Manual seeking does not call this.
export function alignReplayCursor(days, date) {
  if (!days.length) return date;
  return nextReplayDate(days, date - 1) ?? days[0];
}
