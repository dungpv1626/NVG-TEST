"""Đo các vị từ hình học trên MỘT nghiệm đã có.

Vì sao tách khỏi `model.py`
---------------------------
Bộ giải diễn đạt ràng buộc bằng biến; tệp này đọc con số cuối cùng. Hai việc khác nhau, và
việc thứ hai còn dùng ở chỗ khác: trình chỉnh sửa gửi một mặt bằng người dùng vừa kéo tay lên
máy chủ để hỏi "còn hợp lệ không" mà không cần giải lại gì cả.

Đây là NƠI DUY NHẤT vị từ hình học được cài đặt để đo (CLAUDE.md 8.7). Worker đọc rule pack
để hiển thị cho người dùng nhưng không tự đánh giá — hai bản thực thi sẽ lệch nhau.

Quy tắc mức `error` về nguyên tắc không thể bị vi phạm trên một nghiệm đã giải, vì chúng là
ràng buộc cứng. Vẫn kiểm: nếu có ngày một vị từ được đưa vào đây mà quên đưa vào mô hình, thì
nó hiện ra thành vi phạm chứ không âm thầm không được kiểm bao giờ.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Iterable

from design_compute.rules.model import Rule

if TYPE_CHECKING:  # pragma: no cover - chỉ để gõ kiểu, tránh vòng import lúc chạy
    from design_compute.solver.model import PlacedRoom, PlacedVoid, SolveRequest, Violation

_EPS = 1e-9


def _num(value: float, digits: int = 1) -> str:
    """Số theo quy ước hiển thị tiếng Việt: dấu phẩy thập phân, không đuôi 0 thừa."""
    text = f"{value:.{digits}f}".rstrip("0").rstrip(".")
    return (text or "0").replace(".", ",")


def _rect(item: "PlacedRoom | PlacedVoid") -> tuple[float, float, float, float]:
    return item.x0_m, item.x1_m, item.y0_m, item.y1_m


def _touch(a: "PlacedRoom | PlacedVoid", b: "PlacedRoom | PlacedVoid") -> bool:
    """Chung một đoạn biên có độ dài dương. Chạm nhau ở đúng một góc KHÔNG tính."""
    ax0, ax1, ay0, ay1 = _rect(a)
    bx0, bx1, by0, by1 = _rect(b)
    overlap_x = min(ax1, bx1) - max(ax0, bx0)
    overlap_y = min(ay1, by1) - max(ay0, by0)
    if abs(ay1 - by0) < _EPS or abs(by1 - ay0) < _EPS:
        return overlap_x > _EPS
    if abs(ax1 - bx0) < _EPS or abs(bx1 - ax0) < _EPS:
        return overlap_y > _EPS
    return False


def _faces(
    room: "PlacedRoom", footprint: tuple[float, float, float, float]
) -> frozenset[str]:
    """Mặt nào của hình bao mà phòng tiếp giáp — đo trên toạ độ thật."""
    fx0, fy0, fx1, fy1 = footprint
    touched = set()
    if abs(room.y0_m - fy0) < _EPS:
        touched.add("front")
    if abs(room.y1_m - fy1) < _EPS:
        touched.add("back")
    if abs(room.x0_m - fx0) < _EPS:
        touched.add("left")
    if abs(room.x1_m - fx1) < _EPS:
        touched.add("right")
    return frozenset(touched)


def _best_rule(
    rules: Iterable[Rule], room: "PlacedRoom", groups: dict[str, tuple[str, ...]]
) -> Rule | None:
    from design_compute.solver.model import target_covers

    candidates = list(rules)
    for rule in candidates:
        if rule.params.get("target") == room.type:
            return rule
    for rule in candidates:
        if target_covers(rule, room.type, groups):
            return rule
    return None


def evaluate_violations(
    request: "SolveRequest",
    rooms: list["PlacedRoom"],
    voids: list["PlacedVoid"],
) -> list["Violation"]:
    """Mọi quy tắc của gói, đo trên mặt bằng đã giải."""
    from design_compute.solver.model import CORE_TYPES, Violation, max_density, setbacks_m

    pack_rules = request.rule_pack.for_building_type(request.building_type)
    by_predicate: dict[str, list[Rule]] = {}
    for rule in pack_rules:
        by_predicate.setdefault(rule.predicate, []).append(rule)

    found: list[Violation] = []

    def add(
        rule: Rule,
        involved: tuple[str, ...],
        actual: str | None,
        required: str | None,
        predicate: str | None = None,
    ) -> None:
        # `predicate` cho phép ghi một khoá HẸP HƠN tên vị từ — `adjacency_separate` thay vì
        # `adjacency` — vì hai chiều của cùng một vị từ cần hai câu khác hẳn nhau.
        found.append(
            Violation(
                rule_id=rule.id,
                predicate=predicate or rule.predicate,
                severity=rule.severity.value,
                involved=involved,
                actual=actual,
                required=required,
            )
        )

    footprint = _footprint_of(request, rooms)

    for room in rooms:
        _check_dimension(by_predicate, room, add, request.room_groups)
        _check_area(by_predicate, room, add, request.room_groups)
        _check_aspect(by_predicate, room, add, request.room_groups)
        _check_daylight(by_predicate, request, room, voids, footprint, add)
        _check_access(by_predicate, request, room, rooms, footprint, add)
        _check_face(by_predicate, request, room, footprint, add)

    for void in voids:
        _check_void_area(by_predicate, void, add)

    _check_floor_preference(by_predicate, request, rooms, add)
    _check_core_alignment(by_predicate, rooms, CORE_TYPES, add)
    _check_adjacency_rules(by_predicate, rooms, add)
    _check_setbacks(request, footprint, setbacks_m, add)
    _check_density(request, footprint, max_density, add)
    _check_module(by_predicate, rooms, add)

    return found


def _footprint_of(
    request: "SolveRequest", rooms: list["PlacedRoom"]
) -> tuple[float, float, float, float]:
    """Hình bao thật của công trình, đo lại từ các phòng đã đặt."""
    if not rooms:
        return (0.0, 0.0, request.site_width_m, request.site_depth_m)
    return (
        min(r.x0_m for r in rooms),
        min(r.y0_m for r in rooms),
        max(r.x1_m for r in rooms),
        max(r.y1_m for r in rooms),
    )


def _check_dimension(by_predicate, room, add, groups) -> None:
    rule = _best_rule(
        [r for r in by_predicate.get("min_dimension", []) if r.scope in ("floor", "building")],
        room,
        groups,
    )
    if rule is None:
        return
    required = float(rule.params.get("value_m", 0.0))
    smallest = min(room.x1_m - room.x0_m, room.y1_m - room.y0_m)
    if smallest + _EPS < required:
        add(rule, (room.id,), _num(smallest, 2), _num(required, 2))


def _check_area(by_predicate, room, add, groups) -> None:
    for predicate, key, worse in (
        ("min_area", "value_m2", lambda actual, required: actual + _EPS < required),
        ("max_area", "value_m2", lambda actual, required: actual > required + _EPS),
    ):
        rule = _best_rule(
            [r for r in by_predicate.get(predicate, []) if r.scope == "floor"], room, groups
        )
        if rule is None:
            continue
        required = float(rule.params.get(key, 0.0))
        if worse(room.area_m2, required):
            add(rule, (room.id,), _num(room.area_m2, 1), _num(required, 1))


def _check_aspect(by_predicate, room, add, groups) -> None:
    rule = _best_rule(
        [r for r in by_predicate.get("aspect_ratio_max", []) if r.scope == "floor"], room, groups
    )
    if rule is None:
        return
    required = float(rule.params.get("value", 0.0))
    width = room.x1_m - room.x0_m
    depth = room.y1_m - room.y0_m
    if min(width, depth) <= _EPS:
        return
    ratio = max(width, depth) / min(width, depth)
    if ratio > required + 1e-6:
        add(rule, (room.id,), _num(ratio, 2), _num(required, 2))


def _check_daylight(by_predicate, request, room, voids, footprint, add) -> None:
    groups = request.room_groups
    rule = _best_rule(
        [r for r in by_predicate.get("requires_daylight", []) if r.scope == "floor"], room, groups
    )
    if rule is None:
        return
    if _faces(room, footprint) & set(request.open_faces):
        return
    if any(v.floor == room.floor and _touch(room, v) for v in voids):
        return
    add(rule, (room.id,), None, None)


def _check_access(by_predicate, request, room, rooms, footprint, add) -> None:
    from design_compute.solver.model import CIRCULATION_TYPES

    if room.type in CIRCULATION_TYPES:
        return
    rule = _best_rule(
        [r for r in by_predicate.get("requires_access", []) if r.scope == "floor"],
        room,
        request.room_groups,
    )
    if rule is None:
        return
    if room.floor == 1 and _faces(room, footprint) & set(request.access_faces):
        return
    for other in rooms:
        if other.floor != room.floor or other.type not in CIRCULATION_TYPES:
            continue
        if _touch(room, other):
            return
    add(rule, (room.id,), None, None)


def _check_void_area(by_predicate, void, add) -> None:
    """Cận trên của khoảng rỗng, tra theo LOẠI của nó (`lightwell`, `courtyard`, `atrium`).

    Khoảng rỗng không phải phòng nên nó không đi qua `_check_area`, và trước 06/09/2026 đó
    là lý do một giếng trời 37 m² không xuất hiện trong bất kỳ danh sách vi phạm nào.
    """
    for rule in by_predicate.get("max_area", []):
        if rule.scope != "floor" or rule.params.get("target") != void.kind:
            continue
        required = float(rule.params.get("value_m2", 0.0))
        actual = (void.x1_m - void.x0_m) * (void.y1_m - void.y0_m)
        if actual > required + _EPS:
            add(rule, (void.id,), _num(actual), _num(required))
        return


def _check_face(by_predicate, request, room, footprint, add) -> None:
    """Phòng phải tiếp giáp một MẶT cụ thể của hình bao — mặt vào được, hoặc mặt thoáng.

    Khác `requires_daylight` ở đúng một điểm và điểm đó là toàn bộ lý do vị từ này tồn tại:
    không có phương án thay thế. Chiếu sáng chấp nhận giếng trời; còn một chỗ để xe lấy sáng
    qua giếng trời vẫn là chỗ để xe mà ô tô không vào được, và một ban công bốn phía là tường
    vẫn không phải ban công.
    """
    rule = _best_rule(
        [r for r in by_predicate.get("requires_face", []) if r.scope == "floor"],
        room,
        request.room_groups,
    )
    if rule is None:
        return
    which = str(rule.params.get("face", "open"))
    wanted = set(request.access_faces if which == "access" else request.open_faces)
    # Mặt vào được chỉ có nghĩa ở tầng trệt: tầng trên không có mặt nào xe vào được, nên áp
    # quy tắc lên đó là sinh ra một vi phạm không ai sửa được.
    if which == "access" and room.floor != 1:
        return
    if _faces(room, footprint) & wanted:
        return
    add(rule, (room.id,), None, None)


def _check_floor_preference(by_predicate, request, rooms, add) -> None:
    """Phòng nào ở tầng nào là quyết định của Lớp 2 — bộ giải chỉ nói ra khi lệch ý muốn."""
    rules = [r for r in by_predicate.get("floor_preference", []) if r.scope == "building"]
    if not rules or not rooms:
        return
    top = max(r.floor for r in rooms)
    for rule in rules:
        target = rule.params.get("target")
        want = rule.params.get("value")
        for room in rooms:
            if room.type != target:
                continue
            if want == "top" and room.floor != top:
                add(rule, (room.id,), str(room.floor), "trên cùng", "floor_preference_top")
            elif want == "ground" and room.floor != 1:
                add(rule, (room.id,), str(room.floor), "trệt", "floor_preference_ground")


def _check_core_alignment(by_predicate, rooms, core_types, add) -> None:
    rules = [
        r
        for r in by_predicate.get("aligned_across_floors", [])
        if r.params.get("target") in ("core", "stair")
    ]
    if not rules:
        return
    cores = sorted((r for r in rooms if r.type in core_types), key=lambda r: (r.floor, r.id))
    if len(cores) < 2:
        return
    first = cores[0]
    for other in cores[1:]:
        drift = max(
            abs(other.x0_m - first.x0_m),
            abs(other.x1_m - first.x1_m),
            abs(other.y0_m - first.y0_m),
            abs(other.y1_m - first.y1_m),
        )
        tolerance = float(rules[0].params.get("tolerance_m", 0.0))
        if drift > tolerance + _EPS:
            add(rules[0], (first.id, other.id), _num(drift, 2), _num(tolerance, 2))


def _check_adjacency_rules(by_predicate, rooms, add) -> None:
    for rule in by_predicate.get("adjacency", []):
        type_a = rule.params.get("a")
        type_b = rule.params.get("b")
        kind = rule.params.get("kind")
        if not type_a or not type_b or kind not in ("adjacent", "near", "separate"):
            continue
        for room_a in rooms:
            if room_a.type != type_a:
                continue
            for room_b in rooms:
                if room_b.type != type_b or room_b.id == room_a.id:
                    continue
                if rule.scope == "floor" and room_a.floor != room_b.floor:
                    continue
                same_floor = room_a.floor == room_b.floor
                touching = same_floor and _touch(room_a, room_b)
                if kind == "adjacent" and same_floor and not touching:
                    add(rule, (room_a.id, room_b.id), None, None, "adjacency_adjacent")
                elif kind == "separate" and touching:
                    add(rule, (room_a.id, room_b.id), None, None, "adjacency_separate")


def _check_setbacks(request, footprint, setbacks_m, add) -> None:
    fx0, fy0, fx1, fy1 = footprint
    actual = {
        "left": fx0,
        "right": request.site_width_m - fx1,
        "front": fy0,
        "back": request.site_depth_m - fy1,
    }
    for side, (required, rule) in setbacks_m(request).items():
        if rule is None or required <= 0:
            continue
        if actual[side] + _EPS < required:
            add(rule, (side,), _num(actual[side], 2), _num(required, 2))


def _check_density(request, footprint, max_density, add) -> None:
    value, rule = max_density(request)
    if rule is None:
        return
    fx0, fy0, fx1, fy1 = footprint
    built = (fx1 - fx0) * (fy1 - fy0)
    lot = request.lot_area_m2
    if lot <= 0:
        return
    ratio = built / lot
    if ratio > value + 1e-6:
        add(rule, ("footprint",), _num(ratio, 2), _num(value, 2))


def _check_module(by_predicate, rooms, add) -> None:
    """Kích thước là bội số của module xây dựng.

    Bộ giải làm việc bằng số module nguyên nên điều này đúng theo cấu trúc. Vẫn kiểm, vì cùng
    hàm này sẽ nhận hình học do NGƯỜI kéo tay trong trình chỉnh sửa — ở đó nó không còn hiển
    nhiên nữa.
    """
    rules = [r for r in by_predicate.get("module_multiple", []) if r.params.get("value_m")]
    if not rules:
        return
    rule = rules[0]
    module_m = float(rule.params["value_m"])
    if module_m <= 0:
        return
    for room in rooms:
        for value in (room.x0_m, room.x1_m, room.y0_m, room.y1_m):
            steps = value / module_m
            if abs(steps - round(steps)) > 1e-6:
                add(rule, (room.id,), _num(value, 3), _num(module_m, 3))
                break
