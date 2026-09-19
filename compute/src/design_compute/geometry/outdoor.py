"""Đoạn nào của một bức tường là LAN CAN của không gian ngoài trời.

Tách riêng vì hai nơi cùng cần và phải trả lời giống hệt nhau: tờ mặt bằng (`sheet/model.py`)
vẽ nó thành hai nét mảnh, khối ba chiều (`massing.py`) dựng nó thành dải thấp. Hai bản thực
thi lệch nhau thì bản vẽ và khối nói khác nhau về cùng một cạnh, và không có gì báo.

## Vì sao theo ĐOẠN chứ không theo cả bức tường

Tường trên mặt bằng là đoạn thẳng đã GỘP: ba phòng xếp dọc chung một tuyến tường thì đó là
MỘT bức chạy suốt (`geometry/walls.py`). Nên một bức tường mặt tiền có thể vừa là lan can của
ban công vừa là tường của phòng bên cạnh — xét điểm giữa của cả bức sẽ trả lời theo phòng nào
tình cờ nằm ở giữa. Đo được 06/09/2026: ban công 1,7 m nằm cạnh phòng làm việc 3,3 m trên
cùng một tuyến, điểm giữa rơi vào phòng làm việc, và ban công ra bản vẽ là phòng kín.

Đơn vị không quan trọng — hàm chỉ cần toạ độ tường và toạ độ phòng cùng một hệ.
"""

from __future__ import annotations

Point = tuple[float, float]
Polygon = list[Point]


def _contains(polygon: Polygon, point: Point) -> bool:
    x, y = point
    inside = False
    n = len(polygon)
    for i in range(n):
        x0, y0 = polygon[i]
        x1, y1 = polygon[(i + 1) % n]
        if (y0 > y) != (y1 > y):
            cross = x0 + (y - y0) * (x1 - x0) / (y1 - y0)
            if x < cross:
                inside = not inside
    return inside


def railing_spans(
    a: Point,
    b: Point,
    open_air: list[Polygon],
    indoor: list[Polygon],
    *,
    step: float,
) -> list[tuple[float, float]]:
    """Các đoạn `[s0, s1]` dọc tường mà một bên là ngoài trời, bên kia là ngoài công trình.

    `step` là khoảng dời sang hai bên tim tường để xét — đủ lớn để rơi hẳn vào trong một ô,
    đủ nhỏ để không nhảy qua một phòng hẹp. Gọi bằng đơn vị của chính toạ độ truyền vào.

    Cạnh giữa ban công và phòng trong nhà KHÔNG phải lan can: cửa ra ban công nằm ở đó.
    """
    if not open_air:
        return []
    (ax, ay), (bx, by) = a, b
    dx, dy = bx - ax, by - ay
    length = (dx * dx + dy * dy) ** 0.5
    if length <= 1e-9:
        return []
    ux, uy = dx / length, dy / length
    nx, ny = -uy, ux

    # Điểm cắt: hai đầu tường, cộng hình chiếu của mọi đỉnh phòng lên trục tường. Giữa hai
    # điểm cắt liền nhau, phân loại hai bên không đổi — nên xét một lần ở điểm giữa là đủ.
    marks = {0.0, length}
    for poly in (*open_air, *indoor):
        for px, py in poly:
            s = (px - ax) * ux + (py - ay) * uy
            if 1e-6 < s < length - 1e-6:
                marks.add(s)
    cuts = sorted(marks)

    def classify(s: float) -> bool:
        mx, my = ax + ux * s, ay + uy * s
        sides = set()
        for sign in (1.0, -1.0):
            point = (mx + nx * sign * step, my + ny * sign * step)
            if any(_contains(poly, point) for poly in open_air):
                sides.add("outdoor")
            elif any(_contains(poly, point) for poly in indoor):
                sides.add("indoor")
            else:
                sides.add("outside")
        return sides == {"outdoor", "outside"}

    spans: list[tuple[float, float]] = []
    for s0, s1 in zip(cuts, cuts[1:]):
        if s1 - s0 <= 1e-6 or not classify((s0 + s1) / 2):
            continue
        if spans and abs(spans[-1][1] - s0) < 1e-6:
            spans[-1] = (spans[-1][0], s1)
        else:
            spans.append((s0, s1))
    return spans


def split_by(
    s0: float, s1: float, spans: list[tuple[float, float]]
) -> list[tuple[float, float, bool]]:
    """Cắt đoạn `[s0, s1]` theo `spans`, kèm cờ "đoạn này thuộc lan can hay không"."""
    marks = {s0, s1}
    for a, b in spans:
        if s0 < a < s1:
            marks.add(a)
        if s0 < b < s1:
            marks.add(b)
    out: list[tuple[float, float, bool]] = []
    ordered = sorted(marks)
    for lo, hi in zip(ordered, ordered[1:]):
        if hi - lo <= 1e-6:
            continue
        mid = (lo + hi) / 2
        out.append((lo, hi, any(a - 1e-6 <= mid <= b + 1e-6 for a, b in spans)))
    return out
