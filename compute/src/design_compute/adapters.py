"""Chuyển đổi giữa hợp đồng dữ liệu và mô hình nội bộ của bộ giải.

Hợp đồng nói bằng ngôn ngữ kiến trúc (cây chia không gian, mét, số thực); bộ giải nói bằng
ngôn ngữ tối ưu hoá (vùng front/mid/rear, milimét, số nguyên). Toàn bộ việc dịch nằm ở đây
để `solver/` không phải biết gì về JSON, và để chỗ dịch có thể thay đổi mà không đụng bộ giải.

⚠️ GIỚI HẠN ĐÃ BIẾT (vướng mắc V-6, ghi trong TIEN_DO_THIET_KE.html)

Mô hình hiện tại của bộ giải chia mỗi tầng thành BA vùng theo chiều sâu: mặt tiền · dải lõi ·
phía sau. Vì vậy hàm `_zones_from_tree` dưới đây chỉ đọc được các lát cắt NGANG (`split: "H"`)
của cây. Lát cắt DỌC (`split: "V"`) — hai phòng cạnh nhau theo chiều rộng — chưa biểu diễn
được, và bị gộp chung vào một vùng.

Với nhà phố 5m thì gần đúng (bề rộng đó hiếm khi chia dọc ngoài dải lõi). Với biệt thự thì
KHÔNG dùng được. Mở rộng thuộc Mốc 5, cùng lúc với việc mã hoá các vị từ còn lại.
"""

from __future__ import annotations

from typing import Any

from design_compute.rules.loader import default_rules_root, load_for_locality
from design_compute.rules.messages import MessageCatalog
from design_compute.solver.model import RoomSpec, SolveRequest, SolveResult, Zone


def _flatten_rooms(node: dict[str, Any]) -> list[str]:
    """Mã phòng theo THỨ TỰ HÌNH HỌC từ mặt tiền vào sâu.

    Với lát cắt ngang, nhánh `a` nằm phía mặt tiền và `b` nằm phía sau — đó là quy ước của
    hợp đồng (gốc toạ độ ở góc trước-trái, `y` vào sâu). Nhờ vậy thứ tự duyệt cây chính là
    thứ tự vào sâu, không cần toạ độ.
    """
    if "room" in node:
        return [str(node["room"])]
    if "void" in node:
        return []
    return _flatten_rooms(node["a"]) + _flatten_rooms(node["b"])


def _zones_from_tree(node: dict[str, Any]) -> dict[str, Zone]:
    """Gán mỗi phòng của một tầng vào một trong ba vùng của bộ giải.

    Phòng đầu tiên (sát mặt tiền) vào `front`, phòng cuối vào `rear`, còn lại vào `mid` —
    dải giữa là nơi lõi thang đi qua ở mọi tầng.
    """
    rooms = _flatten_rooms(node)
    if not rooms:
        return {}
    if len(rooms) == 1:
        return {rooms[0]: "front"}
    if len(rooms) == 2:
        return {rooms[0]: "front", rooms[1]: "rear"}

    zones: dict[str, Zone] = {rooms[0]: "front", rooms[-1]: "rear"}
    for room_id in rooms[1:-1]:
        zones[room_id] = "mid"
    return zones


def build_solve_request(
    *,
    intent: dict[str, Any],
    program: dict[str, Any],
    site: dict[str, float],
    locality: str,
    time_budget_s: float,
    building_type: str = "nha_pho",
) -> SolveRequest:
    """Dựng đầu vào cho bộ giải từ `LayoutIntent` + `SpaceProgram` đã kiểm hợp đồng."""
    zones: dict[str, Zone] = {}
    for floor in intent["floors"]:
        for wing in floor["wings"]:
            zones.update(_zones_from_tree(wing["tree"]))

    rooms: list[RoomSpec] = []
    for space in program["spaces"]:
        space_id = space["id"]
        zone = zones.get(space_id)
        if zone is None:
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
                zone=zone,
                target_area_m2=float(target) if target is not None else min_area,
                min_area_m2=min_area,
                max_area_m2=(
                    float(space["max_area_m2"]) if space.get("max_area_m2") is not None else None
                ),
                needs_daylight=bool(space.get("needs_daylight", False)),
            )
        )

    floors = max((r.floor for r in rooms), default=1)

    return SolveRequest(
        site_width_m=float(site["width_m"]),
        site_depth_m=float(site["depth_m"]),
        floors=floors,
        rooms=tuple(rooms),
        rule_pack=load_for_locality(default_rules_root(), locality),
        building_type=building_type,
        time_limit_s=float(time_budget_s),
    )


def floor_plan_from_result(
    result: SolveResult, *, request: SolveRequest, intent_ref: str, site: dict[str, float]
) -> dict[str, Any]:
    """Dựng payload `FloorPlan` từ kết quả bộ giải.

    `rule_pack_version` là BẮT BUỘC trong hợp đồng: không có nó thì không tái lập được
    phương án cũ sau khi quy chuẩn thay đổi (03-data-contracts 3.4).
    """
    # `requires_daylight` chưa được mã hoá vào mô hình (Mốc 5). Cho tới lúc đó, cờ này chỉ
    # chép lại YÊU CẦU của chương trình không gian, không phải kết quả kiểm tra hình học —
    # suy ra từ vị trí phòng lúc này là nói dối bằng dữ liệu trông có vẻ đã kiểm.
    wants_daylight = {r.id: r.needs_daylight for r in request.rooms}

    levels: dict[int, list[dict[str, Any]]] = {}
    for room in result.rooms:
        levels.setdefault(room.floor, []).append(
            {
                "id": room.id,
                "type": room.type,
                "wing": "W1",
                "polygon": room.polygon,
                "area_m2": round(room.area_m2, 3),
                "has_daylight": wants_daylight.get(room.id, False),
            }
        )

    # Lõi thang là biến DÙNG CHUNG giữa các tầng: MỘT đa giác cho mọi tầng, không phải mỗi
    # tầng một bản sao. Bộ giải đã trả sẵn đúng hình đó, ở đây chỉ gắn mã.
    cores: list[dict[str, Any]] = []
    if result.core:
        cores.append({"id": "C1", **result.core})

    return {
        "schema_version": "1.0.0",
        "intent_ref": intent_ref,
        "rule_pack_version": result.rule_pack_version,
        "site": {"width_m": site["width_m"], "depth_m": site["depth_m"]},
        "structural_grid": {
            "axes_x_m": result.structural_axes_x_m,
            "axes_y_m": result.structural_axes_y_m,
        },
        "levels": [
            {"level": level, "rooms": rooms, "voids": [], "walls": [], "openings": []}
            for level, rooms in sorted(levels.items())
        ],
        "cores": cores,
        "constraint_report": {
            # `warning` của bộ giải nghĩa là "có nghiệm nhưng chưa chứng minh tối ưu, hoặc có
            # vi phạm mức cảnh báo" — ánh xạ thẳng sang trạng thái cùng tên của hợp đồng.
            "status": "pass" if result.status == "pass" else "warning",
            "violations": result.violations,
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
        params: dict[str, Any] = {"target": _target_label(entry, rule)}
        if rule is not None:
            for key in _THRESHOLD_KEYS:
                if key in rule.params:
                    params["required"] = rule.params[key]
                    break
        parts.append(
            messages.requirement(entry.rule_id, rule.predicate if rule else "", **params)
        )
        if rule is not None and rule.auto_repair != "none":
            relaxations.append({"rule_id": rule.id, "action": rule.auto_repair})

    if parts:
        constraint = f"khu đất {request.site_width_m:g}×{request.site_depth_m:g} m, {request.floors} tầng"
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


def _target_label(entry: Any, rule: Any) -> str:
    """Tên hiển thị của thứ bị ràng buộc: phòng cụ thể nếu có, không thì đối tượng của quy tắc."""
    if entry.involved:
        return entry.involved[0]
    if rule is not None:
        return str(rule.params.get("target", rule.id))
    return entry.rule_id
