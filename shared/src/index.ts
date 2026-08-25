/**
 * @nvg/shared — mã dùng chung giữa Frontend (`web/`) và Backend (`workers/`).
 *
 * Tech Stack Mục 1.3: "một ngôn ngữ duy nhất xuyên suốt … cho phép dùng chung kiểu dữ liệu
 * và quy tắc kiểm tra dữ liệu (Zod) giữa hai lớp, giảm lỗi không khớp dữ liệu client/server".
 *
 * KHÔNG đặt ở đây: truy vấn CSDL (thuộc `db/`), gọi API (thuộc `web/` hoặc `workers/`),
 * hoặc bất cứ thứ gì phụ thuộc môi trường chạy (DOM, Node API, binding Cloudflare).
 */

export * from './status.js';
export * from './modules.js';
export * from './format.js';
export * from './terminology.js';
export * from './content.js';
export * from './codes.js';
export * from './roles.js';
