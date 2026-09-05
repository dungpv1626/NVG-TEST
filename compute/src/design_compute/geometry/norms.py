"""Chuẩn cấu tạo: bề dày tường, kích thước cửa. Nạp từ `kb/construction_norms.yaml`.

Quy ước cấu tạo là DỮ LIỆU, cùng lý lẽ với rule pack và bảng ánh xạ lớp bản vẽ (CLAUDE.md
8.7). Khác rule pack ở chỗ: số ở đây quyết định bản vẽ TRÔNG thế nào, không quyết định phương
án có hợp lệ hay không — nên chúng không có mức nghiêm trọng và không chặn phát hành.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


class ConstructionNormsError(RuntimeError):
    """Tệp chuẩn cấu tạo sai định dạng hoặc không đọc được."""


def default_norms_path() -> Path:
    """Trong container, ảnh Docker chép tệp sang `/app/kb/` và đặt `NVG_CONSTRUCTION_NORMS`."""
    from_env = os.environ.get("NVG_CONSTRUCTION_NORMS")
    if from_env:
        return Path(from_env)
    # norms.py -> geometry/ -> design_compute/ -> src/ -> compute/ -> gốc repo
    return Path(__file__).resolve().parents[4] / "kb" / "construction_norms.yaml"


@dataclass(frozen=True, slots=True)
class ConstructionNorms:
    version: str
    exterior_m: float
    load_bearing_m: float
    partition_m: float
    door_width_m: float
    door_height_m: float
    wc_door_width_m: float
    wc_door_height_m: float
    entrance_width_m: float
    entrance_height_m: float
    window_height_m: float
    window_sill_m: float
    window_share: float
    window_min_m: float
    window_max_m: float
    wc_window_width_m: float
    wc_window_height_m: float
    wc_window_sill_m: float
    no_window_types: frozenset[str]
    # Cao độ tầng — đọc từ mặt cắt hồ sơ thật (HS-01). Tầng trên cùng cao hơn các tầng còn
    # lại, nên là hai số chứ không phải một. Đây là chỗ duy nhất giữ con số này: bộ giải không
    # có biến chiều cao, còn `FloorPlan.levels[].height_m` mang nó ra cho khối 3D và mặt cắt.
    storey_height_m: float
    top_storey_height_m: float

    def storey_height(self, level: int, top_level: int) -> float:
        """Chiều cao của một tầng, biết tầng nào là tầng trên cùng."""
        return self.top_storey_height_m if level == top_level else self.storey_height_m


def _number(source: dict[str, Any], *path: str) -> float:
    node: Any = source
    for key in path:
        if not isinstance(node, dict) or key not in node:
            raise ConstructionNormsError(
                "Chuẩn cấu tạo thiếu mục " + ".".join(path) + " — không đoán bù."
            )
        node = node[key]
    try:
        return float(node)
    except (TypeError, ValueError) as exc:
        raise ConstructionNormsError(
            "Giá trị " + ".".join(path) + " của chuẩn cấu tạo không phải số."
        ) from exc


def parse_construction_norms(text: str) -> ConstructionNorms:
    raw = yaml.safe_load(text) or {}
    if not isinstance(raw, dict):
        raise ConstructionNormsError("Tệp chuẩn cấu tạo rỗng hoặc sai định dạng.")
    return ConstructionNorms(
        version=str(raw.get("version", "")),
        exterior_m=_number(raw, "walls", "exterior_m"),
        load_bearing_m=_number(raw, "walls", "load_bearing_m"),
        partition_m=_number(raw, "walls", "partition_m"),
        door_width_m=_number(raw, "openings", "door", "width_m"),
        door_height_m=_number(raw, "openings", "door", "height_m"),
        wc_door_width_m=_number(raw, "openings", "wc_door", "width_m"),
        wc_door_height_m=_number(raw, "openings", "wc_door", "height_m"),
        entrance_width_m=_number(raw, "openings", "entrance", "width_m"),
        entrance_height_m=_number(raw, "openings", "entrance", "height_m"),
        window_height_m=_number(raw, "openings", "window", "height_m"),
        window_sill_m=_number(raw, "openings", "window", "sill_m"),
        window_share=_number(raw, "openings", "window", "share_of_wall"),
        window_min_m=_number(raw, "openings", "window", "min_width_m"),
        window_max_m=_number(raw, "openings", "window", "max_width_m"),
        wc_window_width_m=_number(raw, "openings", "wc_window", "width_m"),
        wc_window_height_m=_number(raw, "openings", "wc_window", "height_m"),
        wc_window_sill_m=_number(raw, "openings", "wc_window", "sill_m"),
        no_window_types=frozenset(str(t) for t in (raw.get("no_window_types") or [])),
        storey_height_m=_number(raw, "levels", "storey_height_m"),
        top_storey_height_m=_number(raw, "levels", "top_storey_height_m"),
    )


def load_construction_norms(path: Path | None = None) -> ConstructionNorms:
    target = path or default_norms_path()
    try:
        return parse_construction_norms(target.read_text(encoding="utf-8"))
    except OSError as exc:
        raise ConstructionNormsError(f"Không đọc được chuẩn cấu tạo tại {target}.") from exc
