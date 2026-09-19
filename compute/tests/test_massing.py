"""Khối ba chiều sơ bộ — glTF hợp lệ, cao đúng tổng cao độ tầng, có lỗ mở, lỗ mở đọc được loại."""

from __future__ import annotations

import io

import trimesh

from design_compute.massing import build_massing, massing_glb
from tests import test_geometry as tg


def _plan():
    plan = tg.TestDxfExport._plan()
    plan["levels"][0]["height_m"] = 3.6
    return plan


class TestMassing:
    def test_exports_binary_gltf_that_loads_back(self) -> None:
        data = massing_glb(_plan())
        assert data[:4] == b"glTF"
        scene = trimesh.load(io.BytesIO(data), file_type="glb")
        assert len(scene.geometry) > 0

    def test_height_is_storeys_plus_roof_parapet_and_y_is_up(self) -> None:
        scene = build_massing(_plan())
        bounds = scene.bounds
        # glTF: Y hướng lên. Một tầng 3,6 m + sàn mái 0,12 + lan can 0,9.
        assert abs((bounds[1][1] - bounds[0][1]) - (3.6 + 0.12 + 0.9)) < 0.05
        # Lô 5 m theo X, 18 m theo Z (âm).
        assert abs((bounds[1][0] - bounds[0][0]) - 5.0) < 0.3
        assert abs((bounds[1][2] - bounds[0][2]) - 18.0) < 0.3

    def test_walls_are_split_at_openings_so_openings_are_gaps(self) -> None:
        plan = _plan()
        openings = plan["levels"][0]["openings"]
        assert openings, "mặt bằng thử phải có lỗ mở"
        with_openings = len(build_massing(plan).geometry)
        plan["levels"][0]["openings"] = []
        without = len(build_massing(plan).geometry)
        # Mỗi lỗ mở thêm ít nhất một hộp (lanh tô hoặc kính) so với tường liền.
        assert with_openings > without

    def test_node_names_carry_the_kind_so_the_viewer_can_tell_glass_from_wall(self) -> None:
        """Tên nút là kênh DUY NHẤT còn lại để trình duyệt biết đâu là kính, đâu là tường.

        `trimesh` ghi màu mặt thành màu ĐỈNH (COLOR_0), không thành vật liệu — nên sau khi xuất
        glTF thì `material.color` của mọi mesh đều trắng. Mất tên nút là mất luôn khả năng tô
        khác nhau, và cửa đi với cửa sổ hiện ra y hệt mảng tường (thấy tận mắt 06/09/2026).
        """
        scene = build_massing(_plan())
        kinds = {name.rsplit("-", 1)[0] for name in scene.geometry}
        assert "wall" in kinds
        assert "slab" in kinds
        assert "window" in kinds, "mặt bằng thử phải có cửa sổ trên tường bao"
        assert "door" in kinds, "mặt bằng thử phải có cửa đi"

    def test_kind_survives_the_round_trip_through_glb(self) -> None:
        scene = trimesh.load(io.BytesIO(massing_glb(_plan())), file_type="glb")
        kinds = {name.rsplit("-", 1)[0] for name in scene.geometry}
        assert {"wall", "window", "door"} <= kinds


class TestOutdoorRooms:
    """Ban công phải ĐỌC RA ĐƯỢC là ban công, không phải một hộp kín bốn phía tường."""

    @staticmethod
    def _plan_with_balcony():
        """Tầng một: một phòng trong nhà phía sau, một ban công chạm mặt trước.

        Ba bức tường bao ban công: hai bức bên (giáp ngoài trời cả hai phía ngoài), một bức
        phía trước (giáp ngoài), và một bức chung với phòng trong nhà.
        """
        return {
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
                        {"id": "W-left", "a": [0, 0], "b": [0, 6], "thickness_m": 0.22},
                        {"id": "W-right", "a": [4, 0], "b": [4, 6], "thickness_m": 0.22},
                    ],
                    "openings": [],
                }
            ]
        }

    def test_the_open_edge_of_a_balcony_is_a_railing_not_a_wall(self) -> None:
        plan = self._plan_with_balcony()
        groups = {"outdoor": ["balcony", "terrace", "courtyard", "light_well"]}

        heights = {}
        for name, mesh in build_massing(plan, groups).geometry.items():
            heights.setdefault(name.split("-")[0], []).append(mesh.bounds[1][1] - mesh.bounds[0][1])

        assert "railing" in heights, "cạnh hở của ban công phải thành lan can"
        # Lan can thấp hơn hẳn tường: 1,1 m so với 3,48 m (`kb/construction_norms.yaml`).
        assert max(heights["railing"]) < 1.5
        assert max(heights["wall"]) > 3.0

    def test_the_shared_edge_with_an_indoor_room_stays_a_wall(self) -> None:
        """Cạnh giữa ban công và phòng trong nhà VẪN là tường — cửa ra ban công nằm ở đó."""
        plan = self._plan_with_balcony()
        groups = {"outdoor": ["balcony"]}
        scene = build_massing(plan, groups)

        # Tường chung nằm ở y = 1,5 m, tức z = -1,5 trong hệ glTF.
        shared = [
            name
            for name, mesh in scene.geometry.items()
            if abs((mesh.bounds[0][2] + mesh.bounds[1][2]) / 2 + 1.5) < 0.1
            and name.split("-")[0] in ("wall", "railing")
        ]
        assert shared, "phải tìm được bức tường chung"
        assert all(name.startswith("wall") for name in shared), shared

    def test_the_roof_does_not_cover_the_balcony(self) -> None:
        """Mái không đổ ra ban công — nếu không thì đó là lô gia, và khối đọc ra là phòng kín."""
        plan = self._plan_with_balcony()
        roofs = [
            mesh
            for name, mesh in build_massing(plan, {"outdoor": ["balcony"]}).geometry.items()
            if name.startswith("slab") and mesh.bounds[0][1] > 3.0
        ]
        assert roofs, "phải có sàn mái"
        # Mép trước của sàn mái dừng ở tường chung (z = -1,5), không ra tới z = 0.
        assert max(m.bounds[1][2] for m in roofs) < -1.0

    def test_a_wall_shared_with_a_neighbouring_room_is_split_not_classified_whole(self) -> None:
        """Tường mặt tiền chạy chung cho ban công VÀ phòng bên cạnh — phải cắt theo đoạn.

        Đo được 06/09/2026: ban công 1,7 m nằm cạnh phòng làm việc 3,3 m trên cùng một tuyến
        tường mặt tiền. Xét điểm giữa của cả bức tường trả lời theo phòng làm việc, và ban
        công ra bản vẽ lẫn khối ba chiều đều là phòng kín.
        """
        plan = {
            "levels": [
                {
                    "level": 1,
                    "height_m": 3.6,
                    "rooms": [
                        {
                            "id": "balcony_1",
                            "type": "balcony",
                            "polygon": [[0, 0], [1.7, 0], [1.7, 4], [0, 4]],
                            "area_m2": 6.8,
                        },
                        {
                            "id": "study_1",
                            "type": "study",
                            "polygon": [[1.7, 0], [5, 0], [5, 4], [1.7, 4]],
                            "area_m2": 13.2,
                        },
                    ],
                    "voids": [],
                    "walls": [
                        {"id": "W-front", "a": [0, 0], "b": [5, 0], "thickness_m": 0.22},
                        {"id": "W-mid", "a": [1.7, 0], "b": [1.7, 4], "thickness_m": 0.11},
                        {"id": "W-back", "a": [0, 4], "b": [5, 4], "thickness_m": 0.22},
                    ],
                    "openings": [],
                }
            ]
        }
        scene = build_massing(plan, {"outdoor": ["balcony"]})
        # Chỉ xét tuyến mặt tiền (y = 0, tức z = 0 trong hệ glTF): ở fixture này ban công
        # chạy suốt chiều sâu nên cạnh sau của nó cũng hở, và cũng thành lan can — đúng.
        front = [
            m
            for n, m in scene.geometry.items()
            if n.startswith("railing") and abs((m.bounds[0][2] + m.bounds[1][2]) / 2) < 0.2
        ]
        assert front, "đoạn mặt tiền của ban công phải thành lan can"
        # Đúng 1,7 m — phần của ban công, không phải cả 5 m mặt tiền.
        assert abs(sum(m.bounds[1][0] - m.bounds[0][0] for m in front) - 1.7) < 0.05

        # Và phần còn lại của chính tuyến đó vẫn là tường cao.
        walls = [
            m
            for n, m in scene.geometry.items()
            if n.startswith("wall") and abs((m.bounds[0][2] + m.bounds[1][2]) / 2) < 0.2
        ]
        assert abs(sum(m.bounds[1][0] - m.bounds[0][0] for m in walls) - 3.3) < 0.05

    def test_without_the_group_table_nothing_changes(self) -> None:
        """Không có bảng nhóm thì mọi phòng dựng như phòng kín — thiếu tin, không phải sai tin."""
        plan = self._plan_with_balcony()
        assert not any(n.startswith("railing") for n in build_massing(plan).geometry)
