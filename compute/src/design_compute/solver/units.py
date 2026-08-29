"""Quy đổi đơn vị.

Hợp đồng dữ liệu nói bằng MÉT, số thực. Bộ giải làm việc bằng đơn vị NGUYÊN, mỗi đơn vị là
một module xây dựng — nhờ đó mọi kích thước là bội số nguyên của module theo cấu trúc chứ
không phải theo một phép kiểm tra, và miền giá trị của biến CP-SAT đủ nhỏ để tìm kiếm nhanh.

Module là 100 mm, cũng chính là con số quy tắc `module_grid_100mm` ghi. Hằng số đặt ở đây chứ
không đặt trong rule pack vì nó là ĐỘ PHÂN GIẢI NỘI BỘ của bộ giải, không phải một ngưỡng quy
chuẩn — đổi nó là đổi mô hình, không phải đổi quy định phải tuân thủ.
"""

from __future__ import annotations

MODULE_MM = 100
"""Độ phân giải của bộ giải, tính bằng milimét. Một đơn vị nguyên == 100 mm."""


def m_to_units(metres: float) -> int:
    """Mét sang số module nguyên, làm tròn về gần nhất để 2,45 m không âm thầm thành 2,4 m."""
    return round(metres * 1000 / MODULE_MM)


def m_to_units_ceil(metres: float) -> int:
    """Mét sang số module nguyên, làm tròn LÊN.

    Dùng cho GIÁ TRỊ TỐI THIỂU: hạn 0,9 m của hành lang không được coi là đã thoả bởi 0,85 m
    chỉ vì đó là module gần hơn.
    """
    exact = metres * 1000 / MODULE_MM
    rounded = round(exact)
    return rounded if abs(exact - rounded) < 1e-9 else int(exact) + 1


def m_to_units_floor(metres: float) -> int:
    """Mét sang số module nguyên, làm tròn XUỐNG. Dùng cho GIÁ TRỊ TỐI ĐA."""
    exact = metres * 1000 / MODULE_MM
    rounded = round(exact)
    return rounded if abs(exact - rounded) < 1e-9 else int(exact)


def units_to_m(units: int) -> float:
    """Module đổi ngược về mét."""
    return units * MODULE_MM / 1000


def m2_to_units2(square_metres: float) -> int:
    """Mét vuông sang module vuông (1 đơn vị² == 0,01 m²), làm tròn về gần nhất."""
    return round(square_metres / (MODULE_MM / 1000) ** 2)


def m2_to_units2_ceil(square_metres: float) -> int:
    """Mét vuông sang module vuông, làm tròn LÊN. Dùng cho diện tích tối thiểu."""
    exact = square_metres / (MODULE_MM / 1000) ** 2
    rounded = round(exact)
    return rounded if abs(exact - rounded) < 1e-9 else int(exact) + 1


def units_to_m2(square_units: int) -> float:
    """Module vuông đổi ngược về mét vuông."""
    return square_units * (MODULE_MM / 1000) ** 2
