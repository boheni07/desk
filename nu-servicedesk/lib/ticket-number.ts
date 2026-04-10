// Design Ref: §채번 로직 — Redis INCR + DB fallback
// Plan SC: SC-10 티켓 번호 TK-YYYY-00000 채번 정확도, 중복/누락 0건

import { redis } from './redis';
import { prisma } from './prisma';
import { logger } from './logger';

const SEQ_PREFIX = 'ticket:seq:';

/**
 * Generate a sequential ticket number: TK-YYYY-NNNNN
 *
 * Uses Redis INCR for atomic sequence per year.
 * On Redis miss (cold start or eviction), initializes from DB.
 * Falls back to DB-only if Redis is unavailable.
 */
export async function generateTicketNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const redisKey = `${SEQ_PREFIX}${year}`;

  try {
    // Try Redis INCR first (atomic)
    let seq = await redis.incr(redisKey);

    // If seq === 1, this might be a cold start — sync from DB
    if (seq === 1) {
      const dbSeq = await prisma.ticketSequence.findUnique({
        where: { year },
      });

      if (dbSeq && dbSeq.lastNumber > 0) {
        // DB has a higher number — reset Redis to match
        await redis.set(redisKey, dbSeq.lastNumber + 1);
        seq = dbSeq.lastNumber + 1;
      }

      // Set TTL to expire at end of year + 1 month buffer
      const endOfYear = new Date(year + 1, 1, 1); // Feb 1 next year
      const ttlSeconds = Math.floor((endOfYear.getTime() - Date.now()) / 1000);
      if (ttlSeconds > 0) {
        await redis.expire(redisKey, ttlSeconds);
      }
    }

    // Sync to DB (upsert for durability)
    await prisma.ticketSequence.upsert({
      where: { year },
      update: { lastNumber: seq },
      create: { year, lastNumber: seq },
    });

    return formatTicketNumber(year, seq);
  } catch (error) {
    // Fallback: DB-only atomic increment
    logger.warn({ error }, 'Redis ticket sequence failed, falling back to DB');
    return generateTicketNumberFromDB(year);
  }
}

/**
 * DB-only fallback using Prisma transaction.
 */
async function generateTicketNumberFromDB(year: number): Promise<string> {
  const result = await prisma.$queryRaw<{ last_number: number }[]>`
    INSERT INTO ticket_sequences (year, last_number)
    VALUES (${year}, 1)
    ON CONFLICT (year)
    DO UPDATE SET last_number = ticket_sequences.last_number + 1
    RETURNING last_number
  `;

  const seq = result[0].last_number;
  return formatTicketNumber(year, seq);
}

/**
 * Format: TK-YYYY-NNNNN (5-digit zero-padded)
 */
function formatTicketNumber(year: number, seq: number): string {
  return `TK-${year}-${String(seq).padStart(5, '0')}`;
}
