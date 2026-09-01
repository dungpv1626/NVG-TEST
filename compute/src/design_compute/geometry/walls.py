"""Lớp 3c — đọc tường và lỗ mở ra từ các đa giác phòng đã giải.

Nguồn: `doc/design/04-layer3-floorplan.md` mục 4.5.

Không có bước tối ưu nào ở đây. Nghiệm đã có, phần này chỉ dịch từ "các ô chữ nhật lấp kín mặt
sàn" sang "tường và cửa" — ngữ nghĩa mà IFC, tệp CAD và mô hình ba chiều đều cần
(`02-architecture.md` mục 2.7b: `IfcWall`, `IfcDoor`, `IfcWindow`).

Hai điểm đáng ghi lại vì chúng quyết định bản vẽ có đọc được không:

  · **Tường là đoạn thẳng đã GỘP, không phải bốn cạnh của từng ô.** Ba phòng xếp dọc chung một
    tuyến tường thì đó là MỘT bức tường chạy suốt, không phải ba đoạn rời. Không gộp thì bản vẽ
    có ba đoạn chồng mép nhau, và mọi phép đếm vật tư sau này đếm ba lần.
  · **Cửa đặt vào tường CHUNG giữa phòng và không gian giao thông.** Không có đoạn tường chung
    thì không đặt cửa — và phòng đó đã bị `every_room_requires_access` chặn từ trước, nên ở đây
    không cần đoán bù.

Bề dày tường và kích thước cửa lấy từ `kb/construction_norms.yaml`; không con số nào nằm trong
tệp này.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Literal

from design_compute.geometry.norms import ConstructionNorms

EPS = 1e-9

Orientation = Literal["horizontal", "vertical"]


@dataclass(frozen=True, slots=True)
class Cell:
    """Một ô đã đặt trên mặt bằng: phòng hoặc khoảng rỗng."""

    id: str
    type: str
    x0: float
    y0: float
    x1: float
    y1: float
    is_void: bool = False


@dataclass(frozen=True, slots=True)
class Wall:
    id: str
    a: tuple[float, float]
    b: tuple[float, float]
    thickness_m: float
    load_bearing: bool

    @property
    def orientation(self) -> Orientation:
        return "vertical" if abs(self.a[0] - self.b[0]) < EPS else "horizontal"

    @property
    def length_m(self) -> float:
        return abs(self.b[0] - self.a[0]) + abs(self.b[1] - self.a[1])


@dataclass(frozen=True, slots=True)
class Opening:
    id: str
    wall: str
    kind: Literal["door", "window", "opening"]
    offset_m: float
    width_m: float
    height_m: float | None = None
    sill_m: float | None = None


def _merge(intervals: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Gộp các khoảng chồng lấn hoặc chạm đầu nhau thành khoảng lớn nhất."""
    if not intervals:
        return []
    ordered = sorted(intervals)
    merged = [ordered[0]]
    for lo, hi in ordered[1:]:
        last_lo, last_hi = merged[-1]
        if lo <= last_hi + EPS:
            merged[-1] = (last_lo, max(last_hi, hi))
        else:
            merged.append((lo, hi))
    return merged


def _round(value: float) -> float:
    """Về milimét. Toạ độ từ bộ giải là bội của module nên đây chỉ là chống trôi số thực."""
    return round(value + 0.0, 6)


def build_walls_and_openings(
    cells: Iterable[Cell],
    *,
    level: int,
    footprint: tuple[float, float, float, float],
    structural_x: Iterable[float],
    structural_y: Iterable[float],
    open_faces: Iterable[str],
    access_faces: Iterable[str],
    circulation_types: Iterable[str],
    norms: ConstructionNorms,
) -> tuple[list[Wall], list[Opening]]:
    """Tường và lỗ mở của MỘT tầng."""
    items = list(cells)
    fx0, fy0, fx1, fy1 = footprint
    axes_x = {round(v, 6) for v in structural_x}
    axes_y = {round(v, 6) for v in structural_y}
    circulation = set(circulation_types)
    faces_open = set(open_faces)
    faces_access = set(access_faces)

    vertical: dict[float, list[tuple[float, float]]] = {}
    horizontal: dict[float, list[tuple[float, float]]] = {}
    for cell in items:
        vertical.setdefault(_round(cell.x0), []).append((cell.y0, cell.y1))
        vertical.setdefault(_round(cell.x1), []).append((cell.y0, cell.y1))
        horizontal.setdefault(_round(cell.y0), []).append((cell.x0, cell.x1))
        horizontal.setdefault(_round(cell.y1), []).append((cell.x0, cell.x1))

    walls: list[Wall] = []
    index = 0

    def add(a: tuple[float, float], b: tuple[float, float], exterior: bool, structural: bool):
        nonlocal index
        index += 1
        thickness = (
            norms.exterior_m
            if exterior
            else norms.load_bearing_m
            if structural
            else norms.partition_m
        )
        walls.append(
            Wall(
                id=f"W{level}-{index:02d}",
                a=a,
                b=b,
                thickness_m=thickness,
                load_bearing=exterior or structural,
            )
        )

    for x, spans in sorted(vertical.items()):
        exterior = abs(x - fx0) < EPS or abs(x - fx1) < EPS
        for y0, y1 in _merge(spans):
            add((x, _round(y0)), (x, _round(y1)), exterior, x in axes_x)
    for y, spans in sorted(horizontal.items()):
        exterior = abs(y - fy0) < EPS or abs(y - fy1) < EPS
        for x0, x1 in _merge(spans):
            add((_round(x0), y), (_round(x1), y), exterior, y in axes_y)

    openings = _place_openings(
        items,
        walls,
        level=level,
        footprint=footprint,
        faces_open=faces_open,
        faces_access=faces_access,
        circulation=circulation,
        norms=norms,
    )
    return walls, openings


def _overlap(a0: float, a1: float, b0: float, b1: float) -> tuple[float, float] | None:
    lo, hi = max(a0, b0), min(a1, b1)
    return (lo, hi) if hi - lo > EPS else None


def _shared_edge(a: Cell, b: Cell) -> tuple[Orientation, float, float, float] | None:
    """Đoạn biên chung giữa hai ô: (phương, toạ độ tuyến, đầu, cuối). `None` nếu không chạm."""
    if abs(a.y1 - b.y0) < EPS or abs(b.y1 - a.y0) < EPS:
        span = _overlap(a.x0, a.x1, b.x0, b.x1)
        if span:
            line = a.y1 if abs(a.y1 - b.y0) < EPS else a.y0
            return ("horizontal", line, span[0], span[1])
    if abs(a.x1 - b.x0) < EPS or abs(b.x1 - a.x0) < EPS:
        span = _overlap(a.y0, a.y1, b.y0, b.y1)
        if span:
            line = a.x1 if abs(a.x1 - b.x0) < EPS else a.x0
            return ("vertical", line, span[0], span[1])
    return None


def _wall_for(
    walls: list[Wall], orientation: Orientation, line: float, start: float, end: float
) -> Wall | None:
    """Bức tường chứa trọn đoạn biên đó."""
    for wall in walls:
        if wall.orientation != orientation:
            continue
        if orientation == "vertical":
            if abs(wall.a[0] - line) > EPS:
                continue
            lo, hi = sorted((wall.a[1], wall.b[1]))
        else:
            if abs(wall.a[1] - line) > EPS:
                continue
            lo, hi = sorted((wall.a[0], wall.b[0]))
        if lo - EPS <= start and end <= hi + EPS:
            return wall
    return None


def _offset_on(wall: Wall, position: float) -> float:
    origin = wall.a[1] if wall.orientation == "vertical" else wall.a[0]
    return _round(abs(position - origin))


def _place_openings(
    cells: list[Cell],
    walls: list[Wall],
    *,
    level: int,
    footprint: tuple[float, float, float, float],
    faces_open: set[str],
    faces_access: set[str],
    circulation: set[str],
    norms: ConstructionNorms,
) -> list[Opening]:
    fx0, fy0, fx1, fy1 = footprint
    openings: list[Opening] = []
    counter = 0

    def emit(wall: Wall, kind, start: float, end: float, width: float, height, sill) -> None:
        nonlocal counter
        span = end - start
        actual = min(width, max(span - 0.2, span * 0.5))
        if actual <= EPS:
            return
        centre = (start + end) / 2 - actual / 2
        counter += 1
        openings.append(
            Opening(
                id=f"O{level}-{counter:02d}",
                wall=wall.id,
                kind=kind,
                offset_m=_offset_on(wall, centre),
                width_m=_round(actual),
                height_m=height,
                sill_m=sill,
            )
        )

    rooms = [c for c in cells if not c.is_void]

    for room in rooms:
        if room.type in circulation:
            continue

        # ── Cửa đi: vào tường chung với không gian giao thông gần nhất ────────────────
        placed_door = False
        for other in rooms:
            if other.id == room.id or other.type not in circulation:
                continue
            edge = _shared_edge(room, other)
            if edge is None:
                continue
            orientation, line, start, end = edge
            wall = _wall_for(walls, orientation, line, start, end)
            if wall is None:
                continue
            emit(wall, "door", start, end, norms.door_width_m, norms.door_height_m, None)
            placed_door = True
            break

        # ── Cửa vào nhà: tầng trệt, phòng giáp mặt vào được ──────────────────────────
        if level == 1 and not placed_door:
            for face, orientation, line, start, end in _faces_of(room, footprint):
                if face not in faces_access:
                    continue
                wall = _wall_for(walls, orientation, line, start, end)
                if wall is None:
                    continue
                emit(
                    wall,
                    "door",
                    start,
                    end,
                    norms.entrance_width_m,
                    norms.entrance_height_m,
                    None,
                )
                break

        # ── Cửa sổ: mỗi mặt thoáng mà phòng tiếp giáp ────────────────────────────────
        if room.type in norms.no_window_types:
            continue
        for face, orientation, line, start, end in _faces_of(room, footprint):
            if face not in faces_open:
                continue
            wall = _wall_for(walls, orientation, line, start, end)
            if wall is None:
                continue
            width = min(norms.window_max_m, max(norms.window_min_m, (end - start) * norms.window_share))
            emit(
                wall,
                "window",
                start,
                end,
                width,
                norms.window_height_m,
                norms.window_sill_m,
            )

    return openings


def _faces_of(
    room: Cell, footprint: tuple[float, float, float, float]
) -> list[tuple[str, Orientation, float, float, float]]:
    """Cạnh nào của phòng nằm trên mặt nào của hình bao."""
    fx0, fy0, fx1, fy1 = footprint
    found: list[tuple[str, Orientation, float, float, float]] = []
    if abs(room.y0 - fy0) < EPS:
        found.append(("front", "horizontal", room.y0, room.x0, room.x1))
    if abs(room.y1 - fy1) < EPS:
        found.append(("back", "horizontal", room.y1, room.x0, room.x1))
    if abs(room.x0 - fx0) < EPS:
        found.append(("left", "vertical", room.x0, room.y0, room.y1))
    if abs(room.x1 - fx1) < EPS:
        found.append(("right", "vertical", room.x1, room.y0, room.y1))
    return found
