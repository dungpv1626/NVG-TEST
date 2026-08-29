"""Mặt tiếp xúc HTTP của bước số hoá: `/extract` và `/kb/record`.

Hai điều đáng kiểm nhất ở đây không phải đường đi thuận lợi, mà là:
(a) Container **tự kiểm đầu ra của chính mình** theo hợp đồng — Worker không tin Container
    và ngược lại;
(b) lỗi được phân loại đúng — tệp sai định dạng (422, đừng thử lại) khác hẳn thiếu công cụ
    trong bản triển khai (503). Gộp chúng lại thì Workflow đốt bốn lượt thử vào một tệp PDF.
"""

from __future__ import annotations

from io import BytesIO
from pathlib import Path

import ezdxf
import pytest
from fastapi.testclient import TestClient

from design_compute.cad import oda_available
from design_compute.service import app

client = TestClient(app, raise_server_exceptions=False)

TENANT = "00000000-0000-0000-0000-000000000001"


def _dxf_bytes(tmp_path: Path, *, layer: str = "A-AREA-ROOM") -> bytes:
    doc = ezdxf.new("R2018")
    doc.header["$INSUNITS"] = 4
    msp = doc.modelspace()
    msp.add_lwpolyline(
        [(0, 0), (5000, 0), (5000, 6000), (0, 6000)], close=True, dxfattribs={"layer": layer}
    )
    msp.add_lwpolyline(
        [(0, 6000), (5000, 6000), (5000, 10000), (0, 10000)], close=True, dxfattribs={"layer": layer}
    )
    msp.add_text("PHONG KHACH", dxfattribs={"layer": "A-ROOM-IDEN"}).set_placement((2500, 3000))
    msp.add_text("PN1", dxfattribs={"layer": "A-ROOM-IDEN"}).set_placement((2500, 8000))
    path = tmp_path / "mb-tang-1.dxf"
    doc.saveas(path)
    return path.read_bytes()


def _upload(data: bytes, name: str = "mb-tang-1.dxf"):
    return client.post("/extract", files={"file": (name, BytesIO(data), "application/octet-stream")})


class TestExtractEndpoint:
    def test_extracts_rooms_and_labels(self, tmp_path: Path) -> None:
        body = _upload(_dxf_bytes(tmp_path)).json()
        assert body["status"] == "ok"
        rooms = body["extraction"]["rooms"]
        assert sorted(r["area_m2"] for r in rooms) == [20.0, 30.0]
        assert {r["label_raw"] for r in rooms} == {"PHONG KHACH", "PN1"}

    def test_response_satisfies_the_contract(self, tmp_path: Path) -> None:
        """Container tự kiểm đầu ra của mình trước khi trả — không đợi Worker phát hiện."""
        from design_compute.contracts import validate

        validate("cad-extraction", _upload(_dxf_bytes(tmp_path)).json()["extraction"])

    def test_unmapped_layer_is_reported_not_swallowed(self, tmp_path: Path) -> None:
        body = _upload(_dxf_bytes(tmp_path, layer="QUY-UOC-LA")).json()
        assert body["extraction"]["layers_unmapped"] == ["QUY-UOC-LA"]
        assert any(w["code"] == "no_rooms" for w in body["extraction"]["warnings"])

    def test_pdf_is_refused_without_burning_retries(self) -> None:
        """Sai định dạng là lỗi dữ liệu: 422 và KHÔNG đáng thử lại."""
        response = _upload(b"%PDF-1.7 ...", name="mat-bang.pdf")
        assert response.status_code == 422
        assert response.json()["retryable"] is False

    def test_empty_file_is_refused(self) -> None:
        assert _upload(b"").status_code == 422

    def test_corrupt_dxf_is_a_data_error_not_a_crash(self) -> None:
        response = _upload(b"day khong phai DXF")
        assert response.status_code == 422
        assert "không đọc được" in response.json()["error"]

    @pytest.mark.skipif(oda_available(), reason="ODA đã cài — nhánh này chỉ đúng khi thiếu")
    def test_missing_converter_is_a_deployment_problem_not_a_data_problem(self) -> None:
        response = _upload(b"DWG-gia", name="mb.dwg")
        assert response.status_code == 503
        assert "kb/vendor" in response.json()["error"]

    @pytest.mark.skipif(not oda_available(), reason="chưa cài ODA File Converter")
    def test_dwg_goes_through_the_converter(self, tmp_path: Path) -> None:
        from design_compute.cad.convert import dxf_to_dwg

        (tmp_path / "src.dxf").write_bytes(_dxf_bytes(tmp_path))
        dwg = dxf_to_dwg(tmp_path / "src.dxf", tmp_path / "out").dxf
        body = _upload(dwg.read_bytes(), name="mb-tang-1.dwg").json()
        assert sorted(r["area_m2"] for r in body["extraction"]["rooms"]) == [20.0, 30.0]


class TestKbRecordEndpoint:
    def _extraction(self, tmp_path: Path) -> dict:
        return _upload(_dxf_bytes(tmp_path)).json()["extraction"]

    def test_builds_a_valid_record_from_extractions(self, tmp_path: Path) -> None:
        extraction = self._extraction(tmp_path)
        response = client.post(
            "/kb/record",
            json={
                "tenant_id": TENANT,
                "project_code": "NVO-015",
                "building_type": "nha_pho",
                "site": {"width_m": 5.0, "depth_m": 10.0},
                "plans": [extraction],
                "room_types": [["living", "bedroom"]],
                "has_brief": True,
            },
        )
        body = response.json()
        assert response.status_code == 200
        assert body["record"]["floors"] == 1
        assert body["record"]["slicing_tree"]["split"] == "H"

    def test_checks_are_returned_alongside_the_score(self, tmp_path: Path) -> None:
        """Người xác nhận cần biết bản ghi mất điểm vì gì, không chỉ biết nó được 0,62."""
        body = client.post(
            "/kb/record",
            json={
                "tenant_id": TENANT,
                "project_code": "NVO-015",
                "building_type": "nha_pho",
                "site": {"width_m": 5.0, "depth_m": 10.0},
                "plans": [self._extraction(tmp_path)],
            },
        ).json()
        assert 0 < body["record"]["quality_score"] < 1
        assert {c["code"] for c in body["checks"]} >= {"rooms_present", "slicing_tree"}

    def test_round_trip_through_the_contract_loses_nothing(self, tmp_path: Path) -> None:
        """Container KHÔNG giữ trạng thái: kết quả trích quay lại nguyên vẹn ở lời gọi sau."""
        extraction = self._extraction(tmp_path)
        body = client.post(
            "/kb/record",
            json={
                "tenant_id": TENANT,
                "project_code": "NVO-015",
                "building_type": "nha_pho",
                "site": {"width_m": 5.0, "depth_m": 10.0},
                "plans": [extraction],
            },
        ).json()
        rebuilt = body["record"]["floor_plans"][0]["rooms"]
        assert [r["area_m2"] for r in rebuilt] == [r["area_m2"] for r in extraction["rooms"]]
        assert [r["label_raw"] for r in rebuilt] == [r["label_raw"] for r in extraction["rooms"]]

    def test_extraction_not_matching_the_contract_is_refused(self) -> None:
        response = client.post(
            "/kb/record",
            json={
                "tenant_id": TENANT,
                "project_code": "NVO-015",
                "building_type": "nha_pho",
                "site": {"width_m": 5.0, "depth_m": 10.0},
                "plans": [{"schema_version": "1.0.0", "source_file": "x.dxf"}],
            },
        )
        assert response.status_code == 422
        assert response.json()["retryable"] is False

    def test_no_plans_is_refused_by_the_request_model(self) -> None:
        response = client.post(
            "/kb/record",
            json={
                "tenant_id": TENANT,
                "project_code": "NVO-015",
                "building_type": "nha_pho",
                "site": {"width_m": 5.0, "depth_m": 10.0},
                "plans": [],
            },
        )
        assert response.status_code == 422
