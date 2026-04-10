// Shared holiday helper — single source of truth for holiday queries
// Replaces duplicated getHolidays()/getHolidaysForWorkflow() across workflow + jobs

import { prisma } from '@/lib/prisma';

/**
 * Fetch holidays for business hours calculation.
 * Covers current year ±1 for year-boundary edge cases.
 */
export async function getHolidays(): Promise<Date[]> {
  const currentYear = new Date().getFullYear();
  const holidays = await prisma.holiday.findMany({
    where: { year: { in: [currentYear - 1, currentYear, currentYear + 1] } },
    select: { date: true },
  });
  return holidays.map((h) => h.date);
}
