"""Lớp 3c — tường và lỗ mở đọc ra từ các đa giác phòng, rồi xuất DXF.

Ba câu hỏi:
  1. Ba phòng chung một tuyến tường có ra MỘT bức tường chạy suốt không, hay ba đoạn chồng mép?
  2. Cửa có rơi vào tường chung giữa phòng và không gian giao thông không?
  3. Bản vẽ xuất ra có ghi đúng tên lớp theo `kb/layer_mapping.yaml`, và đọc ngược có ra đúng
     vai trò cũ không?

Câu thứ ba là thứ quyết định hồ sơ có dùng được ở NVG hay không: một bản vẽ đúng hình nhưng
sai tên lớp thì người nhận phải gán lại từng lớp bằng tay.
"""

from __future__ import annotations

import ezdxf
import pytest

from design_compute.cad import DxfExportError, TitleBlock, export_floor_plan, load_mapping
from design_compute.geometry import Cell, build_walls_and_openings, load_construction_norms

NORMS = load_construction_norms()
FOOTPRINT = (0.0, 0.0, 5.0, 18.0)


def _townhouse_level() -> list[Cell]:
    """Một tầng nhà ống: dải mặt tiền, hành lang dọc bên trái, ba dải phòng bên phải."""
    return [
        Cell("living_1", "living", 0.0, 0.0, 5.0, 6.0),
        Cell("circulation_1", "circulation", 0.0, 6.0, 2.0, 18.0),
        Cell("stair_1", "stair", 2.0, 6.0, 5.0, 9.0),
        Cell("dining_1", "dining", 2.0, 9.0, 5.0, 13.0),
        Cell("kitchen_1", "kitchen", 2.0, 13.0, 5.0, 18.0),
    ]


def _build(cells: list[Cell], **overrides):
    kwargs = {
        "level": 1,
        "footprint": FOOTPRINT,
        "structural_x": [0.0, 2.0, 5.0],
        "structural_y": [0.0, 6.0, 18.0],
        "open_faces": ["front", "back"],
        "access_faces": ["front"],
        "circulation_types": ["circulation", "stair", "core"],
        "norms": NORMS,
    }
    kwargs.update(overrides)
    return build_walls_and_openings(cells, **kwargs)


class TestWalls:
    def test_rooms_sharing_a_line_produce_one_wall_not_three(self) -> None:
        """Ba phòng xếp dọc chung tuyến tường x = 2,0 là MỘT bức tường chạy suốt.

        Không gộp thì bản vẽ có ba đoạn chồng mép nhau, và mọi phép đếm vật tư đếm ba lần.
        """
        walls, _ = _build(_townhouse_level())
        along_spine = [w for w in walls if w.orientation == "vertical" and w.a[0] == 2.0]
        assert len(along_spine) == 1
        assert sorted((along_spine[0].a[1], along_spine[0].b[1])) == [6.0, 18.0]

    def test_the_lot_boundary_is_an_exterior_wall(self) -> None:
        walls, _ = _build(_townhouse_level())
        left = next(w for w in walls if w.orientation == "vertical" and w.a[0] == 0.0)
        assert left.thickness_m == NORMS.exterior_m
        assert left.load_bearing is True

    def test_a_partition_off_the_structural_grid_is_thin(self) -> None:
        walls, _ = _build(_townhouse_level())
        partition = next(w for w in walls if w.orientation == "horizontal" and w.a[1] == 9.0)
        assert partition.thickness_m == NORMS.partition_m
        assert partition.load_bearing is False

    def test_every_wall_has_positive_length(self) -> None:
        walls, _ = _build(_townhouse_level())
        assert walls
        for wall in walls:
            assert wall.length_m > 0, wall.id


class TestOpenings:
    def test_every_room_gets_a_door_onto_circulation(self) -> None:
        walls, openings = _build(_townhouse_level())
        by_id = {w.id: w for w in walls}
        doors = [o for o in openings if o.kind == "door"]
        assert len(doors) >= 3
        for door in doors:
            wall = by_id[door.wall]
            assert 0 <= door.offset_m
            assert door.offset_m + door.width_m <= wall.length_m + 1e-6

    def _front_doors(self, cells: list[Cell]) -> list:
        """Cửa nằm trên tường mặt tiền y = 0 — tức lối vào nhà, không phải cửa thông phòng."""
        walls, openings = _build(cells)
        facade = {
            w.id for w in walls if w.orientation == "horizontal" and abs(w.a[1]) < 1e-6
        }
        return [o for o in openings if o.kind == "door" and o.wall in facade]

    def test_the_ground_floor_front_room_gets_an_entrance(self) -> None:
        """Phòng mặt tiền tầng trệt vào thẳng từ đường; nó không cần đi qua hành lang."""
        cells = [
            Cell("living_1", "living", 0.0, 0.0, 5.0, 9.0),
            Cell("store_1", "store", 0.0, 9.0, 5.0, 18.0),
        ]
        assert self._front_doors(cells), "phòng mặt tiền tầng trệt phải có cửa vào nhà"

    def test_the_entrance_survives_a_front_room_that_already_has_an_inner_door(self) -> None:
        """Bài học 06/09/2026: mặt tiền tầng trệt từng KHÔNG có lối vào nào.

        Bước đặt cửa vào nhà trước đây chỉ chạy khi phòng mặt tiền chưa có cửa thông vào nhà —
        mà phòng mặt tiền thì gần như luôn giáp hành lang, nên điều kiện đó gần như không bao
        giờ đúng. Bài cũ không thấy vì phương án mẫu của nó không có không gian giao thông.
        Đây là mặt bằng nhà ống thật: phòng khách mặt tiền GIÁP hành lang.
        """
        assert self._front_doors(_townhouse_level()), "mặt tiền tầng trệt phải có lối vào"

    def test_a_hall_or_garage_on_the_street_face_also_gets_the_entrance(self) -> None:
        """Sảnh và gara giáp đường là chỗ đặt cửa chính phổ biến nhất của nhà lô.

        Cả hai đều bị bỏ qua trước đây: sảnh vì là không gian giao thông, gara vì nằm trong
        `no_window_types` và đã có cửa thông vào trong.
        """
        for kind in ("circulation", "garage"):
            cells = [
                Cell(f"front_1", kind, 0.0, 0.0, 5.0, 5.0),
                Cell("stair_1", "stair", 0.0, 5.0, 5.0, 9.0),
                Cell("living_1", "living", 0.0, 9.0, 5.0, 18.0),
            ]
            assert self._front_doors(cells), f"{kind} giáp đường phải có cửa vào nhà"

    def test_the_entrance_is_wider_than_an_inner_door_and_within_measured_range(self) -> None:
        """Bề rộng theo đoạn tường mặt tiền, kẹp giữa hai cỡ ĐO ĐƯỢC (1,65 và 3,8)."""
        doors = self._front_doors(_townhouse_level())
        assert doors
        for door in doors:
            assert door.width_m >= NORMS.entrance_width_m > NORMS.door_width_m
            assert door.width_m <= NORMS.entrance_max_width_m

    def test_no_two_openings_overlap_on_the_same_wall(self) -> None:
        """Hai lỗ mở chồng nhau là hỏng ở cả ba nơi cùng lúc.

        Bản vẽ ra hai ký hiệu đè nhau, bảng thống kê đếm thừa một ô cửa, và khối ba chiều dựng
        một tấm kính nằm trong một tấm kính khác. Đây là điều đã xảy ra ngay sau khi sửa chỗ
        đặt cửa vào nhà (06/09/2026): phòng mặt tiền nhận cả cửa vào lẫn cửa sổ, và cả hai đều
        căn giữa đúng đoạn tường ấy.
        """
        for cells in (_townhouse_level(), self._front_hall_level()):
            _, openings = _build(cells)
            spans: dict[str, list[tuple[float, float]]] = {}
            for o in openings:
                spans.setdefault(o.wall, []).append((o.offset_m, o.offset_m + o.width_m))
            for wall_id, items in spans.items():
                items.sort()
                for (a0, a1), (b0, b1) in zip(items, items[1:]):
                    assert b0 >= a1 - 1e-6, f"{wall_id}: ({a0},{a1}) chồng ({b0},{b1})"

    @staticmethod
    def _front_hall_level() -> list[Cell]:
        return [
            Cell("living_1", "living", 0.0, 0.0, 5.0, 5.0),
            Cell("stair_1", "stair", 0.0, 5.0, 5.0, 9.0),
            Cell("kitchen_1", "kitchen", 0.0, 9.0, 5.0, 18.0),
        ]

    def test_upper_floors_have_no_entrance_from_the_street(self) -> None:
        """Cửa vào nhà chỉ ở tầng trệt — tầng hai giáp mặt phố thì mở cửa sổ, không mở cửa."""
        cells = [
            Cell("bedroom_2", "bedroom", 0.0, 0.0, 5.0, 9.0),
            Cell("circulation_2", "circulation", 0.0, 9.0, 5.0, 18.0),
        ]
        walls, openings = _build(cells, level=2)
        facade = {w.id for w in walls if w.orientation == "horizontal" and abs(w.a[1]) < 1e-6}
        assert [o for o in openings if o.kind == "door" and o.wall in facade] == []

    def test_windows_land_only_on_open_faces(self) -> None:
        walls, openings = _build(_townhouse_level())
        by_id = {w.id: w for w in walls}
        windows = [o for o in openings if o.kind == "window"]
        assert windows
        for window in windows:
            wall = by_id[window.wall]
            on_facade = (
                wall.orientation == "horizontal" and wall.a[1] in (0.0, 18.0)
            ) or (wall.orientation == "vertical" and wall.a[0] in (0.0, 5.0))
            assert on_facade, f"{window.id} không nằm trên mặt thoáng"
            # Mặt bên là tường chung với hàng xóm — không phải mặt thoáng của nhà ống.
            assert wall.orientation == "horizontal"

    def test_service_spaces_get_no_window(self) -> None:
        """Thang bộ không mở cửa sổ ra mặt phố dù có tiếp giáp."""
        cells = [
            Cell("stair_1", "stair", 0.0, 0.0, 5.0, 6.0),
            Cell("circulation_1", "circulation", 0.0, 6.0, 5.0, 18.0),
        ]
        _, openings = _build(cells)
        assert [o for o in openings if o.kind == "window"] == []


class TestDxfExport:
    @staticmethod
    def _plan() -> dict:
        walls, openings = _build(_townhouse_level())
        return {
            "schema_version": "1.0.0",
            "intent_ref": "sha256:" + "a" * 64,
            "rule_pack_version": "2026.08.1",
            "site": {"width_m": 5.0, "depth_m": 18.0},
            "structural_grid": {"axes_x_m": [0.0, 2.0, 5.0], "axes_y_m": [0.0, 6.0, 18.0]},
            "levels": [
                {
                    "level": 1,
                    "rooms": [
                        {
                            "id": c.id,
                            "type": c.type,
                            "polygon": [
                                [c.x0, c.y0],
                                [c.x1, c.y0],
                                [c.x1, c.y1],
                                [c.x0, c.y1],
                            ],
                            "area_m2": round((c.x1 - c.x0) * (c.y1 - c.y0), 3),
                        }
                        for c in _townhouse_level()
                    ],
                    "voids": [],
                    "walls": [
                        {
                            "id": w.id,
                            "a": list(w.a),
                            "b": list(w.b),
                            "thickness_m": w.thickness_m,
                            "load_bearing": w.load_bearing,
                        }
                        for w in walls
                    ],
                    "openings": [
                        {
                            "id": o.id,
                            "wall": o.wall,
                            "kind": o.kind,
                            "offset_m": o.offset_m,
                            "width_m": o.width_m,
                            "height_m": o.height_m,
                            "sill_m": o.sill_m,
                        }
                        for o in openings
                    ],
                }
            ],
            "cores": [],
            "constraint_report": {"status": "pass"},
        }

    @staticmethod
    def _title() -> TitleBlock:
        return TitleBlock(
            project_code="NVO-TK-2026-0001",
            project_name="Nhà anh A",
            discipline="Kiến trúc",
            sheet="Mặt bằng",
            version="a1b2c3d4",
            date="30/08/2026",
            rule_pack_version="2026.08.1",
        )

    def test_writes_a_readable_dxf_in_millimetres(self, tmp_path) -> None:
        data = export_floor_plan(self._plan(), level=1, title=self._title())
        path = tmp_path / "mat-bang.dxf"
        path.write_bytes(data)

        doc = ezdxf.readfile(path)
        assert doc.header["$INSUNITS"] == 4, "hồ sơ kiến trúc Việt Nam đo bằng milimét"
        # Lô 5 × 18 m phải ra 5000 × 18000 đơn vị bản vẽ.
        xs = [p[0] for e in doc.modelspace().query("LWPOLYLINE") for p in e.get_points("xy")]
        assert max(xs) >= 5000

    def test_layer_names_come_from_the_mapping_and_read_back(self, tmp_path) -> None:
        """Vòng khép kín: bản vẽ hệ thống xuất ra, đọc ngược vào lại đúng vai trò cũ.

        Đây là lý do tên lớp nằm ở `kb/layer_mapping.yaml` chứ không nằm trong mã nguồn. Đứt
        vòng này thì mỗi lần số hoá lại chính bản vẽ mình xuất ra sẽ mất phòng.
        """
        mapping = load_mapping()
        data = export_floor_plan(self._plan(), level=1, title=self._title())
        path = tmp_path / "mat-bang.dxf"
        path.write_bytes(data)
        doc = ezdxf.readfile(path)
        names = {layer.dxf.name for layer in doc.layers}

        for role in ("room_boundary", "room_label", "wall", "door", "window", "site_boundary"):
            spec = mapping.export_layer(role)
            assert spec.layer in names, f"thiếu lớp cho vai trò {role}"
            assert mapping.role_of(spec.layer) == role, f"lớp {spec.layer} đọc ngược sai vai trò"

        # Lưới trục, chuỗi kích thước và khung tên TRƯỚC ĐÂY nằm trong danh sách bỏ qua, với
        # lý do "chúng là ghi chú của bản vẽ, không phải hình học phòng". Đã đổi 05/09/2026:
        # nhãn bong bóng trục chính là `structural_grid` mà `06-knowledge-base.md` xếp ưu tiên
        # P1-cao, khung tên mang mã tờ và tỷ lệ, còn chuỗi kích thước là một trong ba năng lực
        # nền của mọi loại tờ. Bỏ qua chúng là vứt đi đúng thứ đang thiếu.
        for role in ("grid", "dimension", "title_block"):
            spec = mapping.export_layer(role)
            assert not mapping.is_ignored(spec.layer), f"lớp {spec.layer} không được bỏ qua nữa"
            assert mapping.role_of(spec.layer) == role, f"lớp {spec.layer} đọc ngược sai vai trò"

    def test_the_title_block_carries_the_version_and_the_mandatory_notice(self, tmp_path) -> None:
        """Nhãn cảnh báo do MÃ NGUỒN chèn, không phụ thuộc người dùng nhớ bật (CLAUDE.md 8.7)."""
        data = export_floor_plan(self._plan(), level=1, title=self._title())
        path = tmp_path / "mat-bang.dxf"
        path.write_bytes(data)
        doc = ezdxf.readfile(path)
        # Chữ tĩnh của khung tên nằm trong ĐỊNH NGHĨA block, không ở modelspace — gom cả hai.
        text = " ".join(entity.dxf.text for entity in doc.modelspace().query("TEXT"))
        for block in doc.blocks:
            if block.name.startswith("NVG_"):
                text += " " + " ".join(e.dxf.text for e in block.query("TEXT"))
        # Khung tên là BLOCK có ATTRIB (họ `semantic_kt` của kb/title_block.yaml) — đúng cách
        # HS-01 KT làm, và là thứ trình trích xuất đọc lại thành mã tờ. Phiên bản nằm ở đó.
        inserts = list(doc.modelspace().query("INSERT"))
        assert inserts, "thiếu khung tên dạng BLOCK"
        attribs = {a.dxf.tag: a.dxf.text for ins in inserts for a in ins.attribs}
        assert attribs.get("PB") == "a1b2c3d4"
        assert attribs.get("KHBV") and attribs.get("TL", "").startswith("1:")
        assert "Phương án sơ bộ" in text
        assert "kỹ sư kết cấu quyết định" in text
        assert "chưa phải hồ sơ thi công" in text

    def test_asking_for_a_level_that_does_not_exist_says_which_ones_do(self) -> None:
        with pytest.raises(DxfExportError) as exc:
            export_floor_plan(self._plan(), level=4, title=self._title())
        assert "tầng 4" in str(exc.value)
        assert "1" in str(exc.value)
