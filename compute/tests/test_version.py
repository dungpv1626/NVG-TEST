"""Dấu vân của mã hình học — thứ giữ cho bộ nhớ đệm phía Worker không trả về hình học lỗi thời.

Bài học 06/09/2026: khoá bộ nhớ đệm của bước giải không có mã nguồn Container trong đó, nên sửa
xong chỗ đặt cửa vào nhà rồi dựng lại ảnh Docker vẫn nhận về đúng mặt bằng cũ — không lỗi, không
cảnh báo. Ba tính chất dưới đây là điều kiện để `solver_version()` gánh được việc đó.
"""

from __future__ import annotations

import design_compute.version as version_module
from design_compute.version import _geometry_files, solver_version


def test_version_is_short_and_stable() -> None:
    first = solver_version()
    assert len(first) == 16
    assert first == solver_version(), "gọi hai lần phải ra cùng một chuỗi"


def test_version_covers_the_files_that_decide_geometry() -> None:
    """Thiếu một trong ba nhóm này thì có thay đổi thật mà dấu vân không đổi."""
    names = {p.name for p in _geometry_files()}
    assert "walls.py" in names, "bộ dựng tường và lỗ mở"
    assert "model.py" in names, "mô hình tờ bản vẽ"
    assert "massing.py" in names, "khối ba chiều"
    assert "construction_norms.yaml" in names, "chuẩn cấu tạo"
    assert any(n.endswith((".yaml", ".yml")) and n != "construction_norms.yaml" for n in names), (
        "rule pack"
    )


def test_changing_a_geometry_file_changes_the_version(tmp_path, monkeypatch) -> None:
    """Đổi nội dung một tệp là đổi dấu vân — nếu không thì cơ chế này vô nghĩa."""
    original = solver_version()

    a = tmp_path / "walls.py"
    a.write_text("x = 1", encoding="utf-8")
    monkeypatch.setattr(version_module, "_geometry_files", lambda: [a])
    solver_version.cache_clear()
    before = solver_version()

    a.write_text("x = 2", encoding="utf-8")
    solver_version.cache_clear()
    after = solver_version()

    assert before != after
    assert original not in (before, after)
    solver_version.cache_clear()
