"""Mô hình tờ — tám yếu tố ngôn ngữ bản vẽ (12-ux-ui 12.8), một nguồn cho DXF và SVG.

Bộ này ĐẾM thực thể chứ không nhìn ảnh: mỗi yếu tố để lại một dấu vết đếm được trong DXF
(DIMENSION, ARC, CIRCLE, INSERT có ATTRIB) và trong SVG (`class="phong"`, `data-group`).
"""

from __future__ import annotations

import ezdxf

from design_compute.cad.export import TitleBlock, build_sheet, export_floor_plan
from design_compute.geometry import load_construction_norms
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
        leaf = load_construction_norms().door_width_m
        plan = _plan()
        doors = [o for o in plan["levels"][0]["openings"] if o["kind"] == "door"]
        # Cửa rộng hơn hai lần cánh vẽ HAI cánh: một cung bán kính 2,75 m quét gần hết phòng
        # khách là đúng hình học nhưng không phải cách nhà ở được vẽ (06/09/2026).
        expected = sum(2 if float(d["width_m"]) > 2 * leaf else 1 for d in doors)
        data = export_floor_plan(plan, level=1, title=_title())
        path = tmp_path / "s.dxf"
        path.write_bytes(data)
        doc = ezdxf.readfile(path)
        arcs = [e for e in doc.modelspace().query("ARC") if e.dxf.layer == "NV-Cua"]
        assert len(arcs) == expected
        assert all(e.dxf.layer for e in doc.modelspace().query("LINE") if e.dxf.layer == "NV-CuaSo")

    def test_a_wide_entrance_is_drawn_as_two_leaves(self, tmp_path) -> None:
        """Bán kính mỗi cung phải là NỬA lỗ mở, không phải cả lỗ mở."""
        leaf = load_construction_norms().door_width_m
        plan = _plan()
        wide = 2.5 * leaf
        plan["levels"][0]["openings"][0] = {
            **plan["levels"][0]["openings"][0],
            "kind": "door",
            "width_m": wide,
            "offset_m": 0.5,
        }
        data = export_floor_plan(plan, level=1, title=_title())
        path = tmp_path / "s.dxf"
        path.write_bytes(data)
        doc = ezdxf.readfile(path)
        radii = sorted(
            round(e.dxf.radius, 1)
            for e in doc.modelspace().query("ARC")
            if e.dxf.layer == "NV-Cua"
        )
        assert radii.count(round(wide * 1000 / 2, 1)) == 2
        assert round(wide * 1000, 1) not in radii

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


class TestWallCleanup:
    """Thân tường vẽ thành MỘT hình hợp, không phải từng tứ giác rời chồng mép nhau."""

    @staticmethod
    def _tee():
        """Một nút chữ T: tường ngang chạy suốt, tường dọc đâm vào giữa nó."""
        return {
            "site": {"width_m": 6.0, "depth_m": 6.0},
            "structural_grid": {"axes_x_m": [0, 3, 6], "axes_y_m": [0, 3, 6]},
            "levels": [
                {
                    "level": 1,
                    "height_m": 3.6,
                    "rooms": [
                        {
                            "id": "r1",
                            "type": "living",
                            "polygon": [[0, 0], [6, 0], [6, 3], [0, 3]],
                            "area_m2": 18.0,
                        },
                        {
                            "id": "r2",
                            "type": "bedroom",
                            "polygon": [[0, 3], [3, 3], [3, 6], [0, 6]],
                            "area_m2": 9.0,
                        },
                        {
                            "id": "r3",
                            "type": "bedroom",
                            "polygon": [[3, 3], [6, 3], [6, 6], [3, 6]],
                            "area_m2": 9.0,
                        },
                    ],
                    "voids": [],
                    "walls": [
                        {"id": "H1", "a": [0, 3], "b": [6, 3], "thickness_m": 0.22},
                        {"id": "V1", "a": [3, 3], "b": [3, 6], "thickness_m": 0.22},
                    ],
                    "openings": [],
                }
            ],
            "cores": [],
            "constraint_report": {"status": "pass", "violations": []},
        }

    def test_a_t_junction_leaves_no_line_inside_the_wall_body(self) -> None:
        """Trước 06/09/2026 mỗi bức tường có nét bao riêng, nên nút chữ T có nét cắt ngang.

        Tường đi theo TIM, nên hai tứ giác chồng nhau một đoạn bằng nửa bề dày và cả hai nét
        bao đều được vẽ. Ảnh chụp mặt bằng demo cho thấy đúng như vậy: một nét chạy ngang giữa
        thân tường, và mỗi tường thò qua tường kia.

        Nay nét bao là biên của HỢP: một nút chữ T cho ra đúng MỘT vòng khép kín.
        """
        from design_compute.sheet.model import Polyline

        sheet = build_sheet(self._tee(), level=1, title=_title())
        rings = [
            e
            for e in sheet.entities
            if isinstance(e, Polyline) and e.layer.endswith("Tuong") and not e.no_stroke
        ]
        assert len(rings) == 1, [r.points for r in rings]

    def test_the_poche_still_covers_every_wall_segment(self) -> None:
        """Tô poché vẫn theo từng đoạn — hình hợp có LỖ thì một vòng khép kín tô sai."""
        from design_compute.sheet.model import Polyline

        sheet = build_sheet(self._tee(), level=1, title=_title())
        poche = [e for e in sheet.entities if isinstance(e, Polyline) and e.fill == "poche"]
        assert len(poche) == 2, "hai đoạn tường, hai mảng tô"

    def test_a_closed_room_keeps_its_inner_outline(self) -> None:
        """Bốn bức tường quây kín một phòng: hợp có lỗ, và mặt trong phải còn nét bao."""
        from design_compute.sheet.model import Polyline

        plan = self._tee()
        plan["levels"][0]["walls"] = [
            {"id": "N", "a": [1, 1], "b": [5, 1], "thickness_m": 0.22},
            {"id": "E", "a": [5, 1], "b": [5, 5], "thickness_m": 0.22},
            {"id": "S", "a": [5, 5], "b": [1, 5], "thickness_m": 0.22},
            {"id": "W", "a": [1, 5], "b": [1, 1], "thickness_m": 0.22},
        ]
        sheet = build_sheet(plan, level=1, title=_title())
        rings = [
            e
            for e in sheet.entities
            if isinstance(e, Polyline) and e.layer.endswith("Tuong") and not e.no_stroke
        ]
        assert len(rings) == 2, "một vòng ngoài, một vòng trong"


class TestBalconyOnSheet:
    """Ban công trên MẶT BẰNG cũng phải đọc ra được — cùng lỗi, cùng cách sửa với khối 3D."""

    @staticmethod
    def _plan():
        return {
            "site": {"width_m": 4.0, "depth_m": 6.0},
            "structural_grid": {"axes_x_m": [0, 4], "axes_y_m": [0, 1.5, 6]},
            "levels": [
                {
                    "level": 1,
                    "height_m": 3.6,
                    "rooms": [
                        {
                            "id": "balcony_1",
                            "type": "balcony",
                            "polygon": [[0, 0], [4, 0], [4, 1.5], [0, 1.5]],
                            "area_m2": 6.0,
                        },
                        {
                            "id": "bedroom_1",
                            "type": "bedroom",
                            "polygon": [[0, 1.5], [4, 1.5], [4, 6], [0, 6]],
                            "area_m2": 18.0,
                        },
                    ],
                    "voids": [],
                    "walls": [
                        {"id": "W-front", "a": [0, 0], "b": [4, 0], "thickness_m": 0.22},
                        {"id": "W-mid", "a": [0, 1.5], "b": [4, 1.5], "thickness_m": 0.11},
                        {"id": "W-back", "a": [0, 6], "b": [4, 6], "thickness_m": 0.22},
                    ],
                    "openings": [],
                }
            ],
            "cores": [],
            "constraint_report": {"status": "pass", "violations": []},
        }

    def test_the_open_edge_is_two_thin_lines_not_a_poche_wall(self) -> None:
        from design_compute.sheet.model import Line, Polyline

        groups = {"outdoor": ["balcony", "terrace", "courtyard", "light_well"]}
        sheet = build_sheet(self._plan(), level=1, title=_title(), groups=groups)

        poche = [e for e in sheet.entities if isinstance(e, Polyline) and e.fill == "poche"]
        # Ba bức tường, nhưng cạnh hở của ban công không được tô: chỉ còn hai mảng poché.
        assert len(poche) == 2

        # Hai nét mảnh song song, lệch khỏi tim tường đúng nửa bề dày (110 mm) — không nét
        # nào NẰM TRÊN tim, vì lan can là hai mép chứ không phải một đường.
        rails = [
            e
            for e in sheet.entities
            if isinstance(e, Line)
            and e.weight == "thin"
            and e.linetype == "solid"
            and abs(e.a[1]) < 200
            and abs(e.b[1]) < 200
        ]
        assert len(rails) == 2, rails
        assert {round(e.a[1]) for e in rails} == {-110, 110}

    def test_without_the_group_table_it_stays_a_wall(self) -> None:
        from design_compute.sheet.model import Polyline

        sheet = build_sheet(self._plan(), level=1, title=_title())
        poche = [e for e in sheet.entities if isinstance(e, Polyline) and e.fill == "poche"]
        assert len(poche) == 3
