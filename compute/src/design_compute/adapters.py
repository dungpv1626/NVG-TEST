"""Chuyển đổi giữa hợp đồng dữ liệu và mô hình nội bộ của bộ giải.

Hợp đồng nói bằng ngôn ngữ kiến trúc (cây chia không gian, mét, số thực); bộ giải nói bằng
ngôn ngữ tối ưu hoá (module nguyên, biến, ràng buộc). Toàn bộ việc dịch nằm ở đây để `solver/`
không phải biết gì về JSON, và để chỗ dịch có thể thay đổi mà không đụng bộ giải.

Từ Mốc 5, cây bố cục được đọc NGUYÊN VẸN — cả lát cắt ngang lẫn lát cắt dọc, sâu tuỳ ý, kể cả
lá `void`. Bản Mốc 0.2 trước đó ép mọi tầng vào ba dải theo chiều sâu và vì vậy làm phẳng mất
mọi lát cắt dọc (vướng mắc V-6). Giới hạn đó đã hết.

Còn lại một giới hạn thật: **một cánh nhà**. `massing.wings` nhiều hơn một phần tử là biệt thự
hình L/U/T, thuộc Mốc 7 — ở đây báo lỗi thay vì lặng lẽ bỏ qua các cánh còn lại.
"""

from __future__ import annotations

from typing import Any

from design_compute.geometry import Cell, build_walls_and_openings, load_construction_norms
from design_compute.rules.loader import default_rules_root, load_for_locality
from design_compute.rules.messages import MessageCatalog
from design_compute.solver.model import (
    CIRCULATION_TYPES,
    AdjacencyRequest,
    FloorLayout,
    RoomSpec,
    SolveRequest,
    SolveResult,
    Violation,
)
from design_compute.solver.tree import leaves as tree_leaves

_VALID_SIDES = ("front", "back", "left", "right")


def _single_wing(floor: dict[str, Any]) -> dict[str, Any]:
    wings = floor.get("wings") or []
    if len(wings) != 1:
        raise ValueError(
            f"Tầng {floor.get('level')} có {len(wings)} cánh nhà. Giai đoạn 1 chỉ giải nhà phố "
            "một cánh; biệt thự nhiều cánh thuộc Mốc 7."
        )
    return wings[0]


def _sides(values: Any, fallback: tuple[str, ...]) -> tuple[str, ...]:
    if not values:
        return fallback
    picked = tuple(str(v) for v in values if str(v) in _VALID_SIDES)
    return picked or fallback


def build_solve_request(
    *,
    intent: dict[str, Any],
    program: dict[str, Any],
    site: dict[str, Any],
    locality: str,
    time_budget_s: float,
    building_type: str = "nha_pho",
    labels: dict[str, str] | None = None,
    groups: dict[str, list[str]] | None = None,
) -> SolveRequest:
    """Dựng đầu vào cho bộ giải từ `LayoutIntent` + `SpaceProgram` đã kiểm hợp đồng."""
    layouts: list[FloorLayout] = []
    placed_ids: set[str] = set()
    for floor in intent["floors"]:
        tree = _single_wing(floor)["tree"]
        layouts.append(FloorLayout(level=int(floor["level"]), tree=tree))
        placed_ids.update(leaf.ref for leaf in tree_leaves(tree) if leaf.kind == "room")

    labels = labels or {}
    rooms: list[RoomSpec] = []
    for space in program["spaces"]:
        space_id = space["id"]
        if space_id not in placed_ids:
            # Phòng có trong chương trình nhưng không có trong cây là lỗi cấu trúc của
            # LayoutIntent (03-data-contracts 3.3, ràng buộc validate số 2). Bộ giải không
            # đoán bù — nó sẽ đặt phòng ở chỗ tuỳ ý và không ai biết là đã sai.
            raise ValueError(
                f'Phòng "{space_id}" có trong chương trình không gian nhưng không xuất hiện '
                "trong cây bố cục — sinh lại phương án thay vì giải tiếp."
            )
        min_area = float(space["min_area_m2"])
        target = space.get("target_area_m2")
        rooms.append(
            RoomSpec(
                id=space_id,
                type=str(space["type"]),
                floor=int(space["floor"]),
                target_area_m2=float(target) if target is not None else min_area,
                min_area_m2=min_area,
                max_area_m2=(
                    float(space["max_area_m2"]) if space.get("max_area_m2") is not None else None
                ),
                needs_daylight=bool(space.get("needs_daylight", False)),
                label=labels.get(space_id),
                enclosed_in=(
                    str(space["enclosed_in"]) if space.get("enclosed_in") is not None else None
                ),
            )
        )

    adjacency = tuple(
        AdjacencyRequest(
            a=str(item["a"]),
            b=str(item["b"]),
            kind=str(item["kind"]),  # type: ignore[arg-type]
            weight=float(item.get("weight", 1.0)),
        )
        for item in program.get("adjacency", [])
    )

    floors = max((r.floor for r in rooms), default=1)

    # Mặt sàn chương trình CHỌN DÙNG, lấy mức lớn nhất trong các tầng: hình bao dùng chung cho
    # cả công trình, nên nó phải đủ cho tầng cần nhiều nhất. Không có trường này (chương trình
    # cũ) thì để `None` và bộ giải giữ nguyên hành vi cũ — chia hết phần xây được.
    wanted = [
        float(entry["usable_area_m2"])
        for entry in (program.get("floor_allocation") or [])
        if entry.get("usable_area_m2") is not None
    ]

    setbacks = site.get("setback_required_m") or {}

    return SolveRequest(
        site_width_m=float(site["width_m"]),
        site_depth_m=float(site["depth_m"]),
        floors=floors,
        rooms=tuple(rooms),
        layouts=tuple(layouts),
        rule_pack=load_for_locality(default_rules_root(), locality),
        building_type=building_type,
        site_area_m2=(float(site["area_m2"]) if site.get("area_m2") is not None else None),
        open_faces=_sides(site.get("open_faces"), ("front", "back")),  # type: ignore[arg-type]
        access_faces=_sides(site.get("access_faces"), ("front",)),  # type: ignore[arg-type]
        adjacency=adjacency,
        room_groups={name: tuple(members) for name, members in (groups or {}).items()},
        setback_override_m={
            side: float(setbacks[side]) for side in _VALID_SIDES if setbacks.get(side) is not None
        },
        max_density_override=(
            float(site["max_density"]) if site.get("max_density") is not None else None
        ),
        target_floor_area_m2=(max(wanted) if wanted else None),
        time_limit_s=float(time_budget_s),
    )


def _render_violation(
    violation: Violation, *, request: SolveRequest, messages: MessageCatalog
) -> dict[str, Any]:
    """Một vi phạm thành câu tiếng Việt đọc được, ghép từ mẫu câu chứ không từ mô hình ngôn ngữ."""
    by_id = {room.id: room for room in request.rooms}

    def name(space_id: str) -> str:
        room = by_id.get(space_id)
        return (room.label if room and room.label else None) or space_id

    involved = list(violation.involved)
    params: dict[str, Any] = {
        "actual": violation.actual,
        "required": violation.required,
    }
    if involved:
        params["room"] = name(involved[0])
        params["target"] = name(involved[0])
        params["side"] = involved[0]
        params["a"] = name(involved[0])
    if len(involved) > 1:
        params["b"] = name(involved[1])

    return {
        "rule_id": violation.rule_id,
        "severity": violation.severity,
        "message": messages.render(violation.rule_id, violation.predicate, **params),
        "involved": involved,
    }


def floor_plan_from_result(
    result: SolveResult,
    *,
    request: SolveRequest,
    intent_ref: str,
    site: dict[str, Any],
    messages: MessageCatalog,
) -> dict[str, Any]:
    """Dựng payload `FloorPlan` từ kết quả bộ giải.

    `rule_pack_version` là BẮT BUỘC trong hợp đồng: không có nó thì không tái lập được
    phương án cũ sau khi quy chuẩn thay đổi (03-data-contracts 3.4).
    """
    levels: dict[int, dict[str, list[dict[str, Any]]]] = {}

    for room in result.rooms:
        entry = levels.setdefault(room.floor, {"rooms": [], "voids": []})
        entry["rooms"].append(
            {
                "id": room.id,
                "type": room.type,
                "wing": "W1",
                "polygon": room.polygon,
                "area_m2": round(room.area_m2, 3),
                # Không còn chép lại YÊU CẦU của chương trình không gian: từ Mốc 5 đây là kết
                # quả ĐO trên hình học đã giải — phòng có tiếp giáp mặt thoáng hay giếng trời
                # thật hay không.
                "has_daylight": room.has_daylight,
            }
        )

    for void in result.voids:
        entry = levels.setdefault(void.floor, {"rooms": [], "voids": []})
        entry["voids"].append({"id": void.id, "kind": void.kind, "polygon": void.polygon})

    # ── Lớp 3c: đọc tường và lỗ mở ra từ các đa giác phòng ────────────────────────────
    norms = load_construction_norms()
    footprint = result.footprint_m or (0.0, 0.0, float(site["width_m"]), float(site["depth_m"]))
    geometry: dict[int, tuple[list[Any], list[Any]]] = {}
    for level in levels:
        cells = [
            Cell(r.id, r.type, r.x0_m, r.y0_m, r.x1_m, r.y1_m)
            for r in result.rooms
            if r.floor == level
        ] + [
            Cell(v.id, v.kind, v.x0_m, v.y0_m, v.x1_m, v.y1_m, is_void=True)
            for v in result.voids
            if v.floor == level
        ]
        walls, openings = build_walls_and_openings(
            cells,
            level=level,
            footprint=footprint,
            structural_x=result.structural_axes_x_m,
            structural_y=result.structural_axes_y_m,
            open_faces=request.open_faces,
            access_faces=request.access_faces,
            circulation_types=CIRCULATION_TYPES,
            norms=norms,
        )
        geometry[level] = (
            [
                {
                    "id": w.id,
                    "a": list(w.a),
                    "b": list(w.b),
                    "thickness_m": w.thickness_m,
                    "load_bearing": w.load_bearing,
                }
                for w in walls
            ],
            [
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
        )

    # Lõi thang là hình học DÙNG CHUNG giữa các tầng: MỘT đa giác cho mọi tầng, không phải mỗi
    # tầng một bản sao. Bộ giải đã ràng buộc chúng trùng khít, ở đây chỉ gắn mã.
    top_level = max(levels) if levels else 1

    cores: list[dict[str, Any]] = []
    if result.core:
        cores.append({"id": "C1", **result.core})

    violations = [
        _render_violation(v, request=request, messages=messages) for v in result.violations
    ]

    return {
        "schema_version": "1.0.0",
        "intent_ref": intent_ref,
        "rule_pack_version": result.rule_pack_version,
        "site": {"width_m": float(site["width_m"]), "depth_m": float(site["depth_m"])},
        # Hình bao công trình, không phải ranh thửa. Đã tính sẵn ở trên cho việc dựng tường;
        # ghi ra để Worker khỏi phải suy lại từ toạ độ tường — suy lại là bản thực thi thứ hai
        # của cùng một phép, và nó đã lệch một lần rồi (V-22).
        "footprint_m": [float(v) for v in footprint],
        "structural_grid": {
            "axes_x_m": result.structural_axes_x_m,
            "axes_y_m": result.structural_axes_y_m,
        },
        "levels": [
            {
                "level": level,
                # Cao độ tầng là DỮ LIỆU của chuẩn cấu tạo, không phải hằng số trong mã: trước
                # đây `stubArchModel` ở Worker mặc định cứng 3,4 m trong khi hồ sơ thật là 3,6 m.
                "height_m": norms.storey_height(level, top_level),
                "rooms": entry["rooms"],
                "voids": entry["voids"],
                "walls": geometry.get(level, ([], []))[0],
                "openings": geometry.get(level, ([], []))[1],
            }
            for level, entry in sorted(levels.items())
        ],
        "cores": cores,
        "constraint_report": {
            # `warning` nghĩa là "có nghiệm nhưng chưa chứng minh tối ưu, hoặc có vi phạm mức
            # cảnh báo" — ánh xạ thẳng sang trạng thái cùng tên của hợp đồng.
            "status": "pass" if result.status == "pass" else "warning",
            "violations": violations,
        },
    }


# Tham số của vị từ mang ngưỡng, theo thứ tự ưu tiên khi điền `{required}`.
_THRESHOLD_KEYS = ("value_m", "value_m2", "value", "tolerance_m")


def infeasibility_report_from_result(
    result: SolveResult, *, request: SolveRequest, messages: MessageCatalog
) -> dict[str, Any]:
    """Dựng payload `InfeasibilityReport`.

    `human_message` sinh từ MẪU CÂU, không gọi mô hình ngôn ngữ: tất định, rẻ, dịch được,
    và không bịa ra một quy tắc không tồn tại (07-rule-pack 7.6).

    `suggested_relaxations` lấy `auto_repair` của chính quy tắc — đó là lý do trường đó tồn
    tại trong rule pack. Không tự nghĩ ra hướng nới lỏng nào ngoài những gì quy tắc đã khai.
    """
    by_id = request.rule_pack.by_id()

    conflict_set = [
        {"rule_id": entry.rule_id, "involved": list(entry.involved)}
        for entry in result.conflict_set
    ]

    parts: list[str] = []
    relaxations: list[dict[str, Any]] = []
    for entry in result.conflict_set:
        rule = by_id.get(entry.rule_id)
        params: dict[str, Any] = {"target": _target_label(entry, rule, request)}
        if rule is not None:
            for key in _THRESHOLD_KEYS:
                if key in rule.params:
                    params["required"] = rule.params[key]
                    break
        parts.append(messages.requirement(entry.rule_id, rule.predicate if rule else "", **params))
        if rule is not None and rule.auto_repair != "none":
            relaxations.append({"rule_id": rule.id, "action": rule.auto_repair})

    if parts:
        constraint = (
            f"khu đất {request.site_width_m:g}×{request.site_depth_m:g} m, {request.floors} tầng"
        )
        human = messages.combine(parts, constraint=constraint)
    else:
        human = (
            "Không tìm được phương án thoả mọi yêu cầu, và bộ giải không chỉ ra được ràng "
            "buộc nào mâu thuẫn. Thử nới một yêu cầu về diện tích hoặc tăng bề rộng khu đất."
        )

    return {
        "schema_version": "1.0.0",
        "status": "infeasible",
        "rule_pack_version": result.rule_pack_version,
        "conflict_set": conflict_set,
        "human_message": human,
        "suggested_relaxations": relaxations,
    }


def _target_label(entry: Any, rule: Any, request: SolveRequest) -> str:
    """Tên hiển thị của thứ bị ràng buộc: phòng cụ thể nếu có, không thì đối tượng của quy tắc."""
    if entry.involved:
        first = entry.involved[0]
        for room in request.rooms:
            if room.id == first:
                return room.label or first
        return first
    if rule is not None:
        return str(rule.params.get("target", rule.id))
    return entry.rule_id
