import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

// ─── Enums ──────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", [
  "client",
  "reader",
  "admin",
]);

export const readingTypeEnum = pgEnum("reading_type", [
  "chat",
  "voice",
  "video",
]);

export const readingStatusEnum = pgEnum("reading_status", [
  "pending",
  "accepted",
  "in_progress",
  "active",
  "paused",
  "completed",
  "cancelled",
  "missed",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "paid",
  "refunded",
]);

export const transactionTypeEnum = pgEnum("transaction_type", [
  "topup",
  "reading_charge",
  "reader_payout",
  "refund",
  "admin_adjustment",
]);

// ─── Users ──────────────────────────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    auth0Id: varchar("auth0_id", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    username: varchar("username", { length: 100 }),
    fullName: varchar("full_name", { length: 255 }),
    role: userRoleEnum("role").notNull().default("client"),

    // Profile
    profileImage: text("profile_image"),
    bio: text("bio"),
    specialties: text("specialties"), // comma-separated

    // Reader pricing (cents per minute)
    pricingChat: integer("pricing_chat").notNull().default(0),
    pricingVoice: integer("pricing_voice").notNull().default(0),
    pricingVideo: integer("pricing_video").notNull().default(0),

    // Reader status
    isOnline: boolean("is_online").notNull().default(false),

    // Client balance (cents, integer only)
    balance: integer("balance").notNull().default(0),

    // Reader stats
    totalReadings: integer("total_readings").notNull().default(0),

    // Stripe Connect
    stripeAccountId: varchar("stripe_account_id", { length: 255 }),
    stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    // Soft-delete timestamp (set by DELETE /api/me). When non-null the row is
    // retained for FK integrity on historical readings/transactions but PII is
    // scrubbed and the user is excluded from public listings.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    auth0IdIdx: uniqueIndex("users_auth0_id_idx").on(table.auth0Id),
    emailIdx: uniqueIndex("users_email_idx").on(table.email),
    roleIdx: index("users_role_idx").on(table.role),
    isOnlineIdx: index("users_is_online_idx").on(table.isOnline),
    deletedAtIdx: index("users_deleted_at_idx").on(table.deletedAt),
  }),
);

// ─── Readings ───────────────────────────────────────────────────────────────

export const readings = pgTable(
  "readings",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id")
      .notNull()
      .references(() => users.id),
    readerId: integer("reader_id")
      .notNull()
      .references(() => users.id),

    readingType: readingTypeEnum("reading_type").notNull(),
    status: readingStatusEnum("status").notNull().default("pending"),

    // Pricing snapshot (cents per minute at time of reading)
    ratePerMinute: integer("rate_per_minute").notNull(),

    // Timing
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    durationSeconds: integer("duration_seconds").notNull().default(0),

    // Billing
    totalCharged: integer("total_charged").notNull().default(0),
    readerEarned: integer("reader_earned").notNull().default(0),
    platformEarned: integer("platform_earned").notNull().default(0),

    // Agora
    agoraChannel: varchar("agora_channel", { length: 255 }),

    // Payment
    paymentStatus: paymentStatusEnum("payment_status").notNull().default("pending"),

    // Chat transcript (chat sessions only)
    chatTranscript: jsonb("chat_transcript"),

    // Rating
    rating: integer("rating"), // 1-5 stars
    review: text("review"),

    // Grace period tracking
    lastHeartbeat: timestamp("last_heartbeat", { withTimezone: true }),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    clientIdIdx: index("readings_client_id_idx").on(table.clientId),
    readerIdIdx: index("readings_reader_id_idx").on(table.readerId),
    statusIdx: index("readings_status_idx").on(table.status),
  }),
);

// ─── Transactions ───────────────────────────────────────────────────────────

export const transactions = pgTable(
  "transactions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    readingId: integer("reading_id").references(() => readings.id),

    type: transactionTypeEnum("type").notNull(),
    amount: integer("amount").notNull(), // cents (positive = credit, negative = debit)
    balanceBefore: integer("balance_before").notNull().default(0), // balance before this tx
    balanceAfter: integer("balance_after").notNull(), // balance after this tx

    note: text("note"),

    // Stripe
    stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdIdx: index("transactions_user_id_idx").on(table.userId),
    readingIdIdx: index("transactions_reading_id_idx").on(table.readingId),
    typeIdx: index("transactions_type_idx").on(table.type),
  }),
);

// ─── Forum Posts ────────────────────────────────────────────────────────────

export const forumPosts = pgTable(
  "forum_posts",
  {
    id: serial("id").primaryKey(),
    authorId: integer("author_id")
      .notNull()
      .references(() => users.id),

    title: varchar("title", { length: 255 }).notNull(),
    content: text("content").notNull(),
    category: varchar("category", { length: 100 }).notNull().default("General"),

    isPinned: boolean("is_pinned").notNull().default(false),
    isLocked: boolean("is_locked").notNull().default(false),
    flagCount: integer("flag_count").notNull().default(0),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    authorIdIdx: index("forum_posts_author_id_idx").on(table.authorId),
    categoryIdx: index("forum_posts_category_idx").on(table.category),
    createdAtIdx: index("forum_posts_created_at_idx").on(table.createdAt),
  }),
);

// ─── Forum Comments ─────────────────────────────────────────────────────────

export const forumComments = pgTable(
  "forum_comments",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id")
      .notNull()
      .references(() => forumPosts.id, { onDelete: "cascade" }),
    authorId: integer("author_id")
      .notNull()
      .references(() => users.id),

    content: text("content").notNull(),
    flagCount: integer("flag_count").notNull().default(0),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    postIdIdx: index("forum_comments_post_id_idx").on(table.postId),
    authorIdIdx: index("forum_comments_author_id_idx").on(table.authorId),
  }),
);

// ─── Forum Flags ────────────────────────────────────────────────────────────

export const forumFlags = pgTable(
  "forum_flags",
  {
    id: serial("id").primaryKey(),
    reporterId: integer("reporter_id")
      .notNull()
      .references(() => users.id),

    postId: integer("post_id").references(() => forumPosts.id, {
      onDelete: "cascade",
    }),
    commentId: integer("comment_id").references(() => forumComments.id, {
      onDelete: "cascade",
    }),

    reason: text("reason").notNull(),
    resolved: boolean("resolved").notNull().default(false),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    resolvedIdx: index("forum_flags_resolved_idx").on(table.resolved),
  }),
);

// ─── Relations ──────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  clientReadings: many(readings, { relationName: "clientReadings" }),
  readerReadings: many(readings, { relationName: "readerReadings" }),
  transactions: many(transactions),
  forumPosts: many(forumPosts),
  forumComments: many(forumComments),
  forumFlags: many(forumFlags),
}));

export const readingsRelations = relations(readings, ({ one, many }) => ({
  client: one(users, {
    fields: [readings.clientId],
    references: [users.id],
    relationName: "clientReadings",
  }),
  reader: one(users, {
    fields: [readings.readerId],
    references: [users.id],
    relationName: "readerReadings",
  }),
  transactions: many(transactions),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, {
    fields: [transactions.userId],
    references: [users.id],
  }),
  reading: one(readings, {
    fields: [transactions.readingId],
    references: [readings.id],
  }),
}));

export const forumPostsRelations = relations(forumPosts, ({ one, many }) => ({
  author: one(users, {
    fields: [forumPosts.authorId],
    references: [users.id],
  }),
  comments: many(forumComments),
  flags: many(forumFlags),
}));

export const forumCommentsRelations = relations(
  forumComments,
  ({ one }) => ({
    post: one(forumPosts, {
      fields: [forumComments.postId],
      references: [forumPosts.id],
    }),
    author: one(users, {
      fields: [forumComments.authorId],
      references: [users.id],
    }),
  }),
);

export const forumFlagsRelations = relations(forumFlags, ({ one }) => ({
  post: one(forumPosts, {
    fields: [forumFlags.postId],
    references: [forumPosts.id],
  }),
  comment: one(forumComments, {
    fields: [forumFlags.commentId],
    references: [forumComments.id],
  }),
  reporter: one(users, {
    fields: [forumFlags.reporterId],
    references: [users.id],
  }),
}));

// ─── Newsletter Subscribers ─────────────────────────────────────────────────
export const newsletterSubscribers = pgTable(
  "newsletter_subscribers",
  {
    id: serial("id").primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailIdx: uniqueIndex("newsletter_subscribers_email_idx").on(table.email),
  }),
);
