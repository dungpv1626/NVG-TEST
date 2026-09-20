"""Service phải nhập được trong một trình thông dịch SẠCH, đúng thứ tự uvicorn nạp.

Vòng nhập `cad/__init__` → `cad.export` → `sheet` → `cad.layers` từng làm Container chết ngay lúc
khởi động (06/09/2026) trong khi cả bộ pytest vẫn xanh — vì pytest nạp `cad.export` trước qua
một đường khác. `cad.export` và `sheet` đã gỡ cùng bộ giải (T58), nhưng lớp lỗi này vẫn có thể
quay lại, nên bộ này vẫn nạp `design_compute.service` như uvicorn, trong tiến trình con.
"""

import subprocess
import sys


def test_service_imports_cleanly_in_a_fresh_interpreter() -> None:
    result = subprocess.run(
        [sys.executable, "-c", "import design_compute.service; print('ok')"],
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, result.stderr[-1500:]
    assert result.stdout.strip() == "ok"
