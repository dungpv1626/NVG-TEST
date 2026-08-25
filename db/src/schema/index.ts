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
