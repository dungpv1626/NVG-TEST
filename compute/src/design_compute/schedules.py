"""Bảng thống kê tự sinh từ `FloorPlan` — cửa, cửa sổ, diện tích, khối lượng sơ bộ (Mốc 5, TK-17).

Nguồn: `contracts/schedules.schema.json`, `doc/design/11-design-flow.md` 11.6 Output 4
("xuất kèm dạng XLSX, TỰ CẬP NHẬT khi mặt bằng đổi — hiện các bảng này phải sửa tay từng bản vẽ").

Hai ràng buộc:
- Hàm thuần trên `FloorPlan`: cùng mặt bằng → cùng bảng. Không đọc CSDL, không đoán bù.
- Nhãn "Khối lượng sơ bộ — không dùng làm căn cứ ký hợp đồng" do MÃ NGUỒN chèn (hợp đồng đặt
  `const`), không tắt được từ giao diện.

Mã cửa theo cách hồ sơ thật đặt (`kb/construction_norms.yaml`): cửa đi `D1..`, cửa vệ sinh `DW1..`,
cửa sổ `W1..` — cùng kích thước thì cùng mã, xếp từ rộng tới hẹp.
"""

from __future__ import annotations

import io
from collections import Counter, defaultdict
from typing import Any

from design_compute.geometry.norms import ConstructionNorms

DISCLAIMER = "Khối lượng sơ bộ — không dùng làm căn cứ ký hợp đồng"
EPS = 1e-6


def _key(o: dict[str, Any], fallback_h: float) -> tuple[float, float]:
    return (round(float(o["width_m"]), 2), round(float(o.get("height_m") or fallback_h), 2))


def build_schedules(
    plan: dict[str, Any],
    *,
    floorplan_ref: str,
    norms: ConstructionNorms,
) -> dict[str, Any]:
    doors: Counter[tuple[float, float]] = Counter()
    wc_doors: Counter[tuple[float, float]] = Counter()
    windows: Counter[tuple[float, float]] = Counter()
    areas: list[dict[str, Any]] = []
    wall_length: dict[str, float] = defaultdict(float)
    total_area = 0.0

    for level in sorted(plan.get("levels", []), key=lambda lv: int(lv["level"])):
        for room in level.get("rooms", []):
            area = round(float(room["area_m2"]), 1)
            total_area += area
            areas.append({"level": int(level["level"]), "room_type": str(room["type"]), "area_m2": area})
        for wall in level.get("walls", []):
            (ax, ay), (bx, by) = wall["a"], wall["b"]
            length = abs(float(bx) - float(ax)) + abs(float(by) - float(ay))
            t = float(wall.get("thickness_m") or norms.partition_m)
            wall_length[f"{int(round(t * 1000))}"] += length
        for opening in level.get("openings", []):
            kind = opening.get("kind")
            if kind == "door":
                key = _key(opening, norms.door_height_m)
                if abs(key[0] - round(norms.wc_door_width_m, 2)) < EPS:
                    wc_doors[key] += 1
                else:
                    doors[key] += 1
            elif kind == "window":
                windows[key := _key(opening, norms.window_height_m)] += 1

    def rows(counter: Counter[tuple[float, float]], prefix: str, material_of) -> list[dict[str, Any]]:
        out = []
        for i, ((w, h), n) in enumerate(sorted(counter.items(), key=lambda kv: (-kv[0][0], -kv[0][1])), start=1):
            out.append({"code": f"{prefix}{i}", "w_m": w, "h_m": h, "count": n, "material": material_of(w, h)})
        return out

    defaults = norms.schedule_materials

    def door_material(w: float, _h: float) -> str | None:
        if w >= norms.entrance_width_m - EPS:
            return defaults.get("entrance")
        return defaults.get("door")

    def window_material(w: float, h: float) -> str | None:
        if abs(w - norms.wc_window_width_m) < EPS and abs(h - norms.wc_window_height_m) < EPS:
            return defaults.get("wc_window")
        return defaults.get("window")

    materials = [
        {"code": f"TUONG_{t}", "name": f"Tường {t} (mét dài, mọi tầng)", "count": int(round(length)), "area_m2": None, "volume_m3": None}
        for t, length in sorted(wall_length.items(), key=lambda kv: -int(kv[0]))
    ]
    materials.append({"code": "SAN", "name": "Sàn xây dựng (tổng các tầng)", "area_m2": round(total_area, 1), "volume_m3": None, "count": None})

    return {
        "schema_version": "1.0.0",
        "floorplan_ref": floorplan_ref,
        "doors": rows(doors, "D", door_material) + rows(wc_doors, "DW", lambda w, h: defaults.get("wc_door")),
        "windows": rows(windows, "W", window_material),
        "areas": areas,
        "materials": materials,
        "disclaimer": DISCLAIMER,
    }


def _fmt(v: float) -> str:
    return f"{v:.1f}".replace(".", ",")


def schedules_to_xlsx(schedules: dict[str, Any], *, labels: dict[str, str] | None = None, title: str = "") -> bytes:
    """Ba bảng, ba sheet. Dòng đầu mỗi sheet là nhãn cảnh báo — không có cách bỏ."""
    from openpyxl import Workbook
    from openpyxl.styles import Font

    labels = labels or {}
    wb = Workbook()
    bold = Font(bold=True)

    def sheet(name: str, header: list[str], body: list[list[Any]]):
        ws = wb.create_sheet(title=name)
        ws.append([title] if title else [""])
        ws.append([schedules["disclaimer"]])
        ws["A2"].font = Font(italic=True)
        ws.append([])
        ws.append(header)
        for cell in ws[ws.max_row]:
            cell.font = bold
        for row in body:
            ws.append(row)
        for col in ws.columns:
            width = max(len(str(c.value or "")) for c in col)
            ws.column_dimensions[col[0].column_letter].width = min(48, max(10, width + 2))
        return ws

    wb.remove(wb.active)
    sheet(
        "Thống kê cửa",
        ["STT", "Ký hiệu", "Loại", "Rộng (mm)", "Cao (mm)", "Số lượng", "Vật liệu", "Ghi chú"],
        [
            [i, r["code"], "Cửa đi" if r["code"].startswith("D") and not r["code"].startswith("DW") else "Cửa vệ sinh" if r["code"].startswith("DW") else "Cửa sổ",
             int(round(r["w_m"] * 1000)), int(round(r["h_m"] * 1000)), r["count"], r.get("material") or "", "kích thước thông thủy hoàn thiện"]
            for i, r in enumerate([*schedules.get("doors", []), *schedules.get("windows", [])], start=1)
        ],
    )
    total = 0.0
    area_rows = []
    for r in schedules.get("areas", []):
        total += r["area_m2"]
        area_rows.append([r["level"], labels.get(r["room_type"], r["room_type"]), _fmt(r["area_m2"])])
    area_rows.append(["", "Tổng sàn xây dựng", _fmt(total)])
    sheet("Thống kê diện tích", ["Tầng", "Không gian", "Diện tích (m²)"], area_rows)
    sheet(
        "Khối lượng sơ bộ",
        ["Mã", "Hạng mục", "Số lượng", "Diện tích (m²)"],
        [[m["code"], m["name"], m.get("count") or "", _fmt(m["area_m2"]) if m.get("area_m2") else ""] for m in schedules.get("materials", [])],
    )
    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
