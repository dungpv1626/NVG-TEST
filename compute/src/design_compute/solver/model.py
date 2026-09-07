"""Mô hình CP-SAT liên tầng cho nhà ở dân dụng.

Hình dạng mô hình
-----------------
Mỗi tầng là một CÂY CHIA KHÔNG GIAN lấy nguyên văn từ `LayoutIntent` (Lớp 3a). Nút chia mang
một đường cắt ngang hoặc dọc; lá là một phòng hoặc một khoảng rỗng. Toạ độ và kích thước từng
phòng SUY RA từ các đường cắt, không bao giờ khai độc lập — đó là lý do không thể có khe hở
hay chồng lấn: tính chất của cấu trúc dữ liệu, không phải thứ một phép kiểm tra bắt lại về sau
(`doc/design/04-layer3-floorplan.md` mục 4.2).

Thẳng hàng giữa các tầng
------------------------
Đường cắt nào cũng có thể DÙNG CHUNG giữa các tầng, miễn là mọi tầng có cắt tại đúng vị trí đó
trong cây đều cắt cùng phương, và toàn bộ tổ tiên cũng vậy (`tree.aligned_cuts`). Những đường
cắt dùng chung ấy chính là tuyến tường chịu lực chạy suốt chiều cao nhà, và chúng đi thẳng vào
`structural_grid` của mặt bằng.

Đây là bản TỔNG QUÁT của ba đường cắt cố định ở mô hình Mốc 0.2. Mô hình cũ ép mọi tầng vào
đúng ba dải theo chiều sâu nên không biểu diễn được lát cắt DỌC (vướng mắc V-6) và bắt mọi
tầng có cùng diện tích theo vùng (V-5). Bản này không ép gì cả: tầng nào chia giống nhau thì
tự thẳng hàng, tầng nào chia khác thì tách ra — và chỗ tách ra được nói thẳng trong lưới trục.

Vị từ đã mã hoá
---------------
`min_dimension` · `min_area` · `max_area` · `aspect_ratio_max` · `requires_daylight` ·
`requires_access` · `requires_face` · `adjacency` · `aligned_across_floors` · `setback` ·
`max_density`.
`module_multiple` đúng theo cấu trúc vì bộ giải làm việc bằng số module nguyên.
`floor_preference` do Lớp 2 quyết định (phòng nào ở tầng nào) nên bộ giải chỉ KIỂM, xem
`evaluate.py`.

Giải thích khi vô nghiệm
------------------------
Mỗi ràng buộc cứng nằm dưới một BIẾN GIẢ ĐỊNH. Vô nghiệm thì bộ giải trả về một tập biến giả
định mâu thuẫn, ánh xạ thẳng ngược ra mã quy tắc — "ba yêu cầu này không thể cùng đúng" thay
vì "không có lời giải". Đó là toàn bộ lý do chọn CP-SAT.

Ràng buộc CẤU TRÚC không thoả (phòng ngủ nằm lọt giữa nhà nên không thể có mặt thoáng) cũng đi
qua đúng cơ chế đó: gắn một giả định rồi ép nó sai. Nhờ vậy nó xuất hiện cùng danh sách với
các mâu thuẫn số học, thay vì thành một loại lỗi thứ hai người đọc phải học riêng.

OR-Tools trả về tập ĐỦ chứ không phải tập NHỎ NHẤT — trên một đầu bài thật là khoảng bốn mươi
mục, tức một bức tường chữ. `_minimise_conflict` thu hẹp bằng bộ lọc xoá dần trước khi tới
người đọc.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Literal

from ortools.sat.python import cp_model

from design_compute.rules.model import Rule, RulePack, Severity
from design_compute.solver import tree as layout_tree
from design_compute.solver.units import (
    m2_to_units2_ceil,
    m2_to_units2_floor,
    m_to_units,
    m_to_units_ceil,
    units_to_m,
    units_to_m2,
)

Side = Literal["front", "back", "left", "right"]

SIDES: tuple[Side, ...] = ("front", "back", "left", "right")

# Không gian đóng vai trò GIAO THÔNG: phòng khác vào nhà qua chúng.
#
# Đây là sự thật về loại hình, không phải một ngưỡng quy chuẩn (ngưỡng nằm ở `rules/`). Nhưng
# nó vẫn là danh sách phải bảo trì: thêm một mã phòng giao thông mới vào
# `kb/room_vocabulary.yaml` mà quên thêm ở đây thì phòng đó không còn dẫn được lối vào cho ai,
# và vi phạm hiện ra dưới dạng "phòng chưa có lối vào" ở chỗ khác — xa nguyên nhân.
CIRCULATION_TYPES: frozenset[str] = frozenset({"circulation", "stair", "core"})

# Loại phòng tạo nên lõi thang: rect của chúng phải TRÙNG KHÍT giữa các tầng.
CORE_TYPES: frozenset[str] = frozenset({"stair", "core"})

# ── Trọng số hàm mục tiêu ──────────────────────────────────────────────────────────────
# KHÔNG phải ngưỡng quy chuẩn. Đây là tỉ giá giữa các loại "chưa hoàn hảo" khi mọi ràng buộc
# cứng đã thoả — đổi chúng làm phương án đẹp hơn hoặc xấu đi, không làm nó hợp lệ hay không.
# Diện tích tính bằng module vuông nên số lớn hơn cạnh một bậc; các trọng số dưới đây quy về
# cùng thang đó.
_W_AREA_DEVIATION = 1
# Vượt cận trên của chuẩn diện tích nặng hơn lệch khỏi diện tích mong muốn, nhưng vẫn là một
# khoản phạt: thà có một phòng rộng quá mức còn hơn không có phương án nào.
_W_OVER_MAX_AREA = 6
_W_DIMENSION_SHORTFALL = 40
_W_ASPECT_EXCESS = 4
_W_ADJACENCY = 300


@dataclass(frozen=True, slots=True)
class RoomSpec:
    """Một phòng bộ giải phải đặt, lấy từ chương trình không gian."""

    id: str
    type: str
    floor: int
    target_area_m2: float
    min_area_m2: float | None = None
    max_area_m2: float | None = None
    needs_daylight: bool = False
    # Nhãn tiếng Việt do WORKER cấp. Container không quy chuẩn hoá nhãn phòng và không giữ
    # bảng từ vựng (CLAUDE.md 8.7) — nhưng câu thông báo phải đọc được, nên nhãn đi kèm đầu
    # vào thay vì để Container tự tra.
    label: str | None = None
    # Mã phòng MẸ khi phòng này nằm LỌT bên trong một phòng khác (khu vệ sinh của phòng ngủ
    # khép kín). Lối vào đi qua phòng mẹ, không qua hành lang — xem `_apply_access`.
    enclosed_in: str | None = None


@dataclass(frozen=True, slots=True)
class FloorLayout:
    """Cây chia không gian của một tầng, nguyên văn từ `LayoutIntent`."""

    level: int
    tree: dict[str, Any]


@dataclass(frozen=True, slots=True)
class AdjacencyRequest:
    """Một quan hệ vị trí mà hàm mục tiêu cần tôn trọng."""

    a: str
    b: str
    kind: Literal["adjacent", "near", "separate"]
    weight: float = 1.0


@dataclass(frozen=True, slots=True)
class SolveRequest:
    """Toàn bộ thứ bộ giải cần. Không trạng thái toàn cục, không tác dụng phụ."""

    site_width_m: float
    site_depth_m: float
    floors: int
    rooms: tuple[RoomSpec, ...]
    layouts: tuple[FloorLayout, ...]
    rule_pack: RulePack
    building_type: str = "nha_pho"
    # Diện tích THẬT của thửa, dùng cho mật độ xây dựng. Với thửa không vuông vắn nó lớn hơn
    # `site_width_m * site_depth_m` (ô chữ nhật xây được), nên để mặc định là tự phạt oan.
    site_area_m2: float | None = None
    # Mặt nào của thửa lấy được sáng tự nhiên, suy từ hiện trạng bốn phía trong đầu bài.
    open_faces: tuple[Side, ...] = ("front", "back")
    # Mặt nào vào được từ ngoài. Phòng tầng trệt giáp mặt này là đã có lối vào.
    access_faces: tuple[Side, ...] = ("front",)
    adjacency: tuple[AdjacencyRequest, ...] = ()
    # Thành viên của từng nhóm mã phòng (`habitable` gồm những mã nào), do Worker cấp từ
    # `kb/room_vocabulary.yaml`. Nhóm không khai ở đây được hiểu là phủ MỌI loại phòng — đó là
    # nghĩa của `all`, và cũng là cách cư xử an toàn: thà kiểm thừa còn hơn bỏ sót.
    room_groups: dict[str, tuple[str, ...]] = field(default_factory=dict)
    # Khoảng lùi do đầu bài áp thêm (giấy phép quy hoạch cụ thể của thửa). Lấy mức CHẶT hơn
    # giữa nó và rule pack — không bao giờ nới ra.
    setback_override_m: dict[str, float] = field(default_factory=dict)
    max_density_override: float | None = None
    # Mặt sàn mỗi tầng mà CHƯƠNG TRÌNH KHÔNG GIAN chọn dùng (`floor_allocation.usable_area_m2`).
    #
    # Vì sao bộ giải phải biết con số này: sàn xây được là một GIỚI HẠN, không phải một yêu
    # cầu. Lớp 2 chọn mặt sàn vừa đủ cho chương trình — một gia đình bốn người trên lô
    # 20 × 30 m không cần căn nhà 360 m²/tầng. Không gửi con số đó sang thì bộ giải vẫn chia
    # HẾT phần xây được, và toàn bộ việc thu nhỏ ở Lớp 2 biến mất ngay ở Lớp 3: phần dôi ra
    # phải chui vào một phòng nào đó, đúng cái đã sửa.
    #
    # `None` = không thu nhỏ (hành vi cũ). Thu từ PHÍA SAU, giữ nguyên mặt tiền — cùng cách
    # trần mật độ thu, và cùng lý do: mặt tiền là bề rộng thửa, không đổi được; phần dôi ra
    # phía sau thành sân.
    target_floor_area_m2: float | None = None
    # Bao nhiêu tầng cây được coi là KẾT CẤU CHÍNH.
    #
    # Đường cắt ở tầng nông là tuyến tường chịu lực chạy suốt chiều cao nhà — chúng dùng chung
    # giữa các tầng, và đó là điều làm mọi tầng nhất quán. Đường cắt sâu hơn là tường ngăn:
    # tầng nào chia thế nào là việc của tầng đó.
    #
    # Dùng chung TẤT CẢ các đường cắt nghe có vẻ chặt chẽ hơn, nhưng nó ép hai tầng có số phòng
    # khác nhau phải có cùng diện tích ở từng dải — và cái hiện ra là vô nghiệm với một tập
    # ràng buộc trỏ vào hai phòng chẳng liên quan gì tới nhau. Nhà thật không như vậy: nó có
    # vài tuyến tường chịu lực, còn vách ngăn thì mỗi tầng một khác.
    #
    # Lõi thang KHÔNG dựa vào cơ chế này — nó có ràng buộc trùng khít riêng (`stair_alignment`),
    # nên vẫn thẳng hàng dù nằm sâu bao nhiêu trong cây.
    structural_depth: int = 2
    time_limit_s: float = 60.0
    # Hạng `standard-1` của Cloudflare Container có ~0,5 vCPU nên chỉ một luồng tìm kiếm.
    # Nâng hạng instance mới là thứ gỡ được giới hạn này, không phải sửa mã.
    num_search_workers: int = 1

    @property
    def lot_area_m2(self) -> float:
        return (
            self.site_area_m2
            if self.site_area_m2 is not None
            else self.site_width_m * self.site_depth_m
        )


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
    has_daylight: bool = False

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
class PlacedVoid:
    id: str
    kind: str
    floor: int
    x0_m: float
    y0_m: float
    x1_m: float
    y1_m: float

    @property
    def polygon(self) -> list[list[float]]:
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


@dataclass(frozen=True, slots=True)
class Violation:
    """Một quy tắc bị vi phạm trên nghiệm đã có. Câu chữ do lớp gọi dựng từ mẫu câu."""

    rule_id: str
    predicate: str
    severity: str
    involved: tuple[str, ...]
    actual: str | None = None
    required: str | None = None


@dataclass(slots=True)
class SolveResult:
    """Hoặc một mặt bằng, hoặc lời giải thích vì sao không có mặt bằng nào."""

    status: Literal["pass", "warning", "infeasible", "unknown"]
    solve_time_s: float
    rule_pack_version: str
    rooms: list[PlacedRoom] = field(default_factory=list)
    voids: list[PlacedVoid] = field(default_factory=list)
    footprint_m: tuple[float, float, float, float] | None = None
    core: dict[str, Any] | None = None
    structural_axes_x_m: list[float] = field(default_factory=list)
    structural_axes_y_m: list[float] = field(default_factory=list)
    conflict_set: list[ConflictEntry] = field(default_factory=list)
    violations: list[Violation] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


# --------------------------------------------------------------------------------------
# Đọc ngưỡng từ rule pack. Không dòng nào bên dưới hard-code một con số quy chuẩn.
# --------------------------------------------------------------------------------------


def rules_for(pack: RulePack, building_type: str, predicate: str) -> list[Rule]:
    return [r for r in pack.for_building_type(building_type) if r.predicate == predicate]


def _scoped(rules: list[Rule], *scopes: str) -> list[Rule]:
    return [r for r in rules if r.scope in scopes]


def target_covers(
    rule: Rule, room_type: str, groups: dict[str, tuple[str, ...]]
) -> bool:
    """Quy tắc này có nhắm tới loại phòng đó không.

    `target` là một mã phòng, hoặc tên một NHÓM. Nhóm khai thành viên (`habitable`) chỉ phủ
    đúng những mã đã khai — hành lang dài và hẹp là đúng bản chất của nó, và một quy tắc tỉ lệ
    dành cho không gian ở mà đè lên hành lang chỉ sinh ra cảnh báo sai. Nhóm không khai thành
    viên coi như phủ mọi mã, đó là nghĩa của `all`.
    """
    target = rule.params.get("target")
    if target is None:
        return False
    if target == room_type:
        return True
    members = groups.get(str(target))
    if members is not None:
        return room_type in members
    return target in ("all", "habitable")


def threshold_for_target(
    rules: list[Rule],
    target: str,
    key: str,
    groups: dict[str, tuple[str, ...]] | None = None,
) -> tuple[float, Rule] | None:
    """Tìm quy tắc áp cho một loại phòng, ưu tiên quy tắc cụ thể hơn.

    Quy tắc nhắm `bedroom` thắng quy tắc nhắm `habitable`, và quy tắc đó thắng `all`.
    """
    members = groups or {}
    specific = [r for r in rules if r.params.get("target") == target]
    fallback = [
        r
        for r in rules
        if r.params.get("target") != target and target_covers(r, target, members)
    ]
    for candidate in (*specific, *fallback):
        value = candidate.params.get(key)
        if value is not None:
            return float(value), candidate
    return None


def setbacks_m(request: SolveRequest) -> dict[str, tuple[float, Rule | None]]:
    """Khoảng lùi bắt buộc từng phía: mức CHẶT hơn giữa rule pack và đầu bài."""
    result: dict[str, tuple[float, Rule | None]] = {}
    pack_rules = _scoped(
        rules_for(request.rule_pack, request.building_type, "setback"), "site", "building"
    )
    for side in SIDES:
        rule = next((r for r in pack_rules if r.params.get("side") == side), None)
        value = float(rule.params.get("value_m", 0.0)) if rule is not None else 0.0
        override = float(request.setback_override_m.get(side, 0.0))
        result[side] = (max(value, override), rule)
    return result


def max_density(request: SolveRequest) -> tuple[float, Rule | None]:
    """Mật độ xây dựng trần: mức CHẶT hơn giữa rule pack và đầu bài."""
    rules = _scoped(
        rules_for(request.rule_pack, request.building_type, "max_density"), "site", "building"
    )
    rule = next((r for r in rules if r.params.get("value") is not None), None)
    value = float(rule.params["value"]) if rule is not None else 1.0
    if request.max_density_override is not None:
        value = min(value, float(request.max_density_override))
    return value, rule


# --------------------------------------------------------------------------------------
# Dựng mô hình
# --------------------------------------------------------------------------------------


class _Rect:
    """Bốn biến toạ độ cộng các đại lượng suy ra. Không nơi nào khai toạ độ độc lập."""

    __slots__ = ("x0", "x1", "y0", "y1", "w", "h", "area")

    def __init__(self, x0, x1, y0, y1, w, h, area) -> None:
        self.x0, self.x1, self.y0, self.y1 = x0, x1, y0, y1
        self.w, self.h, self.area = w, h, area


class _Builder:
    def __init__(self, request: SolveRequest) -> None:
        self.req = request
        self.m = cp_model.CpModel()
        self.W = m_to_units(request.site_width_m)
        self.D = m_to_units(request.site_depth_m)
        self.assumptions: dict[cp_model.IntVar, ConflictEntry] = {}
        self.rooms_by_id = {r.id: r for r in request.rooms}
        self.room_rects: dict[str, _Rect] = {}
        self.void_rects: dict[str, _Rect] = {}
        self.void_floor: dict[str, tuple[int, str]] = {}
        self.room_faces: dict[str, frozenset[str]] = {}
        self.leaf_path: dict[str, str] = {}
        self.floor_paths: dict[int, dict[str, dict[str, Any]]] = {}
        self.soft_terms: list[tuple[int, cp_model.IntVar]] = []
        self.shared_cuts: dict[tuple[str, str], cp_model.IntVar] = {}
        # Gợi ý nghiệm cho từng đường cắt, suy từ `ratio_hint` của `LayoutIntent`.
        #
        # Trước đây `ratio_hint` là trường CHẾT: hợp đồng có, Lớp 3a điền, và bộ giải bỏ qua
        # hoàn toàn. Với mặt bằng mười ba phòng thì đó là mất mát thật — đo trên
        # NVO-TK-2026-2737 ngày 07/09/2026, bộ giải khoá vào một nghiệm đặt 88 m² cho dải chỉ
        # cần 65 m², và không thoát ra kể cả khi cho 90 giây (kết quả ở 25 giây và 90 giây
        # giống hệt nhau tới từng centimet).
        #
        # Gợi ý KHÔNG phải ràng buộc: CP-SAT dùng nó làm điểm xuất phát rồi tự sửa nếu không
        # thoả. Nên nó không mở thêm quyền cho Lớp 3a quyết định hình học — nguyên tắc bất
        # biến 2 vẫn nguyên: một gợi ý sai chỉ làm chậm, không làm sai.
        self.cut_hints: dict[str, tuple[cp_model.IntVar, int]] = {}
        self._adjacency_cache: dict[tuple[str, str], cp_model.IntVar] = {}
        self._pack_rules = request.rule_pack.for_building_type(request.building_type)

    # -- hàm trợ giúp ------------------------------------------------------------------

    def _assume(self, entry: ConflictEntry) -> cp_model.IntVar:
        """Một biến giả định cho MỘT lần áp dụng của một ràng buộc cứng."""
        lit = self.m.NewBoolVar(f"assume::{entry.rule_id}::{'+'.join(entry.involved)}")
        self.assumptions[lit] = entry
        return lit

    def _entry(self, rule: Rule, *involved: str) -> ConflictEntry:
        return ConflictEntry(rule.id, tuple(involved), rule.source, rule.is_legal)

    def _fail(self, rule: Rule, *involved: str) -> None:
        """Ép một ràng buộc CẤU TRÚC không thoả vào đúng cơ chế giải thích của bộ giải.

        Không thoả được bằng cách sắp xếp lại toạ độ nào cả — cây bố cục đã quyết định rồi.
        Nhưng nó vẫn phải xuất hiện trong tập mâu thuẫn cùng các ràng buộc số học, nếu không
        người đọc phải học hai loại lỗi khác nhau cho cùng một câu hỏi.
        """
        lit = self._assume(self._entry(rule, *involved))
        self.m.AddBoolAnd([lit.Not()])

    def _rect(self, name: str, x0, x1, y0, y1) -> _Rect:
        w = self.m.NewIntVar(0, self.W, f"{name}.w")
        h = self.m.NewIntVar(0, self.D, f"{name}.h")
        self.m.Add(w == x1 - x0)
        self.m.Add(h == y1 - y0)
        area = self.m.NewIntVar(0, self.W * self.D, f"{name}.area")
        self.m.AddMultiplicationEquality(area, [w, h])
        return _Rect(x0, x1, y0, y1, w, h, area)

    def _soft(self, weight: int, var: cp_model.IntVar) -> None:
        self.soft_terms.append((weight, var))

    def _soft_min(self, weight: int, var: cp_model.IntVar, minimum: int, label: str) -> None:
        """Ngưỡng ở mức cảnh báo thành một khoản phạt, không phải ràng buộc cứng."""
        shortfall = self.m.NewIntVar(0, minimum, f"soft::{label}")
        self.m.Add(shortfall >= minimum - var)
        self._soft(weight, shortfall)

    # -- đặt khối ----------------------------------------------------------------------

    def _footprint(self) -> tuple[int, int, int, int]:
        """Hình bao công trình: ô xây được thu vào theo khoảng lùi từng phía.

        Giai đoạn 1 chỉ có nhà phố — một cánh lấp kín phần còn lại của lô sau khoảng lùi
        (`04-layer3-floorplan.md` mục 4.2: "với nhà phố bước này gần như hiển nhiên"). Đặt
        khối thành bài toán tối ưu riêng là việc của biệt thự, Mốc 7.
        """
        insets = setbacks_m(self.req)
        x0 = m_to_units_ceil(insets["left"][0])
        x1 = self.W - m_to_units_ceil(insets["right"][0])
        y0 = m_to_units_ceil(insets["front"][0])
        y1 = self.D - m_to_units_ceil(insets["back"][0])

        for side, (value, rule) in insets.items():
            if rule is None or value <= 0:
                continue
            available = self.W if side in ("left", "right") else self.D
            if m_to_units_ceil(value) * 2 >= available:
                # Khoảng lùi ăn hết bề rộng lô: không còn chỗ nào để xây.
                self._fail(rule, side)

        if x1 <= x0 or y1 <= y0:
            x1, y1 = max(x1, x0 + 1), max(y1, y0 + 1)

        # Mật độ xây dựng: thu chiều sâu về từ PHÍA SAU, giữ nguyên bề rộng mặt tiền.
        #
        # Thu từ phía sau chứ không thu đều bốn phía vì mặt tiền là thứ không đổi được —
        # nó là bề rộng thửa và là chỗ nhà tiếp đường. Phần dôi ra phía sau thành sân, đúng
        # cách một thửa có trần mật độ được xây trên thực tế.
        density, rule = max_density(self.req)
        if rule is not None:
            allowed_m2 = density * self.req.lot_area_m2
            width = x1 - x0
            max_depth = m2_to_units2_floor(allowed_m2) // width if width > 0 else 0
            if max_depth <= 0:
                self._fail(rule, "footprint")
            elif y1 - y0 > max_depth:
                y1 = y0 + max_depth

        # Mặt sàn chương trình chọn dùng — thu thêm từ phía sau, KHÔNG BAO GIỜ nới ra.
        #
        # Vế "không nới ra" là phần quan trọng: con số này đến từ Lớp 2 qua mạng, còn khoảng
        # lùi và mật độ là quy chuẩn. Cho phép nó nới là mở đường cho một chương trình sai
        # (hoặc bị sửa) vượt trần pháp lý mà không có gì chặn.
        wanted = self.req.target_floor_area_m2
        if wanted is not None and wanted > 0:
            width = x1 - x0
            if width > 0:
                depth = m2_to_units2_floor(wanted) // width
                # Không thu xuống dưới một mức tối thiểu vô lý: thà giữ nguyên còn hơn trả về
                # một hình bao không đặt nổi phòng nào.
                if 0 < depth < y1 - y0:
                    y1 = y0 + depth

        return x0, x1, y0, y1

    # -- cây chia không gian -----------------------------------------------------------

    def build(self) -> None:
        for layout in self.req.layouts:
            layout_tree.check_shape(layout.tree)

        trees = {layout.level: layout.tree for layout in self.req.layouts}
        self.aligned = {
            path: axis
            for path, axis in layout_tree.aligned_cuts(trees).items()
            if len(path) < self.req.structural_depth
        }

        fx0, fx1, fy0, fy1 = self._footprint()
        self.footprint = (fx0, fx1, fy0, fy1)

        for layout in self.req.layouts:
            by_path = {path: node for path, node in layout_tree.walk(layout.tree)}
            self.floor_paths[layout.level] = by_path
            for leaf in layout_tree.leaves(layout.tree):
                key = self._leaf_key(layout.level, leaf)
                self.room_faces[key] = layout_tree.touches_root_face(leaf.path, by_path)
                self.leaf_path[key] = leaf.path
            self._build_node(
                layout.level,
                layout.tree,
                "",
                self.m.NewConstant(fx0),
                self.m.NewConstant(fx1),
                self.m.NewConstant(fy0),
                self.m.NewConstant(fy1),
                (fx0, fx1, fy0, fy1),
            )

        for cut, value in self.cut_hints.values():
            self.m.AddHint(cut, value)

        self._align_cores()
        self._apply_daylight()
        self._apply_access()
        self._apply_face()
        self._apply_adjacency()

        if self.soft_terms:
            self.m.Minimize(sum(weight * var for weight, var in self.soft_terms))

    def _leaf_key(self, level: int, leaf: layout_tree.Leaf) -> str:
        return leaf.ref if leaf.kind == "room" else f"void_{level}_{leaf.path or 'root'}"

    def _cut_var(
        self, level: int, path: str, axis: str, lo, hi, hint: int | None = None
    ) -> cp_model.IntVar:
        """Đường cắt tại `path`. Dùng chung giữa các tầng khi cấu trúc cho phép."""
        upper = self.W if axis == "V" else self.D
        if self.aligned.get(path) == axis:
            key = (path, axis)
            cut = self.shared_cuts.get(key)
            if cut is None:
                cut = self.m.NewIntVar(0, upper, f"cut::shared::{path or 'root'}::{axis}")
                self.shared_cuts[key] = cut
        else:
            cut = self.m.NewIntVar(0, upper, f"cut::L{level}::{path or 'root'}::{axis}")
        self.m.Add(cut >= lo)
        self.m.Add(cut <= hi)
        # Một đường cắt dùng chung nhận gợi ý của tầng ĐẦU TIÊN gặp; CP-SAT chỉ nhận mỗi biến
        # một giá trị gợi ý, và gán hai lần là lỗi chứ không phải ghi đè.
        if hint is not None and 0 <= hint <= upper:
            self.cut_hints.setdefault(cut.Name(), (cut, hint))
        return cut

    def _build_node(
        self,
        level: int,
        node: dict[str, Any],
        path: str,
        x0,
        x1,
        y0,
        y1,
        box: tuple[int, int, int, int] | None = None,
    ) -> None:
        """Dựng một nút của cây.

        `box` là ô chữ nhật GỢI Ý (x0, x1, y0, y1) tính bằng đơn vị nguyên, suy từ
        `ratio_hint` dọc đường đi. Nó không tham gia ràng buộc nào — chỉ để `_cut_var` biết
        đề nghị CP-SAT bắt đầu từ đâu.
        """
        if "room" in node:
            self._place_room(level, str(node["room"]), path, x0, x1, y0, y1)
            return
        if "void" in node:
            self._place_void(level, str(node["void"]), path, x0, x1, y0, y1)
            return

        axis = node["split"]
        ratio = node.get("ratio_hint")
        bx0, bx1, by0, by1 = box if box else (0, 0, 0, 0)
        if axis == "H":
            hint = None
            if box and isinstance(ratio, (int, float)) and 0 < ratio < 1:
                hint = by0 + int(round((by1 - by0) * float(ratio)))
            cut = self._cut_var(level, path, axis, y0, y1, hint)
            self._build_node(
                level, node["a"], path + "a", x0, x1, y0, cut, (bx0, bx1, by0, hint) if hint else None
            )
            self._build_node(
                level, node["b"], path + "b", x0, x1, cut, y1, (bx0, bx1, hint, by1) if hint else None
            )
        else:
            hint = None
            if box and isinstance(ratio, (int, float)) and 0 < ratio < 1:
                hint = bx0 + int(round((bx1 - bx0) * float(ratio)))
            cut = self._cut_var(level, path, axis, x0, x1, hint)
            self._build_node(
                level, node["a"], path + "a", x0, cut, y0, y1, (bx0, hint, by0, by1) if hint else None
            )
            self._build_node(
                level, node["b"], path + "b", cut, x1, y0, y1, (hint, bx1, by0, by1) if hint else None
            )

    def _place_void(self, level: int, kind: str, path: str, x0, x1, y0, y1) -> None:
        key = f"void_{level}_{path or 'root'}"
        rect = self._rect(f"L{level}::{key}", x0, x1, y0, y1)
        self.void_rects[key] = rect
        self.void_floor[key] = (level, kind)
        # Giếng trời chỉ có nghĩa khi nó thật sự rộng. Bề rộng tối thiểu lấy từ quy tắc hành
        # lang — cùng con số, cùng lý do: một khe 20 cm không lấy được sáng cho ai.
        corridor = threshold_for_target(
            _scoped(rules_for(self.req.rule_pack, self.req.building_type, "min_dimension"), "floor"),
            "circulation",
            "value_m",
            self.req.room_groups,
        )
        if corridor is not None:
            units = m_to_units_ceil(corridor[0])
            lit = self._assume(self._entry(corridor[1], key))
            self.m.Add(rect.w >= units).OnlyEnforceIf(lit)
            self.m.Add(rect.h >= units).OnlyEnforceIf(lit)

        # Và cận TRÊN, tra theo chính LOẠI khoảng rỗng (`lightwell`, `atrium`, `courtyard`).
        #
        # Không có nó thì khoảng rỗng là thứ duy nhất trong mô hình không mang chi phí nào:
        # không diện tích mong muốn, không cận trên, không phạt. Cây chia lấp kín mặt sàn, nên
        # mọi mét vuông không phòng nào mong muốn đổ hết vào đây — đo được trên bản vẽ demo
        # 06/09/2026: giếng trời 33 m² và 37 m² trên sàn 90 m².
        #
        # Là KHOẢN PHẠT chứ không phải ràng buộc cứng, cùng lý do với cận trên của phòng: mặt
        # sàn phải chia hết, nên một cận trên cứng ở đây biến mọi tầng rộng hơn chương trình
        # thành vô nghiệm.
        cap = threshold_for_target(
            _scoped(rules_for(self.req.rule_pack, self.req.building_type, "max_area"), "floor"),
            kind,
            "value_m2",
            self.req.room_groups,
        )
        if cap is not None:
            over = self.m.NewIntVar(0, self.W * self.D, f"soft::void_over::{key}")
            self.m.Add(over >= rect.area - m2_to_units2_floor(cap[0]))
            self._soft(_W_OVER_MAX_AREA, over)

    def _place_room(self, level: int, room_id: str, path: str, x0, x1, y0, y1) -> None:
        room = self.rooms_by_id.get(room_id)
        if room is None:
            raise ValueError(
                f'Cây bố cục có phòng "{room_id}" không nằm trong chương trình không gian — '
                "sinh lại phương án thay vì giải tiếp."
            )
        if room.floor != level:
            raise ValueError(
                f'Phòng "{room_id}" thuộc tầng {room.floor} của chương trình không gian nhưng '
                f"nằm trong cây bố cục của tầng {level}."
            )
        if room_id in self.room_rects:
            raise ValueError(f'Phòng "{room_id}" xuất hiện hai lần trong cây bố cục.')

        rect = self._rect(f"L{level}::{room_id}", x0, x1, y0, y1)
        self.room_rects[room_id] = rect
        self._apply_dimension_rules(room, rect)
        self._apply_area_rules(room, rect)
        self._apply_aspect_rules(room, rect)
        self._add_area_deviation(room, rect)

    # -- ràng buộc lấy từ rule pack ----------------------------------------------------

    def _apply_dimension_rules(self, room: RoomSpec, rect: _Rect) -> None:
        found = threshold_for_target(
            _scoped(
                rules_for(self.req.rule_pack, self.req.building_type, "min_dimension"),
                "floor",
                "building",
            ),
            room.type,
            "value_m",
            self.req.room_groups,
        )
        if found is None:
            return
        value_m, rule = found
        units = m_to_units_ceil(value_m)
        if rule.severity is Severity.ERROR:
            lit = self._assume(self._entry(rule, room.id))
            self.m.Add(rect.w >= units).OnlyEnforceIf(lit)
            self.m.Add(rect.h >= units).OnlyEnforceIf(lit)
        else:
            self._soft_min(_W_DIMENSION_SHORTFALL, rect.w, units, f"{room.id}.w")
            self._soft_min(_W_DIMENSION_SHORTFALL, rect.h, units, f"{room.id}.h")

    def _apply_area_rules(self, room: RoomSpec, rect: _Rect) -> None:
        # Cận trên/dưới của chính chương trình không gian là ràng buộc CỨNG: chúng đến từ đầu
        # bài chứ không từ quy chuẩn, nhưng một phòng nằm ngoài khoảng đó không còn là phòng
        # mà khách yêu cầu nữa.
        if room.min_area_m2 is not None:
            lit = self._assume(
                ConflictEntry(f"program:min_area:{room.id}", (room.id,), "Space Program", False)
            )
            self.m.Add(rect.area >= m2_to_units2_ceil(room.min_area_m2)).OnlyEnforceIf(lit)
        if room.max_area_m2 is not None:
            # Cận TRÊN của chương trình không gian là khoản phạt, không phải ràng buộc cứng.
            #
            # Nó đến từ `kb/space_norms.yaml` — "phòng loại này thường không quá chừng này" —
            # chứ không từ quy chuẩn và cũng không từ yêu cầu của khách. Cây chia lấp KÍN mặt
            # sàn, nên đặt nó thành ràng buộc cứng biến mọi tầng có chương trình nhỏ hơn mặt
            # sàn thành vô nghiệm, kèm một tập mâu thuẫn trỏ vào cận trên của một khu vệ sinh.
            # Quy chuẩn nào thật sự chặn diện tích tối đa thì khai thành quy tắc `max_area`
            # mức `error` trong rule pack, và nó vẫn cứng.
            over = self.m.NewIntVar(0, self.W * self.D, f"soft::over::{room.id}")
            self.m.Add(over >= rect.area - m2_to_units2_floor(room.max_area_m2))
            self._soft(_W_OVER_MAX_AREA, over)

        found = threshold_for_target(
            _scoped(rules_for(self.req.rule_pack, self.req.building_type, "min_area"), "floor"),
            room.type,
            "value_m2",
            self.req.room_groups,
        )
        if found is None:
            return
        value_m2, rule = found
        units2 = m2_to_units2_ceil(value_m2)
        if rule.severity is Severity.ERROR:
            lit = self._assume(self._entry(rule, room.id))
            self.m.Add(rect.area >= units2).OnlyEnforceIf(lit)
        else:
            self._soft_min(_W_AREA_DEVIATION, rect.area, units2, f"{room.id}.area")

    def _apply_aspect_rules(self, room: RoomSpec, rect: _Rect) -> None:
        """Tỉ lệ dài trên rộng: `max(w, h) <= ratio * min(w, h)`.

        Nhân hai vế với 100 để giữ số nguyên — tỉ lệ trong rule pack là số thực.
        """
        found = threshold_for_target(
            _scoped(
                rules_for(self.req.rule_pack, self.req.building_type, "aspect_ratio_max"), "floor"
            ),
            room.type,
            "value",
            self.req.room_groups,
        )
        if found is None:
            return
        ratio, rule = found
        scaled = round(ratio * 100)
        if rule.severity is Severity.ERROR:
            lit = self._assume(self._entry(rule, room.id))
            self.m.Add(100 * rect.w <= scaled * rect.h).OnlyEnforceIf(lit)
            self.m.Add(100 * rect.h <= scaled * rect.w).OnlyEnforceIf(lit)
            return
        for long_side, short_side, tag in ((rect.w, rect.h, "w"), (rect.h, rect.w, "h")):
            excess = self.m.NewIntVar(0, 100 * max(self.W, self.D), f"soft::aspect::{room.id}.{tag}")
            self.m.Add(excess >= 100 * long_side - scaled * short_side)
            self._soft(_W_ASPECT_EXCESS, excess)

    def _add_area_deviation(self, room: RoomSpec, rect: _Rect) -> None:
        """Thành phần hàm mục tiêu: giữ mỗi phòng gần diện tích mong muốn."""
        target = m2_to_units2_ceil(room.target_area_m2)
        dev = self.m.NewIntVar(0, self.W * self.D, f"dev::{room.id}")
        self.m.AddAbsEquality(dev, rect.area - target)
        self._soft(_W_AREA_DEVIATION, dev)

    # -- thẳng hàng liên tầng ----------------------------------------------------------

    def _align_cores(self) -> None:
        """Lõi thang chồng đúng vị trí giữa các tầng.

        Không phải "nên": thang bộ đi xuyên các tầng nên nếu hai tầng đặt nó ở hai chỗ thì
        không có ngôi nhà nào ứng với bản vẽ đó.
        """
        rules = [
            r
            for r in rules_for(self.req.rule_pack, self.req.building_type, "aligned_across_floors")
            if r.params.get("target") in ("core", "stair")
        ]
        if not rules:
            return
        rule = rules[0]
        cores = sorted(
            (rid for rid, room in self.rooms_by_id.items() if room.type in CORE_TYPES),
            key=lambda rid: (self.rooms_by_id[rid].floor, rid),
        )
        cores = [rid for rid in cores if rid in self.room_rects]
        if len(cores) < 2:
            return
        first = self.room_rects[cores[0]]
        for rid in cores[1:]:
            rect = self.room_rects[rid]
            lit = self._assume(self._entry(rule, cores[0], rid))
            for attr in ("x0", "x1", "y0", "y1"):
                self.m.Add(getattr(rect, attr) == getattr(first, attr)).OnlyEnforceIf(lit)

    # -- quan hệ hình học --------------------------------------------------------------

    def _certainly_adjacent(self, level: int, a_key: str, b_key: str) -> bool:
        """Chứng minh được kề nhau bằng cấu trúc cây thì khỏi dựng biến nào cả.

        Với khung nhà ống (hành lang dọc chạy suốt, các dải phòng trải hết bề ngang phần sau)
        điều này đúng cho MỌI cặp phòng–hành lang, nên toàn bộ ràng buộc lối vào biến mất khỏi
        mô hình. Đo được: giảm thời gian giải một căn ba tầng từ 6,6 giây xuống còn hơn một
        giây — phần đắt nhất của mô hình là những biến bool phản ánh "hai ô này có chạm nhau
        không", và phần lớn trong số đó trả lời được bằng hình học của cây.
        """
        by_path = self.floor_paths.get(level)
        a_path = self.leaf_path.get(a_key)
        b_path = self.leaf_path.get(b_key)
        if by_path is None or a_path is None or b_path is None:
            return False
        return layout_tree.structurally_adjacent(a_path, b_path, by_path)

    def _adjacent(self, a_key: str, b_key: str) -> cp_model.IntVar:
        """Biến bool đúng khi hai hình chữ nhật CHUNG MỘT ĐOẠN BIÊN có độ dài dương.

        Chạm nhau đúng một điểm ở góc không phải liền kề — không đi qua nhau được, và không
        mở cửa được. Nên yêu cầu phần chồng lấn theo phương vuông góc ít nhất một module.
        """
        key = (a_key, b_key) if a_key <= b_key else (b_key, a_key)
        cached = self._adjacency_cache.get(key)
        if cached is not None:
            return cached

        a = self.room_rects.get(a_key) or self.void_rects[a_key]
        b = self.room_rects.get(b_key) or self.void_rects[b_key]
        tag = f"{key[0]}~{key[1]}"

        overlaps: dict[str, cp_model.IntVar] = {}
        for axis, lo_a, hi_a, lo_b, hi_b, span in (
            ("x", a.x0, a.x1, b.x0, b.x1, self.W),
            ("y", a.y0, a.y1, b.y0, b.y1, self.D),
        ):
            lo = self.m.NewIntVar(0, span, f"ov::{tag}::{axis}.lo")
            hi = self.m.NewIntVar(0, span, f"ov::{tag}::{axis}.hi")
            self.m.AddMaxEquality(lo, [lo_a, lo_b])
            self.m.AddMinEquality(hi, [hi_a, hi_b])
            positive = self.m.NewBoolVar(f"ov::{tag}::{axis}.pos")
            self.m.Add(hi - lo >= 1).OnlyEnforceIf(positive)
            self.m.Add(hi - lo <= 0).OnlyEnforceIf(positive.Not())
            overlaps[axis] = positive

        touches: list[cp_model.IntVar] = []
        for label, left, right, perpendicular in (
            ("ab_y", a.y1, b.y0, "x"),
            ("ba_y", b.y1, a.y0, "x"),
            ("ab_x", a.x1, b.x0, "y"),
            ("ba_x", b.x1, a.x0, "y"),
        ):
            flush = self.m.NewBoolVar(f"touch::{tag}::{label}")
            self.m.Add(left == right).OnlyEnforceIf(flush)
            self.m.Add(left != right).OnlyEnforceIf(flush.Not())
            both = self.m.NewBoolVar(f"side::{tag}::{label}")
            self.m.AddBoolAnd([flush, overlaps[perpendicular]]).OnlyEnforceIf(both)
            self.m.AddBoolOr([flush.Not(), overlaps[perpendicular].Not()]).OnlyEnforceIf(both.Not())
            touches.append(both)

        adjacent = self.m.NewBoolVar(f"adj::{tag}")
        self.m.AddMaxEquality(adjacent, touches)
        self._adjacency_cache[key] = adjacent
        return adjacent

    def _apply_daylight(self) -> None:
        """Phòng cần sáng tự nhiên phải tiếp giáp mặt thoáng hoặc một khoảng rỗng."""
        rules = _scoped(
            rules_for(self.req.rule_pack, self.req.building_type, "requires_daylight"), "floor"
        )
        if not rules:
            return
        open_faces = set(self.req.open_faces)

        for room_id, rect in self.room_rects.items():
            room = self.rooms_by_id[room_id]
            rule = _rule_for_room(rules, room, self.req.room_groups)
            if rule is None and not room.needs_daylight:
                continue
            faces = self.room_faces.get(room_id, frozenset())
            on_facade = bool(faces & open_faces)
            voids = [
                key for key, (level, _) in self.void_floor.items() if level == room.floor
            ]
            if on_facade:
                continue
            if rule is None:
                continue
            if not voids:
                self._fail(rule, room_id)
                continue
            if any(self._certainly_adjacent(room.floor, room_id, key) for key in voids):
                continue
            options = [self._adjacent(room_id, void_key) for void_key in voids]
            if rule.severity is Severity.ERROR:
                lit = self._assume(self._entry(rule, room_id))
                self.m.AddBoolOr(options).OnlyEnforceIf(lit)
            else:
                lit = self.m.NewBoolVar(f"soft::daylight::{room_id}")
                self.m.AddMaxEquality(lit, options)
                miss = self.m.NewIntVar(0, 1, f"soft::daylight::{room_id}.miss")
                self.m.Add(miss == 1 - lit)
                self._soft(_W_ADJACENCY, miss)

    def _apply_face(self) -> None:
        """`requires_face` — phòng phải tiếp giáp mặt vào được, hoặc mặt thoáng.

        Đây là ràng buộc CẤU TRÚC thuần: `room_faces` suy từ cây chia, không phụ thuộc toạ độ.
        Nên chỉ có hai kết cục, và cả hai đều biết TRƯỚC khi giải — thoả, hoặc không đời nào
        thoả. Không có gì cho bộ giải xoay xở.

        Vì vậy mức `warning` cố ý KHÔNG thêm gì vào mô hình: một khoản phạt hằng số cộng vào
        hàm mục tiêu không đổi được nghiệm nào, chỉ làm mọi nghiệm cùng xấu đi một lượng bằng
        nhau. Vi phạm vẫn hiện ra đầy đủ, do `evaluate.py` đo trên nghiệm. Chỗ thật sự sửa
        được là Lớp 3a — xếp phòng vào dải giáp đúng mặt ngay từ ý đồ bố cục.
        """
        rules = _scoped(
            rules_for(self.req.rule_pack, self.req.building_type, "requires_face"), "floor"
        )
        if not rules:
            return
        for room_id in self.room_rects:
            room = self.rooms_by_id[room_id]
            rule = _rule_for_room(rules, room, self.req.room_groups)
            if rule is None or rule.severity is not Severity.ERROR:
                continue
            which = str(rule.params.get("face", "open"))
            if which == "access" and room.floor != 1:
                continue
            wanted = set(self.req.access_faces if which == "access" else self.req.open_faces)
            if not (self.room_faces.get(room_id, frozenset()) & wanted):
                self._fail(rule, room_id)

    def _apply_access(self) -> None:
        """Mọi phòng phải có lối vào: giáp một không gian giao thông, hoặc giáp lối vào nhà."""
        rules = _scoped(
            rules_for(self.req.rule_pack, self.req.building_type, "requires_access"), "floor"
        )
        if not rules:
            return
        access_faces = set(self.req.access_faces)

        by_floor: dict[int, list[str]] = {}
        for room_id in self.room_rects:
            by_floor.setdefault(self.rooms_by_id[room_id].floor, []).append(room_id)

        for level, ids in by_floor.items():
            circulation = [rid for rid in ids if self.rooms_by_id[rid].type in CIRCULATION_TYPES]
            for room_id in ids:
                room = self.rooms_by_id[room_id]
                if room.type in CIRCULATION_TYPES:
                    continue
                rule = _rule_for_room(rules, room, self.req.room_groups)
                if rule is None:
                    continue
                faces = self.room_faces.get(room_id, frozenset())
                if level == 1 and faces & access_faces:
                    continue
                # Phòng khép kín vào qua phòng MẸ, không qua hành lang. Bỏ vế này thì mọi
                # phòng ngủ khép kín đều vô nghiệm: khu vệ sinh bên trong không chạm hành lang
                # nào, và đó chính là điều làm nó khép kín.
                reachable = circulation
                if room.enclosed_in and room.enclosed_in in self.room_rects:
                    reachable = [room.enclosed_in]

                if not reachable:
                    self._fail(rule, room_id)
                    continue
                if any(self._certainly_adjacent(level, room_id, other) for other in reachable):
                    continue
                options = [self._adjacent(room_id, other) for other in reachable]
                if rule.severity is Severity.ERROR:
                    lit = self._assume(self._entry(rule, room_id))
                    self.m.AddBoolOr(options).OnlyEnforceIf(lit)
                else:
                    reached = self.m.NewBoolVar(f"soft::access::{room_id}")
                    self.m.AddMaxEquality(reached, options)
                    miss = self.m.NewIntVar(0, 1, f"soft::access::{room_id}.miss")
                    self.m.Add(miss == 1 - reached)
                    self._soft(_W_ADJACENCY, miss)

    def _apply_adjacency(self) -> None:
        """Quan hệ vị trí giữa các phòng — phần lớn là kinh nghiệm nghề, nên vào hàm mục tiêu.

        Cặp phòng do Lớp 2 gửi sang (`SpaceProgram.adjacency`), suy từ chính rule pack. Bộ giải
        không đọc lại quy tắc quan hệ ở đây: hai nơi cùng suy ra danh sách cặp thì sớm muộn
        chúng nói khác nhau.
        """
        for wish in self.req.adjacency:
            if wish.a not in self.room_rects or wish.b not in self.room_rects:
                continue
            if self.rooms_by_id[wish.a].floor != self.rooms_by_id[wish.b].floor:
                # `separate` giữa hai tầng đã thoả sẵn; `adjacent` thì không thể thoả.
                continue
            adjacent = self._adjacent(wish.a, wish.b)
            weight = max(1, round(_W_ADJACENCY * wish.weight))
            penalty = self.m.NewIntVar(0, 1, f"soft::adj::{wish.a}~{wish.b}")
            if wish.kind == "separate":
                self.m.Add(penalty == adjacent)
            elif wish.kind == "adjacent":
                self.m.Add(penalty == 1 - adjacent)
            else:
                continue
            self._soft(weight, penalty)


def _rule_for_room(
    rules: list[Rule], room: RoomSpec, groups: dict[str, tuple[str, ...]]
) -> Rule | None:
    """Quy tắc áp cho một phòng: nhắm đúng loại phòng thắng nhắm cả nhóm."""
    for rule in rules:
        if rule.params.get("target") == room.type:
            return rule
    for rule in rules:
        if target_covers(rule, room.type, groups):
            return rule
    return None


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
            core = trial

    model.ClearAssumptions()
    return core


def solve_townhouse(request: SolveRequest) -> SolveResult:
    """Giải MỌI TẦNG của một ngôi nhà trong cùng một mô hình.

    Trả về mặt bằng đã đặt phòng, hoặc — cũng hữu ích không kém — tập yêu cầu nhỏ nhất không
    thể cùng đúng. Vô nghiệm là một kết quả hợp lệ, không phải lỗi.
    """
    from design_compute.solver.evaluate import evaluate_violations

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
            notes.append("bộ giải không thu hẹp được tập ràng buộc mâu thuẫn, trả về tập đầy đủ")
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

    voids = [
        PlacedVoid(
            id=key,
            kind=builder.void_floor[key][1],
            floor=builder.void_floor[key][0],
            x0_m=units_to_m(solver.Value(rect.x0)),
            y0_m=units_to_m(solver.Value(rect.y0)),
            x1_m=units_to_m(solver.Value(rect.x1)),
            y1_m=units_to_m(solver.Value(rect.y1)),
        )
        for key, rect in builder.void_rects.items()
    ]

    open_faces = set(request.open_faces)
    placed: list[PlacedRoom] = []
    for room in request.rooms:
        rect = builder.room_rects.get(room.id)
        if rect is None:
            continue
        x0, x1 = solver.Value(rect.x0), solver.Value(rect.x1)
        y0, y1 = solver.Value(rect.y0), solver.Value(rect.y1)
        faces = builder.room_faces.get(room.id, frozenset())
        touches_void = any(
            v.floor == room.floor
            and _rects_touch(
                (x0, x1, y0, y1),
                (
                    m_to_units(v.x0_m),
                    m_to_units(v.x1_m),
                    m_to_units(v.y0_m),
                    m_to_units(v.y1_m),
                ),
            )
            for v in voids
        )
        placed.append(
            PlacedRoom(
                id=room.id,
                type=room.type,
                floor=room.floor,
                x0_m=units_to_m(x0),
                y0_m=units_to_m(y0),
                x1_m=units_to_m(x1),
                y1_m=units_to_m(y1),
                area_m2=units_to_m2(solver.Value(rect.area)),
                has_daylight=bool(faces & open_faces) or touches_void,
            )
        )

    axes_x = {0.0, request.site_width_m}
    axes_y = {0.0, request.site_depth_m}
    fx0, fx1, fy0, fy1 = builder.footprint
    axes_x.update({units_to_m(fx0), units_to_m(fx1)})
    axes_y.update({units_to_m(fy0), units_to_m(fy1)})
    for (_, axis), cut in builder.shared_cuts.items():
        value = units_to_m(solver.Value(cut))
        (axes_x if axis == "V" else axes_y).add(value)

    core_rooms = [r for r in placed if r.type in CORE_TYPES]
    core = None
    if core_rooms:
        first = core_rooms[0]
        core = {
            "polygon": first.polygon,
            "levels": sorted({r.floor for r in core_rooms}),
        }

    violations = evaluate_violations(request, placed, voids)
    has_error = any(v.severity == "error" for v in violations)

    return SolveResult(
        # Hết giờ vẫn trả về phương án tốt nhất tìm được, gắn mức cảnh báo để không ai nhầm
        # nó với một nghiệm đã chứng minh tối ưu.
        status="pass" if status == cp_model.OPTIMAL and not violations else "warning",
        solve_time_s=elapsed,
        rule_pack_version=version,
        rooms=placed,
        voids=voids,
        footprint_m=(units_to_m(fx0), units_to_m(fy0), units_to_m(fx1), units_to_m(fy1)),
        core=core,
        structural_axes_x_m=sorted(axes_x),
        structural_axes_y_m=sorted(axes_y),
        violations=violations,
        notes=(
            []
            if status == cp_model.OPTIMAL
            else ["hết thời gian, trả nghiệm tốt nhất tìm được"]
        )
        + (["có vi phạm mức chặn phát hành trên nghiệm đã tìm được"] if has_error else []),
    )


def _rects_touch(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> bool:
    """Hai hình chữ nhật chung một đoạn biên dài hơn không — dùng cho kiểm sau khi giải."""
    ax0, ax1, ay0, ay1 = a
    bx0, bx1, by0, by1 = b
    overlap_x = min(ax1, bx1) - max(ax0, bx0)
    overlap_y = min(ay1, by1) - max(ay0, by0)
    if (ay1 == by0 or by1 == ay0) and overlap_x > 0:
        return True
    if (ax1 == bx0 or bx1 == ax0) and overlap_y > 0:
        return True
    return False
