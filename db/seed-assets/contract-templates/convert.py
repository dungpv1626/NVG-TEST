"""
Chuyển bộ mẫu hợp đồng Word của NVG (bản dự thảo, chỗ trống là dải chấm «……») thành mẫu có
chỗ trống máy điền được ({ten_cho_trong} — danh mục ở shared/src/hd-template.ts).

Chỉ THAY CHỮ ở đúng chỗ đã biết, giữ nguyên định dạng của mẫu:
  · đầu văn bản: số hợp đồng, ngày ký, tên công trình / dự án, địa điểm;
  · khối thông tin hai bên: tên, địa chỉ, mã số thuế, điện thoại, email, người đại diện, chức vụ,
    tài khoản. Bên của pháp nhân soạn mẫu → nvg_*; bên kia → doi_tac_* (không dùng ben_a/ben_b
    vì bên A / B mỗi mẫu một khác);
  · giá hợp đồng + bằng chữ;
  · bảng các đợt thanh toán → bảng lặp {#dot_thanh_toan}.
Bỏ đoạn «Ghi chú soạn thảo (xóa khi phát hành)». Ô «Phương án» giữ nguyên để chọn trong Word.
Chỗ khác giữ dải chấm — văn bản điền ra vẫn in dải chấm để điền tay.

Chạy:  python -I db/seed-assets/contract-templates/convert.py <thư mục bộ mẫu> <mã pháp nhân>
Ra:    db/seed-assets/contract-templates/<MÃ>/<tên tệp>.docx + manifest.json
"""

import copy
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path

from lxml import etree

W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
W = '{%s}' % W_NS
XML_SPACE = '{http://www.w3.org/XML/1998/namespace}space'
DOTS = '…'

# Mẫu hợp đồng chính → loại hợp đồng của hệ thống. Tệp không có ở đây không được nạp
# (phụ lục, biên bản, hợp đồng lao động thuộc phân hệ khác).
CATALOG = {
    'NVC-HD-01': ('thi_cong', 'Hợp đồng thi công xây dựng (với chủ đầu tư)'),
    'NVC-HD-02': ('thi_cong', 'Hợp đồng thiết kế – thi công (EC / EPC)'),
    'NVC-HD-03': ('thi_cong', 'Hợp đồng tổng thầu thi công'),
    'NVC-HD-04': ('khoan_thau_phu', 'Hợp đồng giao thầu phụ'),
    'NVC-HD-05': ('khoan_thau_phu', 'Hợp đồng giao khoán nhân công tổ đội'),
    'NVC-HD-06': ('mua_vat_tu', 'Hợp đồng mua vật tư'),
    'NVC-HD-07': ('thue_thiet_bi', 'Hợp đồng thuê máy móc thiết bị'),
    'NVC-DC-04': ('mua_vat_tu', 'Hợp đồng nguyên tắc với nhà cung cấp'),
    'NVO-HD-01': ('thiet_ke', 'Hợp đồng tư vấn thiết kế nhà ở'),
    'NVO-HD-02': ('thi_cong', 'Hợp đồng thiết kế – thi công trọn gói nhà ở'),
    'NVO-HD-03': ('thi_cong', 'Hợp đồng thi công phần thô hoặc hoàn thiện'),
    'NVO-HD-04': ('thi_cong', 'Hợp đồng thiết kế, sản xuất, lắp đặt nội thất'),
    'NVO-HD-05': ('khoan_thau_phu', 'Hợp đồng giao khoán nhân công tổ đội'),
    'NVO-HD-06': ('mua_vat_tu', 'Hợp đồng mua bán vật tư xây dựng'),
    'NVO-DC-04': ('mua_vat_tu', 'Hợp đồng nguyên tắc với nhà cung cấp'),
    'NVS-HD-01': ('mua_ban', 'Hợp đồng mua bán giàn giáo, kết cấu thép'),
    'NVS-HD-02': ('cho_thue', 'Hợp đồng cho thuê giàn giáo (kèm biên bản giao nhận, thu hồi)'),
    'NVS-HD-03': ('mua_ban', 'Hợp đồng gia công, sản xuất theo đơn'),
    'NVS-HD-04': ('mua_ban', 'Hợp đồng nguyên tắc với khách hàng thường xuyên'),
    'NVS-HD-05': ('cho_thue', 'Hợp đồng cho thuê, bán nội bộ (NVC / NVO)'),
    'NVS-DC-04': ('mua_vat_tu', 'Hợp đồng nguyên tắc với nhà cung cấp'),
}

# Nhãn trong khối thông tin một bên → khoá chỗ trống (không có tiền tố bên).
PARTY_LABELS = [
    (re.compile(r'Địa chỉ[^:]{0,24}:'), 'dia_chi'),
    (re.compile(r'Mã số (doanh nghiệp/MST|doanh nghiệp|thuế)\s*:|MST\s*:'), 'ma_so_thue'),
    (re.compile(r'Điện thoại\s*:'), 'dien_thoai'),
    (re.compile(r'Email\s*:'), 'email'),
    (re.compile(r'Người đại diện( theo pháp luật)?\s*:'), 'dai_dien'),
    (re.compile(r'Chức vụ\s*:'), 'chuc_vu'),
    (re.compile(r'Tài khoản( số)?\s*:'), 'so_tai_khoan'),
    (re.compile(r' tại (Ngân hàng|NH)\s*'), 'ngan_hang'),
]
PARTY_HEADER = re.compile(r'^(?P<label>[^:]*\(BÊN (?P<side>[AB])[^)]*\)[^:]*?)\s*:\s?(?P<rest>.*)$')


def texts(p):
    return [t for t in p.iter(W + 't')]


def ptext(p):
    return ''.join(t.text or '' for t in texts(p))


def replace_range(p, start, end, new):
    """Thay đoạn [start, end) của chữ trong đoạn văn — giữ định dạng của run chứa điểm đầu."""
    pos = 0
    placed = False
    for t in texts(p):
        s = t.text or ''
        a, b = pos, pos + len(s)
        pos = b
        if b <= start or a >= end:
            if a >= end and not placed:
                break
            continue
        ls, le = max(start - a, 0), min(end - a, len(s))
        if not placed:
            t.text = s[:ls] + new + s[le:]
            placed = True
        else:
            t.text = s[:ls] + s[le:]
        t.set(XML_SPACE, 'preserve')
    if not placed:
        raise ValueError('không tìm thấy vị trí thay')


def replace_regex_groups(p, regex, tags):
    """Thay các nhóm của lần khớp ĐẦU (từ phải sang trái để vị trí không lệch)."""
    m = regex.search(ptext(p))
    if not m:
        return False
    for idx in sorted(range(1, len(tags) + 1), key=lambda i: -m.start(i)):
        if tags[idx - 1] is not None and m.group(idx) is not None:
            replace_range(p, m.start(idx), m.end(idx), '{%s}' % tags[idx - 1])
    return True


def value_spans(text):
    """Các ô «Nhãn: giá trị» trong một dòng — giá trị kéo tới nhãn kế tiếp hoặc hết dòng."""
    found = []
    for rx, key in PARTY_LABELS:
        for m in rx.finditer(text):
            found.append((m.start(), m.end(), key))
    found.sort()
    # Bỏ nhãn lồng trong nhãn khác (vd «MST:» nằm trong «Mã số doanh nghiệp/MST:»).
    clean = []
    for f in found:
        if clean and f[0] < clean[-1][1]:
            continue
        clean.append(f)
    out = []
    for i, (s, e, key) in enumerate(clean):
        stop = clean[i + 1][0] if i + 1 < len(clean) else len(text)
        vs, ve = e, stop
        while vs < ve and text[vs] in '  ':
            vs += 1
        while ve > vs and text[ve - 1] in '  –-,;':
            ve -= 1
        if key == 'dai_dien' and text[vs:ve].startswith('Ông/Bà '):
            vs += len('Ông/Bà ')
        if ve > vs:
            out.append((vs, ve, key))
    return out


def remove_paragraph(p):
    parent = p.getparent()
    if parent.tag == W + 'tc' and len(parent.findall(W + 'p')) == 1:
        for t in texts(p):
            t.text = ''
        return
    parent.remove(p)


def convert_payment_table(tbl):
    rows = tbl.findall(W + 'tr')
    if len(rows) < 2:
        return None
    header = [ptext_cell(c) for c in rows[0].findall(W + 'tc')]
    if not any('Đợt' in h for h in header) or not any('Tỷ lệ' in h or '%' in h for h in header):
        return None
    cols = []
    has_amount = any('Số tiền' in h or 'Giá trị' in h for h in header)
    for h in header:
        if 'Đợt' in h or h.strip() in ('TT', 'STT'):
            cols.append('stt')
        elif 'Tỷ lệ' in h or h.strip() == '%':
            cols.append('ty_le')
        elif 'Số tiền' in h or 'Giá trị' in h:
            cols.append('so_tien')
        elif 'Lũy kế' in h:
            cols.append(None if has_amount else 'so_tien')
        elif h.strip().startswith('Hạn'):
            cols.append('han')
        elif 'noi_dung' not in cols:
            # Cột mô tả đầu tiên (Mốc / Thời điểm / Điều kiện) là nội dung đợt.
            cols.append('noi_dung')
        else:
            # Cột phụ (Ghi chú, Điều kiện thứ hai) để trống — điều khoản không có ô này.
            cols.append(None)
    # Các đợt mẫu đề xuất — nạp làm gợi ý «Tiến độ thanh toán» (không mất khi bảng thành bảng lặp).
    milestones = []
    for r in rows[1:]:
        vals = [ptext_cell(c).strip() for c in r.findall(W + 'tc')]
        desc = vals[cols.index('noi_dung')] if 'noi_dung' in cols and cols.index('noi_dung') < len(vals) else ''
        rate = vals[cols.index('ty_le')] if 'ty_le' in cols and cols.index('ty_le') < len(vals) else ''
        if desc:
            milestones.append({'noi_dung': desc, 'ty_le_mau': rate, 'ty_le': default_percent(rate)})
    # Cột «Lũy kế» thành «Số tiền» khi mẫu không có cột số tiền — bảng lặp không tính lũy kế.
    if 'so_tien' in cols and not has_amount:
        i = cols.index('so_tien')
        set_cell_text(rows[0].findall(W + 'tc')[i], 'Số tiền')
    template_row = rows[1]
    cells = template_row.findall(W + 'tc')
    for i, c in enumerate(cells):
        key = cols[i] if i < len(cols) else None
        txt = '{%s}' % key if key else ''
        if i == 0:
            txt = '{#dot_thanh_toan}' + txt
        if i == len(cells) - 1:
            txt = txt + '{/dot_thanh_toan}'
        set_cell_text(c, txt)
    for r in rows[2:]:
        tbl.remove(r)
    return milestones


def default_percent(text):
    """«……% (mặc định 40%)» → '40'; «5%» → '5'; còn chỗ trống / khoảng / «đến 95%» → None."""
    m = re.search(r'mặc định:?\s*(\d+(?:[.,]\d+)?)\s*%', text)
    if m:
        return m.group(1).replace(',', '.')
    m = re.fullmatch(r'\s*(\d+(?:[.,]\d+)?)\s*%\s*', text)
    return m.group(1).replace(',', '.') if m else None


def ptext_cell(tc):
    return ' '.join(ptext(p) for p in tc.findall(W + 'p'))


def set_cell_text(tc, txt):
    ps = tc.findall(W + 'p')
    for extra in ps[1:]:
        tc.remove(extra)
    p = ps[0]
    ts = texts(p)
    if not ts:
        r = etree.SubElement(p, W + 'r')
        t = etree.SubElement(r, W + 't')
        ts = [t]
    ts[0].text = txt
    ts[0].set(XML_SPACE, 'preserve')
    for t in ts[1:]:
        t.text = ''


DATE_RX = re.compile(r'ngày (…+) tháng (…+) năm (20…+)')
NUMBER_RX = re.compile(r'^Số: (…+/…+)\s*$')
TOP_PARTY_RX = re.compile(r'^(BÊN [^:]+): (…+)\s*$')
TITLE_RX = re.compile(r'^(?:Công trình|Dự án|Hạng mục): (…+)')
PLACE_RX = re.compile(r'Địa điểm(?: xây dựng| thi công)?: (…+)')
VALUE_RX = re.compile(
    r'(?:Giá hợp đồng|Tổng giá trị hợp đồng|Giá trị hợp đồng)[^:]{0,24}: (…+ đồng) \(Bằng chữ: (…+)\)'
)
NOTE_PREFIX = 'Ghi chú soạn thảo'


def convert(src: Path, code: str):
    z = zipfile.ZipFile(src)
    root = etree.fromstring(z.read('word/document.xml'))
    body = root.find(W + 'body')
    report = {'replaced': [], 'notes_removed': 0, 'payment_table': False, 'milestones': []}
    report['options'] = []
    report['free_fields'] = []

    paras = list(body.iter(W + 'p'))
    # Ranh giới: phần đầu (trước «Điều 1» / «Hai bên thống nhất»).
    head_end = next(
        (i for i, p in enumerate(paras) if re.match(r'^(Điều 1\.|Hai bên (thống nhất|cùng))', ptext(p))),
        len(paras),
    )

    # 1) Khối thông tin hai bên.
    side_prefix = {}
    current = None
    for i, p in enumerate(paras[:head_end]):
        t = ptext(p)
        m = PARTY_HEADER.match(t)
        if m and ('BÊN' in m.group('label')) and i > 3:
            rest = m.group('rest')
            own = f'({code})' in rest
            internal = not own and 'NHÀ VIỆT' in rest.upper()
            current = None if internal else ('nvg' if own else 'doi_tac')
            if current:
                side_prefix[m.group('side')] = current
                label_end = m.start('rest')
                if own:
                    cut = rest.find(' – ')
                    end = label_end + (cut if cut > 0 else len(rest))
                    replace_range(p, label_end, end, '{nvg_ten}')
                else:
                    dm = re.search(r'…+', rest)
                    if dm:
                        replace_range(p, label_end + dm.start(), label_end + dm.end(), '{doi_tac_ten}')
                report['replaced'].append(f'{current}_ten')
            continue
        if current is None or t.startswith('(') or t.startswith(NOTE_PREFIX):
            continue
        for vs, ve, key in sorted(value_spans(t), reverse=True):
            replace_range(p, vs, ve, '{%s_%s}' % (current, key))
            report['replaced'].append(f'{current}_{key}')

    # 2) Đầu văn bản.
    numbered = False
    for i, p in enumerate(paras[:head_end]):
        t = ptext(p)
        if not numbered and NUMBER_RX.match(t):
            replace_regex_groups(p, NUMBER_RX, ['so_hop_dong'])
            numbered = True
            report['replaced'].append('so_hop_dong')
        if DATE_RX.search(t) and (t.startswith(DOTS) or t.startswith('Hôm nay')):
            replace_regex_groups(p, DATE_RX, ['ngay_ky_ngay', 'ngay_ky_thang', 'ngay_ky_nam'])
            report['replaced'].append('ngay_ky')
        m = TOP_PARTY_RX.match(t)
        if m and i <= 3:
            label = m.group(1)
            side = 'A' if label.endswith(' A') else 'B' if label.endswith(' B') else None
            if side is None:
                for q in paras[:head_end]:
                    hm = PARTY_HEADER.match(ptext(q))
                    if hm and hm.group('label').startswith(label):
                        side = hm.group('side')
                        break
            prefix = side_prefix.get(side)
            if prefix:
                replace_regex_groups(p, TOP_PARTY_RX, [None, f'{prefix}_ten'])
        if i < 14 and TITLE_RX.search(t):
            replace_regex_groups(p, TITLE_RX, ['ten_hop_dong'])
            report['replaced'].append('ten_hop_dong')
        if i < 14 and PLACE_RX.search(ptext(p)):
            replace_regex_groups(p, PLACE_RX, ['dia_diem'])
            report['replaced'].append('dia_diem')

    # 3) Giá hợp đồng (lần đầu).
    for p in paras[head_end:]:
        if replace_regex_groups(p, VALUE_RX, ['gia_tri', 'gia_tri_bang_chu']):
            report['replaced'].append('gia_tri')
            break

    # 4) Bảng các đợt thanh toán (bảng đầu tiên khớp).
    for tbl in body.iter(W + 'tbl'):
        milestones = convert_payment_table(tbl)
        if milestones is not None:
            report['payment_table'] = True
            report['milestones'] = milestones
            break

    # 5) Tên pháp nhân viết đúng đăng ký: «Tư vấn và Xây dựng» (anh Dũng chốt 21/10/2026; bộ mẫu
    #    ghi «&» ở chỗ in sẵn tên NVO — hợp đồng nội bộ, hợp đồng nguyên tắc nhà cung cấp).
    for p in body.iter(W + 'p'):
        while (k := ptext(p).find('TƯ VẤN & XÂY DỰNG')) >= 0:
            replace_range(p, k, k + len('TƯ VẤN & XÂY DỰNG'), 'TƯ VẤN VÀ XÂY DỰNG')

    # 6) Bỏ ghi chú soạn thảo.
    for p in list(body.iter(W + 'p')):
        if ptext(p).startswith(NOTE_PREFIX):
            remove_paragraph(p)
            report['notes_removed'] += 1

    # 7) Ô «☐ Phương án A/B/C» → khối điều kiện {#pa_N_X}…{/pa_N_X}: chọn phương án nào thì văn
    #    bản chỉ in phương án đó; chưa chọn thì in cả (như bản giấy).
    report['options'] = wrap_options(body)

    # 8) Mọi dải chấm còn lại → chỗ trống tự do {o_N}, kèm câu văn quanh nó để người soạn biết
    #    đang điền gì, và mức «(mặc định: …)» mẫu ghi sẵn (anh Dũng 21/10/2026: phải ra một bộ
    #    hoàn chỉnh, không còn chỗ chấm nào phải điền tay trên giấy).
    report['free_fields'] = free_blanks(body, report['options'])

    report['tags'] = collect_tags(root)
    xml = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
    return z, xml, report


TAG_RX = re.compile(r'\{([#/]?)([a-z0-9_]+)\}')

OPTION_RX = re.compile(r'^☐\s*Phương án\s+([A-Z])\b')
# Đoạn mở một khoản / điều mới — khối phương án dừng trước nó.
CLAUSE_RX = re.compile(r'^(\d+\.\d+\.|Điều \d+\.|PHỤ LỤC|Phụ lục \d|BIÊN BẢN|ĐẠI DIỆN)')
BLANK_RX = re.compile(r'…+(?:\s*[/.,]\s*…+)*')
DEFAULT_RX = re.compile(r'^(\s*%?)(\s*\(mặc định:?\s*([^)]+)\))')
CHOICE_RX = re.compile(r'\[([^\[\]{}]{2,120}/[^\[\]{}]{1,120})\]')
ARTICLE_RX = re.compile(r'^(Điều \d+\.[^\n]{0,70}|PHỤ LỤC[^\n]{0,60}|BIÊN BẢN[^\n]{0,60})')


def make_para(text, like=None):
    p = etree.Element(W + 'p')
    if like is not None and like.find(W + 'pPr') is not None:
        p.append(copy.deepcopy(like.find(W + 'pPr')))
    r = etree.SubElement(p, W + 'r')
    t = etree.SubElement(r, W + 't')
    t.text = text
    t.set(XML_SPACE, 'preserve')
    return p


def wrap_options(body):
    """Nhóm các đoạn «☐ Phương án X» liền nhau (chỉ cấp thân văn bản) thành khối điều kiện."""
    children = list(body)
    plan = []
    i = 0
    while i < len(children):
        el = children[i]
        if not (el.tag == W + 'p' and OPTION_RX.match(ptext(el))):
            i += 1
            continue
        prev = children[i - 1] if i > 0 and children[i - 1].tag == W + 'p' else None
        article = next(
            (ARTICLE_RX.match(ptext(c)).group(1).strip() for c in reversed(children[:i])
             if c.tag == W + 'p' and ARTICLE_RX.match(ptext(c))),
            'Phần đầu văn bản',
        )
        group = {
            'id': f'pa_{len(plan) + 1}',
            'article': article,
            'label': re.sub(r'\{[#/]?[a-z0-9_]+\}', '…', ptext(prev).strip() if prev is not None else '')[:120],
            'options': [],
        }
        blocks = []
        while i < len(children) and children[i].tag == W + 'p' and OPTION_RX.match(ptext(children[i])):
            start = children[i]
            block = [start]
            j = i + 1
            while j < len(children):
                nxt = children[j]
                if nxt.tag == W + 'sectPr':
                    break
                t = ptext(nxt) if nxt.tag == W + 'p' else 'x'
                if nxt.tag == W + 'p' and (OPTION_RX.match(t) or CLAUSE_RX.match(t) or not t.strip()):
                    break
                block.append(nxt)
                j += 1
            blocks.append(block)
            i = j
        plan.append((group, blocks))
    for group, blocks in plan:
        for block in blocks:
            el = block[0]
            text = ptext(el)
            letter = OPTION_RX.match(text).group(1)
            key = f"{group['id']}_{letter.lower()}"
            group['options'].append({'key': key, 'letter': letter, 'text': re.sub(r'^☐\s*', '', text)[:160]})
            k = text.find('☐')
            replace_range(el, k, k + 1, '{%s_o}' % key)
            body.insert(body.index(block[0]), make_para('{#%s}' % key, el))
            body.insert(body.index(block[-1]) + 1, make_para('{/%s}' % key, el))
    return [g for g, _ in plan]


def free_blanks(body, options):
    """Đánh số mọi dải chấm còn lại ({o_N}) và lựa chọn trong ngoặc vuông ({c_N}); ghi câu văn
    quanh nó, Điều chứa nó, khối phương án chứa nó, mức mặc định / các lựa chọn."""
    fields = []
    article = 'Phần đầu văn bản'
    open_opts = []
    n_blank = n_choice = 0
    strip_tags = lambda t: re.sub(r'\{[#/]?[a-z0-9_]+\}', '…', t)
    for p in body.iter(W + 'p'):
        text = ptext(p)
        am = ARTICLE_RX.match(text)
        if am and p.getparent() is body:
            article = am.group(1).strip()
        for tag in re.findall(r'\{([#/])(pa_\d+_[a-z])\}', text):
            if tag[0] == '#':
                open_opts.append(tag[1])
            elif open_opts and open_opts[-1] == tag[1]:
                open_opts.pop()
        found = []
        for m in BLANK_RX.finditer(text):
            found.append(('o', m))
        for m in CHOICE_RX.finditer(text):
            if '{' not in m.group(0) and '…' not in m.group(0):
                found.append(('c', m))
        found.sort(key=lambda f: f[1].start())
        keyed = []
        base_seq = n_blank + n_choice
        for kind, m in found:
            if kind == 'o':
                n_blank += 1
                keyed.append((f'o_{n_blank}', kind, m))
            else:
                n_choice += 1
                keyed.append((f'c_{n_choice}', kind, m))
        for idx, (key, kind, m) in reversed(list(enumerate(keyed))):
            field = {
                'key': key,
                # Thứ tự xuất hiện trong văn bản — giao diện xếp chỗ trống theo số này.
                'seq': base_seq + idx + 1,
                'article': article,
                'before': strip_tags(text[: m.start()])[-90:].lstrip(),
                'after': strip_tags(text[m.end():])[:50].rstrip(),
                'default': None,
                'option': open_opts[-1] if open_opts else None,
            }
            if kind == 'c':
                inner = re.sub(r'\s*[–-]\s*chọn một\s*$', '', m.group(1)).strip()
                sep = ' / ' if ' / ' in inner else '/'
                field['choices'] = [c.strip() for c in inner.split(sep) if c.strip()]
                replace_range(p, m.start(), m.end(), '{%s}' % key)
            else:
                dm = DEFAULT_RX.match(text[m.end():])
                if dm:
                    field['default'] = dm.group(3).strip().rstrip('%').strip() or None
                    # Điền rồi thì chữ «(mặc định: …)» cũng đi — giữ lại đơn vị «%» đứng trước nó.
                    replace_range(p, m.end() + dm.start(2), m.end() + dm.end(2), '')
                replace_range(p, m.start(), m.end(), '{%s}' % key)
                field['after'] = strip_tags(ptext(p)[m.start() + len(key) + 2:])[:50].rstrip()
            fields.append(field)
    fields.sort(key=lambda f: f['seq'])
    return fields


def collect_tags(root):
    """Cây chỗ trống như `inspectTemplate` (web/src/lib/docx-template.ts): thường → {}, lặp → {cột: {}}."""
    text = ''.join(t.text or '' for t in root.iter(W + 't'))
    tags = {}
    stack = [tags]
    for kind, name in TAG_RX.findall(text):
        if kind == '#':
            stack.append(stack[-1].setdefault(name, {}))
        elif kind == '/':
            stack.pop()
        else:
            stack[-1].setdefault(name, {})
    return tags


def main():
    src_dir, code = Path(sys.argv[1]), sys.argv[2]
    out_dir = Path(__file__).parent / code
    out_dir.mkdir(exist_ok=True)
    manifest = []
    for f in sorted(src_dir.glob('*.docx')):
        key = f.name[:9]
        if key not in CATALOG:
            continue
        contract_type, title = CATALOG[key]
        z, xml, report = convert(f, code)
        out = out_dir / f.name
        with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zo:
            for item in z.infolist():
                data = xml if item.filename == 'word/document.xml' else z.read(item.filename)
                zo.writestr(item, data)
        manifest.append({
            'file': f.name,
            'code': key.replace('-HD-', '-HĐ-'),
            'title': f'{key.replace("-HD-", "-HĐ-")} — {title}',
            'contract_type': contract_type,
            'replaced': sorted(set(report['replaced'])),
            'payment_table': report['payment_table'],
            'payment_milestones': report['milestones'],
            'tags': report['tags'],
            'options': report['options'],
            'free_fields': report['free_fields'],
            # Băm nội dung văn bản — seed đặt tên tệp lưu theo băm: đổi mẫu = mẫu mới.
            'sha': hashlib.sha256(xml).hexdigest()[:16],
            'notes_removed': report['notes_removed'],
        })
    (out_dir / 'manifest.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
    )
    for m in manifest:
        print(m['code'], m['contract_type'], len(m['replaced']), 'payment' if m['payment_table'] else '-', m['notes_removed'])


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
