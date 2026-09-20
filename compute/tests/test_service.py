"""Kiểm thử ranh giới Container: hợp đồng có mặt trong ảnh, và kiểm tra sống.

Các ca của /solve, /export/* và /schedules đã gỡ cùng bộ giải nội bộ (T58). Hai đầu ra số hoá
(/extract, /kb/record) kiểm ở `test_digitise.py` và `test_kb_record.py`.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from design_compute.contracts import available_contracts
from design_compute.service import app

client = TestClient(app, raise_server_exceptions=False)

# Mọi hợp đồng phải có mặt trong ảnh Docker. Liệt kê TÊN chứ không đếm số: một con số vỡ ra
# chỉ nói "lệch", còn danh sách nói thẳng tệp nào thiếu — và thêm một lớp mới buộc phải sửa
# đúng một chỗ, có chủ đích.
EXPECTED_CONTRACTS = {
    # Hợp đồng của nhánh AI. Container KHÔNG đọc cái nào: nhánh AI không đi qua Container
    # (T14). Chúng nằm trong ảnh vì `contracts/` được copy nguyên thư mục, và liệt kê ở đây để
    # danh sách nói đúng thực tế thay vì trở thành chỗ phải nhớ loại trừ.
    "ai-brief-digest",
    "ai-facade-brief",
    "ai-facade-concept",
    "ai-facade-image",
    "ai-facade-proposal",
    "ai-floor-plan",
    "ai-floor-plan-proposal",
    "ai-house-intent",
    "ai-image-set",
    "ai-plan-edit",
    "ai-plan-intent",
    "ai-plan-rooms",
    "ai-plan-sheet-image",
    "ai-plan-tree",
    "ai-space-program",
    "ai-space-program-proposal",
    # Số hoá hồ sơ cũ — hai hợp đồng Container thật sự đọc và ghi.
    "cad-extraction",
    "kb-record",
    # Đầu bài và ranh giới thửa đất — chạy ở Worker, cùng lý do có mặt như nhóm AI.
    "design-brief",
    "site-boundary-extraction",
}


class TestContracts:
    def test_every_contract_is_present(self) -> None:
        """Thiếu một hợp đồng nghĩa là `COPY contracts/` trong Dockerfile đã hỏng."""
        assert set(available_contracts()) == EXPECTED_CONTRACTS


class TestHealth:
    def test_health_loads_contracts(self) -> None:
        """Kiểm tra sống phải CHẠM tới hợp đồng — quên `COPY contracts/` chỉ lộ ra ở lời gọi
        nghiệp vụ đầu tiên nếu /health chỉ trả `{"ok": true}`."""
        body = client.get("/health").json()
        assert body["ok"] is True
        assert set(body["contracts"]) == EXPECTED_CONTRACTS

    def test_health_declares_whether_dwg_can_be_read(self) -> None:
        """Khả năng đọc `.dwg` khác nhau giữa các bản build của cùng một ảnh Docker.

        Công cụ ODA không được commit (giấy phép Open Design Alliance không cho phát tán
        lại), nên ảnh build ở máy chưa có bộ cài vẫn chạy được mọi thứ trừ phần đọc CAD.
        /health phải nói ra điều đó, chứ không để lỗi nổ ra giữa chừng một mẻ số hoá.
        """
        cad = client.get("/health").json()["cad"]
        assert isinstance(cad["dwg_reader"], bool)
        assert cad["layer_mapping_version"]

    def test_solver_endpoints_are_gone(self) -> None:
        """Bộ giải nội bộ đã gỡ (T58) — không đường nào của nó còn trả lời."""
        for path in ("/solve", "/export/dxf", "/export/svg", "/export/glb", "/schedules"):
            assert client.post(path, json={}).status_code == 404, path
