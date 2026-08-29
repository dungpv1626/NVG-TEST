"""Bộ giải mặt bằng bằng CP-SAT.

Giải phần đặt khối và MỌI TẦNG trong CÙNG MỘT mô hình. Lõi thang, trục tường chịu lực và hộp
kỹ thuật là biến DÙNG CHUNG giữa các tầng — giải từng tầng riêng thì việc chúng thẳng hàng
với nhau chỉ còn là chuyện may rủi.

Gói này phải giữ tính TẤT ĐỊNH: không bao giờ import phần gọi mô hình ngôn ngữ.
"""

from design_compute.solver.units import MODULE_MM, m_to_units, units_to_m, units_to_m2
from design_compute.solver.model import SolveRequest, SolveResult, solve_townhouse

__all__ = [
    "MODULE_MM",
    "m_to_units",
    "units_to_m",
    "units_to_m2",
    "SolveRequest",
    "SolveResult",
    "solve_townhouse",
]
