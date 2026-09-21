# Tài liệu Kiến trúc Phần mềm

| Tệp | Vai trò |
| --- | --- |
| `SAD.md` | Bản gốc để đọc và sửa trong Git |
| `SAD.docx` | Bản trình bày: trang bìa, mục lục, sơ đồ có chú thích, số trang |
| `diagrams/*.mmd` | **Nguồn** của sơ đồ (Mermaid) — sửa ở đây |
| `diagrams/*.png` · `*.svg` | Bản sinh ra từ nguồn; `.png` nhúng vào DOCX |
| `adr/ADR-00x.md` | Một quyết định kiến trúc một tệp, kèm phương án đã loại |
| `docx-lib.mjs` · `sad-docx.mjs` | Bộ dựng DOCX |

## Dựng lại toàn bộ

```bash
npm install docx @mermaid-js/mermaid-cli --no-save --prefix /tmp/sad

# 1. Sơ đồ
PATH=/tmp/sad/node_modules/.bin:$PATH ./doc/architecture/diagrams/ve.sh

# 2. Tài liệu
NODE_PATH=/tmp/sad/node_modules node doc/architecture/sad-docx.mjs
```

Hai gói trên **cố ý không nằm trong `package.json`**: chúng chỉ dùng để sinh tài liệu, không phải
phụ thuộc lúc chạy của `web/`, `workers/` hay `db/`.

Xem lại bằng mắt trước khi gửi — bước này bắt lỗi sơ đồ tràn trang, chữ quá nhỏ, bảng vỡ:

```bash
soffice --headless --convert-to pdf doc/architecture/SAD.docx --outdir /tmp/sad
pdftoppm -jpeg -r 80 /tmp/sad/SAD.pdf /tmp/sad/page
```

## Quy tắc nội dung

- **Kiến trúc, không phải thiết kế chi tiết.** Không đi vào lớp, hàm, hay lược đồ bảng đầy đủ —
  dẫn chiếu sang `db/src/schema/`, PRD, BSD.
- **Không tự suy đoán.** Chưa quyết thì đánh dấu `TBD`; suy luận chưa ai xác nhận thì ghi
  **Giả định**. Mọi con số đo trên hệ thống thật, kèm ngày đo.
- **Sơ đồ là bắt buộc, chữ là phần bổ sung.** Bố cục mỗi mục: khái niệm → sơ đồ → giải thích ngắn
  → chi tiết dạng bảng.
- **Một sơ đồ một ý.** Nhiều sơ đồ nhỏ tốt hơn một sơ đồ lớn; tên gọi trong sơ đồ phải trùng với
  tên trong phần chữ.
- **Nguồn sơ đồ phải nằm trong Git** để dựng lại được, không dán ảnh không có nguồn.
- Quyết định kiến trúc quan trọng tách ra `adr/`, mỗi tệp một quyết định, bắt buộc có **phương án
  đã loại** và **đánh đổi**.

## Danh mục kiểm trước khi phát hành

- [ ] `SAD.md` và `SAD.docx` khớp nhau về nội dung
- [ ] DOCX mở được; mục lục cập nhật bằng F9
- [ ] Mọi sơ đồ hiển thị đúng, không tràn trang, chữ đọc được khi in
- [ ] Tên gọi trong sơ đồ trùng với phần chữ
- [ ] Luồng trọng yếu có sequence diagram
- [ ] Bảo mật, triển khai, khả mở rộng đều có mục riêng
- [ ] `TBD` và rủi ro được đánh dấu rõ, không có chỗ nào tự suy đoán
