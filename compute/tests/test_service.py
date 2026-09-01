"""Kiểm thử ranh giới Container: hợp đồng dữ liệu, adapter, và hai đầu ra của /solve.

Phần này KHÔNG kiểm lại bộ giải (đã có `test_solver.py`). Nó kiểm đúng thứ nằm giữa: dữ liệu
vào có bị chặn khi sai hợp đồng không, và dữ liệu ra có đúng hợp đồng không. Đó là chỗ hai
runtime gặp nhau, và cũng là chỗ lỗi im lặng nhất nếu không có test.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from design_compute.contracts import ContractError, available_contracts, validate
from design_compute.service import app

client = TestClient(app, raise_server_exceptions=False)

# Mọi hợp đồng phải có mặt trong ảnh Docker. Liệt kê TÊN chứ không đếm số: một con số vỡ ra
# chỉ nói "lệch", còn danh sách nói thẳng tệp nào thiếu — và thêm một lớp mới buộc phải sửa
# đúng một chỗ, có chủ đích.
EXPECTED_CONTRACTS = {
    "arch-model",
    "cad-extraction",
    "design-brief",
    "floor-plan",
    "infeasibility-report",
    "kb-record",
    "layout-intent",
    "publish-request",
    "render-request",
    "render-result",
    "schedules",
    "space-program",
}


# ---------------------------------------------------------------------------
# Hợp đồng dữ liệu
# ---------------------------------------------------------------------------


class TestContracts:
    def test_every_contract_is_present(self) -> None:
        """Thiếu một hợp đồng nghĩa là `COPY contracts/` trong Dockerfile đã hỏng."""
        assert set(available_contracts()) == EXPECTED_CONTRACTS

    def test_rejects_layout_intent_without_core(self) -> None:
        """Nhà phố phải có đúng một lõi — hợp đồng bắt `cores` tối thiểu một phần tử."""
        with pytest.raises(ContractError):
            validate(
                "layout-intent",
                {
                    "schema_version": "1.0.0",
                    "program_ref": "sha256:" + "a" * 64,
                    "variant_id": "A",
                    "massing": {"wings": [{"id": "W1"}]},
                    "cores": [],
                    "floors": [{"level": 1, "wings": [{"wing_id": "W1", "tree": {"room": "a"}}]}],
                },
            )

    def test_rejects_hybrid_tree_node(self) -> None:
        """Nút cây phải là ĐÚNG MỘT trong ba dạng, không được lai `split` với `room`."""
        with pytest.raises(ContractError):
            validate(
                "layout-intent",
                {
                    "schema_version": "1.0.0",
                    "program_ref": "sha256:" + "a" * 64,
                    "variant_id": "A",
                    "massing": {"wings": [{"id": "W1"}]},
                    "cores": [{"id": "C1", "wing": "W1"}],
                    "floors": [
                        {
                            "level": 1,
                            "wings": [
                                {
                                    "wing_id": "W1",
                                    "tree": {
                                        "split": "H",
                                        "room": "living_1",
                                        "a": {"room": "a"},
                                        "b": {"room": "b"},
                                    },
                                }
                            ],
                        }
                    ],
                },
            )

    def test_rejects_artifact_ref_that_is_not_a_hash(self) -> None:
        with pytest.raises(ContractError):
            validate(
                "space-program",
                {
                    "schema_version": "1.0.0",
                    "brief_ref": "NVO-028",
                    "spaces": [
                        {"id": "living_1", "type": "living", "floor": 1, "min_area_m2": 16.0}
                    ],
                },
            )

    def test_floor_plan_requires_rule_pack_version(self) -> None:
        """Không có nó thì không tái lập được phương án cũ sau khi quy chuẩn thay đổi."""
        with pytest.raises(ContractError) as exc:
            validate(
                "floor-plan",
                {
                    "schema_version": "1.0.0",
                    "intent_ref": "sha256:" + "b" * 64,
                    "site": {
            "width_m": 5.0,
            "depth_m": 18.0,
            "area_m2": 90.0,
            "open_faces": ["front", "back"],
            "access_faces": ["front"],
        },
        "labels": {
            "garage_1": "Gara",
            "landing_1": "Thang bộ tầng 1",
            "living_1": "Phòng khách",
            "bedroom_2": "Phòng ngủ 1",
            "landing_2": "Thang bộ tầng 2",
            "bedroom_3": "Phòng ngủ 2",
        },
                    "levels": [{"level": 1, "rooms": []}],
                    "constraint_report": {"status": "pass"},
                },
            )
        assert "rule_pack_version" in str(exc.value)


# ---------------------------------------------------------------------------
# Dữ liệu mẫu cho /solve — nhà phố 5×18, hai tầng
# ---------------------------------------------------------------------------

REF = "sha256:" + "c" * 64


def _program(**overrides: object) -> dict:
    spaces = [
        {
            "id": "garage_1",
            "type": "garage",
            "floor": 1,
            "min_area_m2": 14.0,
            "max_area_m2": 60.0,
            "needs_daylight": False,
        },
        {
            "id": "landing_1",
            "type": "stair",
            "floor": 1,
            "min_area_m2": 8.0,
            "max_area_m2": 60.0,
            "needs_daylight": False,
        },
        {
            "id": "living_1",
            "type": "living",
            "floor": 1,
            "min_area_m2": 16.0,
            "max_area_m2": 60.0,
            "needs_daylight": True,
        },
        {
            "id": "bedroom_2",
            "type": "bedroom",
            "floor": 2,
            "min_area_m2": 14.0,
            "max_area_m2": 60.0,
            "needs_daylight": True,
        },
        {
            "id": "landing_2",
            "type": "stair",
            "floor": 2,
            "min_area_m2": 8.0,
            "max_area_m2": 60.0,
            "needs_daylight": False,
        },
        {
            "id": "bedroom_3",
            "type": "bedroom",
            "floor": 2,
            "min_area_m2": 16.0,
            "max_area_m2": 60.0,
            "needs_daylight": True,
        },
    ]
    return {
        "schema_version": "1.0.0",
        "brief_ref": REF,
        "spaces": spaces,
        "adjacency": [],
        **overrides,
    }


def _intent() -> dict:
    def tree(front: str, mid: str, rear: str) -> dict:
        return {
            "split": "H",
            "ratio_hint": 0.3,
            "a": {"room": front},
            "b": {"split": "H", "ratio_hint": 0.5, "a": {"room": mid}, "b": {"room": rear}},
        }

    return {
        "schema_version": "1.0.0",
        "program_ref": REF,
        "variant_id": "A",
        "variant_label": "Lõi giữa",
        "massing": {"wings": [{"id": "W1"}], "wing_links": []},
        "cores": [{"id": "C1", "wing": "W1", "band": "left", "position_hint": "middle"}],
        "floors": [
            {"level": 1, "wings": [{"wing_id": "W1", "tree": tree("garage_1", "landing_1", "living_1")}]},
            {"level": 2, "wings": [{"wing_id": "W1", "tree": tree("bedroom_2", "landing_2", "bedroom_3")}]},
        ],
    }


def _payload(**overrides: object) -> dict:
    return {
        "intent": _intent(),
        "intent_ref": REF,
        "program": _program(),
        "site": {
            "width_m": 5.0,
            "depth_m": 18.0,
            "area_m2": 90.0,
            "open_faces": ["front", "back"],
            "access_faces": ["front"],
        },
        "labels": {
            "garage_1": "Gara",
            "landing_1": "Thang bộ tầng 1",
            "living_1": "Phòng khách",
            "bedroom_2": "Phòng ngủ 1",
            "landing_2": "Thang bộ tầng 2",
            "bedroom_3": "Phòng ngủ 2",
        },
        "rule_pack": {"locality": "thai_binh"},
        "time_budget_s": 30,
        **overrides,
    }


class TestHealth:
    def test_health_loads_rule_pack_and_contracts(self) -> None:
        """Kiểm tra sống phải CHẠM tới rule pack và hợp đồng.

        Hai lỗi triển khai hay gặp nhất là quên `COPY rules/` và quên `COPY contracts/`; cả
        hai chỉ lộ ra ở lời gọi nghiệp vụ đầu tiên nếu /health chỉ trả `{"ok": true}`.
        """
        body = client.get("/health").json()
        assert body["ok"] is True
        assert body["rule_pack"]["rules"] > 0
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


class TestSolve:
    def test_returns_floor_plan_matching_contract(self) -> None:
        response = client.post("/solve", json=_payload())
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["status"] == "ok"

        # Đầu ra tự kiểm lại theo hợp đồng: service đã validate trước khi trả, test kiểm lại
        # để một thay đổi ở adapter không lặng lẽ vượt qua nhờ service quên gọi validate.
        validate("floor-plan", body["floor_plan"])

        plan = body["floor_plan"]
        assert [lv["level"] for lv in plan["levels"]] == [1, 2]
        assert plan["rule_pack_version"]
        assert plan["intent_ref"] == REF

    def test_core_is_shared_across_floors(self) -> None:
        """Lõi thang là biến DÙNG CHUNG — một đa giác cho mọi tầng, không phải mỗi tầng một."""
        plan = client.post("/solve", json=_payload()).json()["floor_plan"]
        assert len(plan["cores"]) == 1
        assert plan["cores"][0]["levels"] == [1, 2]

    def test_rejects_payload_that_breaks_contract(self) -> None:
        """Sai hợp đồng → 422 và KHÔNG đáng thử lại.

        Trả 5xx ở đây sẽ khiến Workflow đốt bốn lần thử vào một dữ liệu sai cấu trúc.
        """
        broken = _payload()
        broken["intent"]["cores"] = []
        response = client.post("/solve", json=broken)
        assert response.status_code == 422
        assert response.json()["retryable"] is False

    def test_rejects_room_missing_from_layout_tree(self) -> None:
        """Phòng có trong chương trình mà không có trong cây là lỗi cấu trúc, không đoán bù."""
        payload = _payload()
        payload["program"]["spaces"].append(
            {"id": "kho_1", "type": "storage", "floor": 1, "min_area_m2": 3.0}
        )
        response = client.post("/solve", json=payload)
        assert response.status_code == 422
        assert "kho_1" in response.json()["error"]

    def test_infeasible_returns_readable_explanation(self) -> None:
        """Vô nghiệm là KẾT QUẢ, không phải lỗi — mã 200 kèm lời giải thích đọc được.

        Ép mâu thuẫn bằng cách đòi cả ba phòng tầng 1 đều rất lớn trên lô 5×18.
        """
        payload = _payload()
        for space in payload["program"]["spaces"]:
            space["min_area_m2"] = 60.0
            space["max_area_m2"] = 90.0

        response = client.post("/solve", json=payload)
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["status"] == "infeasible"

        validate("infeasibility-report", body["report"])
        message = body["report"]["human_message"]

        # Câu giải thích phải nói được VÌ SAO, không phải in ra mã quy tắc.
        assert "không thể đồng thời" in message.lower()
        assert "rule_id" not in message
        # Tập mâu thuẫn phải đủ nhỏ để đọc: OR-Tools trả tập ĐỦ (~40 mục trên đầu bài thật),
        # bộ giải thu hẹp lại bằng bộ lọc xoá dần trước khi tới người đọc (vướng mắc V-4).
        assert 1 <= len(body["report"]["conflict_set"]) <= 6


class TestExportDxf:
    """Xuất bản vẽ: MỘT CHIỀU, và tệp ra phải mở được."""

    def test_exports_the_solved_plan(self) -> None:
        plan = client.post("/solve", json=_payload()).json()["floor_plan"]
        response = client.post(
            "/export/dxf",
            json={
                "floor_plan": plan,
                "level": 1,
                "title_block": {
                    "project_code": "NVO-TK-2026-0001",
                    "project_name": "[TEST] Nhà anh A",
                    "discipline": "Kiến trúc",
                    "sheet": "Mặt bằng",
                    "version": "a1b2c3d4",
                    "date": "30/08/2026",
                },
            },
        )
        assert response.status_code == 200, response.text
        assert response.headers["content-type"].startswith("application/dxf")
        body = response.content.decode("utf-8")
        assert body.startswith("  0\nSECTION"), "tệp phải là DXF hợp lệ ngay từ dòng đầu"
        assert "NVO-TK-2026-0001" in body

    def test_a_level_that_does_not_exist_is_a_data_error_not_a_crash(self) -> None:
        plan = client.post("/solve", json=_payload()).json()["floor_plan"]
        response = client.post(
            "/export/dxf",
            json={
                "floor_plan": plan,
                "level": 9,
                "title_block": {
                    "project_code": "X",
                    "project_name": "X",
                    "discipline": "Kiến trúc",
                    "sheet": "Mặt bằng",
                    "version": "v",
                    "date": "30/08/2026",
                },
            },
        )
        assert response.status_code == 422
        assert response.json()["retryable"] is False

    def test_the_solved_plan_carries_walls_and_openings(self) -> None:
        """Lớp 3c: mặt bằng không còn là danh sách ô chữ nhật trần."""
        plan = client.post("/solve", json=_payload()).json()["floor_plan"]
        level = plan["levels"][0]
        assert level["walls"], "mặt bằng phải có tường"
        wall_ids = {w["id"] for w in level["walls"]}
        for opening in level["openings"]:
            assert opening["wall"] in wall_ids, "lỗ mở trỏ tới bức tường không tồn tại"
