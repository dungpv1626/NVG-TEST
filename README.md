# Hệ thống Phần mềm Quản trị Nhà Việt Group (NVG)

Hệ thống quản trị nội bộ cho ba pháp nhân **NVC** (nhà xưởng công nghiệp), **NVO** (nhà ở trọn gói),
**NVS** (giàn giáo, kết cấu thép) và khối Back Office dùng chung.

## Tài liệu

| Loại | Vị trí |
|---|---|
| Tài liệu nghiệp vụ chính thức (6 tài liệu) | `doc/` |
| Quy ước, ràng buộc, quyết định kỹ thuật | [`CLAUDE.md`](./CLAUDE.md) |
| Kế hoạch triển khai theo phase | [`BUILD_PLAN.md`](./BUILD_PLAN.md) |

Đọc tài liệu `.docx` trong `doc/`:

```bash
python3 doc/docx2md.py "doc/PRD_He_thong_Quan_tri_NVG_v1.3.docx"
```

## Cấu trúc

```
web/       React 18 + Vite (SPA) — giao diện
workers/   Cloudflare Workers + Hono — API tùy chỉnh, cron, queue
db/        Drizzle ORM — schema, migration, seed
shared/    Zod schema, type, hằng số nghiệp vụ dùng chung
doc/       Tài liệu nghiệp vụ (.docx)
```

## Bắt đầu

```bash
npm install
cp .env.example .env    # điền giá trị thật
npm run db:migrate      # áp dụng schema
npm run db:seed         # nạp dữ liệu khởi tạo
npm run dev             # chạy giao diện
npm run dev:workers     # chạy API (cửa sổ khác)
```

## Lệnh thường dùng

| Lệnh | Việc |
|---|---|
| `npm run typecheck` | Kiểm tra kiểu toàn bộ workspace |
| `npm test` | Chạy test (unit + RLS) |
| `npm run db:generate` | Sinh migration từ thay đổi schema |
| `npm run db:studio` | Mở Drizzle Studio xem dữ liệu |
| `npm run format` | Định dạng mã nguồn |

## Nguyên tắc bắt buộc

- Sửa cấu trúc bảng **chỉ qua migration Drizzle**, không sửa tay trên Supabase Dashboard.
- Khóa `service_role` **chỉ dùng trong `workers/`**, không bao giờ đưa vào `web/`.
- Giao diện **tiếng Việt có dấu 100%**; mã nguồn và tên bảng/cột tiếng Anh.
- Chi tiết đầy đủ: [`CLAUDE.md`](./CLAUDE.md).
