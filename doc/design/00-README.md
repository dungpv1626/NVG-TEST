# Tài liệu kỹ thuật — NVG AI Preliminary Design Engine

**Đối tượng:** developer và Claude Code.
**Nguồn sự thật duy nhất cho việc triển khai.** Tài liệu bản trình bày cho NVG
(`AI_Preliminary_Design_Engine_NVG_v05.docx`) chỉ dùng để trao đổi với khách hàng —
khi hai bên lệch nhau, bộ tài liệu này thắng.

Module thiết kế **nằm trong** phần mềm quản trị NVG, không phải hệ thống độc lập. Chạy
trên hai runtime: Cloudflare Worker (TypeScript) và Cloudflare Container (Python).
**Phạm vi Giai đoạn 1 xem `08-milestones.md`** — ngoài phạm vi đó chỉ tạo stub.

## Đọc gì trước

| Bạn đang làm gì | Đọc |
|---|---|
| Mới vào dự án | `01-overview.md` → `02-architecture.md` → `03-data-contracts.md` |
| Cần nhìn tổng thể nhanh | Sơ đồ cấu trúc ở `02-architecture.md` mục 2.0, luồng ở `11-design-flow.md` |
| Viết code bất kỳ layer nào | `03-data-contracts.md` (bắt buộc) |
| Làm Layer 3 (mặt bằng) | `04-layer3-floorplan.md` — phần khó nhất, đọc kỹ |
| Viết bất kỳ giao diện nào | `12-ux-ui.md` (bắt buộc) |
| Chọn thư viện / đặt câu hỏi "dùng gì" | `05-tech-stack.md` |
| Làm pipeline số hoá bản vẽ cũ | `06-knowledge-base.md` |
| Thêm/sửa quy tắc kiến trúc | `07-rule-pack.md` |
| Không biết làm gì tiếp theo | `08-milestones.md` — Giai đoạn 1 |
| Gặp một viết tắt không hiểu | `10-glossary.md` |
| Gặp chỗ chưa rõ | `09-open-questions.md` trước khi tự quyết |

## Cấu trúc

```
CLAUDE.md                      Ràng buộc cứng, cấm kỵ, quy ước — Claude Code nạp tự động
docs/
  00-README.md                 File này
  01-overview.md               Phạm vi, nguyên tắc bất biến, ranh giới trách nhiệm
  02-architecture.md           5 layer, luồng dữ liệu, ranh giới module
  03-data-contracts.md         JSON Schema mọi ranh giới layer
  04-layer3-floorplan.md       Đặc tả chi tiết Layer 3
  05-tech-stack.md             Thư viện đã chốt + cái đã loại và lý do
  06-knowledge-base.md         Pipeline số hoá + schema Knowledge Base
  07-rule-pack.md              Định dạng rule, vị từ, cách thêm rule
  08-milestones.md             Mốc + definition of done + eval harness
  09-open-questions.md         Quyết định đã chốt và câu hỏi còn treo
  10-glossary.md               Bảng thuật ngữ và viết tắt
  11-design-flow.md            Sơ đồ luồng thiết kế một công trình
  12-ux-ui.md                  Đặc tả giao diện và trải nghiệm
```

## Quy ước trong tài liệu

- **CHỐT** — quyết định đã đóng, không mở lại trừ khi có dữ liệu mới.
- **ĐỀ XUẤT** — hướng khuyến nghị, chờ xác nhận, có thể code theo nhưng phải tách
  module để đổi được.
- **BLOCKING** — chưa có câu trả lời thì không code phần liên quan. Dừng và hỏi.
- **TODO(người)** — việc cần con người làm, không phải việc của code.
