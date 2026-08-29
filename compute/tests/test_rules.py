"""Nạp rule pack và kiểm tra định dạng."""

from __future__ import annotations

import textwrap
from pathlib import Path

import pytest

from design_compute.rules import (
    Severity,
    default_rules_root,
    load_for_locality,
    load_pack,
    validate_pack,
)
from design_compute.rules.loader import RulePackError, merge
from design_compute.rules.messages import MessageCatalog
from design_compute.rules.model import Rule

RULES_ROOT = default_rules_root()


def _write_pack(tmp_path: Path, meta: str, rules: str) -> Path:
    (tmp_path / "00-meta.yaml").write_text(textwrap.dedent(meta), encoding="utf-8")
    (tmp_path / "10-rules.yaml").write_text(textwrap.dedent(rules), encoding="utf-8")
    return tmp_path


BASE_META = """
    pack:
      id: test
      version: "2026.08.1"
      locality: null
"""


class TestLegalExperienceSplit:
    """Ranh giới quyết định hệ thống có được dùng hay không.

    Quy tắc chỉ phản ánh kinh nghiệm NVG thì không bao giờ được chặn phát hành — kiến trúc sư
    bị chặn bởi thứ không bắt buộc theo luật sẽ bỏ dùng hệ thống. Ngược lại, quy tắc dẫn quy
    chuẩn mà chỉ cảnh báo là từ bỏ phần kiểm soát pháp lý.
    """

    def test_experience_rule_claiming_error_is_rejected(self, tmp_path: Path) -> None:
        _write_pack(
            tmp_path,
            BASE_META,
            """
            - id: altar_room_top_floor
              applies_to: [nha_pho]
              scope: building
              predicate: floor_preference
              target: altar_room
              value: top
              severity: error
              source: "kinh nghiệm NVG"
            """,
        )
        with pytest.raises(RulePackError) as exc:
            load_pack(tmp_path)
        assert "altar_room_top_floor" in str(exc.value)
        assert "kinh nghiệm NVG" in str(exc.value)

    def test_experience_rule_warning_is_accepted(self, tmp_path: Path) -> None:
        _write_pack(
            tmp_path,
            BASE_META,
            """
            - id: altar_room_top_floor
              applies_to: [nha_pho]
              scope: building
              predicate: floor_preference
              target: altar_room
              value: top
              severity: warning
              source: "kinh nghiệm NVG"
            """,
        )
        pack = load_pack(tmp_path)
        assert pack.rules[0].severity is Severity.WARNING

    def test_legal_rule_that_only_warns_is_flagged_but_loads(self, tmp_path: Path) -> None:
        """Chỉ cảnh báo, không từ chối: pack vẫn nạp được, nhưng khoảng hở được nêu ra."""
        _write_pack(
            tmp_path,
            BASE_META,
            """
            - id: corridor_min_width
              applies_to: [nha_pho]
              scope: floor
              predicate: min_dimension
              target: circulation
              value_m: 0.9
              severity: warning
              source: "QCVN 01:2021/BXD"
            """,
        )
        pack = load_pack(tmp_path)
        issues = validate_pack(pack)
        assert any(i.level == "warning" and i.rule_id == "corridor_min_width" for i in issues)

    def test_unclassifiable_source_is_flagged(self, tmp_path: Path) -> None:
        _write_pack(
            tmp_path,
            BASE_META,
            """
            - id: something
              applies_to: [nha_pho]
              scope: floor
              predicate: min_area
              target: bedroom
              value_m2: 9.0
              severity: warning
              source: "ai đó bảo thế"
            """,
        )
        issues = validate_pack(load_pack(tmp_path))
        assert any("Không phân loại được" in i.message for i in issues)


class TestStructuralValidation:
    def test_unknown_predicate_is_rejected(self, tmp_path: Path) -> None:
        _write_pack(
            tmp_path,
            BASE_META,
            """
            - id: bogus
              applies_to: [nha_pho]
              scope: floor
              predicate: vibe_check
              severity: warning
              source: "kinh nghiệm NVG"
            """,
        )
        with pytest.raises(RulePackError, match="vibe_check"):
            load_pack(tmp_path)

    def test_industrial_building_type_is_rejected(self, tmp_path: Path) -> None:
        """`nha_xuong` nằm ngoài phạm vi module; quy tắc nhắm vào nó là một nhầm lẫn."""
        _write_pack(
            tmp_path,
            BASE_META,
            """
            - id: bogus
              applies_to: [nha_xuong]
              scope: floor
              predicate: min_area
              target: bedroom
              value_m2: 9.0
              severity: warning
              source: "kinh nghiệm NVG"
            """,
        )
        with pytest.raises(RulePackError, match="nha_xuong"):
            load_pack(tmp_path)

    def test_duplicate_rule_id_is_rejected(self, tmp_path: Path) -> None:
        """Pack địa phương ghi đè theo mã, nên mã trùng làm việc ghi đè trở nên mơ hồ."""
        _write_pack(
            tmp_path,
            BASE_META,
            """
            - id: same
              applies_to: [nha_pho]
              scope: floor
              predicate: min_area
              target: bedroom
              value_m2: 9.0
              severity: warning
              source: "kinh nghiệm NVG"
            - id: same
              applies_to: [nha_pho]
              scope: floor
              predicate: min_area
              target: living
              value_m2: 14.0
              severity: warning
              source: "kinh nghiệm NVG"
            """,
        )
        with pytest.raises(RulePackError, match="khai 2 lần"):
            load_pack(tmp_path)


class TestLocalityOverride:
    def test_locality_overrides_base_by_rule_id(self) -> None:
        base = load_pack(RULES_ROOT / "base")
        rule = Rule(
            id="corridor_min_width",
            applies_to=("nha_pho",),
            scope="floor",
            predicate="min_dimension",
            severity=Severity.ERROR,
            source="QCVN 01:2021/BXD",
            params={"target": "circulation", "value_m": 1.2},
        )
        from design_compute.rules.model import RulePack

        override = RulePack(id="somewhere", version="2026.08.1", rules=(rule,))
        merged = merge(base, override)

        assert merged.by_id()["corridor_min_width"].params["value_m"] == 1.2
        # Quy tắc không có trong pack địa phương thì giữ nguyên từ pack nền.
        assert "stair_alignment" in merged.by_id()
        assert len(merged.rules) == len(base.rules)

    def test_unknown_locality_falls_back_to_base_instead_of_raising(self) -> None:
        """Tỉnh chưa có gói riêng phải cho ra ĐÚNG gói nền, không phải một lỗi.

        Biểu mẫu đầu bài cho chọn 34 đơn vị hành chính còn `rules/locality/` chưa có gói
        nào; ném lỗi ở đây nghĩa là Lớp 2 chạy xong (Worker vốn lùi về gói nền) rồi Lớp 3b
        mới đổ — hai lớp đọc cùng một rule pack mà kết luận khác nhau về sự tồn tại của nó.
        """
        base = load_pack(RULES_ROOT / "base")
        fallback = load_for_locality(RULES_ROOT, "nowhere")
        assert [r.id for r in fallback.rules] == [r.id for r in base.rules]
        assert fallback.locality is None


class TestShippedPacks:
    """Các pack thật sự nằm trong `rules/` phải nạp được và nhất quán bên trong."""

    def test_base_pack_loads(self) -> None:
        pack = load_pack(RULES_ROOT / "base")
        assert len(pack.rules) >= 20, "Mốc 0.3 yêu cầu ít nhất 20 quy tắc"
        assert pack.version

    def test_base_pack_has_no_blocking_issues(self) -> None:
        issues = [i for i in validate_pack(load_pack(RULES_ROOT / "base")) if i.level == "error"]
        assert issues == []

    def test_base_pack_carries_setback_and_density(self) -> None:
        """Khoảng lùi và mật độ là QCVN — quy chuẩn QUỐC GIA, nên phải ở gói nền.

        Chúng từng nằm trong gói `thai-binh`, và hệ quả là tỉnh nào chưa có gói riêng cũng
        chạy không khoảng lùi, không trần mật độ: biệt thự được phép phủ kín lô mà không có
        lỗi nào nổ ra.
        """
        by_id = load_pack(RULES_ROOT / "base").by_id()
        assert "setback_front" in by_id
        assert "max_density_villa" in by_id
        assert "corridor_min_width" in by_id

    def test_every_error_rule_cites_a_legal_document(self) -> None:
        """The invariant the whole split rests on."""
        pack = load_for_locality(RULES_ROOT, "hung_yen")
        offenders = [r.id for r in pack.errors() if not r.is_legal]
        assert offenders == [], f"quy tắc chặn phát hành mà không dẫn văn bản: {offenders}"

    def test_no_rule_targets_out_of_scope_building_type(self) -> None:
        pack = load_for_locality(RULES_ROOT, "hung_yen")
        for rule in pack.rules:
            assert "nha_xuong" not in rule.applies_to


class TestMessages:
    def test_renders_from_template_not_from_a_model(self) -> None:
        catalog = MessageCatalog.load(RULES_ROOT / "messages.vi.yaml")
        text = catalog.render("corridor_min_width", "min_dimension", room="tầng 2", actual="0,8", required="0,9")
        assert "0,8" in text and "0,9" in text

    def test_falls_back_to_predicate_template(self) -> None:
        """A new rule reusing an existing predicate gets a sensible message for free."""
        catalog = MessageCatalog.load(RULES_ROOT / "messages.vi.yaml")
        text = catalog.render("min_area_study_room", "min_area", room="phòng làm việc", actual="8,0", required="9,0")
        assert "phòng làm việc" in text

    def test_never_leaks_a_raw_rule_id_as_the_whole_message(self) -> None:
        catalog = MessageCatalog.load(RULES_ROOT / "messages.vi.yaml")
        text = catalog.render("no_such_rule", "no_such_predicate")
        assert text.startswith("Phương án vi phạm")
