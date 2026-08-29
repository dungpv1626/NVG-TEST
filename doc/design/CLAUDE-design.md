# CLAUDE.md — Module Thiết kế AI (trong phần mềm quản trị Nhà Việt Group)

File này được Claude Code nạp tự động. Đọc hết trước khi viết dòng code đầu tiên.

> **Viết tắt:** mọi viết tắt trong bộ tài liệu này đều được giải thích ở
> `docs/10-glossary.md`. Khi viết tài liệu hoặc comment mới, viết đầy đủ ở lần dùng đầu
> tiên trong mỗi file rồi mới dùng dạng ngắn, và bổ sung viết tắt mới vào bảng thuật ngữ.

## Đây là gì

Module **tính năng thiết kế** bên trong phần mềm quản trị Nhà Việt Group — **không phải
hệ thống độc lập**. Nó dùng chung codebase, database, người dùng, phân quyền và hệ quản
lý tài liệu với phần còn lại của phần mềm.

Chức năng: từ yêu cầu khách hàng → mặt bằng có cấu trúc → mô hình 3D → phối cảnh. Kiến
trúc 5 layer, mỗi layer nhận và trả **dữ liệu có cấu trúc**, không phải ảnh.

**Đích đến dài hạn:** nền tảng mang **cả bộ hồ sơ thiết kế nhiều bộ môn** (kiến trúc,
kết cấu, điện nước) đi ra từ một chỗ. Engine sinh phần kiến trúc; kỹ sư kết cấu và điện
nước làm việc bên trong hệ thống và ký phát hành phần của mình. Xem `01-overview.md`
mục 1.4 — ranh giới này là **bất biến**, không phải hạn chế tạm thời.

Đọc theo thứ tự: `docs/01-overview.md` → `docs/02-architecture.md` →
`docs/03-data-contracts.md`. Sơ đồ cấu trúc ở `docs/02-architecture.md` mục 2.0; luồng
thiết kế một công trình ở `docs/11-design-flow.md`. Làm Layer 3 thì bắt buộc đọc `docs/04-layer3-floorplan.md`; viết bất kỳ giao diện nào thì
bắt buộc đọc `docs/12-ux-ui.md`.

**Phạm vi Giai đoạn 1: xem `docs/08-milestones.md`.** Ngoài phạm vi đó thì chỉ tạo stub
đúng contract, không cài đặt.

## Hai runtime — biết code đang viết chạy ở đâu

| | Cloudflare Worker (TypeScript) | Cloudflare Container (Python) |
|---|---|---|
| Chạy gì | UI, API, gọi LLM, đọc/ghi artifact, điều phối Workflows | Bộ giải ràng buộc CP-SAT, hình học, đọc/ghi tệp CAD, sinh mô hình ba chiều |
| Vì sao | I/O bound, cùng codebase Next.js | OR-Tools, trimesh, ezdxf, shapely chỉ có ở Python |
| Gọi nhau | Worker → Container qua service binding (HTTP) | Container không gọi ngược Worker |

**Nhầm chỗ là lỗi kiến trúc, không phải lỗi phong cách.** Đừng gọi LLM từ Container.
Đừng cố cài thư viện hình học ở phía TypeScript.

Container có giới hạn thật: **~0,5 vCPU (virtual CPU — phần bộ xử lý chia cho một máy
ảo), 4 GiB RAM, đĩa ephemeral (xoá sạch sau mỗi lần chạy), Linux/amd64**. Nghĩa
là bộ giải CP-SAT (Constraint Programming — Satisfiability, bộ giải ràng buộc của thư
viện OR-Tools) chạy `num_search_workers=1`; mọi thứ cần trên đĩa phải nằm trong image; không
lưu state giữa các lần gọi.

Giữ container **stateless và không dùng API đặc thù Cloudflare bên trong**, để nếu đo ở
Mốc 0 thấy nửa vCPU quá chậm thì chuyển sang VPS chỉ là đổi chỗ deploy.

## Nguyên tắc bất biến

1. **Không có bước nào đi thẳng từ text sang ảnh.** Mọi ảnh dẫn xuất từ hình học đã giải.
2. **LLM không bao giờ sinh toạ độ hay kích thước.** LLM sinh *cấu trúc* (cây chia không
   gian, lựa chọn rời rạc). Solver gán số. Xem `docs/04-layer3-floorplan.md`.
3. **Mọi ranh giới layer có JSON Schema** trong `packages/contracts/`. Không có contract
   thì không viết code cho layer đó — dừng lại và hỏi.
4. **Quy tắc kiến trúc là dữ liệu, không phải code.** Rule pack YAML. Không hard-code
   `if corridor_width < 0.9` ở bất cứ đâu.
5. **Một nguồn hình học.** Container sinh tệp glTF (Graphics Language Transmission
   Format — định dạng mô hình ba chiều dùng trên web); trình duyệt chỉ đọc. Không dựng
   hình bằng JavaScript.
6. **Artifact bất biến, băm nội dung, có lineage.** Không `UPDATE`, không ghi đè.
7. **Mọi bảng của module mang `tenant_id`.** Kể cả khi hiện chỉ có một tenant.
8. **Mọi artifact và tài liệu mang `discipline`** — bộ môn: `KT` (kiến trúc), `KC` (kết cấu), `DN` (điện nước). Kể cả khi Giai
   đoạn 1 chỉ sinh ra `KT`. Thêm sau phải sửa mọi bảng.
9. **Engine không tự sinh và không tự phát hành nội dung kết cấu, cơ điện, phòng cháy chữa cháy.** Nó chuẩn
   bị nền hình học cho kỹ sư; con người ký và chịu trách nhiệm.

## Dùng lại, không xây lại

Những thứ này **đã có trong phần mềm quản trị** — tham chiếu, đừng tạo bảng mới:

- Dự án / công trình (mã `NVO-xxx`) và khách hàng
- Người dùng và phân quyền theo vai trò
- Quản lý tài liệu/hồ sơ có phiên bản
- Phiếu tiếp nhận yêu cầu thiết kế → **Design Brief thay thế nó**, không chạy song song

Nếu thấy mình sắp tạo bảng `projects`, `users`, hay `documents` — dừng lại, cái đó đã có.

## Cấm dùng (đã cân nhắc và loại)

| Cấm | Dùng thay thế | Lý do |
|---|---|---|
| `scipy.optimize` cho geometry solving | OR-Tools CP-SAT | Ràng buộc nguyên/tổ hợp; scipy kẹt nghiệm cục bộ và **không giải thích được vô nghiệm** |
| LLM sinh `{x, y, w, h}` cho phòng | LLM sinh cây chia không gian | Chữ nhật rời rạc luôn sinh khe hở/chồng lấn |
| Giải từng tầng rồi kiểm tra liên tầng | Một model CP-SAT cho cả công trình | Lõi thang và trục kết cấu là biến dùng chung |
| Mô hình thị giác đọc `.dwg` | ODA File Converter (công cụ chuyển đổi của Open Design Alliance) → `ezdxf` | File vector có toạ độ thật; vision là suy đoán và đắt hơn nhiều |
| Hatchet, Celery, Redis | **Cloudflare Workflows + Queues** | Đã ở trên Cloudflare, không thêm hạ tầng |
| Bảng dự án/user/tài liệu mới | Bảng sẵn có của phần mềm quản trị | Hai nguồn sự thật |
| Viết schema tay ở cả TS và Python | Sinh từ JSON Schema trong `packages/contracts/` | Chắc chắn lệch nhau |
| Hard-code quy chuẩn trong code | Rule pack YAML | Kiến trúc sư (KTS) phải đọc và sửa được |
| Dựng hình 3D phía client | `trimesh` trong Container → glTF | Hai bản logic |
| Rust biên dịch sang WebAssembly cho kiểm tra tức thời | Kiểm tra trên máy chủ | **Hoãn sau Giai đoạn 1** — nó tạo bản thực thi rule thứ ba |
| Engine tự tính tiết diện, tải trọng, hệ thống kỹ thuật | Chuẩn bị nền hình học, để kỹ sư quyết | Trách nhiệm pháp lý; sai một tiết diện dầm khác hẳn sai một mặt bằng |
| Bảng không có `discipline` | Thêm `discipline` ngay | Mở rộng sang kết cấu/M&E sẽ phải sửa toàn bộ |
| Token màu của phần mềm quản trị dùng cho khu vẽ | Token `--dsn-*` riêng | Khu vẽ đảo màu theo quy luật khác giao diện |
| Hai bộ mã vẽ cho chế độ sáng và tối | Một hình học, đổi bảng màu | Chắc chắn lệch nhau |
| Giấu trạng thái ràng buộc sau tab | Luôn hiển thị ở bảng phải | KTS vẽ xong mới biết vi phạm là quá muộn |

## Dữ liệu và LLM

Giai đoạn dev/test dùng gói LLM miễn phí, **chỉ với đầu bài giả lập hoặc ẩn danh**.
Không để dữ liệu khách hàng thật đi qua gói miễn phí.

Model khai báo trong `config/models.yaml`. Mỗi lời gọi ra ngoài khai báo
`data_class: 1|2|3` và bị lớp kiểm tra chặn nếu không đủ điều kiện — xem
`docs/01-overview.md` mục 1.5.

## Quy ước code

- **Worker:** TypeScript, Next.js, zod sinh từ JSON Schema.
- **Container:** Python 3.12, Pydantic v2 sinh từ JSON Schema, type hint bắt buộc.
- Viết tắt trong tài liệu và comment: giải thích ở lần dùng đầu tiên (xem `docs/10-glossary.md`).
- Test: `vitest` cho TS, `pytest` cho Python. Thay đổi ở Layer 2/3 phải chạy lại eval
  harness trước khi coi là xong.
- Tên biến, comment, docstring: tiếng Anh. Chuỗi hiển thị cho người dùng: tiếng Việt.

## Khi gặp chỗ chưa rõ

`docs/09-open-questions.md`. Mục đánh dấu **BLOCKING** thì **dừng và hỏi người dùng** —
không tự giả định rồi code tiếp.
