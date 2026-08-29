"""Thông báo cho người đọc, ghép từ mẫu câu tra theo mã quy tắc.

Sinh từ MẪU CÂU, không bao giờ từ mô hình ngôn ngữ: tất định, rẻ, dịch được, và không thể
bịa ra một quy tắc không tồn tại.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml


class MessageCatalog:
    """Mẫu câu nạp từ `rules/messages.vi.yaml`."""

    def __init__(
        self,
        templates: dict[str, str],
        source_labels: dict[str, str],
        requirements: dict[str, str] | None = None,
        combined: dict[str, str] | None = None,
    ) -> None:
        self._templates = templates
        self._source_labels = source_labels
        self._requirements = requirements or {}
        self._combined = combined or {}

    @classmethod
    def load(cls, path: Path) -> "MessageCatalog":
        data = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
        return cls(
            data.get("templates", {}),
            data.get("source_labels", {}),
            data.get("requirements", {}),
            data.get("combined", {}),
        )

    def render(self, rule_id: str, predicate: str, **params: Any) -> str:
        """Ghép câu thông báo cho một VI PHẠM.

        Không có mẫu câu riêng theo mã quy tắc thì lùi về mẫu câu chung của vị từ, nhờ đó một
        quy tắc mới dùng lại vị từ sẵn có vẫn có câu thông báo hợp lý mà không phải soạn thêm.
        """
        template = self._templates.get(rule_id) or self._templates.get(predicate)
        if template is None:
            # Không bao giờ đưa mã quy tắc thô ra trước mặt người dùng; nói rõ đang thiếu gì.
            return f"Phương án vi phạm một quy tắc chưa có mô tả ({rule_id})."
        try:
            return template.format(**params)
        except KeyError as exc:
            return f"Phương án vi phạm quy tắc {rule_id} (thiếu tham số {exc.args[0]})."

    def requirement(self, rule_id: str, predicate: str, **params: Any) -> str:
        """Ghép một quy tắc thành CỤM DANH TỪ cho câu nêu tập ràng buộc mâu thuẫn.

        Vô nghiệm nghĩa là không có phương án nào, nên không có giá trị `{actual}` để điền —
        mẫu câu vi phạm ở trên không dùng được. Tập mâu thuẫn phải diễn đạt YÊU CẦU ("hành
        lang rộng tối thiểu 0,9 m"), không phải vi phạm.
        """
        template = self._requirements.get(rule_id) or self._requirements.get(predicate)
        if template is None:
            return params.get("target") or rule_id
        try:
            return template.format(**params)
        except KeyError:
            return params.get("target") or rule_id

    def combine(self, parts: list[str], constraint: str | None = None) -> str:
        """Ghép nhiều yêu cầu thành một câu duy nhất, theo `07-rule-pack.md` mục 7.6."""
        prefix = self._combined.get("prefix", "Không thể đồng thời có:")
        separator = self._combined.get("separator", ", ")
        suffix = self._combined.get("suffix", ".")
        fallback = self._combined.get("fallback_constraint", "khu đất đã cho")
        return prefix.format(constraint=constraint or fallback) + " " + separator.join(parts) + suffix

    def source_label(self, is_legal: bool) -> str:
        key = "legal" if is_legal else "experience"
        return self._source_labels.get(key, "")
