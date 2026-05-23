import { Router } from "express";
import { eq, or, asc, sql, inArray } from "drizzle-orm";
import { getDb } from "../db/db";
import { users, messages, transactions } from "../db/schema";
import { aliasedTable } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { sendMessageSchema } from "@soulseer/shared/validators";
import { logger } from "../utils/logger";
import { z } from "zod";

const router = Router();

const senderUsers = aliasedTable(users, "sender");
const receiverUsers = aliasedTable(users, "receiver");

// Zod validation middleware snippet
const validateBody = (schema: z.AnyZodObject) => {
  return (req: any, res: any, next: any) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      next(error);
    }
  };
};


// ─── GET /api/messages — Fetch user's message history ────────────────────────
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user!.id;

    const rawMessages = await db
      .select({
        id: messages.id,
        senderId: messages.senderId,
        receiverId: messages.receiverId,
        content: messages.content,
        price: messages.price,
        isRead: messages.isRead,
        createdAt: messages.createdAt,
        sender: {
          id: senderUsers.id,
          username: senderUsers.username,
          fullName: senderUsers.fullName,
          profileImage: senderUsers.profileImage,
          role: senderUsers.role,
        },
        receiver: {
          id: receiverUsers.id,
          username: receiverUsers.username,
          fullName: receiverUsers.fullName,
          profileImage: receiverUsers.profileImage,
          role: receiverUsers.role,
        },
      })
      .from(messages)
      .innerJoin(senderUsers, eq(messages.senderId, senderUsers.id))
      .innerJoin(receiverUsers, eq(messages.receiverId, receiverUsers.id))
      .where(or(eq(messages.senderId, userId), eq(messages.receiverId, userId)))
      .orderBy(asc(messages.createdAt));

    // Mark free unread messages as read automatically for the receiver
    const unreadFreeMessageIds = rawMessages
      .filter((m) => m.receiverId === userId && m.price === 0 && !m.isRead)
      .map((m) => m.id);

    if (unreadFreeMessageIds.length > 0) {
      // Do it in the background to not block the request
      db.update(messages)
        .set({ isRead: true })
        // @ts-ignore
        .where(inArray(messages.id, unreadFreeMessageIds))
        .execute()
        .catch((err) => logger.error({ err }, "Failed to mark free messages as read"));
    }

    // Obscure paid message content
    const safeMessages = rawMessages.map((m) => {
      // If we are the receiver, it's unread, and it costs money -> obscure
      if (m.receiverId === userId && !m.isRead && m.price > 0) {
        return {
          ...m,
          content: "[Premium Message - Unlock to Read]",
        };
      }
      // If we marked it read just now, update the returned object so UI knows
      if (unreadFreeMessageIds.includes(m.id)) {
        return { ...m, isRead: true };
      }
      return m;
    });

    res.json(safeMessages);
  } catch (err) {
    next(err);
  }
});


// ─── POST /api/messages/:receiverId — Send a message ────────────────────────
router.post(
  "/:receiverId",
  requireAuth,
  validateBody(sendMessageSchema),
  async (req, res, next) => {
    try {
      const db = getDb();
      const sender = req.user!;
      const receiverIdParam = req.params.receiverId || "";
      const receiverId = parseInt(receiverIdParam, 10);
      const { content, price } = req.body;

      if (isNaN(receiverId) || receiverId <= 0) {
        res.status(400).json({ error: "Invalid receiver ID" });
        return;
      }

      if (sender.id === receiverId) {
        res.status(400).json({ error: "Cannot message yourself" });
        return;
      }

      const [receiver] = await db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.id, receiverId));

      if (!receiver) {
        res.status(404).json({ error: "Receiver not found" });
        return;
      }

      let finalPrice = price || 0;

      if (sender.role === "client") {
        finalPrice = 0;
      } else if (sender.role === "reader") {
        if (receiver.role !== "client") {
          finalPrice = 0;
        }
      }

      const [newMessage] = await db
        .insert(messages)
        .values({
          senderId: sender.id,
          receiverId: receiver.id,
          content,
          price: finalPrice,
          isRead: false,
        })
        .returning();

      if (!newMessage) {
        throw new Error("Failed to insert message");
      }

      logger.info({ senderId: sender.id, receiverId, messageId: newMessage.id, price: finalPrice }, "Message sent");

      res.status(201).json(newMessage);
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/messages/:id/unlock — Unlock/Read a message ──────────────────
router.post("/:id/unlock", requireAuth, async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user!.id;
    const messageIdParam = req.params.id || "";
    const messageId = parseInt(messageIdParam, 10);

    if (isNaN(messageId) || messageId <= 0) {
      res.status(400).json({ error: "Invalid message ID" });
      return;
    }

    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId));

    if (!message) {
      res.status(404).json({ error: "Message not found" });
      return;
    }

    if (message.receiverId !== userId) {
      res.status(403).json({ error: "Not authorized to unlock this message" });
      return;
    }

    if (message.isRead) {
      res.status(400).json({ error: "Message is already read" });
      return;
    }

    if (message.price === 0) {
      const [updated] = await db
        .update(messages)
        .set({ isRead: true })
        .where(eq(messages.id, messageId))
        .returning();

      res.json({ success: true, message: updated });
      return;
    }

    const price = message.price;
    const readerShare = Math.floor(price * 0.70);

    let insufficientBalance = false;
    let updatedMessage = null;

    await db.transaction(async (tx) => {
      const [client] = await tx
        .select({ balance: users.balance })
        .from(users)
        .where(eq(users.id, userId));

      if (!client || client.balance < price) {
        insufficientBalance = true;
        return;
      }

      const [updatedClient] = await tx
        .update(users)
        .set({
          balance: sql`${users.balance} - ${price}`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning({ balance: users.balance });

      if (!updatedClient) throw new Error("Failed to update client balance");

      await tx.insert(transactions).values({
        userId: userId,
        type: "message_charge" as any,
        amount: -price,
        balanceBefore: client.balance,
        balanceAfter: updatedClient.balance,
        note: `Unlocked message from reader #${message.senderId}`,
      });

      const [reader] = await tx
        .select({ balance: users.balance })
        .from(users)
        .where(eq(users.id, message.senderId));

      const readerBalanceBefore = reader?.balance || 0;

      const [updatedReader] = await tx
        .update(users)
        .set({
          balance: sql`${users.balance} + ${readerShare}`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, message.senderId))
        .returning({ balance: users.balance });

      if (!updatedReader) throw new Error("Failed to update reader balance");

      await tx.insert(transactions).values({
        userId: message.senderId,
        type: "reader_payout" as any,
        amount: readerShare,
        balanceBefore: readerBalanceBefore,
        balanceAfter: updatedReader.balance,
        note: `Client #${userId} unlocked message`,
      });

      const [resMessage] = await tx
        .update(messages)
        .set({ isRead: true })
        .where(eq(messages.id, messageId))
        .returning();

      updatedMessage = resMessage;
    });

    if (insufficientBalance || !updatedMessage) {
      res.status(402).json({ error: "Insufficient balance to unlock this message" });
      return;
    }

    logger.info({ userId, messageId, price }, "Premium message unlocked");
    res.json({ success: true, message: updatedMessage });
  } catch (err) {
    next(err);
  }
});

export default router;
