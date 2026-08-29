"""Mô hình CP-SAT liên tầng cho nhà phố (nha_pho).

Hình dạng mô hình
-----------------
Nhà phố là một cánh nhà lấp kín lô đất, nên phần đặt khối gần như không có gì và phần đáng
kể là cây chia không gian. Theo `doc/design/04-layer3-floorplan.md` mục 4.2, dải lõi được
quyết định trước, phần còn lại cắt đệ quy.

Mọi tầng dùng CHUNG ba đường cắt định vị lõi::

    root  --H(a)-->  MẶT TIỀN = [0,W] x [0,a]      vùng riêng của từng tầng
                     phần còn lại
    còn lại --H(b)--> DẢI LÕI = [0,W] x [a,b]      dải dùng chung
                      PHÍA SAU = [0,W] x [b,D]     vùng riêng của từng tầng
    DẢI LÕI --V(c)--> LÕI = [0,c] x [a,b]          thang + WC + hộp kỹ thuật, DÙNG CHUNG
                      GIỮA = [c,W] x [a,b]         vùng riêng của từng tầng

`a`, `b` và `c` là BA BIẾN DUY NHẤT, mọi tầng dùng lại. Đó chính là thứ làm lõi thang và
trục tường chịu lực thẳng hàng giữa các tầng, và cũng là lý do thêm tầng thứ năm chỉ là thêm
một khối biến chứ không phải thiết kế lại.

MẶT TIỀN, GIỮA và PHÍA SAU sau đó được cắt tiếp theo từng tầng để ra các phòng của tầng đó.

Vì sao dùng cây thay vì danh sách hình chữ nhật
-----------------------------------------------
Cắt đệ quy KHÔNG THỂ sinh khe hở hay chồng lấn — đó là tính chất của cấu trúc dữ liệu, không
phải thứ một phép kiểm tra phải bắt lại về sau.

Hệ quả của việc dùng chung ba đường cắt
----------------------------------------
Vì `a`, `b`, `c` dùng chung nên mỗi vùng có CÙNG TỔNG DIỆN TÍCH ở mọi tầng. Với nhà phố thì
đó là ĐÚNG chứ không phải hạn chế: ba đường cắt đó là tuyến tường chịu lực chạy suốt chiều
cao nhà. Cái thay đổi theo tầng là cách chia nhỏ trong vùng, không phải độ lớn của vùng.

Nhưng nó có ràng buộc chương trình không gian: hai phòng chiếm trọn cùng một vùng ở hai tầng
khác nhau phải có khoảng diện tích giao nhau. Không giao nhau thì mô hình vô nghiệm thật, và
nó nói ra điều đó (vướng mắc V-5).

Vị từ đã mã hoá tới lúc này
----------------------------
`min_dimension`, `min_area`, `max_area` (lấy từ chương trình không gian) và
`aligned_across_floors` (theo cấu trúc, nhờ ba đường cắt dùng chung). `module_multiple` đúng
theo cấu trúc vì bộ giải làm việc bằng số module nguyên.

CHƯA mã hoá: `requires_daylight`, `requires_access`, `adjacency`, `floor_preference`,
`aspect_ratio_max`, `setback`, `max_density`. Quy tắc dùng những vị từ này vẫn nạp và kiểm
được nhưng chưa ràng buộc mô hình — chúng thuộc Mốc 5, không thuộc phép kiểm rủi ro Mốc 0.2.

Giải thích khi vô nghiệm
------------------------
Mỗi ràng buộc cứng được đặt dưới một BIẾN GIẢ ĐỊNH. Khi mô hình vô nghiệm, bộ giải trả về
một tập biến giả định mâu thuẫn, ánh xạ thẳng ngược ra mã quy tắc. Đó là toàn bộ lý do chọn
CP-SAT thay vì một bộ tối ưu số học, và là thứ biến "không có lời giải" thành "ba yêu cầu
này không thể cùng đúng".

Một điểm phát hiện khi đo: OR-Tools trả về tập ĐỦ, không phải tập NHỎ NHẤT — trên một đầu bài
thật nó trả về khoảng bốn mươi mục, tức một bức tường chữ chứ không phải lời giải thích.
`_minimise_conflict` bên dưới thu hẹp lại bằng bộ lọc xoá dần trước khi tới người đọc.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Literal

from ortools.sat.python import cp_model

from design_compute.rules.model import Rule, RulePack, Severity
from design_compute.solver.units import (
    m2_to_units2_ceil,
    m_to_units,
    m_to_units_ceil,
    units_to_m,
    units_to_m2,
)

Zone = Literal["front", "mid", "rear"]


@dataclass(frozen=True, slots=True)
class RoomSpec:
    """Một phòng bộ giải phải đặt, lấy từ chương trình không gian."""

    id: str
    type: str
    floor: int
    zone: Zone
    target_area_m2: float
    min_area_m2: float | None = None
    max_area_m2: float | None = None
    needs_daylight: bool = False


@dataclass(frozen=True, slots=True)
class SolveRequest:
    """Toàn bộ thứ bộ giải cần. Không trạng thái toàn cục, không tác dụng phụ."""

    site_width_m: float
    site_depth_m: float
    floors: int
    rooms: tuple[RoomSpec, ...]
    rule_pack: RulePack
    building_type: str = "nha_pho"
    core_min_width_m: float = 2.2
    core_min_depth_m: float = 2.6
    time_limit_s: float = 60.0
    # Hạng `standard-1` của Cloudflare Container có ~0,5 vCPU nên chỉ một luồng tìm kiếm.
    # Nâng hạng instance mới là thứ gỡ được giới hạn này, không phải sửa mã.
    num_search_workers: int = 1


@dataclass(frozen=True, slots=True)
class PlacedRoom:
    id: str
    type: str
    floor: int
    x0_m: float
    y0_m: float
    x1_m: float
    y1_m: float
    area_m2: float

    @property
    def polygon(self) -> list[list[float]]:
        """Danh sách đỉnh theo chiều kim đồng hồ, KHÔNG lặp đỉnh đầu ở cuối."""
        return [
            [self.x0_m, self.y0_m],
            [self.x1_m, self.y0_m],
            [self.x1_m, self.y1_m],
            [self.x0_m, self.y1_m],
        ]


@dataclass(frozen=True, slots=True)
class ConflictEntry:
    rule_id: str
    involved: tuple[str, ...]
    source: str
    is_legal: bool


@dataclass(slots=True)
class SolveResult:
    """Hoặc một mặt bằng, hoặc lời giải thích vì sao không có mặt bằng nào."""

    status: Literal["pass", "warning", "infeasible", "unknown"]
    solve_time_s: float
    rule_pack_version: str
    rooms: list[PlacedRoom] = field(default_factory=list)
    core: dict[str, Any] | None = None
    structural_axes_x_m: list[float] = field(default_factory=list)
    structural_axes_y_m: list[float] = field(default_factory=list)
    conflict_set: list[ConflictEntry] = field(default_factory=list)
    violations: list[dict[str, Any]] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


# --------------------------------------------------------------------------------------
# Đọc ngưỡng từ rule pack. Không dòng nào bên dưới hard-code một con số quy chuẩn.
# --------------------------------------------------------------------------------------


def _rules_for(pack: RulePack, building_type: str, predicate: str) -> list[Rule]:
    return [
        r
        for r in pack.for_building_type(building_type)
        if r.predicate == predicate and r.scope in ("floor", "building")
    ]


def _threshold_for_target(rules: list[Rule], target: str, key: str) -> tuple[float, Rule] | None:
    """Tìm quy tắc có `target` khớp, ưu tiên quy tắc cụ thể hơn.

    Quy tắc nhắm `bedroom` thắng quy tắc nhắm `habitable`, và quy tắc đó thắng `all`.
    """
    generic = {"all", "habitable"}
    specific = [r for r in rules if r.params.get("target") == target]
    fallback = [r for r in rules if r.params.get("target") in generic]
    for candidate in (*specific, *fallback):
        value = candidate.params.get(key)
        if value is not None:
            return float(value), candidate
    return None


# --------------------------------------------------------------------------------------
# Dựng mô hình
# --------------------------------------------------------------------------------------


class _Builder:
    def __init__(self, request: SolveRequest) -> None:
        self.req = request
        self.m = cp_model.CpModel()
        self.W = m_to_units(request.site_width_m)
        self.D = m_to_units(request.site_depth_m)
        # biến giả định -> quy tắc và danh sách phòng sinh ra nó
        self.assumptions: dict[cp_model.IntVar, ConflictEntry] = {}
        self.room_vars: dict[str, dict[str, cp_model.IntVar]] = {}
        self.soft_terms: list[cp_model.IntVar] = []
        self._pack_rules = request.rule_pack.for_building_type(request.building_type)

    # -- hàm trợ giúp ------------------------------------------------------------------

    def _assume(self, entry: ConflictEntry) -> cp_model.IntVar:
        """Tạo một biến giả định cho MỘT lần áp dụng của một ràng buộc cứng."""
        lit = self.m.NewBoolVar(f"assume::{entry.rule_id}::{'+'.join(entry.involved)}")
        self.assumptions[lit] = entry
        return lit

    def _rect(self, name: str, x0, x1, y0, y1) -> dict[str, cp_model.IntVar]:
        """Suy ra biến rộng, cao và diện tích cho một hình chữ nhật.

        Toạ độ SUY RA từ vị trí các đường cắt, không bao giờ khai độc lập. Đó chính là lý do
        không thể có chồng lấn.
        """
        w = self.m.NewIntVar(0, self.W, f"{name}.w")
        h = self.m.NewIntVar(0, self.D, f"{name}.h")
        self.m.Add(w == x1 - x0)
        self.m.Add(h == y1 - y0)
        area = self.m.NewIntVar(0, self.W * self.D, f"{name}.area")
        self.m.AddMultiplicationEquality(area, [w, h])
        return {"x0": x0, "x1": x1, "y0": y0, "y1": y1, "w": w, "h": h, "area": area}

    # -- ràng buộc lấy từ rule pack ----------------------------------------------------

    def _apply_dimension_rules(self, room: RoomSpec, rect: dict[str, cp_model.IntVar]) -> None:
        min_dim = _threshold_for_target(
            _rules_for(self.req.rule_pack, self.req.building_type, "min_dimension"),
            room.type,
            "value_m",
        )
        if min_dim is not None:
            value_m, rule = min_dim
            units = m_to_units_ceil(value_m)
            entry = ConflictEntry(rule.id, (room.id,), rule.source, rule.is_legal)
            if rule.severity is Severity.ERROR:
                lit = self._assume(entry)
                self.m.Add(rect["w"] >= units).OnlyEnforceIf(lit)
                self.m.Add(rect["h"] >= units).OnlyEnforceIf(lit)
            else:
                self._soft_min(rect["w"], units, f"{room.id}.w")
                self._soft_min(rect["h"], units, f"{room.id}.h")

    def _apply_area_rules(self, room: RoomSpec, rect: dict[str, cp_model.IntVar]) -> None:
        # Cận trên/dưới của chính chương trình không gian là ràng buộc CỨNG: chúng đến từ đầu
        # bài chứ không từ quy chuẩn, nhưng một phòng nằm ngoài khoảng đó không còn là phòng
        # mà khách yêu cầu nữa.
        if room.min_area_m2 is not None:
            entry = ConflictEntry(
                f"program:min_area:{room.id}", (room.id,), "Space Program", False
            )
            lit = self._assume(entry)
            self.m.Add(rect["area"] >= m2_to_units2_ceil(room.min_area_m2)).OnlyEnforceIf(lit)
        if room.max_area_m2 is not None:
            entry = ConflictEntry(
                f"program:max_area:{room.id}", (room.id,), "Space Program", False
            )
            lit = self._assume(entry)
            self.m.Add(rect["area"] <= m2_to_units2_ceil(room.max_area_m2)).OnlyEnforceIf(lit)

        min_area = _threshold_for_target(
            _rules_for(self.req.rule_pack, self.req.building_type, "min_area"),
            room.type,
            "value_m2",
        )
        if min_area is not None:
            value_m2, rule = min_area
            units2 = m2_to_units2_ceil(value_m2)
            entry = ConflictEntry(rule.id, (room.id,), rule.source, rule.is_legal)
            if rule.severity is Severity.ERROR:
                lit = self._assume(entry)
                self.m.Add(rect["area"] >= units2).OnlyEnforceIf(lit)
            else:
                self._soft_min(rect["area"], units2, f"{room.id}.area")

    def _soft_min(self, var: cp_model.IntVar, minimum: int, label: str) -> None:
        """Ngưỡng ở mức cảnh báo trở thành một khoản phạt, không phải ràng buộc cứng."""
        shortfall = self.m.NewIntVar(0, minimum, f"soft::{label}")
        self.m.Add(shortfall >= minimum - var)
        self.soft_terms.append(shortfall)

    def _add_area_deviation(self, room: RoomSpec, rect: dict[str, cp_model.IntVar]) -> None:
        """Thành phần hàm mục tiêu: giữ mỗi phòng gần diện tích mong muốn."""
        target = m2_to_units2_ceil(room.target_area_m2)
        dev = self.m.NewIntVar(0, self.W * self.D, f"dev::{room.id}")
        self.m.AddAbsEquality(dev, rect["area"] - target)
        self.soft_terms.append(dev)

    # -- cây chia không gian -----------------------------------------------------------

    def build(self) -> None:
        req = self.req
        core_w = m_to_units_ceil(req.core_min_width_m)
        core_d = m_to_units_ceil(req.core_min_depth_m)

        # Ba đường cắt dùng chung. Chính ba biến này buộc các tầng lại với nhau.
        a = self.m.NewIntVar(0, self.D, "shared::front_cut_y")
        b = self.m.NewIntVar(0, self.D, "shared::core_cut_y")
        c = self.m.NewIntVar(0, self.W, "shared::core_cut_x")
        self.m.Add(a <= b)

        # Lõi phải đủ chỗ cho thang, WC và hộp kỹ thuật. Ràng buộc này cũng đặt dưới biến giả
        # định, nhờ đó "lõi không đủ chỗ" là một kết quả GIẢI THÍCH ĐƯỢC.
        core_rule_id = "core_min_footprint"
        stair_rules = [
            r
            for r in self._pack_rules
            if r.predicate == "min_dimension" and r.params.get("target") == "stair"
        ]
        stair_source = stair_rules[0].source if stair_rules else "kinh nghiệm NVG"
        stair_legal = stair_rules[0].is_legal if stair_rules else False
        lit_core_w = self._assume(
            ConflictEntry(core_rule_id, ("core",), stair_source, stair_legal)
        )
        self.m.Add(c >= core_w).OnlyEnforceIf(lit_core_w)
        self.m.Add(b - a >= core_d).OnlyEnforceIf(lit_core_w)

        # Chừa chỗ cho hai vùng nằm hai phía của dải lõi.
        self.m.Add(c <= self.W)
        self.m.Add(b <= self.D)

        self.core_vars = {"a": a, "b": b, "c": c}

        rooms_by_floor: dict[int, list[RoomSpec]] = {}
        for room in req.rooms:
            rooms_by_floor.setdefault(room.floor, []).append(room)

        for level in range(1, req.floors + 1):
            self._build_floor(level, rooms_by_floor.get(level, []), a, b, c)

        if self.soft_terms:
            self.m.Minimize(sum(self.soft_terms))

    def _build_floor(
        self,
        level: int,
        rooms: list[RoomSpec],
        a: cp_model.IntVar,
        b: cp_model.IntVar,
        c: cp_model.IntVar,
    ) -> None:
        """Cắt ba vùng riêng của tầng thành các phòng được phân cho tầng đó."""
        zero = self.m.NewConstant(0)
        w_max = self.m.NewConstant(self.W)
        d_max = self.m.NewConstant(self.D)

        zones = {
            "front": (zero, w_max, zero, a),
            "mid": (c, w_max, a, b),
            "rear": (zero, w_max, b, d_max),
        }

        for zone_name, (x0, x1, y0, y1) in zones.items():
            zone_rooms = [r for r in rooms if r.zone == zone_name]
            if not zone_rooms:
                continue
            self._cut_zone(level, zone_name, zone_rooms, x0, x1, y0, y1)

    def _cut_zone(
        self,
        level: int,
        zone: str,
        rooms: list[RoomSpec],
        x0: cp_model.IntVar,
        x1: cp_model.IntVar,
        y0: cp_model.IntVar,
        y1: cp_model.IntVar,
    ) -> None:
        """Chia một vùng thành `len(rooms)` phòng bằng các lát cắt ngang, đệ quy.

        Một phòng thì lấp trọn vùng; nhiều phòng thì sinh thêm biến cắt riêng của tầng. Các
        đường cắt được sắp thứ tự nên dải được lấp KÍN CHÍNH XÁC — không hở, không chồng lấn,
        theo cấu trúc chứ không theo phép kiểm tra.
        """
        n = len(rooms)
        if n == 1:
            self._place(rooms[0], x0, x1, y0, y1)
            return

        cuts: list[cp_model.IntVar] = [y0]
        for i in range(n - 1):
            cut = self.m.NewIntVar(0, self.D, f"cut::L{level}::{zone}::{i}")
            self.m.Add(cut >= cuts[-1])
            cuts.append(cut)
        cuts.append(y1)
        self.m.Add(cuts[-2] <= y1)

        for room, top, bottom in zip(rooms, cuts[:-1], cuts[1:], strict=True):
            self._place(room, x0, x1, top, bottom)

    def _place(self, room: RoomSpec, x0, x1, y0, y1) -> None:
        rect = self._rect(f"L{room.floor}::{room.id}", x0, x1, y0, y1)
        self.room_vars[room.id] = rect
        self._apply_dimension_rules(room, rect)
        self._apply_area_rules(room, rect)
        self._add_area_deviation(room, rect)


# --------------------------------------------------------------------------------------
# Giải
# --------------------------------------------------------------------------------------


def _resolve_conflict_entries(
    solver: cp_model.CpSolver, assumptions: dict[cp_model.IntVar, ConflictEntry]
) -> list[cp_model.IntVar]:
    """Ánh xạ câu trả lời của bộ giải ngược về các biến giả định của mình.

    Tuỳ phiên bản OR-Tools, hàm này trả về chính các biến hoặc chỉ số biến — nên xử lý cả hai
    thay vì âm thầm cho ra tập mâu thuẫn RỖNG. Tập rỗng sẽ được đọc thành "không có lời giải
    thích", đúng cái điều mà tính năng này sinh ra để tránh.
    """
    raw = list(solver.SufficientAssumptionsForInfeasibility())
    if not raw:
        return []
    if isinstance(raw[0], int):
        by_index = {lit.Index(): lit for lit in assumptions}
        return [by_index[i] for i in raw if i in by_index]
    return [lit for lit in raw if lit in assumptions]


def _minimise_conflict(
    model: cp_model.CpModel,
    candidates: list[cp_model.IntVar],
    request: SolveRequest,
    budget_s: float,
) -> list[cp_model.IntVar]:
    """Thu hẹp một tập mâu thuẫn ĐỦ về phía tập nhỏ nhất.

    Bộ lọc xoá dần: bỏ một biến giả định rồi giải lại. Nếu không có nó mà mô hình vẫn vô
    nghiệm thì biến đó không thuộc mâu thuẫn thật.

    Đáng số lần giải thêm. Danh sách bốn mươi mục không nói được gì cho kiến trúc sư; ba mục
    nói đúng những yêu cầu nào phải đánh đổi — đó là toàn bộ ý nghĩa của phân tích tác động.
    Giải lại một mô hình vô nghiệm rất rẻ: đo được dưới một mili giây.

    Có hạn `budget_s`: hết ngân sách thì trả về tập đã thu hẹp một phần — vẫn nhỏ hơn tập thô
    và không bao giờ sai, chỉ là chưa gọn hết.
    """
    core = list(candidates)
    deadline = time.monotonic() + budget_s

    for candidate in list(core):
        if time.monotonic() > deadline or len(core) <= 1:
            break
        trial = [lit for lit in core if lit is not candidate]

        probe = cp_model.CpSolver()
        probe.parameters.max_time_in_seconds = min(2.0, max(0.1, deadline - time.monotonic()))
        probe.parameters.num_search_workers = request.num_search_workers

        model.ClearAssumptions()
        model.AddAssumptions(trial)
        if probe.Solve(model) == cp_model.INFEASIBLE:
            # Bỏ nó ra vẫn mâu thuẫn, nghĩa là nó không thuộc mâu thuẫn thật.
            core = trial

    model.ClearAssumptions()
    return core


def solve_townhouse(request: SolveRequest) -> SolveResult:
    """Giải MỌI TẦNG của một nhà phố trong cùng một mô hình.

    Trả về mặt bằng đã đặt phòng, hoặc — cũng hữu ích không kém — tập yêu cầu nhỏ nhất không
    thể cùng đúng. Vô nghiệm là một kết quả hợp lệ, không phải lỗi.
    """
    builder = _Builder(request)
    builder.build()

    model = builder.m
    model.AddAssumptions(list(builder.assumptions))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = request.time_limit_s
    solver.parameters.num_search_workers = request.num_search_workers

    started = time.monotonic()
    status = solver.Solve(model)
    elapsed = time.monotonic() - started

    version = request.rule_pack.version

    if status == cp_model.INFEASIBLE:
        literals = _resolve_conflict_entries(solver, builder.assumptions)
        reduced = _minimise_conflict(
            model, literals, request, budget_s=min(10.0, request.time_limit_s)
        )
        notes: list[str] = []
        if literals and not reduced:
            notes.append(
                "bộ giải không thu hẹp được tập ràng buộc mâu thuẫn, trả về tập đầy đủ"
            )
            reduced = literals
        return SolveResult(
            status="infeasible",
            solve_time_s=time.monotonic() - started,
            rule_pack_version=version,
            conflict_set=[builder.assumptions[lit] for lit in reduced],
            notes=notes,
        )

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return SolveResult(
            status="unknown",
            solve_time_s=elapsed,
            rule_pack_version=version,
            notes=[f"solver status {solver.StatusName(status)}"],
        )

    placed: list[PlacedRoom] = []
    for room in request.rooms:
        rect = builder.room_vars.get(room.id)
        if rect is None:
            continue
        placed.append(
            PlacedRoom(
                id=room.id,
                type=room.type,
                floor=room.floor,
                x0_m=units_to_m(solver.Value(rect["x0"])),
                y0_m=units_to_m(solver.Value(rect["y0"])),
                x1_m=units_to_m(solver.Value(rect["x1"])),
                y1_m=units_to_m(solver.Value(rect["y1"])),
                area_m2=units_to_m2(solver.Value(rect["area"])),
            )
        )

    a = solver.Value(builder.core_vars["a"])
    b = solver.Value(builder.core_vars["b"])
    c = solver.Value(builder.core_vars["c"])

    return SolveResult(
        # Hết giờ vẫn trả về phương án tốt nhất tìm được, gắn mức cảnh báo để không ai nhầm
        # nó với một nghiệm đã chứng minh tối ưu.
        status="pass" if status == cp_model.OPTIMAL else "warning",
        solve_time_s=elapsed,
        rule_pack_version=version,
        rooms=placed,
        core={
            "polygon": [
                [0.0, units_to_m(a)],
                [units_to_m(c), units_to_m(a)],
                [units_to_m(c), units_to_m(b)],
                [0.0, units_to_m(b)],
            ],
            "levels": list(range(1, request.floors + 1)),
        },
        structural_axes_x_m=[0.0, units_to_m(c), request.site_width_m],
        structural_axes_y_m=[0.0, units_to_m(a), units_to_m(b), request.site_depth_m],
        notes=[] if status == cp_model.OPTIMAL else ["hết thời gian, trả nghiệm tốt nhất tìm được"],
    )
