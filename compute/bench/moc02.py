"""Mốc 0.2 — đo mô hình CP-SAT liên tầng trên một đầu bài thật.

In ra thời gian giải, mặt bằng thu được, và tập ràng buộc mâu thuẫn của một đầu bài không thể
thoả. Chạy bằng:  docker run --rm nvg-design-compute python /app/bench/moc02.py
"""

from __future__ import annotations

import statistics
import sys

sys.path.insert(0, "/app/tests")

from design_compute.rules import default_rules_root, load_for_locality
from design_compute.solver import solve_townhouse
from design_compute.solver.model import RoomSpec
from test_solver import _nvo028_rooms, _request

FIFTH_FLOOR = (
    RoomSpec("terrace_5", "drying_yard", 5, "front", 18.0, min_area_m2=10.0, max_area_m2=20.0),
    RoomSpec("hall_5", "circulation", 5, "mid", 15.0, min_area_m2=8.0, max_area_m2=22.0),
    RoomSpec("roof_room_5", "store", 5, "rear", 24.0, min_area_m2=10.0, max_area_m2=30.0),
    RoomSpec("wc_5", "wc", 5, "rear", 5.0, min_area_m2=3.0, max_area_m2=12.0),
)


def main() -> None:
    pack = load_for_locality(default_rules_root(), "thai_binh")
    print("=== MỐC 0.2 — đo trên Docker tại chỗ (CHƯA phải hạ tầng thật) ===")
    print(f"rule pack: {pack.id} v{pack.version} · {len(pack.rules)} quy tắc\n")

    results = {}
    for floors, rooms in ((4, _nvo028_rooms()), (5, _nvo028_rooms() + FIFTH_FLOOR)):
        times = []
        result = None
        for _ in range(5):
            result = solve_townhouse(_request(pack, floors=floors, rooms=rooms))
            times.append(result.solve_time_s)
        results[floors] = result
        print(f"{floors} tầng · {len(rooms)} phòng · trạng thái {result.status}")
        print(
            f"   solve_time: trung vị {statistics.median(times) * 1000:.0f} ms"
            f" · nhỏ nhất {min(times) * 1000:.0f} ms"
            f" · lớn nhất {max(times) * 1000:.0f} ms"
        )
        if floors == 4:
            print("   Mặt bằng tầng 1:")
            for rm in sorted((x for x in result.rooms if x.floor == 1), key=lambda x: x.y0_m):
                print(
                    f"     {rm.id:24s} ({rm.x0_m:4.1f},{rm.y0_m:5.1f}) → "
                    f"({rm.x1_m:4.1f},{rm.y1_m:5.1f})  {rm.area_m2:5.1f} m²"
                )
            print(f"   Trục X: {result.structural_axes_x_m}")
            print(f"   Trục Y: {result.structural_axes_y_m}")
        print()

    same_core = (
        results[4].structural_axes_x_m == results[5].structural_axes_x_m
        and results[4].structural_axes_y_m[:3] == results[5].structural_axes_y_m[:3]
    )
    print(f"Đổi 4 → 5 tầng, lõi thang và trục kết cấu giữ nguyên: {same_core}\n")

    print("=== Vô nghiệm: hệ thống nói được CÁI GÌ xung đột với CÁI GÌ ===")
    impossible = (
        RoomSpec("master_1", "master_bedroom", 1, "front", 60.0, min_area_m2=60.0),
        RoomSpec("hall_1", "circulation", 1, "mid", 40.0, min_area_m2=40.0),
        RoomSpec("bed_1", "bedroom", 1, "rear", 60.0, min_area_m2=60.0),
    )
    bad = solve_townhouse(_request(pack, floors=1, rooms=impossible, time_limit_s=30.0))
    print(
        f"trạng thái {bad.status} · {bad.solve_time_s * 1000:.0f} ms"
        f" · {len(bad.conflict_set)} mục trong tập mâu thuẫn"
    )
    for entry in bad.conflict_set:
        flag = "chặn phát hành" if entry.is_legal else "bỏ qua được"
        print(f"   - {entry.rule_id:34s} {entry.involved}  [{entry.source} · {flag}]")
    for note in bad.notes:
        print(f"   ghi chú: {note}")


if __name__ == "__main__":
    main()
