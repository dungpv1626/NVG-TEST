"""Mô hình tờ — tám yếu tố ngôn ngữ bản vẽ (12-ux-ui 12.8), một nguồn cho DXF và SVG.

Bộ này ĐẾM thực thể chứ không nhìn ảnh: mỗi yếu tố để lại một dấu vết đếm được trong DXF
(DIMENSION, ARC, CIRCLE, INSERT có ATTRIB) và trong SVG (`class="phong"`, `data-group`).
"""

from __future__ import annotations

import ezdxf

from design_compute.cad.export import TitleBlock, build_sheet, export_floor_plan
from design_compute.sheet import choose_scale, render_svg
from design_compute.sheet.model import Dimension, TitleBlockRef

# Nhập MÔ-ĐUN chứ không nhập lớp: nhập lớp `TestDxfExport` vào đây là pytest thu thập nó hai lần.
from tests import test_geometry as tg


def _plan():
    return tg.TestDxfExport._plan()


def _title() -> TitleBlock:
    return tg.TestDxfExport._title()


def _labels() -> dict[str, str]:
    """Nhãn theo MÃ KHÔNG GIAN (id), như `spaceLabels` ở Worker gửi sang."""
    rooms = _plan()["levels"][0]["rooms"]
    vi = {"living": "Phòng khách", "circulation": "Giao thông", "stair": "Thang bộ", "dining": "Phòng ăn", "kitchen": "Bếp"}
    return {r["id"]: vi.get(r["type"], r["type"]) for r in rooms}
GROUPS = {"circulation": ["stair", "core", "circulation"], "habitable": ["living", "dining"], "service": ["kitchen"]}


class TestScale:
    def test_townhouse_5x18_fits_a3_at_1_to_70_portrait(self) -> None:
        """Đúng tỷ lệ NVG dùng cho mặt bằng nhà phố trên A3 trong hồ sơ thật."""
        scale, paper = choose_scale(5.0, 18.0)
        assert scale == 70
        assert paper[0] < paper[1], "nhà sâu hơn rộng thì khổ đứng"

    def test_a_wide_villa_goes_landscape_and_smaller(self) -> None:
        scale, paper = choose_scale(20.0, 12.0)
        assert paper[0] > paper[1]
        assert scale >= 70


class TestEightElements:
    def test_dxf_carries_real_dimensions_on_all_four_sides_in_two_layers(self, tmp_path) -> None:
        """Kho mã trước 06/09 không có một DIMENSION nào; hồ sơ thật có hơn 10.000."""
        sheet = build_sheet(_plan(), level=1, title=_title())
        dims = [e for e in sheet.entities if isinstance(e, Dimension)]
        horizontal = [d for d in dims if d.orientation == "horizontal"]
        vertical = [d for d in dims if d.orientation == "vertical"]
        assert len(horizontal) >= 2 and len(vertical) >= 2, "đủ bốn cạnh"
        # Lớp ngoài là tổng: 5000 ngang, 18000 dọc.
        assert any(d.text == "5000" for d in horizontal)
        assert any(d.text == "18000" for d in vertical)
        # Có lớp trong (từng khoảng trục) khi lưới có hơn hai trục dọc.
        assert len(vertical) > 2

        data = export_floor_plan(_plan(), level=1, title=_title())
        path = tmp_path / "s.dxf"
        path.write_bytes(data)
        doc = ezdxf.readfile(path)
        assert len(doc.modelspace().query("DIMENSION")) == len(dims)

    def test_grid_bubbles_at_both_ends_letters_across_numbers_along(self, tmp_path) -> None:
        data = export_floor_plan(_plan(), level=1, title=_title())
        path = tmp_path / "s.dxf"
        path.write_bytes(data)
        doc = ezdxf.readfile(path)
        mapping_grid = [e for e in doc.modelspace().query("CIRCLE") if e.dxf.layer == "NV-Truc"]
        texts = {e.dxf.text for e in doc.modelspace().query("TEXT") if e.dxf.layer == "NV-Truc"}
        # Mặt bằng thử có 3 trục dọc (A, B, C) và 3 trục ngang (1, 2, 3): mỗi trục HAI bong bóng.
        assert len(mapping_grid) == 2 * (3 + 3)
        assert {"A", "C", "1", "3"} <= texts

    def test_doors_have_a_swing_arc_and_windows_a_double_line(self, tmp_path) -> None:
        plan = _plan()
        doors = [o for o in plan["levels"][0]["openings"] if o["kind"] == "door"]
        data = export_floor_plan(plan, level=1, title=_title())
        path = tmp_path / "s.dxf"
        path.write_bytes(data)
        doc = ezdxf.readfile(path)
        arcs = [e for e in doc.modelspace().query("ARC") if e.dxf.layer == "NV-Cua"]
        assert len(arcs) == len(doors)
        assert all(e.dxf.layer for e in doc.modelspace().query("LINE") if e.dxf.layer == "NV-CuaSo")

    def test_walls_are_heavy_double_lines_with_poche(self, tmp_path) -> None:
        data = export_floor_plan(_plan(), level=1, title=_title())
        path = tmp_path / "s.dxf"
        path.write_bytes(data)
        doc = ezdxf.readfile(path)
        walls = [e for e in doc.modelspace().query("LWPOLYLINE") if e.dxf.layer == "NV-Tuong"]
        assert walls and all(e.dxf.lineweight == 50 for e in walls), "tường 0,5 mm — đậm gấp đôi nét thường"
        assert doc.modelspace().query("HATCH"), "poché tường"

    def test_stair_has_treads_and_an_up_arrow(self, tmp_path) -> None:
        data = export_floor_plan(_plan(), level=1, title=_title())
        path = tmp_path / "s.dxf"
        path.write_bytes(data)
        doc = ezdxf.readfile(path)
        treads = [e for e in doc.modelspace().query("LINE") if e.dxf.layer == "NV-Thang"]
        assert len(treads) >= 8, "đủ bậc, không phải một ô ghi chữ 'thang'"
        assert any(e.dxf.text == "LÊN" for e in doc.modelspace().query("TEXT"))

    def test_section_marks_sit_on_both_edges(self) -> None:
        sheet = build_sheet(_plan(), level=1, title=_title())
        from design_compute.sheet.model import Circle, Text

        marks = [e for e in sheet.entities if isinstance(e, Text) and e.text == "A" and e.bold]
        assert len(marks) == 2

    def test_title_block_is_a_block_with_semantic_kt_attribs(self, tmp_path) -> None:
        data = export_floor_plan(_plan(), level=1, title=_title())
        path = tmp_path / "s.dxf"
        path.write_bytes(data)
        doc = ezdxf.readfile(path)
        ins = list(doc.modelspace().query("INSERT"))
        assert len(ins) == 1
        tags = {a.dxf.tag: a.dxf.text for a in ins[0].attribs}
        assert tags["KHBV"] == "kt/01"
        assert tags["TL"] == "1:70"
        assert tags["HM"] == "Kiến trúc"
        assert tags["HT"] == "30/08/2026"
        assert "Tầng 1" in tags["TBV"]


class TestSvg:
    def test_svg_is_the_same_sheet_with_rooms_tagged_for_css(self) -> None:
        sheet = build_sheet(_plan(), level=1, title=_title(), labels=_labels(), groups=GROUPS)
        svg = render_svg(sheet)
        rooms = _plan()["levels"][0]["rooms"]
        assert svg.count('class="phong"') == len(rooms)
        assert 'data-group="circulation"' in svg and 'data-group="habitable"' in svg
        assert 'data-scale="1:70"' in svg
        assert "PHÒNG KHÁCH" in svg and "m²" in svg
        assert "Phương án sơ bộ" in svg
        assert "None" not in svg
        # Không tự chọn màu công năng — đó là việc của CSS phía trình duyệt.
        assert 'class="phong"' in svg and "fill=\"none\" stroke=\"none\"" in svg

    def test_labels_are_optional_and_fall_back_to_the_room_type(self) -> None:
        svg = render_svg(build_sheet(_plan(), level=1, title=_title()))
        assert "LIVING" in svg
