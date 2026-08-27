/**
 * @nvg/shared — mã dùng chung giữa Frontend (`web/`) và Backend (`workers/`).
 *
 * Tech Stack Mục 1.3: "một ngôn ngữ duy nhất xuyên suốt … cho phép dùng chung kiểu dữ liệu
 * và quy tắc kiểm tra dữ liệu (Zod) giữa hai lớp, giảm lỗi không khớp dữ liệu client/server".
 *
 * KHÔNG đặt ở đây: truy vấn CSDL (thuộc `db/`), gọi API (thuộc `web/` hoặc `workers/`),
 * hoặc bất cứ thứ gì phụ thuộc môi trường chạy (DOM, Node API, binding Cloudflare).
 */

export * from './status';
export * from './modules';
export * from './format';
export * from './terminology';
export * from './content';
export * from './codes';
export * from './roles';
export * from './crm';
export * from './da';
export * from './tk';
export * from './hd';
export * from './bc';
export * from './tc';
export * from './mh';
export * from './kho';
export * from './kt';
export * from './ns';
export * from './sx';
