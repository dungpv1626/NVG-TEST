"""Khối ba chiều sơ bộ — glTF hợp lệ, cao đúng tổng cao độ tầng, có lỗ mở."""

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
