import { z } from "zod";

// ─── Shared Primitives ──────────────────────────────────────────────────────

const positiveId = z.number().int().positive();
const nonNegInt = z.number().int().nonnegative();

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
});

// ─── Enum Validators ────────────────────────────────────────────────────────

export const userRoleSchema = z.enum(["client", "reader", "admin"]);
export const readingTypeSchema = z.enum(["chat", "voice", "video"]);
export const readingStatusSchema = z.enum(["pending", "accepted", "in_progress", "completed", "cancelled", "disputed"]);
export const paymentStatusSchema = z.enum(["pending", "paid", "refunded"]);
export const transactionTypeSchema = z.enum(["top_up", "reading_charge", "reader_credit", "payout", "adjustment", "refund"]);
export const forumCategorySchema = z.enum(["general", "readings", "spiritual_growth", "ask_a_reader", "announcements"]);

// ─── Auth / User Sync ───────────────────────────────────────────────────────

export const userSyncSchema = z.object({
  auth0Id: z.string().min(1, "Auth0 ID is required").max(255),
  email: z.string().email("Invalid email").max(255),
  fullName: z.string().max(255).optional(),
  profileImage: z.string().url().max(512).optional(),
});

// ─── User Profile ───────────────────────────────────────────────────────────

export const updateProfileSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/, "Letters, numbers, hyphens, underscores only").optional(),
  fullName: z.string().min(1).max(255).optional(),
  bio: z.string().max(2000).optional(),
  profileImage: z.string().url().max(512).optional(),
});

export const updatePricingSchema = z.object({
  pricingChat: nonNegInt.max(100_000).optional(),
  pricingVoice: nonNegInt.max(100_000).optional(),
  pricingVideo: nonNegInt.max(100_000).optional(),
}).refine(d => d.pricingChat !== undefined || d.pricingVoice !== undefined || d.pricingVideo !== undefined, {
  message: "At least one pricing field required",
});

export const updateOnlineStatusSchema = z.object({ isOnline: z.boolean() });

// ─── Readings ───────────────────────────────────────────────────────────────

export const createReadingSchema = z.object({
  readerId: positiveId,
  type: readingTypeSchema,
});

export const updateReadingStatusSchema = z.object({ status: readingStatusSchema });

// ─── Payments ───────────────────────────────────────────────────────────────

export const createTopUpSchema = z.object({
  amount: z.number().int("Amount must be whole cents").min(500, "Minimum $5.00").max(1_000_000, "Maximum $10,000"),
});

export const balanceAdjustmentSchema = z.object({
  userId: positiveId,
  amount: z.number().int().min(-1_000_000_00).max(1_000_000_00).refine(v => v !== 0, "Amount cannot be zero"),
  note: z.string().min(1, "Note required").max(500),
});

export const payoutRequestSchema = z.object({ readerId: positiveId });

// ─── Reviews ────────────────────────────────────────────────────────────────

export const createReviewSchema = z.object({
  readingId: positiveId,
  rating: z.number().int().min(1, "Min 1").max(5, "Max 5"),
  comment: z.string().max(2000).optional(),
});

// ─── Forum ──────────────────────────────────────────────────────────────────

export const createForumPostSchema = z.object({
  title: z.string().min(1, "Title required").max(200),
  content: z.string().min(1, "Content required").max(10_000),
  category: forumCategorySchema,
});

export const createForumCommentSchema = z.object({
  content: z.string().min(1, "Comment required").max(5_000),
});

export const createFlagSchema = z.object({
  postId: positiveId.optional(),
  commentId: positiveId.optional(),
  reason: z.string().min(1, "Reason required").max(1_000),
}).refine(d => (d.postId !== undefined) !== (d.commentId !== undefined), {
  message: "Exactly one of postId or commentId must be provided",
});

// ─── Admin ──────────────────────────────────────────────────────────────────

export const createReaderSchema = z.object({
  email: z.string().email().max(255),
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/),
  fullName: z.string().min(1).max(255),
  bio: z.string().max(2000).optional(),
  specialties: z.array(z.string().min(1).max(100)).max(20).optional(),
  profileImage: z.string().url().max(512).optional(),
  pricingChat: nonNegInt.max(100_000).optional().default(0),
  pricingVoice: nonNegInt.max(100_000).optional().default(0),
  pricingVideo: nonNegInt.max(100_000).optional().default(0),
  password: z.string().min(8, "Min 8 characters").max(128),
});

export const updateReaderSchema = z.object({
  email: z.string().email().max(255).optional(),
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  fullName: z.string().min(1).max(255).optional(),
  bio: z.string().max(2000).optional(),
  specialties: z.array(z.string().min(1).max(100)).max(20).optional(),
  profileImage: z.string().url().max(512).optional(),
  pricingChat: nonNegInt.max(100_000).optional(),
  pricingVoice: nonNegInt.max(100_000).optional(),
  pricingVideo: nonNegInt.max(100_000).optional(),
  isOnline: z.boolean().optional(),
}).refine(d => Object.values(d).some(v => v !== undefined), {
  message: "At least one field required",
});

// ─── Query Filters ──────────────────────────────────────────────────────────

export const readerFilterSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(12),
  specialty: z.string().max(100).optional(),
  type: readingTypeSchema.optional(),
  online: z.string().transform(v => v === "true").optional(),
});

export const forumFilterSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(10),
  category: forumCategorySchema.optional(),
});

export const readingFilterSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(10),
  status: readingStatusSchema.optional(),
  type: readingTypeSchema.optional(),
});

export const transactionFilterSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  type: transactionTypeSchema.optional(),
});

export const adminUserFilterSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  role: userRoleSchema.optional(),
  search: z.string().max(100).optional(),
});

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// ─── Inferred Input Types ───────────────────────────────────────────────────

export type UserSyncInput = z.infer<typeof userSyncSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdatePricingInput = z.infer<typeof updatePricingSchema>;
export type UpdateOnlineStatusInput = z.infer<typeof updateOnlineStatusSchema>;
export type CreateReadingInput = z.infer<typeof createReadingSchema>;
export type UpdateReadingStatusInput = z.infer<typeof updateReadingStatusSchema>;
export type CreateTopUpInput = z.infer<typeof createTopUpSchema>;
export type BalanceAdjustmentInput = z.infer<typeof balanceAdjustmentSchema>;
export type PayoutRequestInput = z.infer<typeof payoutRequestSchema>;
export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type CreateForumPostInput = z.infer<typeof createForumPostSchema>;
export type CreateForumCommentInput = z.infer<typeof createForumCommentSchema>;
export type CreateFlagInput = z.infer<typeof createFlagSchema>;
export type CreateReaderInput = z.infer<typeof createReaderSchema>;
export type UpdateReaderInput = z.infer<typeof updateReaderSchema>;
export type ReaderFilterInput = z.infer<typeof readerFilterSchema>;
export type ForumFilterInput = z.infer<typeof forumFilterSchema>;
export type ReadingFilterInput = z.infer<typeof readingFilterSchema>;
export type TransactionFilterInput = z.infer<typeof transactionFilterSchema>;
export type AdminUserFilterInput = z.infer<typeof adminUserFilterSchema>;
export type IdParam = z.infer<typeof idParamSchema>;
