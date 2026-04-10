// Design Ref: §12 — Business Hours Engine
// Plan SC: 전 스케줄러(자동접수, 지연감지, 연기, 만족도 등) 근무시간 계산 의존

/**
 * nu-ServiceDesk Business Hours Engine
 *
 * Work schedule: 09:00-18:00 KST, Mon-Fri
 * Holiday-aware: holidays passed as Date[] config
 * Timezone: Asia/Seoul (UTC+9, no DST)
 */

const WORK_START_HOUR = 9;
const WORK_END_HOUR = 18;
const WORK_HOURS_PER_DAY = WORK_END_HOUR - WORK_START_HOUR; // 9 hours
const KST_OFFSET_MS = 9 * 60 * 60 * 1000; // UTC+9

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Convert a Date to a KST-based { year, month, day, hour, minute, second, ms }
 * representation without relying on Intl or date-fns-tz.
 */
function toKST(date: Date): Date {
  // Create a new Date that represents the KST wall clock in UTC-equivalent
  const utcMs = date.getTime();
  const kstMs = utcMs + KST_OFFSET_MS;
  return new Date(kstMs);
}

/**
 * Convert KST wall-clock Date (as if UTC) back to real UTC Date.
 */
function fromKST(kstDate: Date): Date {
  return new Date(kstDate.getTime() - KST_OFFSET_MS);
}

/**
 * Get KST day of week (0=Sun, 6=Sat) for a real UTC Date.
 */
function getKSTDayOfWeek(date: Date): number {
  return toKST(date).getUTCDay();
}

/**
 * Get the KST calendar date string "YYYY-MM-DD" for a real Date.
 */
function getKSTDateString(date: Date): string {
  const kst = toKST(date);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Get the KST calendar date string for a holiday Date (which might be midnight UTC).
 */
function getHolidayDateString(holiday: Date): string {
  // Holidays are typically stored as date-only (midnight UTC).
  // We need to interpret them as KST dates.
  const y = holiday.getFullYear();
  const m = String(holiday.getMonth() + 1).padStart(2, '0');
  const d = String(holiday.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Build a Set of holiday date strings for fast lookup.
 */
function buildHolidaySet(holidays: Date[]): Set<string> {
  return new Set(holidays.map(getHolidayDateString));
}

/**
 * Check if a real Date falls on a weekend (Sat/Sun) in KST.
 */
function isWeekend(date: Date): boolean {
  const dow = getKSTDayOfWeek(date);
  return dow === 0 || dow === 6;
}

/**
 * Check if a real Date falls on a holiday in KST.
 */
function isHoliday(date: Date, holidaySet: Set<string>): boolean {
  return holidaySet.has(getKSTDateString(date));
}

/**
 * Get the KST hour (0-23) and minutes for a real Date.
 */
function getKSTTime(date: Date): { hour: number; minute: number; second: number; ms: number } {
  const kst = toKST(date);
  return {
    hour: kst.getUTCHours(),
    minute: kst.getUTCMinutes(),
    second: kst.getUTCSeconds(),
    ms: kst.getUTCMilliseconds(),
  };
}

/**
 * Convert a KST time to fractional hours since midnight.
 */
function kstTimeToFractionalHours(date: Date): number {
  const t = getKSTTime(date);
  return t.hour + t.minute / 60 + t.second / 3600 + t.ms / 3_600_000;
}

/**
 * Create a Date for a specific KST calendar date and time.
 */
function makeKSTDate(year: number, month: number, day: number, hour: number, minute = 0, second = 0, ms = 0): Date {
  const kstDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms));
  return fromKST(kstDate);
}

/**
 * Get the calendar parts (year, month, day) in KST.
 */
function getKSTParts(date: Date): { year: number; month: number; day: number } {
  const kst = toKST(date);
  return {
    year: kst.getUTCFullYear(),
    month: kst.getUTCMonth() + 1,
    day: kst.getUTCDate(),
  };
}

/**
 * Get start of business day (09:00 KST) for the same KST calendar day as the given date.
 */
function getBusinessDayStart(date: Date): Date {
  const p = getKSTParts(date);
  return makeKSTDate(p.year, p.month, p.day, WORK_START_HOUR);
}

/**
 * Get end of business day (18:00 KST) for the same KST calendar day as the given date.
 */
function getBusinessDayEnd(date: Date): Date {
  const p = getKSTParts(date);
  return makeKSTDate(p.year, p.month, p.day, WORK_END_HOUR);
}

/**
 * Advance to the next calendar day (same time) in KST.
 */
function advanceOneDay(date: Date): Date {
  return new Date(date.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * Go back one calendar day.
 */
function retreatOneDay(date: Date): Date {
  return new Date(date.getTime() - 24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check if a given date is a business day (weekday + not a holiday) in KST.
 */
export function isBusinessDay(date: Date, holidays: Date[] = []): boolean {
  const holidaySet = buildHolidaySet(holidays);
  return !isWeekend(date) && !isHoliday(date, holidaySet);
}

/**
 * Check if a given date/time falls within business hours (09:00-18:00 KST).
 * Only checks the time component; does NOT check weekday/holiday.
 */
export function isWithinBusinessHours(date: Date): boolean {
  const fh = kstTimeToFractionalHours(date);
  return fh >= WORK_START_HOUR && fh < WORK_END_HOUR;
}

/**
 * Get the start of the next business day (09:00 KST) from the given date.
 * If the given date is before 09:00 on a business day, returns 09:00 that same day.
 * If the given date is during or after business hours on a business day, returns 09:00 next business day.
 * If the given date is on a non-business day, returns 09:00 of the next business day.
 */
export function getNextBusinessDayStart(date: Date, holidays: Date[] = []): Date {
  const holidaySet = buildHolidaySet(holidays);
  const fh = kstTimeToFractionalHours(date);

  // If we're before work start on a business day, return 09:00 today
  if (fh < WORK_START_HOUR && !isWeekend(date) && !isHoliday(date, holidaySet)) {
    return getBusinessDayStart(date);
  }

  // Otherwise, find the next calendar day that is a business day
  let cursor = advanceOneDay(getBusinessDayStart(date));
  // Safety limit: max 30 days forward (handles multi-week holiday chains)
  for (let i = 0; i < 30; i++) {
    if (!isWeekend(cursor) && !isHoliday(cursor, holidaySet)) {
      return getBusinessDayStart(cursor);
    }
    cursor = advanceOneDay(cursor);
  }

  // Fallback (should never reach)
  return getBusinessDayStart(cursor);
}

/**
 * Convert a holiday set back to Date array (for passing to getNextBusinessDayStart).
 */
function holidaySetToArray(holidaySet: Set<string>): Date[] {
  return [...holidaySet].map(s => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  });
}

/**
 * Clamp a date to the nearest business hour boundary (for start times).
 * - Before 09:00 on a business day -> 09:00 that day
 * - After 18:00 on a business day -> 09:00 next business day
 * - Weekend/holiday -> 09:00 next business day
 */
function clampToBusinessHours(date: Date, holidaySet: Set<string>): Date {
  if (isWeekend(date) || isHoliday(date, holidaySet)) {
    return getNextBusinessDayStart(date, holidaySetToArray(holidaySet));
  }

  const fh = kstTimeToFractionalHours(date);

  if (fh < WORK_START_HOUR) {
    return getBusinessDayStart(date);
  }

  if (fh >= WORK_END_HOUR) {
    return getNextBusinessDayStart(date, holidaySetToArray(holidaySet));
  }

  return date;
}

/**
 * Clamp an end date for business hour measurement.
 * Unlike start clamping, after-hours on a business day clamps to 18:00 (not next day 09:00).
 * - Before 09:00 on a business day -> 09:00 that day (effectively contributing 0 hours from that day's perspective)
 * - After 18:00 on a business day -> 18:00 that day
 * - Weekend/holiday -> previous business day 18:00 (or next day 09:00, contributing 0)
 */
function clampEndToBusinessHours(date: Date, holidaySet: Set<string>): Date {
  if (isWeekend(date) || isHoliday(date, holidaySet)) {
    // For end time on non-business day, clamp to next business day 09:00
    // This means 0 extra hours are counted from the non-business period
    return getNextBusinessDayStart(date, holidaySetToArray(holidaySet));
  }

  const fh = kstTimeToFractionalHours(date);

  if (fh < WORK_START_HOUR) {
    return getBusinessDayStart(date);
  }

  if (fh >= WORK_END_HOUR) {
    return getBusinessDayEnd(date);
  }

  return date;
}

/**
 * Add business hours to a starting date.
 *
 * If the start time is outside business hours, it is first clamped to the
 * nearest business-hour boundary. Then the specified hours are added across
 * business days, skipping weekends and holidays.
 *
 * @param start  Starting date/time
 * @param hours  Business hours to add (can be fractional, e.g. 2.5)
 * @param holidays  Array of holiday dates (interpreted as KST calendar dates)
 * @returns New Date after adding the business hours
 */
export function addBusinessHours(start: Date, hours: number, holidays: Date[] = []): Date {
  if (hours < 0) {
    throw new Error('addBusinessHours does not support negative hours');
  }
  if (hours === 0) {
    return start;
  }

  const holidaySet = buildHolidaySet(holidays);
  let cursor = clampToBusinessHours(start, holidaySet);
  let remainingMs = hours * 60 * 60 * 1000;

  // Safety: max 365 iterations (handles extreme holiday scenarios)
  for (let i = 0; i < 365 && remainingMs > 0; i++) {
    const dayEnd = getBusinessDayEnd(cursor);
    const msUntilDayEnd = dayEnd.getTime() - cursor.getTime();

    if (remainingMs <= msUntilDayEnd) {
      return new Date(cursor.getTime() + remainingMs);
    }

    // Consume rest of this day and advance to next business day
    remainingMs -= msUntilDayEnd;

    // Find next business day
    let next = advanceOneDay(getBusinessDayStart(cursor));
    for (let j = 0; j < 30; j++) {
      if (!isWeekend(next) && !isHoliday(next, holidaySet)) {
        break;
      }
      next = advanceOneDay(next);
    }
    cursor = getBusinessDayStart(next);
  }

  return cursor;
}

/**
 * Calculate the number of business hours between two dates.
 *
 * Times outside of business hours are clamped. The result is always >= 0.
 * If end < start, returns 0.
 *
 * @param start  Start date/time
 * @param end    End date/time
 * @param holidays  Array of holiday dates
 * @returns Business hours between start and end
 */
/**
 * Add business days to a starting date.
 * Returns a Date at the same time-of-day (within business hours) N business days later.
 * If the start is outside business hours, it is clamped to 09:00 of the next business day.
 *
 * @param start  Starting date/time
 * @param days   Business days to add (integer, >= 0)
 * @param holidays  Array of holiday dates
 * @returns New Date after adding the business days
 */
export function addBusinessDays(start: Date, days: number, holidays: Date[] = []): Date {
  if (days < 0) {
    throw new Error('addBusinessDays does not support negative days');
  }
  if (days === 0) {
    return start;
  }

  const holidaySet = buildHolidaySet(holidays);
  let cursor = clampToBusinessHours(start, holidaySet);
  let remaining = days;

  for (let i = 0; i < 365 && remaining > 0; i++) {
    cursor = advanceOneDay(cursor);
    // Rebuild to same time on new day
    const p = getKSTParts(cursor);
    const startTime = getKSTTime(start);
    const hour = Math.max(WORK_START_HOUR, Math.min(startTime.hour, WORK_END_HOUR - 1));
    cursor = makeKSTDate(p.year, p.month, p.day, hour, startTime.minute);

    if (!isWeekend(cursor) && !isHoliday(cursor, holidaySet)) {
      remaining--;
    }
  }

  return cursor;
}

/**
 * Count the number of business days between two dates.
 * Partial days are not counted — only full calendar business days.
 *
 * @param start  Start date
 * @param end    End date
 * @param holidays  Array of holiday dates
 * @returns Number of complete business days between start and end
 */
export function getBusinessDaysBetween(start: Date, end: Date, holidays: Date[] = []): number {
  if (end.getTime() <= start.getTime()) {
    return 0;
  }

  const holidaySet = buildHolidaySet(holidays);
  let count = 0;
  let cursor = advanceOneDay(getBusinessDayStart(start));
  const endDateStr = getKSTDateString(end);

  for (let i = 0; i < 365; i++) {
    const cursorDateStr = getKSTDateString(cursor);
    if (cursorDateStr > endDateStr) break;

    if (!isWeekend(cursor) && !isHoliday(cursor, holidaySet)) {
      count++;
    }
    cursor = advanceOneDay(cursor);
  }

  return count;
}

export function getBusinessHoursBetween(start: Date, end: Date, holidays: Date[] = []): number {
  if (end.getTime() <= start.getTime()) {
    return 0;
  }

  const holidaySet = buildHolidaySet(holidays);
  const clampedStart = clampToBusinessHours(start, holidaySet);
  const clampedEnd = clampEndToBusinessHours(end, holidaySet);

  if (clampedEnd.getTime() <= clampedStart.getTime()) {
    return 0;
  }

  // If same KST calendar day, just subtract
  if (getKSTDateString(clampedStart) === getKSTDateString(clampedEnd)) {
    return (clampedEnd.getTime() - clampedStart.getTime()) / (60 * 60 * 1000);
  }

  let totalMs = 0;

  // Hours remaining in the start day
  const startDayEnd = getBusinessDayEnd(clampedStart);
  totalMs += startDayEnd.getTime() - clampedStart.getTime();

  // Full business days in between
  let cursor = advanceOneDay(getBusinessDayStart(clampedStart));
  const endDateStr = getKSTDateString(clampedEnd);

  for (let i = 0; i < 365; i++) {
    const cursorDateStr = getKSTDateString(cursor);
    if (cursorDateStr >= endDateStr) break;

    if (!isWeekend(cursor) && !isHoliday(cursor, holidaySet)) {
      totalMs += WORK_HOURS_PER_DAY * 60 * 60 * 1000;
    }
    cursor = advanceOneDay(cursor);
  }

  // Hours in the end day (from 09:00 to clamped end)
  const endDayStart = getBusinessDayStart(clampedEnd);
  if (clampedEnd.getTime() > endDayStart.getTime()) {
    totalMs += clampedEnd.getTime() - endDayStart.getTime();
  }

  return totalMs / (60 * 60 * 1000);
}
