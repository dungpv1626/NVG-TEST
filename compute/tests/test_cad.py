"""Đọc hồ sơ CAD: bảng ánh xạ lớp, trích xuất mặt bằng, và đường đi `.dwg`.

Bản vẽ dùng trong các phép kiểm này được DỰNG TẠI CHỖ bằng `ezdxf`, không lấy từ
`kb/samples/`. Hai lý do: hồ sơ thật là dữ liệu khách hàng nên không được commit, và một
bản vẽ tự dựng cho phép khẳng định "trích ra đúng 21 m²" thay vì "trích ra một con số nào đó".

Phép kiểm đi qua ODA File Converter thật được BỎ QUA khi công cụ chưa cài, thay vì làm đỏ
cả bộ — bộ cài không được commit (giấy phép Open Design Alliance).
"""

from __future__ import annotations

from pathlib import Path

import ezdxf
import pytest

from design_compute.cad import (
    ExtractedFloorPlan,
    LayerMappingError,
    extract_floor_plan,
    load_mapping,
    oda_available,
)
from design_compute.cad.convert import CadConversionError, OdaUnavailable, dwg_to_dxf, dxf_to_dwg
from design_compute.cad.layers import default_mapping_path

MAPPING = load_mapping()

# Một phòng khách 6,0 × 3,5 m và một phòng ngủ 3,0 × 3,5 m, vẽ bằng milimét như hồ sơ thật.
LIVING = [(0, 0), (6000, 0), (6000, 3500), (0, 3500)]
BEDROOM = [(6000, 0), (9000, 0), (9000, 3500), (6000, 3500)]


def _plan(tmp_path: Path, *, insunits: int = 4, name: str = "plan.dxf") -> Path:
    """Một mặt bằng hai phòng, nhãn đặt giữa phòng, kèm một cột và ranh đất.

    `insunits=0` là mã DXF cho "không đơn vị", tức bản vẽ KHÔNG khai đơn vị. Phải đặt tường
    minh: `ezdxf.new()` tự điền $INSUNITS = 6 (mét), nên bỏ trống tham số không tạo ra được
    tình huống thiếu đơn vị.
    """
    doc = ezdxf.new("R2018")
    doc.header["$INSUNITS"] = insunits
    msp = doc.modelspace()

    msp.add_lwpolyline(LIVING, close=True, dxfattribs={"layer": "A-AREA-ROOM"})
    msp.add_lwpolyline(BEDROOM, close=True, dxfattribs={"layer": "A-AREA-ROOM"})
    msp.add_text("PHONG KHACH", dxfattribs={"layer": "A-ROOM-IDEN"}).set_placement((3000, 1750))
    msp.add_text("PN1", dxfattribs={"layer": "A-ROOM-IDEN"}).set_placement((7500, 1750))
    msp.add_circle((6000, 0), radius=150, dxfattribs={"layer": "S-COLS"})
    msp.add_lwpolyline(
        [(-500, -500), (9500, -500), (9500, 4000), (-500, 4000)],
        close=True,
        dxfattribs={"layer": "RANH-DAT"},
    )
    # Lớp cố tình bỏ qua — không được lọt vào danh sách cần bổ sung.
    msp.add_line((0, -1000), (9000, -1000), dxfattribs={"layer": "A-ANNO-DIMS"})

    path = tmp_path / name
    doc.saveas(path)
    return path


def _extract(tmp_path: Path, **kwargs) -> ExtractedFloorPlan:
    return extract_floor_plan(_plan(tmp_path, **kwargs), mapping=MAPPING)


class TestLayerMapping:
    def test_shipped_mapping_loads(self) -> None:
        assert default_mapping_path().is_file()
        assert MAPPING.layers_for("room_boundary")

    def test_role_lookup_ignores_case(self) -> None:
        assert MAPPING.role_of("a-area-room") == "room_boundary"
        assert MAPPING.role_of("A-AREA-ROOM") == "room_boundary"

    def test_ignored_layer_has_no_role_and_is_not_reported_as_missing(self) -> None:
        """Phân biệt 'đã quyết định bỏ qua' với 'chưa ai ánh xạ'.

        Trộn hai loại vào nhau thì mọi bản vẽ đều báo vài chục lớp cần xử lý, và danh sách
        đó lập tức hết người đọc.
        """
        assert MAPPING.role_of("DEFPOINTS") is None
        assert MAPPING.is_ignored("DEFPOINTS")
        assert MAPPING.unmapped(["DEFPOINTS"]) == ()

    def test_dimension_layers_are_a_role_now_not_something_to_ignore(self) -> None:
        """Lớp kích thước ĐÃ CHUYỂN từ `ignore` sang một vai trò (05/09/2026).

        Hai hồ sơ thật có hơn mười nghìn thực thể DIMENSION, và chuỗi kích thước là một
        trong ba năng lực nền của mọi loại tờ (`kb/sheet_catalogue.yaml`). Bỏ qua chúng là
        vứt đi đúng thứ đang thiếu.
        """
        assert MAPPING.role_of("NV-Dim") == "dimension"
        assert not MAPPING.is_ignored("NV-Dim")

    def test_layer_names_match_with_vietnamese_diacritics_folded(self) -> None:
        """Tên lớp thật có dấu: `A2_CẮT BT`, `A6_THẤY ĐẬM`, `A12_NÉT KHUẤT`.

        So khớp không gấp dấu thì mọi mẫu viết không dấu đều trượt — im lặng, và bảng ánh xạ
        trông như đã phủ trong khi không khớp dòng nào.
        """
        assert MAPPING.role_of("A2_CẮT BT") == "wall"
        assert MAPPING.is_line_weight("A6_THẤY ĐẬM")
        assert MAPPING.is_line_weight("A12_NÉT KHUẤT")

    def test_line_weight_layers_are_neither_a_role_nor_ignored(self) -> None:
        """NVG đặt tên lớp theo ĐỘ ĐẬM NÉT KHI IN, không theo vật thể.

        `NV-Thay` chứa lẫn tường, thiết bị và đường bao — bất cứ thứ gì in cùng độ đậm đó.
        Không gán vai trò được, nhưng cũng KHÔNG được bỏ qua như `ignore`: nội dung vẫn phải
        đọc. Tách riêng để danh sách `unmapped` còn đọc được.
        """
        assert MAPPING.is_line_weight("NV-Thay")
        assert not MAPPING.is_ignored("NV-Thay")
        assert MAPPING.unmapped(["NV-Thay", "NV-Khuat"]) == ()

    def test_unknown_layer_is_reported_for_follow_up(self) -> None:
        assert MAPPING.unmapped(["XYZ-LOP-LA"]) == ("XYZ-LOP-LA",)

    def test_invalid_default_units_is_rejected(self, tmp_path: Path) -> None:
        bad = tmp_path / "m.yaml"
        bad.write_text("default_units: furlong\nroles:\n  room_boundary: ['*']\n", encoding="utf-8")
        with pytest.raises(LayerMappingError, match="default_units"):
            load_mapping(bad)

    def test_role_with_no_pattern_is_rejected(self, tmp_path: Path) -> None:
        bad = tmp_path / "m.yaml"
        bad.write_text("default_units: mm\nroles:\n  room_boundary: []\n", encoding="utf-8")
        with pytest.raises(LayerMappingError, match="ít nhất một mẫu"):
            load_mapping(bad)


class TestExtraction:
    def test_room_polygons_and_areas_are_real_numbers(self, tmp_path: Path) -> None:
        plan = _extract(tmp_path)
        assert len(plan.rooms) == 2
        assert sorted(r.area_m2 for r in plan.rooms) == [10.5, 21.0]

    def test_labels_attach_to_the_polygon_that_contains_them(self, tmp_path: Path) -> None:
        plan = _extract(tmp_path)
        by_area = {r.area_m2: r for r in plan.rooms}
        assert by_area[21.0].label_raw == "PHONG KHACH"
        assert by_area[10.5].label_raw == "PN1"
        assert all(r.label_source == "contains" for r in plan.rooms)

    def test_raw_label_is_not_normalised(self, tmp_path: Path) -> None:
        """Quy 'PN1' về `bedroom` là việc của mô hình ngôn ngữ ở Worker.

        Đặt bảng từ đồng nghĩa vào Container sẽ biến một tri thức đang thay đổi thành mã
        nguồn, và vi phạm ranh giới hai runtime (CLAUDE.md 8.3).
        """
        plan = _extract(tmp_path)
        assert {r.label_raw for r in plan.rooms} == {"PHONG KHACH", "PN1"}

    def test_label_outside_any_room_falls_back_to_nearest(self, tmp_path: Path) -> None:
        doc = ezdxf.new("R2018")
        doc.header["$INSUNITS"] = 4
        msp = doc.modelspace()
        msp.add_lwpolyline(LIVING, close=True, dxfattribs={"layer": "A-AREA-ROOM"})
        # Nhãn kéo ra ngoài kèm đường dẫn — lối vẽ thường gặp ở phòng hẹp.
        msp.add_text("WC", dxfattribs={"layer": "A-ROOM-IDEN"}).set_placement((6800, 1750))
        path = tmp_path / "outside.dxf"
        doc.saveas(path)

        plan = extract_floor_plan(path, mapping=MAPPING)
        assert plan.rooms[0].label_raw == "WC"
        assert plan.rooms[0].label_source == "nearest"

    def test_room_without_any_label_is_kept_and_marked(self, tmp_path: Path) -> None:
        """Phòng không nhãn vẫn là phòng — bỏ nó đi là mất diện tích khỏi bản ghi."""
        doc = ezdxf.new("R2018")
        doc.header["$INSUNITS"] = 4
        doc.modelspace().add_lwpolyline(LIVING, close=True, dxfattribs={"layer": "A-AREA-ROOM"})
        path = tmp_path / "nolabel.dxf"
        doc.saveas(path)

        plan = extract_floor_plan(path, mapping=MAPPING)
        assert plan.rooms[0].label_raw is None
        assert plan.rooms[0].label_source == "none"
        assert plan.labelled_ratio == 0.0

    def test_columns_and_site_boundary_are_extracted(self, tmp_path: Path) -> None:
        plan = _extract(tmp_path)
        assert plan.columns_m == ((6.0, 0.0),)
        assert plan.site_boundary_m is not None
        assert len(plan.site_boundary_m) == 4

    def test_unmapped_layers_are_listed_but_ignored_ones_are_not(self, tmp_path: Path) -> None:
        doc = ezdxf.new("R2018")
        doc.header["$INSUNITS"] = 4
        msp = doc.modelspace()
        msp.add_lwpolyline(LIVING, close=True, dxfattribs={"layer": "A-AREA-ROOM"})
        msp.add_line((0, 0), (1, 1), dxfattribs={"layer": "LOP-LA-CHUA-BIET"})
        msp.add_line((0, 0), (1, 1), dxfattribs={"layer": "A-ANNO-DIMS"})
        path = tmp_path / "layers.dxf"
        doc.saveas(path)

        plan = extract_floor_plan(path, mapping=MAPPING)
        assert plan.layers_unmapped == ("LOP-LA-CHUA-BIET",)


class TestUnits:
    def test_units_are_read_from_the_drawing_when_declared(self, tmp_path: Path) -> None:
        plan = _extract(tmp_path, insunits=4)
        assert plan.units == "mm"
        assert plan.units_assumed is False
        assert not any(w.code == "units_assumed" for w in plan.warnings)

    def test_missing_units_falls_back_and_says_so(self, tmp_path: Path) -> None:
        """Một diện tích sai hệ số 1000 mà không có dấu hiệu gì còn tệ hơn không trích được."""
        plan = _extract(tmp_path, insunits=0)
        assert plan.units_assumed is True
        assert any(w.code == "units_assumed" for w in plan.warnings)
        # Vẫn ra đúng số vì mặc định của bảng ánh xạ trùng đơn vị thật của bản vẽ.
        assert sorted(r.area_m2 for r in plan.rooms) == [10.5, 21.0]

    def test_drawing_in_metres_is_read_at_scale_one(self, tmp_path: Path) -> None:
        doc = ezdxf.new("R2018")
        doc.header["$INSUNITS"] = 6
        doc.modelspace().add_lwpolyline(
            [(0, 0), (6, 0), (6, 3.5), (0, 3.5)], close=True, dxfattribs={"layer": "A-AREA-ROOM"}
        )
        path = tmp_path / "metres.dxf"
        doc.saveas(path)

        plan = extract_floor_plan(path, mapping=MAPPING)
        assert plan.units == "m"
        assert plan.rooms[0].area_m2 == 21.0


class TestDegradedDrawings:
    def test_open_polyline_is_skipped_with_an_explanation(self, tmp_path: Path) -> None:
        doc = ezdxf.new("R2018")
        doc.header["$INSUNITS"] = 4
        doc.modelspace().add_lwpolyline(LIVING, close=False, dxfattribs={"layer": "A-AREA-ROOM"})
        path = tmp_path / "open.dxf"
        doc.saveas(path)

        plan = extract_floor_plan(path, mapping=MAPPING)
        assert plan.rooms == ()
        assert any(w.code == "open_polyline" for w in plan.warnings)

    def test_polyline_closed_by_repeating_first_point_still_counts(self, tmp_path: Path) -> None:
        """Nhiều hồ sơ cũ khép kín bằng cách lặp đỉnh đầu, không bật cờ `closed`."""
        doc = ezdxf.new("R2018")
        doc.header["$INSUNITS"] = 4
        doc.modelspace().add_lwpolyline(
            [*LIVING, LIVING[0]], close=False, dxfattribs={"layer": "A-AREA-ROOM"}
        )
        path = tmp_path / "implicit.dxf"
        doc.saveas(path)

        plan = extract_floor_plan(path, mapping=MAPPING)
        assert len(plan.rooms) == 1
        assert plan.rooms[0].area_m2 == 21.0

    def test_symbol_sized_polygon_is_dropped_with_a_reason(self, tmp_path: Path) -> None:
        doc = ezdxf.new("R2018")
        doc.header["$INSUNITS"] = 4
        msp = doc.modelspace()
        msp.add_lwpolyline(LIVING, close=True, dxfattribs={"layer": "A-AREA-ROOM"})
        msp.add_lwpolyline(
            [(100, 100), (300, 100), (300, 300), (100, 300)], close=True, dxfattribs={"layer": "A-AREA-ROOM"}
        )
        path = tmp_path / "symbol.dxf"
        doc.saveas(path)

        plan = extract_floor_plan(path, mapping=MAPPING)
        assert len(plan.rooms) == 1
        assert any(w.code == "tiny_polygon" for w in plan.warnings)

    def test_drawing_with_no_recognised_layer_says_where_to_look(self, tmp_path: Path) -> None:
        doc = ezdxf.new("R2018")
        doc.header["$INSUNITS"] = 4
        doc.modelspace().add_lwpolyline(LIVING, close=True, dxfattribs={"layer": "QUY-UOC-LA"})
        path = tmp_path / "unknown.dxf"
        doc.saveas(path)

        plan = extract_floor_plan(path, mapping=MAPPING)
        assert plan.rooms == ()
        no_rooms = [w for w in plan.warnings if w.code == "no_rooms"]
        assert no_rooms and "layer_mapping.yaml" in no_rooms[0].detail
        assert plan.layers_unmapped == ("QUY-UOC-LA",)

    def test_unreadable_file_raises_a_readable_error(self, tmp_path: Path) -> None:
        broken = tmp_path / "broken.dxf"
        broken.write_text("đây không phải DXF", encoding="utf-8")
        with pytest.raises(ValueError, match="không đọc được"):
            extract_floor_plan(broken, mapping=MAPPING)


class TestOdaPath:
    """Đường đi `.dwg` thật. Bỏ qua khi chưa cài công cụ."""

    def test_missing_source_file_is_named(self, tmp_path: Path) -> None:
        with pytest.raises(CadConversionError, match="không tìm thấy tệp nguồn"):
            dwg_to_dxf(tmp_path / "khong-co.dwg", tmp_path / "out")

    @pytest.mark.skipif(oda_available(), reason="ODA đã cài — nhánh này chỉ đúng khi thiếu")
    def test_absent_converter_points_at_the_fix(self, tmp_path: Path) -> None:
        source = _plan(tmp_path, name="x.dwg")
        with pytest.raises(OdaUnavailable, match="kb/vendor"):
            dwg_to_dxf(source, tmp_path / "out")

    @pytest.mark.skipif(not oda_available(), reason="chưa cài ODA File Converter (kb/vendor/)")
    def test_round_trip_through_dwg_preserves_geometry_and_labels(self, tmp_path: Path) -> None:
        """Kiểm chứng đường đi mà Mốc 0.1 dựa vào, không cần hồ sơ khách hàng.

        Đi DXF → DWG → DXF: nếu đa giác và nhãn còn nguyên sau hai lượt chuyển đổi thì bước
        `.dwg` → `.dxf` của quy trình số hoá là đáng tin.
        """
        dxf = _plan(tmp_path)
        dwg = dxf_to_dwg(dxf, tmp_path / "dwg").dxf
        assert dwg.suffix == ".dwg"

        plan = extract_floor_plan(dwg_to_dxf(dwg, tmp_path / "back").dxf, mapping=MAPPING)
        assert sorted(r.area_m2 for r in plan.rooms) == [10.5, 21.0]
        assert {r.label_raw for r in plan.rooms} == {"PHONG KHACH", "PN1"}
