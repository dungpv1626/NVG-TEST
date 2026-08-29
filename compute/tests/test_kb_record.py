"""Kiểm tra chéo, chấm điểm chất lượng, và lắp bản ghi Knowledge Base.

Điểm chất lượng ở đây quyết định bản ghi có được dùng làm few-shot cho Layer 3a hay không,
nên điều đáng kiểm nhất là nó **không cho điểm cao một cách dễ dãi**: phép kiểm chưa chạy
được cũng phải kéo điểm xuống, chứ không được bỏ qua rồi vẫn chấm tuyệt đối.
"""

from __future__ import annotations

import pytest

from design_compute.cad.extract import ExtractedFloorPlan, ExtractedRoom, ExtractionWarning
from design_compute.contracts import ContractError
from design_compute.kb import (
    blocking_failures,
    build_record,
    check_across_levels,
    check_floor_plan,
    quality_score,
)

TENANT = "00000000-0000-0000-0000-000000000001"
SITE = {"width_m": 5.0, "depth_m": 16.0, "orientation": "DN"}


def _room(x0: float, y0: float, x1: float, y1: float, label: str | None = "PHONG") -> ExtractedRoom:
    return ExtractedRoom(
        polygon_m=((x0, y0), (x1, y0), (x1, y1), (x0, y1)),
        area_m2=round((x1 - x0) * (y1 - y0), 2),
        layer="A-AREA-ROOM",
        label_raw=label,
        label_source="contains" if label else "none",
    )


def _plan(rooms, **kwargs) -> ExtractedFloorPlan:
    defaults = dict(
        source_file="plan.dxf",
        units="mm",
        units_assumed=False,
        rooms=tuple(rooms),
    )
    defaults.update(kwargs)
    return ExtractedFloorPlan(**defaults)  # type: ignore[arg-type]


GOOD_ROOMS = [_room(0, 0, 5, 6), _room(0, 6, 5, 10), _room(0, 10, 5, 16)]
GOOD = _plan(GOOD_ROOMS, site_boundary_m=((0, 0), (5, 0), (5, 16), (0, 16)), columns_m=((0.0, 6.0),))
TYPES = ["living", "kitchen", "bedroom"]


def _codes(checks, outcome: str) -> set[str]:
    return {c.code for c in checks if c.outcome == outcome}


class TestFloorPlanChecks:
    def test_a_clean_plan_passes_everything_it_can(self) -> None:
        checks = check_floor_plan(GOOD, slicing_tree=object())
        assert _codes(checks, "fail") == set()
        assert _codes(checks, "skipped") == set()

    def test_overlapping_rooms_are_caught(self) -> None:
        plan = _plan([_room(0, 0, 5, 8), _room(0, 4, 5, 12)])
        assert "no_overlap" in _codes(check_floor_plan(plan), "fail")

    def test_rooms_sharing_only_an_edge_are_not_overlaps(self) -> None:
        """Hai phòng cạnh nhau luôn chạm nhau ở cạnh chung — đó là bình thường, không phải lỗi."""
        assert "no_overlap" not in _codes(check_floor_plan(GOOD), "fail")

    def test_room_outside_the_site_boundary_is_caught(self) -> None:
        plan = _plan([_room(0, 0, 5, 6), _room(0, 20, 5, 26)], site_boundary_m=((0, 0), (5, 0), (5, 16), (0, 16)))
        assert "inside_site" in _codes(check_floor_plan(plan), "fail")

    def test_column_on_a_wall_is_accepted(self) -> None:
        """Cột nằm TRÊN tường nên ở mép phòng, không trong lòng phòng.

        Không nới footprint thì mọi bản vẽ có cột đều trượt phép kiểm này.
        """
        plan = _plan(GOOD_ROOMS, columns_m=((0.0, 6.0), (5.0, 10.0)))
        assert "columns_inside_footprint" not in _codes(check_floor_plan(plan), "fail")

    def test_column_far_from_the_building_is_caught(self) -> None:
        plan = _plan(GOOD_ROOMS, columns_m=((40.0, 40.0),))
        assert "columns_inside_footprint" in _codes(check_floor_plan(plan), "fail")

    def test_missing_labels_and_assumed_units_are_both_reported(self) -> None:
        plan = _plan([_room(0, 0, 5, 6, label=None)], units_assumed=True)
        failed = _codes(check_floor_plan(plan), "fail")
        assert {"labels_normalised", "units_declared"} <= failed

    def test_absent_optional_data_is_skipped_not_passed(self) -> None:
        """Không có ranh đất và không có cột thì hai phép kiểm đó là 'chưa chạy', không phải 'đạt'."""
        checks = check_floor_plan(_plan(GOOD_ROOMS), slicing_tree=object())
        assert _codes(checks, "skipped") == {"inside_site", "columns_inside_footprint"}

    def test_plan_with_no_rooms_stops_early(self) -> None:
        checks = check_floor_plan(_plan([]))
        assert blocking_failures(checks)


class TestLevelChecks:
    def test_single_level_has_nothing_to_compare(self) -> None:
        assert _codes(check_across_levels([GOOD]), "skipped") == {"levels_consistent"}

    def test_consistent_levels_pass(self) -> None:
        assert _codes(check_across_levels([GOOD, GOOD]), "pass") == {"levels_consistent"}

    def test_upper_floor_far_larger_than_ground_is_caught(self) -> None:
        """Nhà phố không có tầng đua ra 30%; con số đó nghĩa là trích nhầm ranh lô đất."""
        upper = _plan([_room(0, 0, 12, 30)])
        assert "levels_consistent" in _codes(check_across_levels([GOOD, upper]), "fail")


class TestQualityScore:
    def test_a_fully_checked_clean_plan_scores_one(self) -> None:
        checks = check_floor_plan(GOOD, slicing_tree=object()) + check_across_levels([GOOD, GOOD])
        assert quality_score(checks) == 1.0

    def test_skipped_checks_pull_the_score_down(self) -> None:
        """Điểm tuyệt đối phải có nghĩa là 'đã kiểm hết', không phải 'kiểm được ít nên không trượt'."""
        thin = check_floor_plan(_plan(GOOD_ROOMS), slicing_tree=object())
        assert quality_score(thin) < 1.0

    def test_score_never_leaves_the_zero_one_range(self) -> None:
        broken = check_floor_plan(_plan([_room(0, 0, 5, 8, None), _room(0, 4, 5, 12, None)], units_assumed=True))
        assert 0.0 <= quality_score(broken) <= 1.0


class TestBuildRecord:
    def test_record_validates_against_the_contract(self) -> None:
        record, _ = build_record(
            tenant_id=TENANT,
            project_code="NVO-015",
            building_type="nha_pho",
            site=SITE,
            plans=[GOOD],
            room_types=[TYPES],
            has_brief=True,
        )
        assert record["floors"] == 1
        assert record["floor_plans"][0]["rooms"][0]["type"] == "living"
        assert record["floor_plans"][0]["rooms"][0]["label_raw"] == "PHONG"

    def test_slicing_tree_is_filled_when_labels_are_normalised(self) -> None:
        record, _ = build_record(
            tenant_id=TENANT,
            project_code="NVO-015",
            building_type="nha_pho",
            site=SITE,
            plans=[GOOD],
            room_types=[TYPES],
        )
        assert record["slicing_tree"]["split"] == "H"

    def test_record_without_normalised_labels_is_still_valid(self) -> None:
        """Chưa chuẩn hoá nhãn thì mất phần few-shot, KHÔNG mất cả bản ghi."""
        record, checks = build_record(
            tenant_id=TENANT,
            project_code="NVO-015",
            building_type="nha_pho",
            site=SITE,
            plans=[GOOD],
        )
        assert record["slicing_tree"] is None
        assert record["floor_plans"][0]["rooms"][0]["type"] is None
        assert quality_score(checks) < 1.0

    def test_partially_normalised_labels_do_not_produce_a_half_tree(self) -> None:
        """Cây few-shot phải đủ mọi lá hoặc không có — cây thiếu tên dạy mô hình sinh sai."""
        record, _ = build_record(
            tenant_id=TENANT,
            project_code="NVO-015",
            building_type="nha_pho",
            site=SITE,
            plans=[GOOD],
            room_types=[["living", None, "bedroom"]],
        )
        assert record["slicing_tree"] is None

    def test_extraction_warnings_travel_with_the_record(self) -> None:
        """Người xác nhận cần thấy cảnh báo ĐÚNG LÚC đang xem bản ghi, không phải trong nhật ký."""
        plan = _plan(GOOD_ROOMS, warnings=(ExtractionWarning("units_assumed", "đã giả định mm"),))
        record, _ = build_record(
            tenant_id=TENANT,
            project_code="NVO-015",
            building_type="nha_pho",
            site=SITE,
            plans=[plan],
        )
        assert record["extraction_warnings"] == [{"code": "units_assumed", "detail": "đã giả định mm"}]

    def test_structural_grid_comes_from_extracted_columns(self) -> None:
        record, _ = build_record(
            tenant_id=TENANT,
            project_code="NVO-015",
            building_type="nha_pho",
            site=SITE,
            plans=[GOOD],
        )
        assert record["structural_grid"] == {"axes_x_m": [0.0], "axes_y_m": [6.0]}

    def test_multiple_levels_are_numbered_from_the_ground_up(self) -> None:
        record, _ = build_record(
            tenant_id=TENANT,
            project_code="NVO-015",
            building_type="nha_pho",
            site=SITE,
            plans=[GOOD, GOOD, GOOD],
        )
        assert [f["level"] for f in record["floor_plans"]] == [1, 2, 3]
        assert record["floors"] == 3

    def test_building_type_outside_the_module_is_refused_by_the_contract(self) -> None:
        with pytest.raises(ContractError):
            build_record(
                tenant_id=TENANT,
                project_code="NVC-001",
                building_type="nha_xuong",
                site=SITE,
                plans=[GOOD],
            )

    def test_no_plans_is_a_programming_error_not_a_bad_record(self) -> None:
        with pytest.raises(ValueError, match="ít nhất một bản vẽ"):
            build_record(
                tenant_id=TENANT,
                project_code="NVO-015",
                building_type="nha_pho",
                site=SITE,
                plans=[],
            )
