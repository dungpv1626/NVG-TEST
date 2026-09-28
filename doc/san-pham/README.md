# Tài liệu sản phẩm

Tầng đầu của bộ tài liệu: vì sao làm, làm gì, phạm vi phiên bản nào. Làm lần lượt, mỗi tài liệu
được Haan duyệt xong mới sang tài liệu sau.

| Tệp | Vai trò | Trạng thái |
| --- | --- | --- |
| `VISION_BUSINESS_CASE.md` · `.docx` | Tầm nhìn sản phẩm và Luận chứng kinh doanh — vai Chủ sản phẩm | Chờ Haan duyệt |
| `PRD_v2_0.md` · `.docx` | Yêu cầu sản phẩm, thay bản 1.4 — vai Chủ sản phẩm + Phân tích nghiệp vụ | Chờ Haan duyệt |
| `SRS_v1_0.md` · `.docx` | Đặc tả yêu cầu phần mềm cho bản demo — vai Chủ sản phẩm + Kiến trúc sư | Chờ Haan duyệt |
| `TRANG_THAI_HIEN_THUC.md` · `.docx` | **Nội bộ** — tiến độ hiện thực theo phân hệ; KHÔNG đưa ra ngoài | Nội bộ |
| `diagrams/*.mmd` | **Nguồn** sơ đồ (Mermaid); `.png` sinh ra từ đây | |
| `md-docx.mjs` | Dựng `.docx` từ `.md` — bản `.md` là nguồn duy nhất | |

## Dựng lại

```bash
npm install docx @mermaid-js/mermaid-cli --no-save --prefix /tmp/sad

# 1. Sơ đồ
cd doc/san-pham/diagrams
for f in *.mmd; do /tmp/sad/node_modules/.bin/mmdc -i "$f" -o "${f%.mmd}.png" -c mermaid-config.json -b white -s 2 -q; done
cd -

# 2. Tài liệu
NODE_PATH=/tmp/sad/node_modules node doc/san-pham/md-docx.mjs doc/san-pham/VISION_BUSINESS_CASE.md
NODE_PATH=/tmp/sad/node_modules node doc/san-pham/md-docx.mjs doc/san-pham/PRD_v2_0.md
NODE_PATH=/tmp/sad/node_modules node doc/san-pham/md-docx.mjs doc/san-pham/SRS_v1_0.md
NODE_PATH=/tmp/sad/node_modules node doc/san-pham/md-docx.mjs doc/san-pham/TRANG_THAI_HIEN_THUC.md
```

Hai gói trên cố ý không nằm trong `package.json`. `md-docx.mjs` dùng lại `doc/architecture/docx-lib.mjs`
(cùng phông, màu, bảng, trang bìa với SAD). Tập Markdown được hỗ trợ ghi ở đầu `md-docx.mjs`.

Xem bằng mắt trước khi gửi:

```bash
soffice --headless --convert-to pdf doc/san-pham/VISION_BUSINESS_CASE.docx --outdir /tmp/sad
pdftoppm -jpeg -r 70 /tmp/sad/VISION_BUSINESS_CASE.pdf /tmp/sad/trang
```

## Quy tắc nội dung

- Ngắn, bảng và sơ đồ trước, chữ sau. Viết tắt nào dùng phải có trong bảng viết tắt đầu tài liệu.
- Không bịa số: con số nào cũng ghi nguồn hoặc ngày đo; chưa có thì **Chưa xác định**; chưa ai xác nhận thì **Giả định**.
- Không ghi mốc thời gian dự án (QĐ-1) — chỉ thứ tự và tiêu chí hoàn thành.
- Không ghi tên người thật trong tài liệu trình Ban Giám đốc — dùng chức danh.
