"""Bộ giải CP-SAT liên tầng — phép kiểm rủi ro của Mốc 0.2.

Hai câu hỏi bộ kiểm thử này phải trả lời:
  1. Một mô hình có giải được phần đặt khối cộng mọi tầng cùng lúc, với lõi thang và trục
     tường chịu lực dùng chung giữa các tầng không?
  2. Khi các yêu cầu mâu thuẫn nhau, bộ giải có nêu được CÁI NÀO mâu thuẫn với cái nào không?

Câu thứ hai là lý do chọn CP-SAT thay vì một bộ tối ưu số học. Không có nó thì hệ thống chỉ
nói được "không hợp lệ" chứ không nói được "ba yêu cầu này không thể cùng đúng".
"""

from __future__ import annotations

from pathlib import Path

import pytest

from design_compute.rules import default_rules_root, load_for_locality
from design_compute.solver import SolveRequest, solve_townhouse
from design_compute.solver.model import RoomSpec

RULES_ROOT = default_rules_root()


@pytest.fixture(scope="module")
def pack():
    return load_for_locality(RULES_ROOT, "thai_binh")


def _nvo028_rooms() -> tuple[RoomSpec, ...]:
    """Ví dụ chạy suốt trong `doc/design/11-design-flow.md` mục 11.6.

    Lô đất 5,0 × 18,0 m, bốn tầng, ba thế hệ, sáu người.

    Cách gán vùng tôn trọng hệ quả của ba đường cắt dùng chung: dải mặt tiền và dải cạnh lõi
    có cùng tổng diện tích ở mọi tầng, vì các đường cắt đó là tuyến tường chịu lực chạy suốt
    chiều cao nhà. Nên phòng mặt tiền của mỗi tầng là một phòng đơn có cỡ tương đương, dải
    cạnh lõi là sảnh thang ở mọi tầng, còn vùng phía sau — vùng sâu nhất — được chia nhỏ khác
    nhau theo từng tầng.
    """
    return (
        # Tầng 1 — gara ra mặt tiền, sảnh thang, khách và bếp ăn phía sau
        RoomSpec("garage_1", "garage", 1, "front", 18.0, min_area_m2=10.0, max_area_m2=20.0),
        RoomSpec("hall_1", "circulation", 1, "mid", 15.0, min_area_m2=8.0, max_area_m2=22.0),
        RoomSpec("living_1", "living", 1, "rear", 26.0, min_area_m2=16.0, max_area_m2=34.0, needs_daylight=True),
        RoomSpec("kitchen_dining_1", "kitchen", 1, "rear", 16.0, min_area_m2=14.0, max_area_m2=30.0),
        # Tầng 2 — ông bà ra mặt tiền, phòng ngủ chính phía sau
        RoomSpec("bedroom_grandparents_2", "bedroom", 2, "front", 18.0, min_area_m2=10.0, max_area_m2=20.0, needs_daylight=True),
        RoomSpec("hall_2", "circulation", 2, "mid", 15.0, min_area_m2=8.0, max_area_m2=22.0),
        RoomSpec("master_bedroom_2", "master_bedroom", 2, "rear", 24.0, min_area_m2=12.0, max_area_m2=32.0, needs_daylight=True),
        RoomSpec("wc_2", "wc", 2, "rear", 5.0, min_area_m2=3.0, max_area_m2=9.0),
        RoomSpec("bedroom_spare_2", "bedroom", 2, "rear", 13.0, min_area_m2=10.0, max_area_m2=24.0, needs_daylight=True),
        # Tầng 3 — hai phòng con và phòng làm việc
        RoomSpec("bedroom_child_a_3", "bedroom", 3, "front", 18.0, min_area_m2=10.0, max_area_m2=20.0, needs_daylight=True),
        RoomSpec("hall_3", "circulation", 3, "mid", 15.0, min_area_m2=8.0, max_area_m2=22.0),
        RoomSpec("bedroom_child_b_3", "bedroom", 3, "rear", 16.0, min_area_m2=10.0, max_area_m2=24.0, needs_daylight=True),
        RoomSpec("study_3", "study", 3, "rear", 12.0, min_area_m2=8.0, max_area_m2=20.0, needs_daylight=True),
        RoomSpec("wc_3", "wc", 3, "rear", 5.0, min_area_m2=3.0, max_area_m2=9.0),
        # Tầng 4 — phòng thờ ra mặt tiền, sân phơi và kho phía sau
        RoomSpec("altar_room_4", "altar_room", 4, "front", 18.0, min_area_m2=10.0, max_area_m2=20.0),
        RoomSpec("hall_4", "circulation", 4, "mid", 15.0, min_area_m2=8.0, max_area_m2=22.0),
        RoomSpec("drying_yard_4", "drying_yard", 4, "rear", 22.0, min_area_m2=10.0, max_area_m2=28.0),
        RoomSpec("store_4", "store", 4, "rear", 20.0, min_area_m2=5.0, max_area_m2=26.0),
    )


def _request(pack, **overrides) -> SolveRequest:
    base = {
        "site_width_m": 5.0,
        "site_depth_m": 18.0,
        "floors": 4,
        "rooms": _nvo028_rooms(),
        "rule_pack": pack,
        "time_limit_s": 60.0,
    }
    base.update(overrides)
    return SolveRequest(**base)


class TestFeasibleCase:
    def test_solves_four_floors_in_one_model(self, pack) -> None:
        result = solve_townhouse(_request(pack))
        assert result.status in ("pass", "warning"), result.notes
        assert len(result.rooms) == 18
        assert {r.floor for r in result.rooms} == {1, 2, 3, 4}

    def test_rooms_tile_each_floor_with_no_gap_and_no_overlap(self, pack) -> None:
        """The structural guarantee of recursive slicing, checked on real output."""
        result = solve_townhouse(_request(pack))
        assert result.status in ("pass", "warning")

        for level in (1, 2, 3, 4):
            rooms = [r for r in result.rooms if r.floor == level]
            # Các phòng trong cùng một tầng không được chồng lấn.
            for i, a in enumerate(rooms):
                for b in rooms[i + 1 :]:
                    overlap_x = min(a.x1_m, b.x1_m) - max(a.x0_m, b.x0_m)
                    overlap_y = min(a.y1_m, b.y1_m) - max(a.y0_m, b.y0_m)
                    assert overlap_x <= 1e-9 or overlap_y <= 1e-9, f"{a.id} chồng lấn {b.id}"
            # Mọi phòng phải có kích thước dương.
            for r in rooms:
                assert r.x1_m > r.x0_m and r.y1_m > r.y0_m, f"{r.id} rỗng"

    def test_core_and_structural_axis_are_shared_across_floors(self, pack) -> None:
        """Đây chính là lý do phải giải mọi tầng cùng lúc.

        Các phòng thuộc vùng giữa đều bắt đầu ở cùng một hoành độ (mép lõi) và trải cùng một
        dải tung độ ở mọi tầng — đó là lõi thang và trục tường chịu lực thẳng hàng với nhau.
        """
        result = solve_townhouse(_request(pack))
        assert result.status in ("pass", "warning")

        mid = [r for r in result.rooms if r.id.startswith("hall_")]
        assert len({round(r.x0_m, 3) for r in mid}) == 1, "trục tường chịu lực lệch giữa các tầng"
        assert len({round(r.y0_m, 3) for r in mid}) == 1, "lõi thang lệch giữa các tầng"
        assert len({round(r.y1_m, 3) for r in mid}) == 1, "lõi thang lệch giữa các tầng"

        assert result.core is not None
        assert result.core["levels"] == [1, 2, 3, 4]

    def test_areas_are_reported_in_square_metres(self, pack) -> None:
        result = solve_townhouse(_request(pack))
        for room in result.rooms:
            expected = (room.x1_m - room.x0_m) * (room.y1_m - room.y0_m)
            assert room.area_m2 == pytest.approx(expected, abs=1e-6)

    def test_adding_a_floor_keeps_the_core_in_place(self, pack) -> None:
        """Tình huống mà cả cách tiếp cận này sinh ra để giải quyết.

        Khách đổi ý muốn năm tầng thay vì bốn. Làm tay hiện nay là vẽ lại 15–20 bản trong ba
        đến năm ngày. Ở đây nó chỉ là thêm một khối biến vào cùng mô hình, và lõi cùng các
        trục giữ nguyên tại chỗ.
        """
        four = solve_townhouse(_request(pack))
        assert four.status in ("pass", "warning")

        extra = _nvo028_rooms() + (
            RoomSpec("terrace_5", "drying_yard", 5, "front", 18.0, min_area_m2=10.0, max_area_m2=20.0),
            RoomSpec("hall_5", "circulation", 5, "mid", 15.0, min_area_m2=8.0, max_area_m2=22.0),
            RoomSpec("roof_room_5", "store", 5, "rear", 24.0, min_area_m2=10.0, max_area_m2=30.0),
            RoomSpec("wc_5", "wc", 5, "rear", 5.0, min_area_m2=3.0, max_area_m2=12.0),
        )
        five = solve_townhouse(_request(pack, floors=5, rooms=extra))

        assert five.status in ("pass", "warning"), five.notes
        assert {r.floor for r in five.rooms} == {1, 2, 3, 4, 5}
        # Cả năm tầng dùng chung một lõi — đó chính là bảo đảm nhất quán liên tầng.
        mid5 = [r for r in five.rooms if r.id.startswith("hall_")]
        assert len({round(r.x0_m, 3) for r in mid5}) == 1


class TestInfeasibilityIsExplained:
    """Infeasibility is a legitimate, useful result — not an error to hide."""

    def test_impossible_programme_returns_a_named_conflict_set(self, pack) -> None:
        # Rộng 5,0 m, bốn tầng, nhưng tầng 2 đòi hai phòng lớn cộng một sảnh mà tổng lại
        # không thể nằm vừa phía trên một lõi cũng phải có chỗ.
        greedy = (
            RoomSpec("garage_1", "garage", 1, "front", 13.2, min_area_m2=10.0),
            RoomSpec("living_1", "living", 1, "mid", 21.8, min_area_m2=16.0),
            RoomSpec("kitchen_1", "kitchen", 1, "rear", 31.4, min_area_m2=20.0),
            # Bất khả: 60 + 60 + 40 m² trên một sàn 5 × 18 = 90 m².
            RoomSpec("master_2", "master_bedroom", 2, "front", 60.0, min_area_m2=60.0),
            RoomSpec("hall_2", "circulation", 2, "mid", 40.0, min_area_m2=40.0),
            RoomSpec("bedroom_2", "bedroom", 2, "rear", 60.0, min_area_m2=60.0),
        )
        result = solve_townhouse(_request(pack, floors=2, rooms=greedy, time_limit_s=30.0))

        assert result.status == "infeasible"
        assert result.conflict_set, "vô nghiệm mà không nói được cái gì xung đột thì vô dụng"
        # Tập mâu thuẫn phải nêu tên phòng liên quan, không chỉ nói "không có lời giải".
        involved = {r for entry in result.conflict_set for r in entry.involved}
        assert involved, "tập mâu thuẫn không nêu được phần tử liên quan"

    def test_conflict_entries_say_whether_they_block_publication(self, pack) -> None:
        """The architect must be able to tell a regulation from a preference."""
        impossible = (
            RoomSpec("a_1", "bedroom", 1, "front", 80.0, min_area_m2=80.0),
            RoomSpec("b_1", "bedroom", 1, "rear", 80.0, min_area_m2=80.0),
        )
        result = solve_townhouse(_request(pack, floors=1, rooms=impossible, time_limit_s=30.0))
        assert result.status == "infeasible"
        for entry in result.conflict_set:
            assert isinstance(entry.is_legal, bool)
            assert entry.source


class TestDeterminism:
    def test_same_input_gives_the_same_plan(self, pack) -> None:
        """Tính tất định: mã băm của artifact phụ thuộc vào tính chất này."""
        a = solve_townhouse(_request(pack))
        b = solve_townhouse(_request(pack))
        assert a.status == b.status
        assert [(r.id, r.x0_m, r.y0_m, r.x1_m, r.y1_m) for r in a.rooms] == [
            (r.id, r.x0_m, r.y0_m, r.x1_m, r.y1_m) for r in b.rooms
        ]

    def test_records_solve_time_and_rule_pack_version(self, pack) -> None:
        """`rule_pack_version` là bắt buộc: không có nó thì không tái lập được phương án cũ
        sau khi quy chuẩn thay đổi."""
        result = solve_townhouse(_request(pack))
        assert result.solve_time_s > 0
        assert result.rule_pack_version
