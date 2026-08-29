"""Knowledge Base — số hoá hồ sơ công trình cũ thành dữ liệu có cấu trúc (Mốc 3).

Phần chạy trong Container là hình học thuần tuý: dựng cây chia không gian, kiểm tra chéo,
chấm điểm chất lượng. Chuẩn hoá nhãn phòng và giao diện chú giải chạy ở Worker.
"""

from design_compute.kb.crosscheck import (
    CrossCheck,
    blocking_failures,
    check_across_levels,
    check_floor_plan,
    quality_score,
)
from design_compute.kb.record import build_record
from design_compute.kb.slicing import (
    SliceLeaf,
    SliceNode,
    SliceSplit,
    SlicingError,
    infer_slicing_tree,
    leaf_order,
    to_layout_node,
)

__all__ = [
    "CrossCheck",
    "SliceLeaf",
    "SliceNode",
    "SliceSplit",
    "SlicingError",
    "blocking_failures",
    "build_record",
    "check_across_levels",
    "check_floor_plan",
    "infer_slicing_tree",
    "leaf_order",
    "quality_score",
    "to_layout_node",
]
