"""Dấu vân của mọi thứ quyết định kết quả `/solve` — mã hình học, chuẩn cấu tạo, rule pack.

## Vì sao cần

Worker không tính lại một bước đã tính: nó tra `design_artifact_edge` theo (artifact đầu vào,
bước, băm THAM SỐ) và dùng lại kết quả cũ (`artifacts.ts`, `findComputed`). Cơ chế đó chỉ đúng
nếu tham số mô tả ĐỦ những gì quyết định đầu ra.

Trước đây tham số chỉ có `locality`, `timeBudgetS`, `variant` — tức là **mã nguồn của Container
không nằm trong khoá**. Hệ quả đo được ngày 06/09/2026: sửa xong chỗ đặt cửa vào nhà, dựng lại
ảnh Docker, chạy lại bộ nạp demo — bộ giải báo `0ms` cho cả ba phương án và trả về đúng mặt bằng
cũ KHÔNG có lối vào. Không lỗi, không cảnh báo; chỉ là bản vá không bao giờ tới được người xem.

Nên hàm này băm chính những tệp quyết định hình học và trả về một chuỗi ngắn để Worker đưa vào
khoá bộ nhớ đệm. Đổi mã hình học, đổi chuẩn cấu tạo hay đổi rule pack → chuỗi đổi → tính lại.
Không đổi gì → chuỗi giữ nguyên → vẫn không tính lại. Băm nội dung thay vì một hằng số phải nhớ
bump bằng tay, vì thứ phải nhớ bump bằng tay là thứ sẽ quên.
"""

from __future__ import annotations

import hashlib
from functools import lru_cache
from pathlib import Path

from design_compute.geometry.norms import default_norms_path
from design_compute.rules.loader import default_rules_root

# Phần mã đứng giữa đầu vào và hình học trả về.
#
# Danh sách này CỐ Ý rộng hơn mức tối thiểu. Chỉ `solver/`, `geometry/` và `adapters.py` quyết
# định nội dung mặt bằng đã lưu; `sheet/`, `massing.py`, `schedules.py` dựng lại mỗi lần gọi
# nên về lý không cần làm mới bộ nhớ đệm. Vẫn gộp vào, vì cái giá của việc rộng quá là giải
# lại vài giây, còn cái giá của việc hẹp quá là trả về hình học lỗi thời mà không ai biết —
# đúng lỗi đã xảy ra. Ngày nào có bước nào trong ba phần sau được LƯU thành artifact thì danh
# sách này đã sẵn đúng.
#
# `cad/` và `kb/` không nằm ở đây: chúng phục vụ số hoá hồ sơ cũ, không tham gia lời giải.
_GEOMETRY_PARTS = ("solver", "geometry", "sheet", "adapters.py", "massing.py", "schedules.py")


def _geometry_files() -> list[Path]:
    root = Path(__file__).resolve().parent
    found: list[Path] = []
    for part in _GEOMETRY_PARTS:
        target = root / part
        if target.is_dir():
            found.extend(sorted(target.rglob("*.py")))
        elif target.is_file():
            found.append(target)
    norms = default_norms_path()
    if norms.is_file():
        found.append(norms)
    rules = default_rules_root()
    if rules.is_dir():
        found.extend(sorted(p for p in rules.rglob("*") if p.suffix in (".yaml", ".yml")))
    return found


@lru_cache(maxsize=1)
def solver_version() -> str:
    """16 ký tự hex — đủ ngắn để đọc trong log, đủ dài để không đụng nhau."""
    digest = hashlib.sha256()
    for path in _geometry_files():
        # Băm cả ĐƯỜNG DẪN: đổi tên tệp mà giữ nguyên nội dung vẫn là một phiên bản khác.
        digest.update(path.name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()[:16]
