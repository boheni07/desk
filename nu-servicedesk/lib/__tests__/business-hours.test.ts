// Design Ref: §12 — Business Hours Engine Tests (50+ cases)
// Plan SC: 근무시간 계산 정확도 (전 스케줄러 의존)

import { describe, it, expect } from 'vitest';
import {
  addBusinessHours,
  getBusinessHoursBetween,
  isBusinessDay,
  isWithinBusinessHours,
  getNextBusinessDayStart,
} from '../business-hours';

// Helper: Create a KST date easily (pass hours in KST, get UTC Date)
function kst(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  // KST = UTC+9
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute));
}

// Common test dates
// 2026-04-06 (Mon), 2026-04-07 (Tue), ..., 2026-04-10 (Fri), 2026-04-11 (Sat), 2026-04-12 (Sun)
const MON = kst(2026, 4, 6);  // Monday 00:00 KST
const TUE = kst(2026, 4, 7);
const WED = kst(2026, 4, 8);
const THU = kst(2026, 4, 9);
const FRI = kst(2026, 4, 10);
const SAT = kst(2026, 4, 11);
const SUN = kst(2026, 4, 12);
const NEXT_MON = kst(2026, 4, 13);

// Holidays: 2026-04-08 (Wed), 2026-04-09 (Thu)
const HOLIDAYS = [
  new Date(2026, 3, 8),  // Apr 8
  new Date(2026, 3, 9),  // Apr 9
];

// Single holiday: 2026-04-07 (Tue)
const HOLIDAY_TUE = [new Date(2026, 3, 7)];

// ============================================================
// isBusinessDay
// ============================================================
describe('isBusinessDay', () => {
  it('returns true for a regular weekday (Monday)', () => {
    expect(isBusinessDay(kst(2026, 4, 6, 10))).toBe(true);
  });

  it('returns true for a regular weekday (Friday)', () => {
    expect(isBusinessDay(kst(2026, 4, 10, 15))).toBe(true);
  });

  it('returns false for Saturday', () => {
    expect(isBusinessDay(kst(2026, 4, 11, 10))).toBe(false);
  });

  it('returns false for Sunday', () => {
    expect(isBusinessDay(kst(2026, 4, 12, 10))).toBe(false);
  });

  it('returns false for a holiday on a weekday', () => {
    expect(isBusinessDay(kst(2026, 4, 8, 10), HOLIDAYS)).toBe(false);
  });

  it('returns true for a weekday not in the holiday list', () => {
    expect(isBusinessDay(kst(2026, 4, 6, 10), HOLIDAYS)).toBe(true);
  });

  it('returns true when holidays is empty array', () => {
    expect(isBusinessDay(kst(2026, 4, 8, 10), [])).toBe(true);
  });

  it('returns false for Saturday even if holidays contains it', () => {
    const satHoliday = [new Date(2026, 3, 11)];
    expect(isBusinessDay(kst(2026, 4, 11, 10), satHoliday)).toBe(false);
  });
});

// ============================================================
// isWithinBusinessHours
// ============================================================
describe('isWithinBusinessHours', () => {
  it('returns true at exactly 09:00 KST', () => {
    expect(isWithinBusinessHours(kst(2026, 4, 6, 9, 0))).toBe(true);
  });

  it('returns true at 12:00 KST (midday)', () => {
    expect(isWithinBusinessHours(kst(2026, 4, 6, 12, 0))).toBe(true);
  });

  it('returns true at 17:59 KST', () => {
    expect(isWithinBusinessHours(kst(2026, 4, 6, 17, 59))).toBe(true);
  });

  it('returns false at exactly 18:00 KST', () => {
    expect(isWithinBusinessHours(kst(2026, 4, 6, 18, 0))).toBe(false);
  });

  it('returns false at 08:59 KST', () => {
    expect(isWithinBusinessHours(kst(2026, 4, 6, 8, 59))).toBe(false);
  });

  it('returns false at 00:00 KST (midnight)', () => {
    expect(isWithinBusinessHours(kst(2026, 4, 6, 0, 0))).toBe(false);
  });

  it('returns false at 23:59 KST', () => {
    expect(isWithinBusinessHours(kst(2026, 4, 6, 23, 59))).toBe(false);
  });

  it('returns true at 09:01 KST', () => {
    expect(isWithinBusinessHours(kst(2026, 4, 6, 9, 1))).toBe(true);
  });

  // Note: isWithinBusinessHours does NOT check day/holiday - it only checks time
  it('returns true even on Saturday if time is 10:00', () => {
    expect(isWithinBusinessHours(kst(2026, 4, 11, 10, 0))).toBe(true);
  });
});

// ============================================================
// getNextBusinessDayStart
// ============================================================
describe('getNextBusinessDayStart', () => {
  it('returns 09:00 same day when before 09:00 on a weekday', () => {
    const result = getNextBusinessDayStart(kst(2026, 4, 6, 7, 0));
    expect(result.getTime()).toBe(kst(2026, 4, 6, 9, 0).getTime());
  });

  it('returns 09:00 next day when at 18:00 on a weekday', () => {
    const result = getNextBusinessDayStart(kst(2026, 4, 6, 18, 0));
    expect(result.getTime()).toBe(kst(2026, 4, 7, 9, 0).getTime());
  });

  it('returns 09:00 next day when at 20:00 on a weekday', () => {
    const result = getNextBusinessDayStart(kst(2026, 4, 6, 20, 0));
    expect(result.getTime()).toBe(kst(2026, 4, 7, 9, 0).getTime());
  });

  it('returns 09:00 next day when during business hours (10:00)', () => {
    const result = getNextBusinessDayStart(kst(2026, 4, 6, 10, 0));
    expect(result.getTime()).toBe(kst(2026, 4, 7, 9, 0).getTime());
  });

  it('skips Saturday to Monday 09:00', () => {
    const result = getNextBusinessDayStart(kst(2026, 4, 10, 18, 0)); // Friday 18:00
    expect(result.getTime()).toBe(kst(2026, 4, 13, 9, 0).getTime()); // Next Monday
  });

  it('returns Monday 09:00 from Saturday', () => {
    const result = getNextBusinessDayStart(kst(2026, 4, 11, 10, 0)); // Saturday
    expect(result.getTime()).toBe(kst(2026, 4, 13, 9, 0).getTime()); // Monday
  });

  it('returns Monday 09:00 from Sunday', () => {
    const result = getNextBusinessDayStart(kst(2026, 4, 12, 10, 0)); // Sunday
    expect(result.getTime()).toBe(kst(2026, 4, 13, 9, 0).getTime()); // Monday
  });

  it('skips holidays to the next business day', () => {
    // Wednesday Apr 8 is a holiday
    const result = getNextBusinessDayStart(kst(2026, 4, 7, 18, 0), HOLIDAYS); // Tue after hours
    // Wed Apr 8 = holiday, Thu Apr 9 = holiday, Fri Apr 10 = business day
    expect(result.getTime()).toBe(kst(2026, 4, 10, 9, 0).getTime());
  });

  it('handles holiday chain into weekend', () => {
    // Holidays on Thu and Fri, then weekend
    const holidays = [new Date(2026, 3, 9), new Date(2026, 3, 10)]; // Thu, Fri
    const result = getNextBusinessDayStart(kst(2026, 4, 8, 18, 0), holidays); // Wed after hours
    // Thu=holiday, Fri=holiday, Sat=weekend, Sun=weekend, Mon=business day
    expect(result.getTime()).toBe(kst(2026, 4, 13, 9, 0).getTime());
  });

  it('returns 09:00 today when at 00:00 on a business day', () => {
    const result = getNextBusinessDayStart(kst(2026, 4, 6, 0, 0));
    expect(result.getTime()).toBe(kst(2026, 4, 6, 9, 0).getTime());
  });
});

// ============================================================
// addBusinessHours — basic addition
// ============================================================
describe('addBusinessHours — basic', () => {
  it('adds 0 hours, returns same time', () => {
    const start = kst(2026, 4, 6, 10, 0);
    expect(addBusinessHours(start, 0).getTime()).toBe(start.getTime());
  });

  it('adds 2 hours within the same day', () => {
    const start = kst(2026, 4, 6, 10, 0);  // Mon 10:00
    const result = addBusinessHours(start, 2);
    expect(result.getTime()).toBe(kst(2026, 4, 6, 12, 0).getTime());
  });

  it('adds 4 hours from 09:00', () => {
    const start = kst(2026, 4, 6, 9, 0);  // Mon 09:00
    const result = addBusinessHours(start, 4);
    expect(result.getTime()).toBe(kst(2026, 4, 6, 13, 0).getTime());
  });

  it('adds 8 hours from 09:00 = 17:00 same day', () => {
    const start = kst(2026, 4, 6, 9, 0);
    const result = addBusinessHours(start, 8);
    expect(result.getTime()).toBe(kst(2026, 4, 6, 17, 0).getTime());
  });

  it('adds 9 hours from 09:00 = 18:00 same day', () => {
    const start = kst(2026, 4, 6, 9, 0);
    const result = addBusinessHours(start, 9);
    expect(result.getTime()).toBe(kst(2026, 4, 6, 18, 0).getTime());
  });

  it('throws on negative hours', () => {
    expect(() => addBusinessHours(kst(2026, 4, 6, 10), -1)).toThrow();
  });
});

// ============================================================
// addBusinessHours — cross-day spanning
// ============================================================
describe('addBusinessHours — cross-day', () => {
  it('adds 10 hours (9 remaining + 1 next day) from 09:00', () => {
    const start = kst(2026, 4, 6, 9, 0);  // Mon 09:00
    const result = addBusinessHours(start, 10);
    expect(result.getTime()).toBe(kst(2026, 4, 7, 10, 0).getTime()); // Tue 10:00
  });

  it('adds 2 hours from 16:30 crosses to next day', () => {
    const start = kst(2026, 4, 6, 16, 30);  // Mon 16:30 -> 1.5h remaining
    const result = addBusinessHours(start, 2);
    // 1.5h today (to 18:00), 0.5h next day (Tue 09:30)
    expect(result.getTime()).toBe(kst(2026, 4, 7, 9, 30).getTime());
  });

  it('adds 16 hours = 2 full business days from 14:00', () => {
    const start = kst(2026, 4, 6, 14, 0); // Mon 14:00 -> 4h remaining today
    const result = addBusinessHours(start, 16);
    // 4h Mon + 9h Tue + 3h Wed = 16h -> Wed 12:00
    expect(result.getTime()).toBe(kst(2026, 4, 8, 12, 0).getTime());
  });

  it('adds 18 hours from 09:00 = exactly 2 full days', () => {
    const start = kst(2026, 4, 6, 9, 0); // Mon 09:00
    const result = addBusinessHours(start, 18);
    // 9h Mon + 9h Tue = 18h -> Tue 18:00
    expect(result.getTime()).toBe(kst(2026, 4, 7, 18, 0).getTime());
  });
});

// ============================================================
// addBusinessHours — weekend skipping
// ============================================================
describe('addBusinessHours — weekend', () => {
  it('skips weekend when adding hours from Friday afternoon', () => {
    const start = kst(2026, 4, 10, 16, 0);  // Fri 16:00 -> 2h remaining
    const result = addBusinessHours(start, 4);
    // 2h Fri (to 18:00), skip Sat+Sun, 2h Mon = Mon 11:00
    expect(result.getTime()).toBe(kst(2026, 4, 13, 11, 0).getTime());
  });

  it('clamps start on Saturday to Monday 09:00', () => {
    const start = kst(2026, 4, 11, 10, 0);  // Sat 10:00
    const result = addBusinessHours(start, 2);
    // Clamped to Mon 09:00, +2h = Mon 11:00
    expect(result.getTime()).toBe(kst(2026, 4, 13, 11, 0).getTime());
  });

  it('clamps start on Sunday to Monday 09:00', () => {
    const start = kst(2026, 4, 12, 14, 0);  // Sun 14:00
    const result = addBusinessHours(start, 1);
    // Clamped to Mon 09:00, +1h = Mon 10:00
    expect(result.getTime()).toBe(kst(2026, 4, 13, 10, 0).getTime());
  });
});

// ============================================================
// addBusinessHours — holiday skipping
// ============================================================
describe('addBusinessHours — holiday', () => {
  it('skips a single holiday', () => {
    // Tuesday Apr 7 is holiday
    const start = kst(2026, 4, 6, 17, 0);  // Mon 17:00 -> 1h remaining
    const result = addBusinessHours(start, 3, HOLIDAY_TUE);
    // 1h Mon, skip Tue (holiday), 2h Wed = Wed 11:00
    expect(result.getTime()).toBe(kst(2026, 4, 8, 11, 0).getTime());
  });

  it('skips multi-day holidays', () => {
    // Wed Apr 8 and Thu Apr 9 are holidays
    const start = kst(2026, 4, 7, 17, 0);  // Tue 17:00 -> 1h remaining
    const result = addBusinessHours(start, 3, HOLIDAYS);
    // 1h Tue, skip Wed+Thu (holidays), 2h Fri = Fri 11:00
    expect(result.getTime()).toBe(kst(2026, 4, 10, 11, 0).getTime());
  });

  it('skips holidays combined with weekend', () => {
    // Holidays on Thu Apr 9 and Fri Apr 10
    const holidays = [new Date(2026, 3, 9), new Date(2026, 3, 10)];
    const start = kst(2026, 4, 8, 17, 0); // Wed 17:00 -> 1h remaining
    const result = addBusinessHours(start, 3, holidays);
    // 1h Wed, skip Thu+Fri (holidays), skip Sat+Sun (weekend), 2h Mon = Mon 11:00
    expect(result.getTime()).toBe(kst(2026, 4, 13, 11, 0).getTime());
  });

  it('adds hours starting from a holiday', () => {
    const start = kst(2026, 4, 8, 10, 0);  // Wed 10:00 (holiday)
    const result = addBusinessHours(start, 2, HOLIDAYS);
    // Clamped to Fri 09:00 (Thu also holiday), +2h = Fri 11:00
    expect(result.getTime()).toBe(kst(2026, 4, 10, 11, 0).getTime());
  });
});

// ============================================================
// addBusinessHours — boundary conditions
// ============================================================
describe('addBusinessHours — boundaries', () => {
  it('clamps start before 09:00 to 09:00', () => {
    const start = kst(2026, 4, 6, 7, 0);  // Mon 07:00
    const result = addBusinessHours(start, 2);
    expect(result.getTime()).toBe(kst(2026, 4, 6, 11, 0).getTime());
  });

  it('clamps start at exactly 18:00 to next day 09:00', () => {
    const start = kst(2026, 4, 6, 18, 0);  // Mon 18:00
    const result = addBusinessHours(start, 1);
    expect(result.getTime()).toBe(kst(2026, 4, 7, 10, 0).getTime());
  });

  it('clamps start after 18:00 to next day 09:00', () => {
    const start = kst(2026, 4, 6, 20, 0);  // Mon 20:00
    const result = addBusinessHours(start, 1);
    expect(result.getTime()).toBe(kst(2026, 4, 7, 10, 0).getTime());
  });

  it('starts exactly at 09:00', () => {
    const start = kst(2026, 4, 6, 9, 0);
    const result = addBusinessHours(start, 1);
    expect(result.getTime()).toBe(kst(2026, 4, 6, 10, 0).getTime());
  });

  it('adds exactly 9 hours (one full day) from 09:00', () => {
    const start = kst(2026, 4, 6, 9, 0);
    const result = addBusinessHours(start, 9);
    expect(result.getTime()).toBe(kst(2026, 4, 6, 18, 0).getTime());
  });

  it('adds fractional hours (0.5 = 30 minutes)', () => {
    const start = kst(2026, 4, 6, 10, 0);
    const result = addBusinessHours(start, 0.5);
    expect(result.getTime()).toBe(kst(2026, 4, 6, 10, 30).getTime());
  });

  it('adds fractional hours crossing day boundary', () => {
    const start = kst(2026, 4, 6, 17, 30);  // Mon 17:30 -> 0.5h remaining
    const result = addBusinessHours(start, 1.5);
    // 0.5h Mon, 1h Tue = Tue 10:00
    expect(result.getTime()).toBe(kst(2026, 4, 7, 10, 0).getTime());
  });
});

// ============================================================
// getBusinessHoursBetween — same day
// ============================================================
describe('getBusinessHoursBetween — same day', () => {
  it('returns correct hours for same-day business span', () => {
    const start = kst(2026, 4, 6, 10, 0);
    const end = kst(2026, 4, 6, 14, 0);
    expect(getBusinessHoursBetween(start, end)).toBe(4);
  });

  it('returns 9 hours for full business day', () => {
    const start = kst(2026, 4, 6, 9, 0);
    const end = kst(2026, 4, 6, 18, 0);
    expect(getBusinessHoursBetween(start, end)).toBe(9);
  });

  it('returns 0 when start equals end', () => {
    const t = kst(2026, 4, 6, 12, 0);
    expect(getBusinessHoursBetween(t, t)).toBe(0);
  });

  it('returns 0 when end is before start', () => {
    const start = kst(2026, 4, 6, 14, 0);
    const end = kst(2026, 4, 6, 10, 0);
    expect(getBusinessHoursBetween(start, end)).toBe(0);
  });

  it('clamps before-hours start to 09:00', () => {
    const start = kst(2026, 4, 6, 7, 0);  // before 09:00
    const end = kst(2026, 4, 6, 12, 0);
    expect(getBusinessHoursBetween(start, end)).toBe(3); // 09:00 to 12:00
  });

  it('handles half-hour precision', () => {
    const start = kst(2026, 4, 6, 10, 30);
    const end = kst(2026, 4, 6, 12, 0);
    expect(getBusinessHoursBetween(start, end)).toBe(1.5);
  });
});

// ============================================================
// getBusinessHoursBetween — multi-day
// ============================================================
describe('getBusinessHoursBetween — multi-day', () => {
  it('returns 18 hours for Mon 09:00 to Wed 09:00', () => {
    const start = kst(2026, 4, 6, 9, 0);   // Mon 09:00
    const end = kst(2026, 4, 8, 9, 0);     // Wed 09:00
    expect(getBusinessHoursBetween(start, end)).toBe(18);
  });

  it('returns 9 hours for Mon 09:00 to Tue 09:00', () => {
    const start = kst(2026, 4, 6, 9, 0);   // Mon 09:00
    const end = kst(2026, 4, 7, 9, 0);     // Tue 09:00
    expect(getBusinessHoursBetween(start, end)).toBe(9);
  });

  it('returns 45 hours for full week Mon-Fri', () => {
    const start = kst(2026, 4, 6, 9, 0);   // Mon 09:00
    const end = kst(2026, 4, 10, 18, 0);   // Fri 18:00
    expect(getBusinessHoursBetween(start, end)).toBe(45);
  });

  it('skips weekends', () => {
    const start = kst(2026, 4, 10, 16, 0); // Fri 16:00
    const end = kst(2026, 4, 13, 11, 0);   // Mon 11:00
    // 2h Fri + 2h Mon = 4h
    expect(getBusinessHoursBetween(start, end)).toBe(4);
  });
});

// ============================================================
// getBusinessHoursBetween — with holidays
// ============================================================
describe('getBusinessHoursBetween — with holidays', () => {
  it('skips holiday days in calculation', () => {
    // Wed Apr 8, Thu Apr 9 are holidays
    const start = kst(2026, 4, 7, 16, 0);  // Tue 16:00
    const end = kst(2026, 4, 10, 11, 0);   // Fri 11:00
    // 2h Tue + 0h Wed (holiday) + 0h Thu (holiday) + 2h Fri = 4h
    expect(getBusinessHoursBetween(start, end, HOLIDAYS)).toBe(4);
  });

  it('returns 0 when both dates are on holidays', () => {
    const start = kst(2026, 4, 8, 10, 0);  // Wed holiday
    const end = kst(2026, 4, 9, 14, 0);    // Thu holiday
    // Both clamped to Fri 09:00 -> 0
    expect(getBusinessHoursBetween(start, end, HOLIDAYS)).toBe(0);
  });

  it('handles start on holiday', () => {
    const start = kst(2026, 4, 8, 10, 0);  // Wed (holiday)
    const end = kst(2026, 4, 10, 12, 0);   // Fri 12:00
    // Start clamped to Fri 09:00, end Fri 12:00 -> 3h
    expect(getBusinessHoursBetween(start, end, HOLIDAYS)).toBe(3);
  });
});

// ============================================================
// Edge cases
// ============================================================
describe('edge cases', () => {
  it('handles new year boundary', () => {
    const start = kst(2025, 12, 31, 16, 0); // Wed Dec 31 16:00
    const end = kst(2026, 1, 2, 11, 0);     // Fri Jan 2 11:00
    // 2h Wed + 9h Thu + 2h Fri = 13h
    expect(getBusinessHoursBetween(start, end)).toBe(13);
  });

  it('handles new year with Jan 1 holiday', () => {
    const jan1 = [new Date(2026, 0, 1)]; // Jan 1 = Thu
    const start = kst(2025, 12, 31, 16, 0); // Wed Dec 31 16:00
    const end = kst(2026, 1, 2, 11, 0);     // Fri Jan 2 11:00
    // 2h Wed + 0h Thu (holiday) + 2h Fri = 4h
    expect(getBusinessHoursBetween(start, end, jan1)).toBe(4);
  });

  it('addBusinessHours large value: 45 hours = one full week', () => {
    const start = kst(2026, 4, 6, 9, 0); // Mon 09:00
    const result = addBusinessHours(start, 45);
    expect(result.getTime()).toBe(kst(2026, 4, 10, 18, 0).getTime()); // Fri 18:00
  });

  it('addBusinessHours: 54 hours = 6 business days', () => {
    const start = kst(2026, 4, 6, 9, 0);  // Mon 09:00
    const result = addBusinessHours(start, 54);
    // 5 days (Mon-Fri) = 45h, skip weekend, 1 day Mon = 9h -> total 54h = next Mon 18:00
    expect(result.getTime()).toBe(kst(2026, 4, 13, 18, 0).getTime());
  });

  it('addBusinessHours with start before midnight KST', () => {
    // 23:00 KST on Sunday -> should clamp to Monday 09:00
    const start = kst(2026, 4, 12, 23, 0); // Sun 23:00 KST
    const result = addBusinessHours(start, 1);
    expect(result.getTime()).toBe(kst(2026, 4, 13, 10, 0).getTime()); // Mon 10:00
  });

  it('getBusinessHoursBetween: both before business hours same day', () => {
    const start = kst(2026, 4, 6, 6, 0);
    const end = kst(2026, 4, 6, 8, 0);
    // Both clamped to 09:00, so 0 hours
    expect(getBusinessHoursBetween(start, end)).toBe(0);
  });

  it('getBusinessHoursBetween: both after business hours same day', () => {
    const start = kst(2026, 4, 6, 19, 0);
    const end = kst(2026, 4, 6, 21, 0);
    // Both clamped to next day 09:00, so 0 hours
    expect(getBusinessHoursBetween(start, end)).toBe(0);
  });

  it('addBusinessHours: exactly at day boundary with holiday next day', () => {
    const start = kst(2026, 4, 7, 18, 0); // Tue 18:00
    const result = addBusinessHours(start, 1, HOLIDAYS);
    // Next business day is Fri, so Fri 10:00
    expect(result.getTime()).toBe(kst(2026, 4, 10, 10, 0).getTime());
  });

  it('addBusinessHours: very small fractional hours', () => {
    const start = kst(2026, 4, 6, 9, 0);
    const result = addBusinessHours(start, 0.25); // 15 minutes
    expect(result.getTime()).toBe(kst(2026, 4, 6, 9, 15).getTime());
  });
});

// ============================================================
// Consistency: addBusinessHours + getBusinessHoursBetween roundtrip
// ============================================================
describe('roundtrip consistency', () => {
  it('add then measure should return the added hours (simple case)', () => {
    const start = kst(2026, 4, 6, 10, 0);
    const end = addBusinessHours(start, 5);
    expect(getBusinessHoursBetween(start, end)).toBeCloseTo(5, 10);
  });

  it('add then measure should return the added hours (cross-weekend)', () => {
    const start = kst(2026, 4, 10, 14, 0); // Fri 14:00
    const end = addBusinessHours(start, 8);
    expect(getBusinessHoursBetween(start, end)).toBeCloseTo(8, 10);
  });

  it('add then measure should return the added hours (with holidays)', () => {
    const start = kst(2026, 4, 7, 14, 0); // Tue 14:00
    const end = addBusinessHours(start, 10, HOLIDAYS);
    expect(getBusinessHoursBetween(start, end, HOLIDAYS)).toBeCloseTo(10, 10);
  });

  it('add then measure should return the added hours (full week)', () => {
    const start = kst(2026, 4, 6, 9, 0);
    const end = addBusinessHours(start, 45);
    expect(getBusinessHoursBetween(start, end)).toBeCloseTo(45, 10);
  });
});
