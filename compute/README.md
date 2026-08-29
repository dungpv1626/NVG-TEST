# `compute/` — lõi tính toán module Thiết kế AI

Python 3.12. **Không phải npm workspace** — không nằm trong `workspaces` của `package.json`.

## Vì sao tách runtime

Cloudflare Workers không chạy được thư viện Python có phần mở rộng biên dịch sẵn. Toàn bộ
lõi tính toán vì vậy nằm ở đây: bộ giải CP-SAT (OR-Tools), hình học (shapely), đọc/ghi tệp
CAD (ezdxf), dựng mô hình ba chiều (trimesh).

Ranh giới là **năng lực thư viện**, không phải sở thích. Nhầm chỗ là lỗi kiến trúc:

- **Không gọi mô hình ngôn ngữ từ đây.** `solver/` phải tất định — có kiểm thử canh việc
  `solver/` không import phần gọi mô hình ngôn ngữ.
- **Không dùng giao diện lập trình đặc thù Cloudflare bên trong.** Đó là thứ cho phép đổi
  chỗ triển khai mà không viết lại.
- **Không giữ trạng thái.** Nhận đầu vào, trả đầu ra, không tác dụng phụ ngoài giá trị trả về.

## Chạy ở đâu

| Giai đoạn                 | Cách chạy                                                                    |
| ------------------------- | ---------------------------------------------------------------------------- |
| Phát triển (hiện nay)     | `docker run -p 8080:8080` tại chỗ. Worker gọi `http://localhost:8080`        |
| Sau khi nâng Workers Paid | Cloudflare Container, gọi qua `getContainer(env.DESIGN_COMPUTE, id).fetch()` |

Cloudflare Containers không có trên gói Workers Free. Chi tiết ở `TIEN_DO_THIET_KE.html`
vướng mắc V-2.

## Lệnh

⚠️ Bối cảnh build là **gốc repo**, không phải `compute/` — ảnh cần cả `rules/`, `contracts/`
và `kb/vendor/`.

```bash
docker build -f compute/Dockerfile -t nvg-design-compute .   # chạy từ GỐC REPO
docker run --rm -d -p 8080:8080 --name nvg-compute nvg-design-compute
docker run --rm nvg-design-compute pytest                    # chạy kiểm thử
curl -s localhost:8080/health

# Không có Docker, chạy trực tiếp (cần Python 3.12):
cd compute && pip install -e '.[dev]' && pytest
```

Chạy kiểm thử xuyên hai runtime (Worker gọi Container thật), từ gốc repo:

```bash
DESIGN_COMPUTE_URL=http://localhost:8080 npx vitest run --project logic \
  workers/src/design/__tests__/pipeline-e2e.test.ts
```

## Mặt tiếp xúc HTTP

Đây là chỗ DUY NHẤT Worker gọi vào (`workers/src/design/compute-backend.ts`).

| Đường dẫn     | Việc                                                                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health` | Kiểm tra sống. Cố ý NẠP THẬT rule pack và liệt kê hợp đồng: hai lỗi triển khai hay gặp nhất là quên `COPY rules/` và `COPY contracts/` |
| `POST /solve` | Layer 3b — giải massing và mọi tầng trong MỘT mô hình CP-SAT                                                                           |

`POST /solve` trả **200** cho cả hai kết quả: `status: "ok"` kèm `floor_plan`, hoặc
`status: "infeasible"` kèm `report`. Vô nghiệm là kết quả hạng nhất, không phải lỗi — trả
4xx sẽ khiến lớp gọi coi là hỏng hóc và giấu mất lời giải thích. Chỉ có hai mã lỗi thật:
**422** (sai hợp đồng dữ liệu, không đáng thử lại) và **503** (hết giờ chưa có nghiệm nào,
đáng thử lại với ngân sách thời gian lớn hơn).

## Cấu trúc

```
src/design_compute/
  service.py    FastAPI — mặt tiếp xúc duy nhất với Worker
  contracts.py  validate ở ranh giới, đối chiếu THẲNG contracts/*.schema.json
  adapters.py   dịch giữa hợp đồng dữ liệu và mô hình nội bộ của bộ giải
  rules/        nạp rule pack + trình kiểm tra + engine vị từ — NƠI DUY NHẤT cài đặt vị từ
  solver/       CP-SAT: đặt khối + mặt bằng mọi tầng trong MỘT mô hình. KHÔNG import LLM
  geometry/     shapely, tinh chỉnh hình học            (chưa cài đặt)
  cad/          ezdxf + ODA File Converter              (chưa cài đặt)
  mesh/         trimesh → glTF, mặt cắt                 (chưa cài đặt)
  kb_extract/   trích xuất hồ sơ cũ                     (chưa cài đặt)
```

## Hợp đồng dữ liệu — không sinh mã Pydantic

Phía Python **không** sinh mã từ JSON Schema; nó nạp thẳng `contracts/*.schema.json` và
validate bằng `jsonschema`. Tài liệu đặc tả đề xuất `datamodel-code-generator`, nhưng bản
sinh ra là bản sao, mà bản sao thì cần một bước kiểm tra để không lệch — đọc thẳng nguồn gốc
thì không có gì để lệch. Chi tiết ở `contracts/README.md`.

## ODA File Converter

Cần cho `cad/` và `kb_extract/`. Tải từ opendesign.com sau khi đăng ký tài khoản, bản
**Linux X64, QT6, `.deb`**, đặt vào `kb/vendor/` ở gốc repo (đã gitignore — tệp nặng và giấy
phép Open Design Alliance không cho phát tán lại).

⚠️ ODAFileConverter là **ứng dụng đồ hoạ**: kể cả khi chạy dòng lệnh nó vẫn đòi một màn
hình. Trong container phải bọc `xvfb-run` và cài thư viện Qt.
