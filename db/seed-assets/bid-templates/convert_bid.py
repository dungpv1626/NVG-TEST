"""
Chuyển bộ biểu mẫu hồ sơ dự thầu của NVC (NVC-DT-01, bản dự thảo, chỗ trống là dải chấm «……») thành HAI mẫu máy
điền được (danh mục chỗ trống ở shared/src/da-bid-forms.ts):

  · NVC-DT-01A — Phần A (danh mục kiểm tra) + Mẫu 01 → Mẫu 10: lập trước khi nộp thầu.
  · NVC-DT-01B — Mẫu 11 Biên bản thương thảo hợp đồng: lập sau khi trúng thầu.

Phần C (sổ theo dõi gói thầu và bảo lãnh, «dùng nội bộ») KHÔNG đưa vào mẫu: hệ thống đã giữ chính dữ liệu ấy ở gói
thầu (hạn nộp, giá, bảo lãnh, kết quả, đơn vị trúng, giá trúng — 0208). Bỏ mọi «Ghi chú soạn thảo (xóa khi phát hành)».

Chỉ THAY CHỮ ở đúng chỗ đã biết, giữ nguyên định dạng (dùng lại các hàm của convert.py — bộ mẫu hợp đồng):
  · tên, mã số thuế, địa chỉ, người đại diện, chức vụ của pháp nhân đang viết cứng → nvg_*;
  · bên mời thầu, tên gói thầu, dự án, ngày / nơi lập;
  · giá dự thầu + bằng chữ, thuế GTGT, giảm giá, giá sau giảm;
  · bốn bảng kê → bảng lặp (hợp đồng tương tự, nhân sự chủ chốt, thiết bị, tổng hợp giá theo hạng mục).
Mọi dải chấm còn lại → chỗ trống tự do {o_N} kèm câu văn quanh nó (như convert.py), điền tay ngay trên hệ thống.

Chạy:  python -I db/seed-assets/bid-templates/convert_bid.py "<tệp NVC-DT-01 .docx>" NVC
Ra:    db/seed-assets/bid-templates/<MÃ>/<tệp>.docx + manifest.json
"""

import copy
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path

# `python -I` không thêm thư mục của tệp chạy vào sys.path — nạp convert.py của bộ mẫu hợp đồng bằng đường dẫn.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'contract-templates'))
import convert as hd  # noqa: E402
from lxml import etree  # noqa: E402

W = hd.W
DOTS = '…'
ptext = hd.ptext

# Chữ in cứng của NVC trong bộ dự thảo.
NVC_LEGAL = 'CÔNG TY TNHH TƯ VẤN XÂY DỰNG VÀ PHÁT TRIỂN NHÀ VIỆT'
NVC_LEGAL_BRAND = NVC_LEGAL + ' – NHÀ VIỆT CONSTRUCTION (NVC)'
NVC_BRAND = 'NHÀ VIỆT CONSTRUCTION (NVC)'
NVC_REP = 'BÙI VĂN THI'
NVC_TAX = '1001004344'
NVC_ADDRESS = 'Số nhà 587 đường Lê Quý Đôn, Phường Trần Lãm, Tỉnh Hưng Yên, Việt Nam'

# Bảng lặp: (chữ đầu tiên của tiêu đề bảng) → (tên bảng lặp, các cột theo thứ tự ô; None = để trống).
LOOPS = {
    'Tên hợp đồng, công trình, địa điểm': (
        'hop_dong_tuong_tu',
        ['stt', 'ten', 'chu_dau_tu', 'gia_tri', 'phan_thuc_hien', 'thoi_gian', 'tai_lieu'],
    ),
    'Vị trí': ('nhan_su', ['stt', 'vi_tri', 'ho_ten', 'kinh_nghiem', 'chung_chi', 'hdld']),
    'Tên thiết bị, công suất': (
        'thiet_bi',
        ['stt', 'ten', 'so_luong', 'nam_sx', 'so_huu', 'kiem_dinh', 'ghi_chu'],
    ),
    'Hạng mục': ('tong_hop_gia', ['stt', 'hang_muc', 'gia_tri', 'ghi_chu']),
}

# Dòng tổng của Mẫu 10 → chỗ trống ở cột Giá trị.
PRICE_TOTALS = {
    'Cộng trước thuế': 'gia_truoc_thue_so',
    'Thuế GTGT': 'tien_thue_so',
    'Tổng giá dự thầu': 'gia_du_thau_so',
    'Giảm giá (nếu có)': 'giam_gia_so_tien_so',
    'Giá dự thầu sau giảm giá': 'gia_sau_giam_so',
}

# Cột «Đã có / Người chuẩn bị» của danh mục kiểm tra (Phần A): mục nào bộ này soạn, mục nào là việc của người viết.
CHECKLIST_PREPARED = {
    '1': 'Có trong bộ này (Mẫu 01)',
    '4': 'Có trong bộ này (Mẫu 03) — nếu cần',
    '5': 'Có trong bộ này (Mẫu 04) — nếu liên danh',
    '7': 'Có trong bộ này (Mẫu 05)',
    '9': 'Có trong bộ này (Mẫu 06)',
    '13': 'Có trong bộ này (Mẫu 07, 08)',
    '15': 'Có trong bộ này (Mẫu 09)',
    '16': 'Người viết — hệ thống không soạn',
    '17': 'Người viết — hệ thống không soạn',
    '18': 'Người viết — hệ thống không soạn',
    '19': 'Người viết — hệ thống không soạn',
    '20': 'Người viết — hệ thống không soạn',
    '21': 'Người viết — hệ thống không soạn',
    '22': 'Có trong bộ này (Mẫu 10)',
    '24': 'Có trong bộ này (Mẫu 02) — nếu có',
    '25': 'Biên bản riêng, soạn sau khi trúng thầu',
}

DATE_HEAD_RX = re.compile(r'^(…+), ngày (…+) tháng (…+) năm (20…+)')
DATE_TODAY_RX = re.compile(r'^Hôm nay, ngày (…+) tháng (…+) năm (20…+)(?:, tại (…+))?')
TO_RX = re.compile(r'^Kính gửi: (…+)')
BID_PROJECT_RX = re.compile(r'gói thầu (…+) thuộc dự án (…+)')
BID_RX = re.compile(r'gói thầu (…+)')
BID_HEAD_RX = re.compile(r'^Gói thầu: (…+) – Dự án: (…+)')
PRICE_RX = re.compile(r'Tổng giá dự thầu: (…+ đồng) \(Bằng chữ: (…+)\), (\[đã bao gồm/chưa bao gồm\])')
DISCOUNT_RX = re.compile(r'Giảm giá \(nếu có\): (…+) % / (…+ đồng)')
DURATION_RX = re.compile(r'Thời gian thực hiện hợp đồng: (…+) ngày')
VALIDITY_RX = re.compile(r'Hiệu lực của hồ sơ dự thầu: (…+) ngày')
OPT_A_RX = re.compile(r'^(☐) Phương án A: Giảm (…+) %')
OPT_B_RX = re.compile(r'^(☐) Phương án B: Giảm (…+ đồng)')
AFTER_RX = re.compile(r'Giá dự thầu sau giảm giá: (…+ đồng) \(Bằng chữ: (…+)\)')
ID_RX = re.compile(r'Số định danh cá nhân: (…+)')
# Dấu giữ chỗ không chứa «…» để bước đánh số chỗ trống tự do bỏ qua, rồi trả lại dải chấm.
ID_KEEP = '⁣CCCD⁣'
ID_DOTS = '………………'
TITLE_RX_REP = re.compile(r'chức vụ: (…+) – người đại diện theo pháp luật')


def replace_literal(p, needle, tag):
    """Thay MỌI lần xuất hiện của một chuỗi in cứng trong đoạn."""
    n = 0
    while (k := ptext(p).find(needle)) >= 0:
        hd.replace_range(p, k, k + len(needle), '{%s}' % tag)
        n += 1
    return n


def first_cell_text(tbl):
    rows = tbl.findall(W + 'tr')
    cells = rows[0].findall(W + 'tc') if rows else []
    return [hd.ptext_cell(c).strip() for c in cells]


def convert_loop_table(tbl, name, cols, report):
    rows = tbl.findall(W + 'tr')
    # Dòng gợi ý của mẫu (vd vị trí nhân sự, hạng mục giá) — giữ làm dòng mặc định của bảng lặp.
    defaults = []
    body_rows = []
    for r in rows[1:]:
        vals = [hd.ptext_cell(c).strip() for c in r.findall(W + 'tc')]
        if name == 'tong_hop_gia' and not vals[0]:
            break  # dòng tổng — không lặp
        body_rows.append(r)
        defaults.append({cols[i]: v for i, v in enumerate(vals) if i < len(cols) and cols[i] != 'stt' and v})
    template_row = body_rows[0]
    cells = template_row.findall(W + 'tc')
    for i, c in enumerate(cells):
        key = cols[i] if i < len(cols) else None
        txt = '{%s}' % key if key else ''
        if i == 0:
            txt = '{#%s}' % name + txt
        if i == len(cells) - 1:
            txt = txt + '{/%s}' % name
        hd.set_cell_text(c, txt)
    for r in body_rows[1:]:
        tbl.remove(r)
    report['loops'][name] = {'columns': cols, 'default_rows': [d for d in defaults if d]}
    if name == 'tong_hop_gia':
        for r in tbl.findall(W + 'tr'):
            cs = r.findall(W + 'tc')
            label = hd.ptext_cell(cs[1]).strip() if len(cs) > 1 else ''
            if label in PRICE_TOTALS:
                hd.set_cell_text(cs[2], '{%s}' % PRICE_TOTALS[label])


def fill_checklist(tbl):
    for r in tbl.findall(W + 'tr')[1:]:
        cs = r.findall(W + 'tc')
        tt = hd.ptext_cell(cs[0]).strip()
        if tt in CHECKLIST_PREPARED and not hd.ptext_cell(cs[3]).strip():
            hd.set_cell_text(cs[3], CHECKLIST_PREPARED[tt])


def convert_part(root, part):
    """`part` = 'A' (Phần A + Mẫu 01–10) hoặc 'B' (Mẫu 11). Sửa `root` tại chỗ, trả về báo cáo."""
    body = root.find(W + 'body')
    kids = list(body)
    sect = kids[-1] if etree.QName(kids[-1]).localname == 'sectPr' else None
    content = kids[:-1] if sect is not None else kids
    text = lambda el: ''.join(t.text or '' for t in el.iter(W + 't')).strip()
    start_11 = next(i for i, k in enumerate(content) if text(k) == 'Mẫu 11')
    start_c = next(i for i, k in enumerate(content) if text(k).startswith('PHẦN C.'))
    keep = content[:start_11] if part == 'A' else content[start_11:start_c]
    # Bỏ đoạn trống / chỉ có ngắt trang ở cuối phần — tách ra thì nó thành trang trắng.
    while keep and etree.QName(keep[-1]).localname == 'p' and not text(keep[-1]):
        keep = keep[:-1]
    keep_ids = {id(k) for k in keep}
    for k in content:
        if id(k) not in keep_ids:
            body.remove(k)

    report = {'notes_removed': 0, 'loops': {}, 'replaced': []}

    for p in list(body.iter(W + 'p')):
        if ptext(p).startswith(hd.NOTE_PREFIX):
            hd.remove_paragraph(p)
            report['notes_removed'] += 1

    for tbl in body.iter(W + 'tbl'):
        head = first_cell_text(tbl)
        if len(head) > 1 and head[1] == 'Tài liệu':
            fill_checklist(tbl)
        elif len(head) > 1 and head[1] in LOOPS:
            name, cols = LOOPS[head[1]]
            convert_loop_table(tbl, name, cols, report)
        elif part == 'B' and len(head) > 2 and head[2] == 'Theo HSDT':
            for r in tbl.findall(W + 'tr')[1:]:
                cs = r.findall(W + 'tc')
                if hd.ptext_cell(cs[1]).startswith('Giá hợp đồng'):
                    hd.set_cell_text(cs[2], '{gia_theo_hsdt}')

    def sub(p, rx, tags):
        if hd.replace_regex_groups(p, rx, tags):
            report['replaced'].extend(t for t in tags if t)
            return True
        return False

    for p in body.iter(W + 'p'):
        t = ptext(p)
        if t.startswith(NVC_BRAND + ' – áp dụng'):
            # Dòng phụ đề của bìa: ghi pháp nhân và gói thầu đang lập.
            hd.replace_range(p, 0, len(t), '{nvg_ten} — Gói thầu: {ten_goi_thau}')
            continue
        sub(p, DATE_HEAD_RX, ['noi_lap', 'ngay_lap_ngay', 'ngay_lap_thang', 'ngay_lap_nam'])
        sub(p, DATE_TODAY_RX, ['ngay_lap_ngay', 'ngay_lap_thang', 'ngay_lap_nam', 'noi_lap'])
        sub(p, TO_RX, ['ben_moi_thau'])
        sub(p, BID_HEAD_RX, ['ten_goi_thau', 'ten_du_an'])
        if not sub(p, BID_PROJECT_RX, ['ten_goi_thau', 'ten_du_an']):
            sub(p, BID_RX, ['ten_goi_thau'])
        sub(p, PRICE_RX, ['gia_du_thau', 'gia_du_thau_bang_chu', 'thue_gtgt_gom'])
        sub(p, DISCOUNT_RX, ['giam_gia_ty_le', 'giam_gia_so_tien'])
        sub(p, DURATION_RX, ['thoi_gian_thuc_hien'])
        sub(p, VALIDITY_RX, ['hieu_luc_hsdt'])
        sub(p, OPT_A_RX, ['pa_giam_a', 'giam_a_ty_le'])
        sub(p, OPT_B_RX, ['pa_giam_b', 'giam_b_so_tien'])
        sub(p, AFTER_RX, ['gia_sau_giam', 'gia_sau_giam_bang_chu'])
        if NVC_REP in t:
            sub(p, TITLE_RX_REP, ['nvg_chuc_vu'])
            replace_literal(p, NVC_REP, 'nvg_dai_dien')
        replace_literal(p, NVC_ADDRESS, 'nvg_dia_chi')
        replace_literal(p, NVC_TAX, 'nvg_ma_so_thue')
        # Tên đầy đủ trước, rồi mới tới tên giao dịch (tên giao dịch nằm trong tên đầy đủ kèm thương hiệu).
        if not replace_literal(p, NVC_LEGAL_BRAND, 'nvg_ten'):
            replace_literal(p, NVC_LEGAL, 'nvg_ten')
        # «đại diện Nhà thầu (NHÀ VIỆT CONSTRUCTION (NVC))» → một lớp ngoặc; còn lại tên giao dịch → tên pháp nhân.
        while (k := ptext(p).find('(' + NVC_BRAND + ')')) >= 0:
            hd.replace_range(p, k, k + len(NVC_BRAND) + 2, '({nvg_ten})')
        replace_literal(p, NVC_BRAND, 'nvg_ten')

    # Số định danh cá nhân (CCCD) KHÔNG nhập vào hệ thống (CLAUDE.md 9.5 câu 12) — giữ dải chấm để điền tay trên bản
    # in, không thành chỗ trống tự do (chỗ trống tự do lưu giá trị vào `bid_form_inputs`).
    for p in body.iter(W + 'p'):
        while (m := ID_RX.search(ptext(p))):
            hd.replace_range(p, m.start(1), m.end(1), ID_KEEP)
    # Mỗi «Mẫu NN» là một phần của văn bản — chỗ trống tự do ghi theo mẫu chứa nó.
    hd.ARTICLE_RX = re.compile(r'^(Mẫu \d+|PHẦN [A-C]\.[^\n]{0,60})')
    report['free_fields'] = hd.free_blanks(body, [])
    for f in report['free_fields']:
        f['before'] = f['before'].replace(ID_KEEP, '…')
        f['after'] = f['after'].replace(ID_KEEP, '…')
    for p in body.iter(W + 'p'):
        while (k := ptext(p).find(ID_KEEP)) >= 0:
            hd.replace_range(p, k, k + len(ID_KEEP), ID_DOTS)
    titles = {}
    paras = list(body.iter(W + 'p'))
    for i, p in enumerate(paras):
        m = re.match(r'^Mẫu (\d+)$', ptext(p).strip())
        if m and i + 1 < len(paras):
            titles[f'Mẫu {m.group(1)}'] = ptext(paras[i + 1]).strip().capitalize()
    for f in report['free_fields']:
        if f['article'] in titles:
            f['article'] = f"{f['article']} — {titles[f['article']]}"
        elif f['article'] == 'Phần đầu văn bản':
            f['article'] = 'Bìa'
    report['tags'] = hd.collect_tags(root)
    return report


PARTS = [
    ('A', 'ho_so_du_thau', 'NVC-DT-01A — Hồ sơ dự thầu (danh mục kiểm tra, Mẫu 01 – 10)',
     'NVC-DT-01A_Ho_so_du_thau.docx'),
    ('B', 'thuong_thao', 'NVC-DT-01B — Biên bản thương thảo hợp đồng (Mẫu 11)',
     'NVC-DT-01B_Bien_ban_thuong_thao.docx'),
]


def main():
    src, code = Path(sys.argv[1]), sys.argv[2]
    out_dir = Path(__file__).parent / code
    out_dir.mkdir(exist_ok=True)
    manifest = []
    for part, kind, title, name in PARTS:
        root = etree.fromstring(zipfile.ZipFile(src).read('word/document.xml'))
        report = convert_part(root, part)
        xml = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
        hd.write_docx(src, out_dir / name, xml)
        manifest.append({
            'file': name,
            'code': title.split(' — ')[0],
            'title': title,
            'document_kind': kind,
            'tags': report['tags'],
            'loops': report['loops'],
            'free_fields': report['free_fields'],
            'options': [],
            'replaced': sorted(set(report['replaced'])),
            # Băm nội dung văn bản — seed đặt tên tệp lưu theo băm: đổi mẫu = mẫu mới.
            'sha': hashlib.sha256(xml).hexdigest()[:16],
            'notes_removed': report['notes_removed'],
        })
    (out_dir / 'manifest.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
    )
    for m in manifest:
        print(m['code'], m['document_kind'], 'chỗ trống chuẩn:', len(m['tags']), 'tự do:',
              len(m['free_fields']), 'ghi chú bỏ:', m['notes_removed'])


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
