"""Ánh xạ tên lớp bản vẽ sang vai trò mà trình trích xuất hiểu.

Quy ước đặt tên lớp của NVG không đồng nhất giữa các thời kỳ và giữa các người vẽ. Thay vì
đoán trong mã nguồn, bảng ánh xạ nằm ở `kb/layer_mapping.yaml` và lớn dần theo thời gian —
cùng nguyên tắc với rule pack: quy ước là DỮ LIỆU.

Bản thân việc một lớp KHÔNG khớp vai trò nào cũng là thông tin có ích: `unmapped()` trả về
danh sách đó để người đọc biết chính xác cần bổ sung mẫu nào, thay vì phải mở bản vẽ ra dò.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from fnmatch import fnmatch
from pathlib import Path

import yaml

# Đơn vị của bản vẽ, quy ra hệ số nhân sang MÉT. Khoá là mã `$INSUNITS` của DXF.
INSUNITS_TO_METRES: dict[int, tuple[str, float]] = {
    1: ("in", 0.0254),
    2: ("ft", 0.3048),
    4: ("mm", 0.001),
    5: ("cm", 0.01),
    6: ("m", 1.0),
}

# Tên đơn vị cho phép trong `default_units` của tệp ánh xạ.
UNIT_SCALES: dict[str, float] = {name: scale for name, scale in INSUNITS_TO_METRES.values()}


class LayerMappingError(RuntimeError):
    """Tệp ánh xạ lớp bản vẽ sai định dạng hoặc không đọc được."""


def default_mapping_path() -> Path:
    """Tệp ánh xạ nằm ở đâu.

    Trong container, ảnh Docker chép `kb/layer_mapping.yaml` sang `/app/kb/` và đặt
    `NVG_LAYER_MAPPING`. Ngoài container thì lần ngược từ chính tệp này lên gốc repo —
    KHÔNG đoán theo thư mục làm việc của tiến trình gọi.
    """
    from_env = os.environ.get("NVG_LAYER_MAPPING")
    if from_env:
        return Path(from_env)
    # layers.py -> cad/ -> design_compute/ -> src/ -> compute/ -> gốc repo
    return Path(__file__).resolve().parents[4] / "kb" / "layer_mapping.yaml"


@dataclass(frozen=True, slots=True)
class LayerMapping:
    """Bảng tra: tên lớp → vai trò."""

    version: str
    default_units: str
    # Giữ thứ tự khai báo: vai trò khai TRƯỚC thắng khi một lớp khớp nhiều mẫu.
    roles: tuple[tuple[str, tuple[str, ...]], ...]
    ignore: tuple[str, ...]

    @property
    def default_unit_scale(self) -> float:
        """Hệ số nhân sang mét khi bản vẽ không khai đơn vị."""
        return UNIT_SCALES[self.default_units]

    def role_of(self, layer: str) -> str | None:
        """Vai trò của một lớp; `None` nếu lớp bị bỏ qua hoặc chưa có mẫu nào khớp."""
        name = layer.strip().upper()
        for pattern in self.ignore:
            if fnmatch(name, pattern.upper()):
                return None
        for role, patterns in self.roles:
            if any(fnmatch(name, p.upper()) for p in patterns):
                return role
        return None

    def is_ignored(self, layer: str) -> bool:
        """Lớp có nằm trong danh sách cố ý bỏ qua không.

        Phân biệt được "đã quyết định bỏ qua" với "chưa ai ánh xạ" là điều làm cho danh sách
        `layers_unmapped` còn đọc được: nếu trộn hai loại vào nhau thì mọi bản vẽ đều báo vài
        chục lớp cần xử lý và không ai đọc nữa.
        """
        name = layer.strip().upper()
        return any(fnmatch(name, p.upper()) for p in self.ignore)

    def unmapped(self, layers: list[str]) -> tuple[str, ...]:
        """Những lớp chưa ánh xạ và cũng chưa bị bỏ qua — danh sách việc cần bổ sung."""
        seen: dict[str, None] = {}
        for layer in layers:
            if self.role_of(layer) is None and not self.is_ignored(layer):
                seen[layer] = None
        return tuple(seen)

    def layers_for(self, role: str) -> tuple[str, ...]:
        """Các mẫu tên lớp khai cho một vai trò — dùng để báo lỗi cho người đọc hiểu."""
        for name, patterns in self.roles:
            if name == role:
                return patterns
        return ()


def load_mapping(path: Path | None = None) -> LayerMapping:
    """Nạp bảng ánh xạ lớp bản vẽ."""
    path = Path(path) if path is not None else default_mapping_path()
    if not path.is_file():
        raise LayerMappingError(f"không tìm thấy bảng ánh xạ lớp bản vẽ: {path}")

    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise LayerMappingError(f"{path}: cần một ánh xạ ở mức cao nhất")

    units = raw.get("default_units", "mm")
    if units not in UNIT_SCALES:
        raise LayerMappingError(
            f"{path}: default_units {units!r} không hợp lệ, phải là một trong {sorted(UNIT_SCALES)}"
        )

    roles_raw = raw.get("roles") or {}
    if not isinstance(roles_raw, dict):
        raise LayerMappingError(f"{path}: mục `roles:` phải là ánh xạ vai trò → danh sách mẫu")

    roles: list[tuple[str, tuple[str, ...]]] = []
    for role, patterns in roles_raw.items():
        if not isinstance(patterns, list) or not patterns:
            raise LayerMappingError(f"{path}: vai trò {role!r} phải có ít nhất một mẫu tên lớp")
        roles.append((str(role), tuple(str(p) for p in patterns)))

    return LayerMapping(
        version=str(raw.get("version", "0")),
        default_units=units,
        roles=tuple(roles),
        ignore=tuple(str(p) for p in (raw.get("ignore") or [])),
    )
