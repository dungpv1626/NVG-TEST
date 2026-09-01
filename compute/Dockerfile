# Lõi tính toán module Thiết kế AI.
#
# Bối cảnh build là GỐC REPO, không phải compute/ — vì image cần cả bộ cài ODA ở
# kb/vendor/ lẫn rule pack ở rules/:
#     docker build -f compute/Dockerfile -t nvg-design-compute .
#
# Linux/amd64: Cloudflare Containers chỉ chạy kiến trúc này. Khai tường minh để build trên
# máy ARM (Apple Silicon) không lặng lẽ sinh ra image chạy được ở máy mà hỏng khi triển khai.
FROM --platform=linux/amd64 python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# xvfb + thư viện Qt: ODAFileConverter là ứng dụng đồ hoạ, kể cả ở chế độ dòng lệnh nó vẫn
# đòi một màn hình. Không có nhóm này thì lệnh chuyển đổi treo hoặc thoát im lặng.
#
# `xauth` là phụ thuộc của chính `xvfb-run`, KHÔNG đi kèm gói `xvfb`. Thiếu nó thì lệnh
# thoát ngay với "xvfb-run: error: xauth command not found" và mã 3 — trông hệt như lỗi
# của tệp bản vẽ chứ không phải lỗi thiếu gói. Đã gặp thật khi kiểm chứng Mốc 0.1.
RUN apt-get update && apt-get install -y --no-install-recommends \
        xvfb \
        xauth \
        libgl1 \
        libglu1-mesa \
        libxkbcommon-x11-0 \
        libfontconfig1 \
        libxcb-cursor0 \
        libxcb-icccm4 \
        libxcb-image0 \
        libxcb-keysyms1 \
        libxcb-randr0 \
        libxcb-render-util0 \
        libxcb-shape0 \
        libdbus-1-3 \
    && rm -rf /var/lib/apt/lists/*

# Bộ cài ODA File Converter. Thư mục luôn tồn tại (có README) nhưng tệp .deb thì chưa chắc —
# nó không được commit vì nặng và vì giấy phép Open Design Alliance không cho phát tán lại.
# Thiếu tệp thì image vẫn build được; chỉ phần đọc .dwg là chưa dùng được.
COPY kb/vendor/ /opt/oda/
RUN set -eux; \
    if ls /opt/oda/*.deb >/dev/null 2>&1; then \
        apt-get update; \
        apt-get install -y --no-install-recommends /opt/oda/*.deb; \
        rm -rf /var/lib/apt/lists/*; \
        echo "ODA File Converter: đã cài"; \
    else \
        echo "ODA File Converter: CHƯA CÓ trong kb/vendor/ — phần đọc .dwg sẽ không chạy"; \
    fi; \
    rm -f /opt/oda/*.deb

WORKDIR /app

# Cài phụ thuộc trước, mã nguồn sau: sửa mã nguồn không làm mất lớp cache phụ thuộc.
COPY compute/pyproject.toml /app/
RUN pip install --no-cache-dir \
        "ortools>=9.11" \
        "shapely>=2.0" \
        "ezdxf>=1.3" \
        "pydantic>=2.9" \
        "pyyaml>=6.0" \
        "jsonschema>=4.23" \
        "fastapi>=0.115" \
        "uvicorn[standard]>=0.32" \
        "python-multipart>=0.0.12" \
        "pytest>=8.3" \
        "hypothesis>=6.112" \
        "httpx>=0.27"

COPY compute/src/ /app/src/
COPY compute/tests/ /app/tests/
COPY compute/bench/ /app/bench/

# Rule pack là DỮ LIỆU, đọc lúc chạy. Đưa vào image để container không giữ trạng thái và
# không phải tải về từ đâu cả — đĩa của container bị xoá sạch sau mỗi lần chạy.
COPY rules/ /app/rules/

# Bảng ánh xạ lớp bản vẽ và chuẩn cấu tạo cũng là DỮ LIỆU. Chỉ chép đúng hai tệp này,
# KHÔNG chép cả kb/: hai thư mục con còn lại chứa hồ sơ khách hàng và bộ cài ~100MB.
COPY kb/layer_mapping.yaml /app/kb/layer_mapping.yaml
COPY kb/construction_norms.yaml /app/kb/construction_norms.yaml

# Hợp đồng dữ liệu cũng là DỮ LIỆU đọc lúc chạy: Container validate ở ranh giới bằng chính
# tệp JSON Schema gốc, không dùng bản sinh ra (xem `src/design_compute/contracts.py`).
COPY contracts/ /app/contracts/

ENV PYTHONPATH=/app/src \
    NVG_RULES_ROOT=/app/rules \
    NVG_CONTRACTS_ROOT=/app/contracts \
    NVG_LAYER_MAPPING=/app/kb/layer_mapping.yaml \
    NVG_CONSTRUCTION_NORMS=/app/kb/construction_norms.yaml \
    XDG_RUNTIME_DIR=/tmp/runtime-root

EXPOSE 8080

# Không giữ trạng thái, không gọi ngược Worker: nhận đầu vào, trả đầu ra.
CMD ["uvicorn", "design_compute.service:app", "--host", "0.0.0.0", "--port", "8080"]
