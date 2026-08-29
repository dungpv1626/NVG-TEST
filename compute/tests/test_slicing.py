"""Suy ngược cây chia không gian từ hình học.

Phép kiểm quan trọng nhất không phải "dựng được cây" mà là **nhận ra khi KHÔNG dựng được**:
mặt bằng không thuộc lớp slicing phải trả `None` để nơi gọi hạ `quality_score`, chứ không
được trả một cây gần đúng. Một few-shot sai cấu trúc dạy mô hình ngôn ngữ sinh sai.
"""

from __future__ import annotations

import pytest

from design_compute.contracts import ContractError, validate
from design_compute.kb import (
    SliceLeaf,
    SliceSplit,
    SlicingError,
    infer_slicing_tree,
    leaf_order,
    to_layout_node,
)


def _rect(x0: float, y0: float, x1: float, y1: float) -> list[list[float]]:
    """Một phòng hình chữ nhật.

    Trả về DANH SÁCH các danh sách, không phải tuple: bản ghi Knowledge Base được kiểm theo
    JSON Schema, mà `jsonschema` coi tuple của Python không phải kiểu `array`. Nơi nào lắp
    bản ghi từ `ExtractedRoom` (vốn dùng tuple cho bất biến) đều phải đổi kiểu trước khi kiểm.
    """
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]


# Nhà phố 5 m: ba phòng xếp từ mặt tiền vào sâu.
TOWNHOUSE = [
    _rect(0, 0, 5, 6),  # 0 — sát mặt tiền
    _rect(0, 6, 5, 10),  # 1 — giữa
    _rect(0, 10, 5, 16),  # 2 — sau cùng
]

# Lô rộng: dải trước chia đôi theo chiều ngang, dải sau nguyên khối.
WIDE = [
    _rect(0, 0, 4, 6),  # 0 — trước-trái
    _rect(4, 0, 8, 6),  # 1 — trước-phải
    _rect(0, 6, 8, 12),  # 2 — sau
]


class TestStructure:
    def test_stacked_rooms_split_horizontally(self) -> None:
        tree = infer_slicing_tree(TOWNHOUSE)
        assert isinstance(tree, SliceSplit)
        assert tree.axis == "H"

    def test_side_by_side_rooms_split_vertically(self) -> None:
        tree = infer_slicing_tree([_rect(0, 0, 4, 6), _rect(4, 0, 8, 6)])
        assert isinstance(tree, SliceSplit)
        assert tree.axis == "V"

    def test_single_room_is_a_leaf(self) -> None:
        assert infer_slicing_tree([_rect(0, 0, 5, 6)]) == SliceLeaf(0)

    def test_no_rooms_gives_no_tree(self) -> None:
        assert infer_slicing_tree([]) is None

    def test_branch_a_is_always_front_or_left(self) -> None:
        """Quy ước của hợp đồng và của bộ giải: gốc ở góc trước-trái, `y` đi vào sâu.

        Nhờ vậy thứ tự duyệt cây CHÍNH LÀ thứ tự hình học — `_flatten_rooms` của bộ giải dựa
        hẳn vào điều này để gán vùng front/mid/rear mà không cần đọc lại toạ độ.
        """
        assert leaf_order(infer_slicing_tree(TOWNHOUSE)) == [0, 1, 2]
        assert leaf_order(infer_slicing_tree(WIDE)) == [0, 1, 2]

    def test_mixed_axes_are_nested_not_flattened(self) -> None:
        tree = infer_slicing_tree(WIDE)
        assert isinstance(tree, SliceSplit) and tree.axis == "H"
        assert isinstance(tree.a, SliceSplit) and tree.a.axis == "V"
        assert tree.b == SliceLeaf(2)

    def test_result_is_deterministic(self) -> None:
        """Nhiều đường cắt cùng hợp lệ; kết quả vẫn phải như nhau qua các lần chạy."""
        assert infer_slicing_tree(TOWNHOUSE) == infer_slicing_tree(TOWNHOUSE)


class TestNonSlicingLayouts:
    def test_pinwheel_layout_is_rejected(self) -> None:
        """Bố cục chong chóng — bốn phòng quấn quanh một tâm.

        Đây là ví dụ kinh điển của mặt bằng KHÔNG thuộc lớp slicing: không tồn tại đường cắt
        thẳng nào không cắt qua phòng. Trả về một cây gần đúng ở đây sẽ dạy mô hình ngôn ngữ
        sinh ra cấu trúc mà bộ giải không dựng lại được.
        """
        pinwheel = [
            _rect(0, 0, 6, 2),
            _rect(6, 0, 8, 6),
            _rect(2, 6, 8, 8),
            _rect(0, 2, 2, 8),
        ]
        assert infer_slicing_tree(pinwheel) is None

    def test_overlapping_rooms_are_rejected(self) -> None:
        assert infer_slicing_tree([_rect(0, 0, 5, 6), _rect(0, 3, 5, 9)]) is None


class TestTolerance:
    def test_wall_thickness_does_not_break_the_cut(self) -> None:
        """Bản vẽ thật có bề dày tường, hai phòng hiếm khi dùng chung đúng một đường."""
        rooms = [_rect(0, 0, 5, 5.9), _rect(0, 6.1, 5, 10)]
        assert isinstance(infer_slicing_tree(rooms), SliceSplit)

    def test_a_real_misalignment_is_not_swallowed(self) -> None:
        rooms = [_rect(0, 0, 5, 6), _rect(0, 3, 5, 10)]
        assert infer_slicing_tree(rooms, tolerance_m=0.05) is None


class TestContractShape:
    NAMES = ["living", "kitchen", "bedroom"]

    def test_rendered_node_satisfies_the_layout_intent_contract(self) -> None:
        """Cây suy ngược phải hợp lệ theo ĐÚNG lược đồ mà Layer 3a sinh ra.

        Few-shot lệch định dạng là dạy sai — đây là lý do `kb-record` dùng lại nguyên
        `layout_node` của `layout-intent` thay vì định nghĩa một cây riêng.
        """
        node = to_layout_node(infer_slicing_tree(TOWNHOUSE), self.NAMES)
        record = {
            "schema_version": "1.0.0",
            "tenant_id": "00000000-0000-0000-0000-000000000001",
            "project_code": "NVO-015",
            "tier": "A",
            "quality_score": 0.9,
            "building_type": "nha_pho",
            "site": {"width_m": 5.0, "depth_m": 16.0},
            "floors": 1,
            "floor_plans": [
                {
                    "level": 1,
                    "rooms": [{"type": "living", "polygon": TOWNHOUSE[0], "area_m2": 30.0}],
                }
            ],
            "slicing_tree": node,
            "has_brief": True,
        }
        validate("kb-record", record)

    def test_ratio_hint_stays_strictly_inside_zero_and_one(self) -> None:
        thin = [_rect(0, 0, 5, 0.4), _rect(0, 0.4, 5, 30)]
        node = to_layout_node(infer_slicing_tree(thin), ["wc", "living"])
        assert 0 < node["ratio_hint"] < 1

    def test_record_with_null_tree_is_still_valid(self) -> None:
        """Mặt bằng không thuộc lớp slicing vẫn số hoá được, chỉ không dùng làm few-shot."""
        record = {
            "schema_version": "1.0.0",
            "tenant_id": "00000000-0000-0000-0000-000000000001",
            "project_code": "NVO-016",
            "tier": "A",
            "quality_score": 0.4,
            "building_type": "biet_thu",
            "site": {"width_m": 12.0, "depth_m": 18.0},
            "floors": 2,
            "floor_plans": [
                {"level": 1, "rooms": [{"type": None, "polygon": TOWNHOUSE[0], "area_m2": 30.0}]}
            ],
            "slicing_tree": None,
            "has_brief": False,
        }
        validate("kb-record", record)

    def test_unnormalised_label_is_refused_not_guessed(self) -> None:
        tree = infer_slicing_tree(TOWNHOUSE)
        with pytest.raises(SlicingError, match="chưa chuẩn hoá"):
            to_layout_node(tree, ["living", None, "bedroom"])

    def test_label_in_the_wrong_vocabulary_is_refused(self) -> None:
        tree = infer_slicing_tree(TOWNHOUSE)
        with pytest.raises(SlicingError, match="không khớp"):
            to_layout_node(tree, ["living", "PHÒNG NGỦ", "bedroom"])

    def test_contract_rejects_a_hybrid_node(self) -> None:
        """`layout_node` là ĐÚNG MỘT trong ba dạng, không được lai."""
        record = {
            "schema_version": "1.0.0",
            "tenant_id": "00000000-0000-0000-0000-000000000001",
            "project_code": "NVO-017",
            "tier": "A",
            "quality_score": 0.9,
            "building_type": "nha_pho",
            "site": {"width_m": 5.0, "depth_m": 16.0},
            "floors": 1,
            "floor_plans": [
                {"level": 1, "rooms": [{"type": "living", "polygon": TOWNHOUSE[0], "area_m2": 30.0}]}
            ],
            "slicing_tree": {"room": "living", "split": "H"},
            "has_brief": True,
        }
        with pytest.raises(ContractError):
            validate("kb-record", record)
