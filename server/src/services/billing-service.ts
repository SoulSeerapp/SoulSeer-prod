import { eq, and, lt, sql, inArray } from "drizzle-orm";
import { getDb } from "../db/db";
import { users, readings, transactions } from "../db/schema";
import { wsService } from "./websocket-service";
import { logger } from "../utils/logger";

const TICK_INTERVAL_MS = 60_000; // 1 minute
const GRACE_PERIOD_MS = 120_000; // 2 minutes

class BillingService {
  private timer: NodeJS.Timeout | null = null;

  start(): void {
    logger.info("Billing service initialized (cron-driven)");
  }

  shutdown(): void {
    logger.info("Billing service stopped");
  }

  public async tick(): Promise<void> {
    try {
      const db = getDb();

      // 1) Check for stale heartbeats -> missed readings (grace period expired)
      const graceCutoff = new Date(Date.now() - GRACE_PERIOD_MS);
      const stale = await db
        .select()
        .from(readings)
        .where(
          and(eq(readings.status, "active"), lt(readings.lastHeartbeat, graceCutoff)),
        );

      for (const reading of stale) {
        await this.endReading(reading.id, "missed", "grace_period_expired");
        logger.warn({ readingId: reading.id }, "Reading ended due to stale heartbeat (grace period expired)");
      }

      // 2) Charge active readings per minute
      const active = await db
        .select()
        .from(readings)
        .where(eq(readings.status, "active"));

      for (const reading of active) {
        await this.chargeMinute(reading);
      }
    } catch (err) {
      logger.error({ err }, "Billing tick error");
    }
  }

  private async chargeMinute(
    reading: typeof readings.$inferSelect,
  ): Promise<void> {
    const db = getDb();
    const rate = reading.ratePerMinute;
    if (rate <= 0) return;

    // Charge 1 minute atomically — balance check INSIDE the transaction
    // to prevent race conditions per build guide section 8.4
    // Modified to 60% reader / 40% platform as requested
    const readerShare = Math.floor(rate * 0.60);
    const platformShare = rate - readerShare;

    let insufficientBalance = false;

    await db.transaction(async (tx) => {
      // Check balance inside the transaction for atomicity
      const [client] = await tx
        .select({ balance: users.balance })
        .from(users)
        .where(eq(users.id, reading.clientId));

      if (!client || client.balance < rate) {
        insufficientBalance = true;
        return; // rollback — no changes made
      }

      await tx
        .update(readings)
        .set({
          durationSeconds: sql`${readings.durationSeconds} + 60`,
          totalCharged: sql`${readings.totalCharged} + ${rate}`,
          readerEarned: sql`${readings.readerEarned} + ${readerShare}`,
          platformEarned: sql`${readings.platformEarned} + ${platformShare}`,
          updatedAt: new Date(),
        })
        .where(eq(readings.id, reading.id));

      await tx
        .update(users)
        .set({
          balance: sql`${users.balance} - ${rate}`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, reading.clientId));
    });

    if (insufficientBalance) {
      // End reading outside transaction since endReading has its own transaction
      await this.endReading(reading.id, "completed", "insufficient_balance");
      wsService.broadcast(
        [reading.clientId, reading.readerId],
        "reading:insufficient_balance",
        { readingId: reading.id },
      );
      logger.info(
        { readingId: reading.id, rate },
        "Reading ended due to insufficient balance",
      );
      return;
    }

    logger.debug(
      { readingId: reading.id, rate, readerShare, platformShare },
      "Billed 1 minute",
    );
  }

  private async endReading(
    readingId: number,
    status: "completed" | "missed",
    reason?: "insufficient_balance" | "grace_period_expired",
  ): Promise<void> {
    const db = getDb();
    const now = new Date();
    const [reading] = await db
      .select()
      .from(readings)
      .where(eq(readings.id, readingId));
    if (!reading) return;

    await db.transaction(async (tx) => {
      // Re-fetch inside transaction to prevent race with readings/:id/end
      const [fresh] = await tx
        .select()
        .from(readings)
        .where(eq(readings.id, readingId));

      if (!fresh || fresh.status === "completed" || fresh.status === "cancelled") {
        return; // Already finalized by another path
      }

      // Update reading status
      await tx
        .update(readings)
        .set({
          status,
          completedAt: now,
          paymentStatus: fresh.totalCharged > 0 ? "paid" : "pending",
          updatedAt: now,
        })
        .where(eq(readings.id, readingId));

      // Credit reader balance using fresh data
      if (fresh.readerEarned > 0) {
        const [readerBefore] = await tx
          .select({ balance: users.balance })
          .from(users)
          .where(eq(users.id, fresh.readerId));

        const [readerAfter] = await tx
          .update(users)
          .set({
            balance: sql`${users.balance} + ${fresh.readerEarned}`,
            totalReadings: sql`${users.totalReadings} + 1`,
            updatedAt: now,
          })
          .where(eq(users.id, fresh.readerId))
          .returning({ balance: users.balance });

        await tx.insert(transactions).values({
          userId: fresh.readerId,
          readingId,
          type: "reader_payout",
          amount: fresh.readerEarned,
          balanceBefore: readerBefore?.balance ?? 0,
          balanceAfter: readerAfter?.balance ?? 0,
          note: `Earned from reading #${readingId}`,
        });
      }

      // Record client charge transaction
      if (fresh.totalCharged > 0) {
        const [clientAfter] = await tx
          .select({ balance: users.balance })
          .from(users)
          .where(eq(users.id, fresh.clientId));

        await tx.insert(transactions).values({
          userId: fresh.clientId,
          readingId,
          type: "reading_charge",
          amount: -fresh.totalCharged,
          balanceBefore: (clientAfter?.balance ?? 0) + fresh.totalCharged,
          balanceAfter: clientAfter?.balance ?? 0,
          note: `Charged for reading #${readingId}`,
        });
      }
    });

    // Re-fetch the finalized reading so we can broadcast authoritative totals
    // to both participants (client needs these to render the session summary).
    const [finalized] = await db
      .select()
      .from(readings)
      .where(eq(readings.id, readingId));

    wsService.broadcast(
      [reading.clientId, reading.readerId],
      "reading:ended",
      {
        readingId,
        status,
        reason,
        durationSeconds: finalized?.durationSeconds ?? reading.durationSeconds ?? 0,
        totalCharged: finalized?.totalCharged ?? reading.totalCharged ?? 0,
        readerEarned: finalized?.readerEarned ?? reading.readerEarned ?? 0,
        ratePerMinute: reading.ratePerMinute,
      },
    );

    logger.info(
      {
        readingId,
        status,
        totalCharged: finalized?.totalCharged ?? reading.totalCharged,
        readerEarned: finalized?.readerEarned ?? reading.readerEarned,
      },
      "Reading ended by billing service",
    );
  }

  /**
   * Called when a reader toggles offline or their socket closes mid-session.
   * Pauses all active/accepted/in_progress readings for that reader and
   * notifies both participants. Billing ticks skip any non-active status so
   * charging stops immediately. Clients can then choose to end the session
   * or wait for the reader to come back online.
   */
  async handleReaderOffline(readerId: number): Promise<void> {
    const db = getDb();
    const now = new Date();

    const sessions = await db
      .select({ id: readings.id, clientId: readings.clientId, status: readings.status })
      .from(readings)
      .where(
        and(
          eq(readings.readerId, readerId),
          inArray(readings.status, ["accepted", "in_progress", "active"] as const),
        ),
      );

    if (sessions.length > 0) {
      await db
        .update(readings)
        .set({ status: "paused", updatedAt: now })
        .where(
          and(
            eq(readings.readerId, readerId),
            inArray(readings.status, ["accepted", "in_progress", "active"] as const),
          ),
        );

      for (const s of sessions) {
        wsService.broadcast(
          [s.clientId, readerId],
          "reading:partner_disconnected",
          { readingId: s.id, partnerRole: "reader", previousStatus: s.status },
        );
        logger.info({ readingId: s.id, readerId }, "Reading paused: reader went offline");
      }
    }

    // Also cancel any still-pending requests so the client UI clears them.
    const pending = await db
      .select({ id: readings.id, clientId: readings.clientId })
      .from(readings)
      .where(and(eq(readings.readerId, readerId), eq(readings.status, "pending")));

    if (pending.length > 0) {
      await db
        .update(readings)
        .set({ status: "cancelled", updatedAt: now })
        .where(and(eq(readings.readerId, readerId), eq(readings.status, "pending")));

      for (const p of pending) {
        wsService.broadcast(
          [p.clientId, readerId],
          "reading:cancelled",
          { readingId: p.id, reason: "reader_offline" },
        );
      }
    }
  }
}

export const billingService = new BillingService();
