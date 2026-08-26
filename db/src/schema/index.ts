/**
 * Lược đồ CSDL — điểm xuất duy nhất cho Drizzle Kit và mọi truy vấn.
 *
 * Thứ tự export theo Backend Schema Mục 4. Bảng nền tảng (Mục 3.2 + 4.1) trước,
 * rồi tới từng module theo giai đoạn triển khai.
 */

export * from './_enums';
export * from './_helpers';
export * from './_audit';
export * from './_scoped';

// --- Nền tảng (Backend Schema 3.2) ---
export * from './companies';
export * from './users';
export * from './roles';

// --- Hạ tầng xuyên suốt (Backend Schema 4.1) ---
export * from './documents';
export * from './notifications';
export * from './audit';
export * from './approvals';

// --- Module CRM (Backend Schema 4.2) ---
export * from './crm';

// --- Module DA — Dự án và Đấu thầu (Backend Schema 4.3) ---
export * from './da';

// --- Module TK — Thiết kế (Backend Schema 4.4) ---
export * from './tk';

// --- Module HD — Hợp đồng (Backend Schema 4.5) ---
export * from './hd';

// --- Module TC — Thi công và Ngân sách công trình (Backend Schema 4.6) ---
export * from './tc';
