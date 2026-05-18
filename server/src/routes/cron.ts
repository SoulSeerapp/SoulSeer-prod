import { Router } from "express";
import { billingService } from "../services/billing-service";
import { logger } from "../utils/logger";

const router = Router();

// ─── GET /api/cron/billing-tick — Vercel Cron billing heartbeat ───────────────
router.get("/billing-tick", async (req, res, next) => {
  try {
    // Vercel Cron will send an authorization header we can verify in production
    // (e.g. Bearer $CRON_SECRET) but we leave it open here or verify it as needed.
    const authHeader = req.headers.authorization;
    if (
      process.env.CRON_SECRET &&
      authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      logger.warn("Unauthorized cron invocation");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    await billingService.tick();
    res.json({ ok: true, timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

export default router;
