"""Hình học dẫn xuất từ nghiệm của bộ giải: tường, lỗ mở, và xuất bản vẽ.

Lớp 3c của `doc/design/04-layer3-floorplan.md` mục 4.5. Không giải gì cả — mọi toạ độ đã có,
phần này chỉ đọc ra tường và cửa từ các đa giác phòng.
"""

from design_compute.geometry.norms import (
    ConstructionNorms,
    ConstructionNormsError,
    load_construction_norms,
    parse_construction_norms,
)
from design_compute.geometry.walls import Cell, Opening, Wall, build_walls_and_openings

__all__ = [
    "ConstructionNorms",
    "ConstructionNormsError",
    "load_construction_norms",
    "parse_construction_norms",
    "Cell",
    "Wall",
    "Opening",
    "build_walls_and_openings",
]
