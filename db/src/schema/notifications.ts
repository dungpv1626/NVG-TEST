/**
 * Trung tâm Thông báo và Việc cần làm.
 *
 * Webapp Flow Mục 5.4 tách rõ HAI danh sách, không gộp làm một:
 *  - `notifications` — thông tin MỘT CHIỀU ("biết để đó").
 *  - `tasks`         — việc CẦN THAO TÁC ("phải xử lý").
 *
 * PRD NEN-04: cảnh báo tự động cho việc quá hạn, hồ sơ thiếu chứng từ, giấy tờ sắp hết hạn
 * (nhắc trước 90/60/30/7 ngày), chi phí vượt ngân sách, công nợ đến hạn.
 *
 * Content Guidelines 3.4 — chống "nhàm cảnh báo":
 *  - Không lặp lại thông báo đã xử lý.
 *  - Chỉ gửi đến người THẬT SỰ cần xử lý, không gửi hàng loạt cho "chắc ăn".
 *  - Mỗi mục phải dẫn thẳng đến màn hình xử lý, không thông báo suông.
 */

import { index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { statusGroupEnum } from './_enums';
import { auditColumns } from './_audit';
import { primaryId, softDelete } from './_helpers';
import { optionalCompanyScoped } from './_scoped';
import { users } from './users';
import { relatedEntity } from './documents';

export const notifications = pgTable(
  'notifications',
  {
    id: primaryId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ...optionalCompanyScoped(),

    /**
     * Loại thông báo — quyết định mẫu nội dung dùng lại ở `@nvg/shared/content`
     * (NOTIFICATIONS). Ví dụ: `expiring_soon`, `budget_exceeded`, `debt_due`,
     * `handed_over`, `new_version`.
     */
    type: varchar('type', { length: 48 }).notNull(),

    /** Nội dung đã dựng sẵn theo mẫu Content Guidelines 5.3. */
    message: text('message').notNull(),

    ...relatedEntity(),

    /**
     * Đường dẫn dẫn THẲNG đến màn hình xử lý (Webapp Flow 5.4).
     * Bắt buộc có — thông báo không có lối đi tiếp là thông báo vô dụng.
     */
    actionUrl: text('action_url').notNull(),

    readAt: timestamp('read_at', { withTimezone: true }),

    ...auditColumns(),
  },
  (t) => [
    // Truy vấn nóng nhất: thông báo chưa đọc của một người.
    index('notifications_user_unread_idx').on(t.userId, t.readAt),
  ],
);

export const tasks = pgTable(
  'tasks',
  {
    id: primaryId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ...optionalCompanyScoped(),

    title: text('title').notNull(),
    description: text('description'),

    ...relatedEntity(),
    actionUrl: text('action_url').notNull(),

    /** Thời hạn xử lý — cột cố định trên mọi màn hình Danh sách (Webapp Flow 1.3). */
    dueDate: timestamp('due_date', { withTimezone: true }),

    status: statusGroupEnum('status').notNull().default('in_progress'),

    completedAt: timestamp('completed_at', { withTimezone: true }),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('tasks_user_status_idx').on(t.userId, t.status),
    index('tasks_due_idx').on(t.dueDate),
  ],
);

export type Notification = typeof notifications.$inferSelect;
export type Task = typeof tasks.$inferSelect;
