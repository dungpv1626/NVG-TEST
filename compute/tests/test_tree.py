"""Cây chia không gian — phần suy luận CẤU TRÚC, không đụng tới bộ giải.

Ba câu hỏi tệp này trả lời:
  1. Cây sai dạng có bị chặn TRƯỚC khi vào mô hình không?
  2. Một lá tiếp giáp những mặt nào của hình bao — suy được từ cấu trúc, trước khi có toạ độ?
  3. Đường cắt nào dùng chung được giữa các tầng?

Câu thứ ba là thứ quyết định tường chịu lực có thẳng hàng hay không, nên nó phải kiểm được mà
không cần giải một mô hình nào.
"""

from __future__ import annotations

import pytest

from design_compute.solver.tree import (
    LayoutTreeError,
    aligned_cuts,
    check_shape,
    leaves,
    structurally_adjacent,
    touches_root_face,
    walk,
)


def _faces(tree: dict, path: str) -> set[str]:
    return set(touches_root_face(path, {p: n for p, n in walk(tree)}))


class TestShape:
    def test_accepts_the_three_legal_node_shapes(self) -> None:
        check_shape({"split": "H", "a": {"room": "a"}, "b": {"void": "lightwell"}})

    def test_rejects_a_node_that_is_both_split_and_room(self) -> None:
        """Hợp đồng đã cấm bằng `oneOf`; bộ giải kiểm lại vì hai đầu không tin nhau."""
        with pytest.raises(LayoutTreeError):
            check_shape({"split": "H", "room": "a", "a": {"room": "b"}, "b": {"room": "c"}})

    def test_rejects_an_empty_node(self) -> None:
        with pytest.raises(LayoutTreeError):
            check_shape({"ratio_hint": 0.5})

    def test_rejects_an_unknown_axis(self) -> None:
        with pytest.raises(LayoutTreeError):
            check_shape({"split": "Z", "a": {"room": "a"}, "b": {"room": "b"}})

    def test_rejects_a_split_missing_a_branch(self) -> None:
        with pytest.raises(LayoutTreeError):
            check_shape({"split": "V", "a": {"room": "a"}})


class TestLeaves:
    def test_lists_rooms_and_voids_with_their_path(self) -> None:
        tree = {
            "split": "H",
            "a": {"room": "living_1"},
            "b": {"split": "V", "a": {"void": "lightwell"}, "b": {"room": "kitchen_1"}},
        }
        found = leaves(tree)
        assert [(leaf.path, leaf.kind, leaf.ref) for leaf in found] == [
            ("a", "room", "living_1"),
            ("ba", "void", "lightwell"),
            ("bb", "room", "kitchen_1"),
        ]


class TestFaces:
    """Mặt thoáng suy từ CẤU TRÚC, vì toạ độ lúc này còn là biến."""

    def test_the_only_leaf_touches_all_four_faces(self) -> None:
        assert _faces({"room": "a"}, "") == {"front", "back", "left", "right"}

    def test_a_horizontal_cut_splits_front_from_back(self) -> None:
        tree = {"split": "H", "a": {"room": "front"}, "b": {"room": "rear"}}
        assert _faces(tree, "a") == {"front", "left", "right"}
        assert _faces(tree, "b") == {"back", "left", "right"}

    def test_a_vertical_cut_does_not_take_away_the_front_face(self) -> None:
        """Lát cắt dọc chia trái phải; nó không ảnh hưởng gì tới mặt trước và mặt sau."""
        tree = {"split": "V", "a": {"room": "left"}, "b": {"room": "right"}}
        assert _faces(tree, "a") == {"front", "back", "left"}
        assert _faces(tree, "b") == {"front", "back", "right"}

    def test_a_room_in_the_middle_touches_no_open_face(self) -> None:
        """Đây chính là phòng mà quy tắc chiếu sáng tự nhiên phải chặn lại."""
        tree = {
            "split": "H",
            "a": {"room": "front"},
            "b": {"split": "H", "a": {"room": "middle"}, "b": {"room": "rear"}},
        }
        assert _faces(tree, "ba") == {"left", "right"}


class TestAlignedCuts:
    def test_floors_cut_the_same_way_share_every_cut(self) -> None:
        """Ba tầng chia giống nhau thì mọi tuyến tường trùng nhau — không phải nhờ may mắn."""
        tree = {
            "split": "H",
            "a": {"room": "front"},
            "b": {"split": "V", "a": {"room": "core"}, "b": {"room": "rear"}},
        }
        shared = aligned_cuts({1: tree, 2: tree, 3: tree})
        assert shared == {"": "H", "b": "V"}

    def test_a_floor_cutting_the_other_way_breaks_sharing_there_and_below(self) -> None:
        """Chỗ hai tầng chia khác phương thì không có tường chung, và bên dưới cũng vậy."""
        a = {
            "split": "H",
            "a": {"room": "x"},
            "b": {"split": "V", "a": {"room": "y"}, "b": {"room": "z"}},
        }
        b = {
            "split": "H",
            "a": {"room": "x"},
            "b": {"split": "H", "a": {"room": "y"}, "b": {"room": "z"}},
        }
        assert aligned_cuts({1: a, 2: b}) == {"": "H"}

    def test_a_floor_that_stops_early_does_not_block_the_others(self) -> None:
        """Tầng áp mái để trống một dải không được làm mất tuyến tường của các tầng dưới."""
        deep = {
            "split": "H",
            "a": {"room": "x"},
            "b": {"split": "V", "a": {"room": "y"}, "b": {"room": "z"}},
        }
        shallow = {"split": "H", "a": {"room": "x"}, "b": {"room": "yz"}}
        assert aligned_cuts({1: deep, 2: shallow}) == {"": "H", "b": "V"}

    def test_a_single_floor_shares_with_itself(self) -> None:
        tree = {"split": "V", "a": {"room": "a"}, "b": {"room": "b"}}
        assert aligned_cuts({1: tree}) == {"": "V"}


class TestStructuralAdjacency:
    """Chứng minh kề nhau bằng cấu trúc — điều kiện ĐỦ, không phải điều kiện cần.

    Chứng minh được thì bộ giải khỏi phải dựng biến bool nào cho cặp đó. Đo trên một căn ba
    tầng: 6,6 giây xuống còn hơn một giây, vì phần đắt nhất của mô hình chính là những biến
    "hai ô này có chạm nhau không".
    """

    @staticmethod
    def _paths(tree: dict) -> dict[str, dict]:
        return {p: n for p, n in walk(tree)}

    def test_two_siblings_always_touch(self) -> None:
        tree = {"split": "H", "a": {"room": "x"}, "b": {"room": "y"}}
        assert structurally_adjacent("a", "b", self._paths(tree)) is True

    def test_a_full_depth_corridor_touches_every_band_beside_it(self) -> None:
        """Đúng khung nhà ống: hành lang dọc chạy suốt, các dải phòng trải hết bề ngang."""
        tree = {
            "split": "V",
            "a": {"room": "hall"},
            "b": {
                "split": "H",
                "a": {"room": "stair"},
                "b": {"split": "H", "a": {"room": "bed"}, "b": {"room": "kitchen"}},
            },
        }
        paths = self._paths(tree)
        for room in ("ba", "bba", "bbb"):
            assert structurally_adjacent("a", room, paths) is True, room

    def test_a_room_behind_another_room_is_not_proven_adjacent(self) -> None:
        """Phòng nằm sau một phòng khác thì không chạm được dải trước nữa."""
        tree = {
            "split": "H",
            "a": {"room": "front"},
            "b": {"split": "H", "a": {"room": "middle"}, "b": {"room": "rear"}},
        }
        paths = self._paths(tree)
        assert structurally_adjacent("a", "ba", paths) is True
        assert structurally_adjacent("a", "bb", paths) is False

    def test_a_room_in_the_far_column_is_not_proven_adjacent(self) -> None:
        """Hai phòng cạnh nhau trong một dải: chỉ phòng sát hành lang mới chắc chắn chạm."""
        tree = {
            "split": "V",
            "a": {"room": "hall"},
            "b": {"split": "V", "a": {"room": "near"}, "b": {"room": "far"}},
        }
        paths = self._paths(tree)
        assert structurally_adjacent("a", "ba", paths) is True
        assert structurally_adjacent("a", "bb", paths) is False

    def test_a_leaf_is_not_adjacent_to_itself(self) -> None:
        tree = {"split": "H", "a": {"room": "x"}, "b": {"room": "y"}}
        assert structurally_adjacent("a", "a", self._paths(tree)) is False
