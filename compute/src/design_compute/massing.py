"""Khối ba chiều sơ bộ từ `FloorPlan` — Lớp 5a phần tối thiểu kéo lên sớm (Mốc 5, 11-design-flow 11.4b).

Container đùn khối, xuất glTF nhị phân; trình duyệt CHỈ xem (three.js) — một nguồn hình học
(CLAUDE.md 8.2 #5). Không vật liệu, không nội thất, không mặt đứng: đây là khối để khách thấy
tỉ lệ và hình khối tổng thể, mang nhãn "Khối sơ bộ" do giao diện chèn.

## Cách dựng mà không cần phép toán boolean

Tường là các HỘP đặt cạnh nhau theo từng đoạn giữa hai lỗ mở (cùng cách `sheet/model.py` cắt
tường trên mặt bằng); trên mỗi lỗ mở là hộp lanh tô tới trần, dưới cửa sổ là hộp bệ. Lỗ mở vì
thế là khoảng TRỐNG giữa các hộp, không phải lỗ khoét — nên không cần thư viện boolean (thứ
không có trong ảnh Docker và hay hỏng trên hình học mỏng). Sàn là đa giác chân công trình trừ
khoảng rỗng, đùn dày 0,12 m. Mái bằng có lan can theo `roof.parapet_h_m` (mặc định 0,9 m).

Đơn vị glTF là MÉT, trục Y hướng lên (quy ước glTF); mặt bằng nằm trên mặt phẳng XZ với
chiều sâu lô chạy theo -Z để mặt tiền (y = 0 của mặt bằng) quay về phía người xem.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import trimesh
from shapely.geometry import Polygon
from shapely.ops import unary_union

SLAB_M = 0.12
PARAPET_M = 0.9
DEFAULT_STOREY_M = 3.6
DEFAULT_DOOR_H = 2.2
DEFAULT_WINDOW_H = 1.6
DEFAULT_SILL = 0.9

WALL_COLOR = [235, 232, 226, 255]
SLAB_COLOR = [214, 210, 202, 255]
GLASS_COLOR = [140, 176, 205, 120]


class MassingError(ValueError):
    retryable = False


def _to_gltf(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    """Mặt bằng (x, y) + cao độ z → glTF (x, y=lên, z). Mặt tiền y=0 quay ra phía +Z của người xem."""
    m = mesh.copy()
    v = m.vertices.copy()
    m.vertices = np.column_stack([v[:, 0], v[:, 2], -v[:, 1]])
    return m


def _box(x0: float, y0: float, z0: float, x1: float, y1: float, z1: float, color) -> trimesh.Trimesh | None:
    dx, dy, dz = x1 - x0, y1 - y0, z1 - z0
    if dx <= 1e-6 or dy <= 1e-6 or dz <= 1e-6:
        return None
    box = trimesh.creation.box(extents=(dx, dy, dz))
    box.apply_translation(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    box.visual.face_colors = color
    return box


def _slab(polygons: list[Polygon], z0: float, thickness: float, color) -> trimesh.Trimesh | None:
    if not polygons:
        return None
    shape = unary_union(polygons)
    parts = [shape] if shape.geom_type == "Polygon" else list(getattr(shape, "geoms", []))
    meshes = []
    for poly in parts:
        if poly.is_empty or poly.area <= 1e-6:
            continue
        m = trimesh.creation.extrude_polygon(poly, thickness)
        m.apply_translation((0, 0, z0))
        m.visual.face_colors = color
        meshes.append(m)
    return trimesh.util.concatenate(meshes) if meshes else None


def build_massing(plan: dict[str, Any]) -> trimesh.Scene:
    levels = sorted(plan.get("levels", []), key=lambda lv: int(lv["level"]))
    if not levels:
        raise MassingError("Mặt bằng không có tầng nào để dựng khối.")

    meshes: list[trimesh.Trimesh] = []
    base = 0.0
    top_polygons: list[Polygon] = []
    for level in levels:
        height = float(level.get("height_m") or DEFAULT_STOREY_M)
        rooms = [Polygon([(float(x), float(y)) for x, y in r["polygon"]]) for r in level.get("rooms", [])]
        voids = [Polygon([(float(x), float(y)) for x, y in v["polygon"]]) for v in level.get("voids", [])]
        footprint = unary_union(rooms) if rooms else None
        if footprint is not None and voids:
            footprint = footprint.difference(unary_union(voids))
        slab_polys = [footprint] if footprint is not None and not footprint.is_empty else []
        slab = _slab(slab_polys, base, SLAB_M, SLAB_COLOR)
        if slab is not None:
            meshes.append(slab)
        top_polygons = [unary_union(rooms)] if rooms else top_polygons

        walls = {str(w["id"]): w for w in level.get("walls", [])}
        by_wall: dict[str, list[dict[str, Any]]] = {}
        for o in level.get("openings", []):
            by_wall.setdefault(str(o.get("wall")), []).append(o)
        for wall_id, wall in walls.items():
            meshes.extend(_wall_boxes(wall, by_wall.get(wall_id, []), base + SLAB_M, base + height))
        base += height

    # Mái bằng + lan can.
    roof = plan.get("roof") or {}
    parapet = float(roof.get("parapet_h_m") or PARAPET_M)
    roof_slab = _slab(top_polygons, base, SLAB_M, SLAB_COLOR)
    if roof_slab is not None:
        meshes.append(roof_slab)
    if top_polygons:
        outline = unary_union(top_polygons)
        if outline.geom_type == "Polygon":
            ring = list(outline.exterior.coords)
            for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
                thick = 0.11
                if abs(x1 - x0) < 1e-6:
                    b = _box(x0 - thick / 2, min(y0, y1), base + SLAB_M, x0 + thick / 2, max(y0, y1), base + SLAB_M + parapet, WALL_COLOR)
                else:
                    b = _box(min(x0, x1), y0 - thick / 2, base + SLAB_M, max(x0, x1), y0 + thick / 2, base + SLAB_M + parapet, WALL_COLOR)
                if b is not None:
                    meshes.append(b)

    scene = trimesh.Scene()
    for i, m in enumerate(meshes):
        scene.add_geometry(_to_gltf(m), node_name=f"n{i}")
    return scene


def _wall_boxes(wall: dict[str, Any], openings: list[dict[str, Any]], z0: float, z1: float) -> list[trimesh.Trimesh]:
    (ax, ay), (bx, by) = (float(wall["a"][0]), float(wall["a"][1])), (float(wall["b"][0]), float(wall["b"][1]))
    t = float(wall.get("thickness_m") or 0.11)
    vertical = abs(bx - ax) < 1e-6
    start, end = (min(ay, by), max(ay, by)) if vertical else (min(ax, ax + (bx - ax)), max(ax, bx))
    # Toạ độ dọc tường: `offset_m` tính từ điểm a.
    origin = ay if vertical else ax
    length = end - start
    out: list[trimesh.Trimesh] = []

    def box_along(s0: float, s1: float, h0: float, h1: float, color=WALL_COLOR, thickness: float = t):
        if s1 - s0 <= 1e-6:
            return
        if vertical:
            b = _box(ax - thickness / 2, origin + s0 if by >= ay else origin - s1, h0, ax + thickness / 2, origin + s1 if by >= ay else origin - s0, h1, color)
        else:
            b = _box(origin + s0 if bx >= ax else origin - s1, ay - thickness / 2, h0, origin + s1 if bx >= ax else origin - s0, ay + thickness / 2, h1, color)
        if b is not None:
            out.append(b)

    cuts = sorted(
        (max(0.0, float(o["offset_m"])), min(length, float(o["offset_m"]) + float(o["width_m"])), o)
        for o in openings
        if float(o.get("width_m") or 0) > 0
    )
    cursor = 0.0
    for s0, s1, o in cuts:
        if s0 > cursor:
            box_along(cursor, s0, z0, z1)
        kind = o.get("kind")
        h = float(o.get("height_m") or (DEFAULT_DOOR_H if kind == "door" else DEFAULT_WINDOW_H))
        sill = 0.0 if kind == "door" else float(o.get("sill_m") if o.get("sill_m") is not None else DEFAULT_SILL)
        # Bệ dưới cửa sổ, lanh tô trên mọi lỗ mở, và một tấm kính mỏng để khối đọc được là cửa.
        if sill > 0:
            box_along(s0, s1, z0, z0 + sill)
        if z0 + sill + h < z1:
            box_along(s0, s1, z0 + sill + h, z1)
        if kind in ("window", "door"):
            box_along(s0, s1, z0 + sill, min(z1, z0 + sill + h), GLASS_COLOR, thickness=0.02)
        cursor = max(cursor, s1)
    if cursor < length:
        box_along(cursor, length, z0, z1)
    return out


def massing_glb(plan: dict[str, Any]) -> bytes:
    scene = build_massing(plan)
    return scene.export(file_type="glb")
