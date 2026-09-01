"""Bộ giải CP-SAT liên tầng.

Bốn câu hỏi bộ kiểm thử này phải trả lời:
  1. Một mô hình có giải được phần đặt khối cộng mọi tầng cùng lúc, với lõi thang và trục
     tường chịu lực dùng chung giữa các tầng không?
  2. Cây bố cục có được đọc NGUYÊN VẸN không — cả lát cắt dọc, và các tầng chia khác nhau?
  3. Các vị từ của rule pack có thật sự ràng buộc mô hình, hay chỉ được nạp rồi bỏ đó?
  4. Khi các yêu cầu mâu thuẫn nhau, bộ giải có nêu được CÁI NÀO mâu thuẫn với cái nào không?

Câu thứ tư là lý do chọn CP-SAT thay vì một bộ tối ưu số học. Không có nó thì hệ thống chỉ
nói được "không hợp lệ" chứ không nói được "ba yêu cầu này không thể cùng đúng".
"""

from __future__ import annotations

from typing import Any

import pytest

from design_compute.rules import default_rules_root, load_for_locality
from design_compute.solver import FloorLayout, RoomSpec, SolveRequest, solve_townhouse

RULES_ROOT = default_rules_root()

SITE_W = 5.0
SITE_D = 18.0
FLOOR_AREA = SITE_W * SITE_D


@pytest.fixture(scope="module")
def pack():
    return load_for_locality(RULES_ROOT, None)


# --------------------------------------------------------------------------------------
# Nhà phố NVO-028: 5,0 × 18,0 m, bốn tầng, ba thế hệ (doc/design/11-design-flow.md 11.6)
#
# Mỗi tầng cùng một khung: một phòng ra mặt tiền · dải lõi (thang cạnh sảnh) · phần sau chia
# dọc. Cùng khung nghĩa là mọi đường cắt dùng chung được — đó chính là tường chịu lực chạy
# suốt chiều cao nhà. Tầng bốn cố ý để phần sau LIỀN MỘT KHỐI, để thấy một tầng chia thô hơn
# không làm mất tuyến tường của các tầng dưới.
# --------------------------------------------------------------------------------------


def _floor_tree(level: int, rear: dict[str, Any]) -> dict[str, Any]:
    return {
        "split": "H",
        "ratio_hint": 0.3,
        "a": {"room": f"front_{level}"},
        "b": {
            "split": "H",
            "ratio_hint": 0.4,
            "a": {
                "split": "V",
                "ratio_hint": 0.5,
                "a": {"room": f"stair_{level}"},
                "b": {"room": f"circulation_{level}"},
            },
            "b": rear,
        },
    }


def _rear_pair(level: int) -> dict[str, Any]:
    return {
        "split": "V",
        "ratio_hint": 0.6,
        "a": {"room": f"rear_a_{level}"},
        "b": {"room": f"rear_b_{level}"},
    }


def _room(
    room_id: str,
    room_type: str,
    floor: int,
    target: float,
    *,
    minimum: float,
    maximum: float,
    daylight: bool = False,
) -> RoomSpec:
    return RoomSpec(
        id=room_id,
        type=room_type,
        floor=floor,
        target_area_m2=target,
        min_area_m2=minimum,
        max_area_m2=maximum,
        needs_daylight=daylight,
        label=room_id,
    )


_FRONT_TYPE = {1: "garage", 2: "bedroom", 3: "bedroom", 4: "altar_room", 5: "drying_yard"}
_REAR_A_TYPE = {1: "living", 2: "master_bedroom", 3: "bedroom", 4: "bedroom", 5: "store"}
_REAR_B_TYPE = {1: "kitchen", 2: "wc", 3: "wc", 4: "wc", 5: "wc"}


def _floor_rooms(level: int, *, split_rear: bool = True) -> list[RoomSpec]:
    rooms = [
        _room(f"front_{level}", _FRONT_TYPE[level], level, 24.0, minimum=10.0, maximum=40.0,
              daylight=_FRONT_TYPE[level] in ("bedroom", "living")),
        _room(f"stair_{level}", "stair", level, 7.0, minimum=4.0, maximum=14.0),
        _room(f"circulation_{level}", "circulation", level, 9.0, minimum=3.0, maximum=18.0),
    ]
    if split_rear:
        rooms += [
            _room(f"rear_a_{level}", _REAR_A_TYPE[level], level, 32.0, minimum=14.0, maximum=46.0,
                  daylight=True),
            _room(f"rear_b_{level}", _REAR_B_TYPE[level], level, 18.0, minimum=2.4, maximum=40.0),
        ]
    else:
        rooms.append(
            _room(f"rear_a_{level}", "drying_yard", level, 50.0, minimum=10.0, maximum=70.0)
        )
    return rooms


def _nvo028(floors: int = 4) -> tuple[tuple[RoomSpec, ...], tuple[FloorLayout, ...]]:
    rooms: list[RoomSpec] = []
    layouts: list[FloorLayout] = []
    for level in range(1, floors + 1):
        # Tầng trên cùng để phần sau liền một khối — sân phơi, không chia phòng.
        split_rear = level != floors
        rooms += _floor_rooms(level, split_rear=split_rear)
        rear = _rear_pair(level) if split_rear else {"room": f"rear_a_{level}"}
        layouts.append(FloorLayout(level, _floor_tree(level, rear)))
    return tuple(rooms), tuple(layouts)


def _request(pack, **overrides) -> SolveRequest:
    rooms, layouts = _nvo028(overrides.pop("floors", 4))
    base: dict[str, Any] = {
        "site_width_m": SITE_W,
        "site_depth_m": SITE_D,
        "floors": len({r.floor for r in rooms}),
        "rooms": overrides.pop("rooms", rooms),
        "layouts": overrides.pop("layouts", layouts),
        "rule_pack": pack,
        "time_limit_s": 60.0,
    }
    base.update(overrides)
    return SolveRequest(**base)


class TestFeasibleCase:
    def test_solves_four_floors_in_one_model(self, pack) -> None:
        result = solve_townhouse(_request(pack))
        assert result.status in ("pass", "warning"), result.notes
        assert {r.floor for r in result.rooms} == {1, 2, 3, 4}

    def test_rooms_tile_each_floor_with_no_gap_and_no_overlap(self, pack) -> None:
        """Bảo đảm cấu trúc của cây chia đệ quy, kiểm trên đầu ra thật."""
        result = solve_townhouse(_request(pack))
        assert result.status in ("pass", "warning")

        for level in (1, 2, 3, 4):
            rooms = [r for r in result.rooms if r.floor == level]
            for i, a in enumerate(rooms):
                for b in rooms[i + 1 :]:
                    overlap_x = min(a.x1_m, b.x1_m) - max(a.x0_m, b.x0_m)
                    overlap_y = min(a.y1_m, b.y1_m) - max(a.y0_m, b.y0_m)
                    assert overlap_x <= 1e-9 or overlap_y <= 1e-9, f"{a.id} chồng lấn {b.id}"
            for r in rooms:
                assert r.x1_m > r.x0_m and r.y1_m > r.y0_m, f"{r.id} rỗng"
            # Lấp KÍN: tổng diện tích phòng đúng bằng mặt sàn. Không có "phần còn lại" nào
            # nằm ngoài mọi phòng — đó là thứ khiến chương trình không gian phải cộng đủ.
            assert sum(r.area_m2 for r in rooms) == pytest.approx(FLOOR_AREA, abs=1e-6)

    def test_core_and_structural_axes_are_shared_across_floors(self, pack) -> None:
        """Đây chính là lý do phải giải mọi tầng cùng lúc."""
        result = solve_townhouse(_request(pack))
        assert result.status in ("pass", "warning")

        stairs = [r for r in result.rooms if r.type == "stair"]
        assert len(stairs) == 4
        assert len({(r.x0_m, r.x1_m, r.y0_m, r.y1_m) for r in stairs}) == 1, "lõi thang lệch"

        assert result.core is not None
        assert result.core["levels"] == [1, 2, 3, 4]
        # Lưới trục nêu KẾT CẤU CHÍNH: hai tuyến tường ngang dùng chung, cộng hai mép lô.
        # Vách ngăn bên trong từng dải không nằm ở đây — chúng là việc của từng tầng.
        assert len(result.structural_axes_y_m) >= 4

    def test_partitions_are_free_while_the_primary_structure_is_not(self, pack) -> None:
        """Tường ngăn là việc của từng tầng; tuyến tường chịu lực thì không.

        Tầng bốn để phần sau liền một khối, ba tầng dưới chia dọc — và điều đó hợp lệ. Cái phải
        giữ nguyên giữa các tầng là hai tuyến tường ngang của kết cấu chính, cộng lõi thang.
        """
        result = solve_townhouse(_request(pack))
        rear_a = {r.floor: r for r in result.rooms if r.id.startswith("rear_a_")}
        assert rear_a[4].x1_m == pytest.approx(SITE_W), "tầng không chia dọc thì trải hết bề rộng"

        # Hai tuyến tường ngang: mép sau dải mặt tiền và mép sau dải lõi. Dùng chung nên mọi
        # tầng bắt đầu phần sau ở cùng một cao độ mặt bằng.
        fronts = {round(r.y1_m, 3) for r in result.rooms if r.id.startswith("front_")}
        assert len(fronts) == 1, "tuyến tường mặt tiền lệch giữa các tầng"

    def test_vertical_cuts_are_represented(self, pack) -> None:
        """Vướng mắc V-6: mô hình cũ làm phẳng mọi lát cắt dọc thành một dải duy nhất."""
        result = solve_townhouse(_request(pack))
        stair = next(r for r in result.rooms if r.id == "stair_1")
        hall = next(r for r in result.rooms if r.id == "circulation_1")
        assert stair.x1_m == pytest.approx(hall.x0_m), "hai phòng phải nằm CẠNH nhau"
        assert (stair.y0_m, stair.y1_m) == (hall.y0_m, hall.y1_m)

    def test_areas_are_reported_in_square_metres(self, pack) -> None:
        result = solve_townhouse(_request(pack))
        for room in result.rooms:
            expected = (room.x1_m - room.x0_m) * (room.y1_m - room.y0_m)
            assert room.area_m2 == pytest.approx(expected, abs=1e-6)

    def test_adding_a_floor_keeps_the_core_in_place(self, pack) -> None:
        """Tình huống mà cả cách tiếp cận này sinh ra để giải quyết.

        Khách đổi ý muốn năm tầng thay vì bốn. Làm tay hiện nay là vẽ lại 15–20 bản trong ba
        đến năm ngày. Ở đây nó chỉ là thêm một khối biến vào cùng mô hình.
        """
        four = solve_townhouse(_request(pack))
        five = solve_townhouse(_request(pack, floors=5))

        assert four.status in ("pass", "warning")
        assert five.status in ("pass", "warning"), five.notes
        assert {r.floor for r in five.rooms} == {1, 2, 3, 4, 5}

        stairs = {(r.x0_m, r.x1_m, r.y0_m, r.y1_m) for r in five.rooms if r.type == "stair"}
        assert len(stairs) == 1


class TestFloorsMayDifferInPlan:
    """Vướng mắc V-5: mô hình cũ ép mọi tầng có cùng diện tích theo từng dải.

    Ba đường cắt cố định của mô hình Mốc 0.2 dùng chung cho mọi tầng, nên mỗi dải bắt buộc có
    cùng tổng diện tích ở mọi tầng. Từ Mốc 5, việc dùng chung SUY RA từ cây: hai tầng chia
    giống nhau thì thẳng hàng, chia khác nhau thì độc lập. Không còn gì ép cả.
    """

    def test_two_floors_split_along_different_axes_are_independent(self, pack) -> None:
        rooms = (
            _room("living_1", "living", 1, 50.0, minimum=14.0, maximum=70.0, daylight=True),
            _room("hall_1", "circulation", 1, 40.0, minimum=3.0, maximum=70.0),
            _room("hall_2", "circulation", 2, 27.0, minimum=3.0, maximum=70.0),
            _room("bedroom_2", "bedroom", 2, 63.0, minimum=9.0, maximum=80.0, daylight=True),
        )
        layouts = (
            # Tầng 1 chia NGANG: hai dải trước sau.
            FloorLayout(1, {"split": "H", "a": {"room": "living_1"}, "b": {"room": "hall_1"}}),
            # Tầng 2 chia DỌC: hai cột cạnh nhau, chạy suốt chiều sâu.
            FloorLayout(2, {"split": "V", "a": {"room": "hall_2"}, "b": {"room": "bedroom_2"}}),
        )
        result = solve_townhouse(_request(pack, rooms=rooms, layouts=layouts, floors=2))

        assert result.status in ("pass", "warning"), result.notes
        hall_1 = next(r for r in result.rooms if r.id == "hall_1")
        hall_2 = next(r for r in result.rooms if r.id == "hall_2")

        assert hall_1.x1_m - hall_1.x0_m == pytest.approx(SITE_W), "dải ngang trải hết bề rộng"
        assert hall_2.y1_m - hall_2.y0_m == pytest.approx(SITE_D), "cột dọc chạy suốt chiều sâu"
        # Không có dải nào của tầng 1 bị ép bằng diện tích một dải của tầng 2.
        assert hall_1.area_m2 != pytest.approx(hall_2.area_m2)


class TestDaylight:
    def test_a_room_with_no_open_face_is_refused_and_named(self, pack) -> None:
        """Phòng ngủ lọt giữa nhà không thể lấy sáng — nói ra bằng mã quy tắc, không im lặng."""
        rooms = (
            _room("front_1", "living", 1, 30.0, minimum=14.0, maximum=50.0, daylight=True),
            _room("middle_1", "bedroom", 1, 30.0, minimum=9.0, maximum=50.0, daylight=True),
            _room("rear_1", "circulation", 1, 30.0, minimum=3.0, maximum=50.0),
        )
        layouts = (
            FloorLayout(
                1,
                {
                    "split": "H",
                    "a": {"room": "front_1"},
                    "b": {
                        "split": "H",
                        "a": {"room": "middle_1"},
                        "b": {"room": "rear_1"},
                    },
                },
            ),
        )
        result = solve_townhouse(_request(pack, rooms=rooms, layouts=layouts, floors=1))

        assert result.status == "infeasible"
        assert "bedroom_requires_daylight" in {e.rule_id for e in result.conflict_set}
        assert "middle_1" in {i for e in result.conflict_set for i in e.involved}

    def test_a_lightwell_gives_daylight_to_a_room_in_the_middle(self, pack) -> None:
        """Giếng trời là cách nhà phố sâu vẫn có phòng ngủ giữa nhà — mô hình phải biết điều đó."""
        rooms = (
            _room("front_1", "living", 1, 25.0, minimum=14.0, maximum=40.0, daylight=True),
            _room("middle_1", "bedroom", 1, 20.0, minimum=9.0, maximum=40.0, daylight=True),
            _room("hall_1", "circulation", 1, 15.0, minimum=3.0, maximum=40.0),
            _room("rear_1", "kitchen", 1, 25.0, minimum=6.0, maximum=40.0),
        )
        layouts = (
            FloorLayout(
                1,
                {
                    "split": "H",
                    "a": {"room": "front_1"},
                    "b": {
                        "split": "H",
                        "a": {
                            "split": "V",
                            "a": {"room": "middle_1"},
                            "b": {"void": "lightwell"},
                        },
                        "b": {
                            "split": "H",
                            "a": {"room": "hall_1"},
                            "b": {"room": "rear_1"},
                        },
                    },
                },
            ),
        )
        result = solve_townhouse(_request(pack, rooms=rooms, layouts=layouts, floors=1))

        assert result.status in ("pass", "warning"), result.notes
        middle = next(r for r in result.rooms if r.id == "middle_1")
        assert middle.has_daylight is True
        assert [v.kind for v in result.voids] == ["lightwell"]

    def test_daylight_flag_is_measured_not_copied_from_the_programme(self, pack) -> None:
        """Cờ `has_daylight` phải là kết quả ĐO, không phải chép lại yêu cầu của đầu bài."""
        result = solve_townhouse(_request(pack))
        stair = next(r for r in result.rooms if r.id == "stair_1")
        assert stair.has_daylight is False
        front = next(r for r in result.rooms if r.id == "front_1")
        assert front.has_daylight is True

    def test_a_lot_hemmed_in_on_both_sides_loses_its_back_face(self, pack) -> None:
        """Mặt thoáng là DỮ LIỆU của thửa. Thửa chỉ hở mặt trước thì phòng sau phải có giếng trời."""
        result = solve_townhouse(_request(pack, open_faces=("front",)))
        assert result.status == "infeasible"
        assert {"bedroom_requires_daylight", "living_requires_daylight"} & {
            e.rule_id for e in result.conflict_set
        }


class TestAccess:
    def test_a_room_reachable_from_nothing_is_refused(self, pack) -> None:
        rooms = (
            _room("front_1", "living", 1, 45.0, minimum=14.0, maximum=60.0, daylight=True),
            _room("rear_1", "store", 1, 45.0, minimum=5.0, maximum=60.0),
            _room("front_2", "bedroom", 2, 45.0, minimum=9.0, maximum=60.0, daylight=True),
            _room("rear_2", "store", 2, 45.0, minimum=5.0, maximum=60.0),
        )
        layouts = tuple(
            FloorLayout(
                level,
                {"split": "H", "a": {"room": f"front_{level}"}, "b": {"room": f"rear_{level}"}},
            )
            for level in (1, 2)
        )
        result = solve_townhouse(_request(pack, rooms=rooms, layouts=layouts, floors=2))

        assert result.status == "infeasible"
        assert "every_room_requires_access" in {e.rule_id for e in result.conflict_set}
        # Tầng 1 vào được từ mặt tiền, nên chỉ tầng 2 bị nêu tên.
        involved = {i for e in result.conflict_set for i in e.involved}
        assert "front_2" in involved or "rear_2" in involved

    def test_the_ground_floor_can_be_entered_from_the_street(self, pack) -> None:
        result = solve_townhouse(_request(pack))
        assert result.status in ("pass", "warning")
        front = next(r for r in result.rooms if r.id == "front_1")
        assert front.y0_m == pytest.approx(0.0)


class TestMassing:
    def test_a_setback_pushes_the_building_off_the_boundary(self, pack) -> None:
        """Khoảng lùi của rule pack biệt thự phải hiện ra thành hình bao thu vào thật."""
        rooms = (
            _room("front_1", "living", 1, 40.0, minimum=14.0, maximum=200.0, daylight=True),
            _room("stair_1", "stair", 1, 8.0, minimum=4.0, maximum=30.0),
            _room("rear_1", "kitchen", 1, 40.0, minimum=6.0, maximum=200.0),
        )
        layouts = (
            FloorLayout(
                1,
                {
                    "split": "H",
                    "a": {"room": "front_1"},
                    "b": {"split": "V", "a": {"room": "stair_1"}, "b": {"room": "rear_1"}},
                },
            ),
        )
        result = solve_townhouse(
            _request(
                pack,
                rooms=rooms,
                layouts=layouts,
                floors=1,
                building_type="biet_thu",
                site_width_m=10.0,
                site_depth_m=20.0,
                open_faces=("front", "back", "left", "right"),
            )
        )
        assert result.status in ("pass", "warning"), result.notes
        assert result.footprint_m is not None
        x0, y0, x1, y1 = result.footprint_m
        assert y0 == pytest.approx(3.0), "khoảng lùi trước 3 m của gói nền chưa được áp"
        assert min(r.y0_m for r in result.rooms) == pytest.approx(3.0)

    def test_density_shrinks_the_footprint_from_the_back(self, pack) -> None:
        """Trần mật độ 60% của biệt thự phải cắt bớt chiều sâu, không phải làm bài toán vô nghiệm.

        Thu từ phía sau vì mặt tiền là thứ không đổi được — phần dôi ra thành sân.
        """
        rooms = (
            _room("front_1", "living", 1, 40.0, minimum=14.0, maximum=200.0, daylight=True),
            _room("stair_1", "stair", 1, 8.0, minimum=4.0, maximum=30.0),
            _room("rear_1", "kitchen", 1, 40.0, minimum=6.0, maximum=200.0),
        )
        layouts = (
            FloorLayout(
                1,
                {
                    "split": "H",
                    "a": {"room": "front_1"},
                    "b": {"split": "V", "a": {"room": "stair_1"}, "b": {"room": "rear_1"}},
                },
            ),
        )
        result = solve_townhouse(
            _request(
                pack,
                rooms=rooms,
                layouts=layouts,
                floors=1,
                building_type="biet_thu",
                site_width_m=10.0,
                site_depth_m=20.0,
                open_faces=("front", "back", "left", "right"),
            )
        )
        assert result.status in ("pass", "warning"), result.notes
        x0, y0, x1, y1 = result.footprint_m
        built = (x1 - x0) * (y1 - y0)
        assert built <= 0.6 * 10.0 * 20.0 + 1e-6
        assert y1 < 20.0, "hình bao phải thu lại, không chạm mép sau"
        assert not [v for v in result.violations if v.rule_id == "max_density_villa"]

    def test_density_uses_the_real_lot_area_not_the_buildable_rectangle(self, pack) -> None:
        """Thửa không vuông vắn: ô chữ nhật xây được nhỏ hơn thửa, lấy nó làm mẫu số là phạt oan."""
        rooms = (
            _room("front_1", "living", 1, 40.0, minimum=14.0, maximum=200.0, daylight=True),
            _room("stair_1", "stair", 1, 8.0, minimum=4.0, maximum=30.0),
            _room("rear_1", "kitchen", 1, 40.0, minimum=6.0, maximum=200.0),
        )
        layouts = (
            FloorLayout(
                1,
                {
                    "split": "H",
                    "a": {"room": "front_1"},
                    "b": {"split": "V", "a": {"room": "stair_1"}, "b": {"room": "rear_1"}},
                },
            ),
        )
        common = dict(
            rooms=rooms,
            layouts=layouts,
            floors=1,
            building_type="biet_thu",
            site_width_m=10.0,
            site_depth_m=20.0,
            open_faces=("front", "back", "left", "right"),
        )
        tight = solve_townhouse(_request(pack, **common))
        generous = solve_townhouse(_request(pack, site_area_m2=300.0, **common))

        assert tight.footprint_m is not None and generous.footprint_m is not None
        assert generous.footprint_m[3] > tight.footprint_m[3]


class TestWarningsAreReportedNotEnforced:
    def test_a_warning_rule_shows_up_as_a_violation_but_still_solves(self, pack) -> None:
        """Quy tắc mức cảnh báo không được chặn — nó phải hiện ra trong danh sách vi phạm."""
        # Phòng thờ đặt ở tầng 1 trong khi `altar_room_top_floor` muốn nó ở tầng trên cùng.
        rooms = (
            _room("front_1", "altar_room", 1, 45.0, minimum=10.0, maximum=60.0),
            _room("rear_1", "circulation", 1, 45.0, minimum=3.0, maximum=60.0),
            _room("front_2", "bedroom", 2, 45.0, minimum=9.0, maximum=60.0, daylight=True),
            _room("rear_2", "circulation", 2, 45.0, minimum=3.0, maximum=60.0),
        )
        layouts = tuple(
            FloorLayout(
                level,
                {"split": "H", "a": {"room": f"front_{level}"}, "b": {"room": f"rear_{level}"}},
            )
            for level in (1, 2)
        )
        result = solve_townhouse(_request(pack, rooms=rooms, layouts=layouts, floors=2))

        assert result.status in ("pass", "warning"), result.notes
        assert "altar_room_top_floor" in {v.rule_id for v in result.violations}
        assert all(v.severity == "warning" for v in result.violations)


class TestInfeasibilityIsExplained:
    """Vô nghiệm là kết quả hợp lệ và hữu ích — không phải lỗi để giấu."""

    def test_impossible_programme_returns_a_named_conflict_set(self, pack) -> None:
        rooms, layouts = _nvo028(2)
        greedy = tuple(
            _room(r.id, r.type, r.floor, 60.0, minimum=60.0, maximum=90.0, daylight=r.needs_daylight)
            for r in rooms
        )
        result = solve_townhouse(
            _request(pack, rooms=greedy, layouts=layouts, floors=2, time_limit_s=30.0)
        )

        assert result.status == "infeasible"
        assert result.conflict_set, "vô nghiệm mà không nói được cái gì xung đột thì vô dụng"
        involved = {r for entry in result.conflict_set for r in entry.involved}
        assert involved, "tập mâu thuẫn không nêu được phần tử liên quan"

    def test_conflict_entries_say_whether_they_block_publication(self, pack) -> None:
        """Kiến trúc sư phải phân biệt được quy chuẩn với sở thích."""
        rooms = (
            _room("a_1", "bedroom", 1, 80.0, minimum=80.0, maximum=95.0, daylight=True),
            _room("b_1", "bedroom", 1, 80.0, minimum=80.0, maximum=95.0, daylight=True),
        )
        layouts = (
            FloorLayout(1, {"split": "H", "a": {"room": "a_1"}, "b": {"room": "b_1"}}),
        )
        result = solve_townhouse(
            _request(pack, rooms=rooms, layouts=layouts, floors=1, time_limit_s=30.0)
        )
        assert result.status == "infeasible"
        for entry in result.conflict_set:
            assert isinstance(entry.is_legal, bool)
            assert entry.source

    def test_a_stair_that_cannot_line_up_is_named(self, pack) -> None:
        """Hai tầng đặt thang ở hai chỗ khác nhau — không có ngôi nhà nào ứng với bản vẽ đó."""
        rooms = (
            _room("stair_1", "stair", 1, 45.0, minimum=4.0, maximum=60.0),
            _room("hall_1", "circulation", 1, 45.0, minimum=3.0, maximum=60.0),
            _room("hall_2", "circulation", 2, 45.0, minimum=3.0, maximum=60.0),
            _room("stair_2", "stair", 2, 45.0, minimum=4.0, maximum=60.0),
        )
        layouts = (
            FloorLayout(1, {"split": "H", "a": {"room": "stair_1"}, "b": {"room": "hall_1"}}),
            # Tầng 2 đảo thứ tự: thang ra phía sau. Ép hai lõi trùng khít thì hai lát cắt phải
            # cùng lúc ở hai chỗ.
            FloorLayout(2, {"split": "H", "a": {"room": "hall_2"}, "b": {"room": "stair_2"}}),
        )
        result = solve_townhouse(_request(pack, rooms=rooms, layouts=layouts, floors=2))

        assert result.status == "infeasible"
        assert "stair_alignment" in {e.rule_id for e in result.conflict_set}


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
