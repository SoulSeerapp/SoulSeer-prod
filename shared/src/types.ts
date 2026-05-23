import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type {
  users,
  readings,
  transactions,
  forumPosts,
  forumComments,
  forumFlags,
} from "./schema.js";

// ─── Table Row Types (Select = full row from DB) ────────────────────────────

export type SelectUser = InferSelectModel<typeof users>;
export type SelectReading = InferSelectModel<typeof readings>;
export type SelectTransaction = InferSelectModel<typeof transactions>;
export type SelectForumPost = InferSelectModel<typeof forumPosts>;
export type SelectForumComment = InferSelectModel<typeof forumComments>;
export type SelectForumFlag = InferSelectModel<typeof forumFlags>;

// ─── Insert Types (for creating new rows) ───────────────────────────────────

export type InsertUser = InferInsertModel<typeof users>;
export type InsertReading = InferInsertModel<typeof readings>;
export type InsertTransaction = InferInsertModel<typeof transactions>;
export type InsertForumPost = InferInsertModel<typeof forumPosts>;
export type InsertForumComment = InferInsertModel<typeof forumComments>;
export type InsertForumFlag = InferInsertModel<typeof forumFlags>;

// ─── Enum Value Types ───────────────────────────────────────────────────────

export type UserRole = SelectUser["role"];
export type ReadingType = SelectReading["readingType"];
export type ReadingStatus = SelectReading["status"];
export type TransactionType = SelectTransaction["type"];
export type ForumCategory = SelectForumPost["category"];

// ─── API Response Wrappers ──────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

// ─── Business Constants ─────────────────────────────────────────────────────

export const PLATFORM_FEE_PERCENT = 30;
export const READER_SHARE_PERCENT = 70;
export const MIN_TOP_UP_CENTS = 500;
export const MIN_BALANCE_FOR_READING_CENTS = 500;
export const BILLING_INTERVAL_SECONDS = 60;
export const DISCONNECT_GRACE_SECONDS = 120;
export const FORUM_POSTS_PER_PAGE = 10;
export const MAX_RATING = 5;
export const MIN_RATING = 1;
