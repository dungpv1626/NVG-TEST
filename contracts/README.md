# `contracts/` — hợp đồng dữ liệu của Module Thiết kế AI

**Đây là NGUỒN GỐC.** Mọi schema viết tay ở đây, dưới dạng JSON Schema draft 2020-12.
Không viết lại schema ở phía TypeScript hay phía Python — chắc chắn sẽ lệch nhau
(`doc/design/03-data-contracts.md`).

```
contracts/*.schema.json ─┬─► shared/src/design/*.generated.ts   zod + kiểu, do máy sinh
                         └─► compute/ nạp THẲNG tệp JSON lúc chạy, validate bằng jsonschema
```

| Lệnh                      | Việc                                               |
| ------------------------- | -------------------------------------------------- |
| `npm run contracts:gen`   | Sinh lại `shared/src/design/*.generated.ts`        |
| `npm run contracts:check` | So bản sinh với bản đã commit; lệch thì thoát mã 1 |

Mã sinh ra **được commit** để đọc được diff khi xem lại thay đổi.

## Mười hợp đồng

| Tệp                                | Layer | Ai sinh ra                                      |
| ---------------------------------- | ----- | ----------------------------------------------- |
| `design-brief.schema.json`         | 1     | Worker (gọi mô hình ngôn ngữ)                   |
| `space-program.schema.json`        | 2     | Worker                                          |
| `layout-intent.schema.json`        | 3a    | Worker — **thứ duy nhất mô hình ngôn ngữ sinh** |
| `floor-plan.schema.json`           | 3b/3c | Container (bộ giải CP-SAT)                      |
| `infeasibility-report.schema.json` | 3b    | Container, khi vô nghiệm                        |
| `arch-model.schema.json`           | 4     | Worker + Container                              |
| `schedules.schema.json`            | 4     | Container                                       |
| `render-request.schema.json`       | 5     | Worker                                          |
| `render-result.schema.json`        | 5     | `RenderBackend`                                 |
| `publish-request.schema.json`      | —     | Worker, cầu nối sang hệ tài liệu                |

Layer 4 và 5 **chưa cài đặt** ở Mốc 1 — hợp đồng vẫn phải có đủ, vì bước stub của Workflow
trả về đúng hình dạng này. Thêm hợp đồng sau nghĩa là sửa cả Workflow lẫn lineage đã ghi.

## Quy ước bắt buộc

- Đơn vị độ dài trong hợp đồng: **mét**, số thực. Đơn vị nội bộ của bộ giải: **milimét**,
  số nguyên — quy đổi nằm trong `compute/src/design_compute/solver/units.py`.
- Hệ toạ độ: gốc ở **góc trước-trái lô đất**, `x` sang phải, `y` vào sâu.
- Tiền: **số nguyên, đơn vị đồng** (CLAUDE.md 4.2), không dùng số thực.
- Mọi hợp đồng có `schema_version` dạng semver. Đổi phá vỡ tương thích thì **tăng major**.
- `$ref` **chỉ nội bộ tệp** (`#/$defs/...`). Tham chiếu chéo tệp không được hỗ trợ — mỗi
  hợp đồng phải đọc hiểu được một mình.
- `tenant_id` và `discipline` **không nằm trong payload** (trừ `PublishRequest`): chúng ở
  cột của bảng, không thuộc nội dung được băm. Nếu nằm trong payload thì cùng một mặt bằng
  gán cho hai tenant sẽ ra hai mã băm khác nhau, mất tính idempotent.

## Ba chỗ cố ý lệch tài liệu đặc tả

1. **`project_id` là UUID, không phải mã hiển thị.** Ví dụ trong tài liệu ghi `"NVO-028"`;
   repo dùng khoá ngoại UUID tới `design_projects.id` và giữ mã hiển thị ở `project_code`
   (quy ước mã của repo là `NVO-TK-2026-0001`, xem `shared/src/codes.ts`).

2. **`discipline` dùng từ vựng của CSDL**, tức `kien_truc` / `ket_cau` / `dien_nuoc`, không
   phải `KT` / `KC` / `DN`. Ánh xạ ở `DOC_DISCIPLINE_MAP` (`@nvg/shared/design`). Lý do:
   enum `design_discipline` đã chạy trong 12 module và có index phụ thuộc; tạo từ vựng thứ
   hai là mở đường cho lỗi dịch qua lại (CLAUDE.md 8.5 T7).

3. **Phía Python không sinh mã Pydantic.** Tài liệu đề xuất `datamodel-code-generator`;
   ở đây Container nạp thẳng chính tệp JSON Schema này và validate bằng `jsonschema`. Bản
   sinh ra là bản sao, mà bản sao thì cần bước kiểm tra để không lệch; đọc thẳng nguồn gốc
   thì không có gì để lệch, và bớt một công cụ phải cài trong ảnh Docker. Đổi lại mất gợi ý
   kiểu tĩnh phía Python — chấp nhận được vì bộ giải đã có mô hình nội bộ riêng.

## Vì sao tự viết bộ sinh zod

`json-schema-to-zod` **không giải `$ref`**: mọi tham chiếu thành `z.any()`. Nghĩa là
`semver`, `artifact_ref`, và toàn bộ cây chia không gian đệ quy của `LayoutIntent` mất sạch
ràng buộc. Một schema mất ràng buộc nguy hiểm hơn không có schema, vì nó trông như đã kiểm.
Bộ sinh nằm ở `scripts/contracts-gen.mjs`, xử lý đúng tập con JSON Schema mà thư mục này
dùng — kể cả `$ref` đệ quy (sinh `z.lazy` kèm kiểu TypeScript tường minh).
