/**
 * Canh hai quy tắc của hệ thống thiết kế mà không thao tác người dùng nào phát hiện được.
 *
 * Cả hai đều thuộc loại "mòn dần": không lần sửa nào phá vỡ chúng một cách rõ ràng, nhưng sau
 * mười lần sửa nhỏ thì quy tắc biến mất mà không ai nhận ra thời điểm nó mất. Test đọc thẳng mã
 * nguồn và token màu là cách duy nhất giữ được chúng.
 *
 * Xem `DESIGN_SYSTEM.md` mục 2.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Đọc theo đường dẫn từ gốc repo, không theo `import.meta.url`: ở môi trường jsdom, Vite gán cho
 * `import.meta.url` một địa chỉ http chứ không phải đường dẫn tệp, nên `fileURLToPath` sẽ hỏng.
 */
function source(relative: string): string {
  return readFileSync(resolve(process.cwd(), 'web/src', relative), 'utf8');
}

describe('Ranh giới màu thương hiệu (rừng & bạc hà) với màu trạng thái', () => {
  /**
   * Trước đây "cam an toàn" là một màu nhận diện tách biệt khỏi hành động (test canh việc nó
   * không lấn vào nhãn trạng thái/nút). Từ khi đổi sang rừng/bạc hà (DESIGN_SYSTEM.md, xác nhận
   * với Haan), màu thương hiệu và màu hành động đã GỘP LÀM MỘT — không còn "accent" riêng để
   * canh theo tên cũ.
   *
   * Rủi ro còn lại đổi hướng: mint/forest của thương hiệu và xanh lá của trạng thái "Hoàn
   * thành" là hai sắc xanh gần nhau. Nhãn trạng thái phải tiếp tục là một hệ màu ĐÓNG, độc lập
   * với thương hiệu — nếu không, một pill mint cạnh một nhãn "Hoàn thành" xanh là hai tín hiệu
   * người dùng phải phân biệt trong nửa giây, đúng vấn đề mà cam an toàn từng gây ra.
   */
  it('status-lozenge.tsx KHÔNG dùng token thương hiệu (brand/mint/forest)', () => {
    expect(source('components/ui/status-lozenge.tsx')).not.toMatch(/\b(brand|mint|forest)\b/);
  });
});

describe('Bảng màu riêng của Module Thiết kế', () => {
  /**
   * Năm họ màu phân loại thẻ (`tk-am`, `tk-pu`, `tk-rd`…) nằm rất gần ba màu trạng thái Chờ
   * duyệt, Tranh chấp và Quá hạn. Để chúng lọt vào nhãn trạng thái là bắt người dùng phân
   * biệt hai hệ tín hiệu cùng sắc — đúng lý do đã cấm cam an toàn trước đây.
   */
  it('status-lozenge.tsx KHÔNG dùng token của Module Thiết kế', () => {
    expect(source('components/ui/status-lozenge.tsx')).not.toMatch(/\btk-/);
  });
});

/** Mọi tệp `.tsx` của giao diện, trừ phép thử. */
function uiSources(): { path: string; text: string }[] {
  const root = resolve(process.cwd(), 'web/src');
  return (readdirSync(root, { recursive: true }) as string[])
    .filter((f) => f.endsWith('.tsx') && !/__tests__|\.test\./.test(f))
    .map((f) => ({ path: f.replace(/\\/g, '/'), text: readFileSync(resolve(root, f), 'utf8') }));
}

describe('Chỉ một bảng màu — chế độ tối đã gỡ', () => {
  /**
   * Chủ dự án bỏ hẳn chế độ tối (doc/MOC_CAI_TIEN_UX.md, vấn đề 2). Hàng rào này ngăn nó quay lại
   * nửa vời: một bảng màu thứ hai không ai duy trì là nơi sinh ra chữ đen trên nền đen.
   */
  it('không còn nút sáng/tối, thuộc tính đổi bảng màu hay khối màu tối', () => {
    const offenders = uiSources()
      .filter(({ text }) => /data-tk-theme|ThemeSwitch|prefers-color-scheme/.test(text))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
    expect(source('index.css')).not.toMatch(/data-tk-theme|prefers-color-scheme:\s*dark/);
  });
});

describe('Lớp màu chỉ trỏ vào token đã khai', () => {
  /**
   * Tailwind v4 KHÔNG sinh CSS cho lớp trỏ vào token không tồn tại — không lỗi, không cảnh báo,
   * lớp chỉ lặng lẽ không có tác dụng. Review UX tìm thấy `text-fg-muted` ở 21 tệp (chữ phụ và
   * đầu bảng của cả Kho, Kế toán, Mua hàng mang cùng màu chữ chính — mất phân cấp) và
   * `bg-bg`/`bg-bg-subtle` ở mọi trang Nhân sự.
   *
   * Chỉ xét lớp thuộc HỌ token của dự án (họ = đoạn đầu tên token đã khai, cộng `bg` và `on` là
   * hai họ đã từng bị gõ nhầm), nên `text-sm`, `border-t`, `bg-transparent`… không bị bắt nhầm.
   */
  it('mọi lớp text-/bg-/border-/… thuộc họ token của dự án đều có `--color-*` tương ứng', () => {
    const declared = new Set(
      [...source('index.css').matchAll(/--color-([a-z0-9-]+)\s*:/g)].map((m) => m[1]!),
    );
    const families = new Set([...declared].map((t) => t.split('-')[0]!));
    families.add('bg');
    families.add('on');

    const utility =
      /(?<![\w-])(?:[a-z0-9]+:)*(?:text|bg|border|border-[trblxy]|ring|ring-offset|fill|stroke|divide|outline|from|to|via|placeholder|decoration|accent|caret)-([a-z][a-z0-9-]*[a-z0-9])(?:\/\d+)?(?![\w-])/g;
    // Tên kết thúc bằng «-» là tiền tố của chuỗi ghép (`bg-status-${nhóm}`), không phải lớp
    // hoàn chỉnh — không xét được ở đây.
    const offenders: string[] = [];
    for (const { path, text } of uiSources()) {
      for (const m of text.matchAll(utility)) {
        const name = m[1]!;
        if (!families.has(name.split('-')[0]!)) continue;
        if (!declared.has(name)) offenders.push(`${path}: ${m[0]}`);
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });
});

describe('Thanh điều hướng thu gọn', () => {
  /**
   * Ở trạng thái thu gọn, chữ NHÌN THẤY là `shortLabel` còn tên đọc được của liên kết là
   * `label` đầy đủ. WCAG 2.5.3 (Label in Name) đòi tên đọc được phải CHỨA chữ nhìn thấy —
   * nếu không, người dùng ra lệnh bằng giọng nói ("bấm Khách hàng") sẽ không khớp được với
   * thứ họ đang nhìn.
   *
   * Đây là ràng buộc giữa hai chuỗi trong `shared/src/modules.ts`, không nhìn thấy khi sửa
   * từng chuỗi một — đúng loại quy tắc mòn dần mà tệp này tồn tại để canh.
   */
  it('nhãn ngắn của mọi module nằm trong nhãn đầy đủ (WCAG 2.5.3)', async () => {
    // Nạp động cùng lý do với khối dưới: tệp này chạy dưới jsdom, `@nvg/shared` nạp tĩnh ở
    // đầu tệp sẽ kéo theo cả nhánh phụ thuộc không cần cho một phép kiểm chuỗi.
    const { MODULE_CODES, MODULES } = await import('@nvg/shared');
    const lech = MODULE_CODES.filter((code) => {
      const { label, shortLabel } = MODULES[code];
      return !label.toLowerCase().includes(shortLabel.toLowerCase());
    });
    expect(lech).toEqual([]);
  });
});

describe('Chỉ số chưa đủ dữ liệu không được hiện thành số 0', () => {
  /**
   * PRD v1.4 Mục 2.3 và Content Guidelines v1.2 5.6 thêm một quy tắc hiển thị mới: chỉ số mà
   * NVG chưa có dữ liệu thật phải hiện "Chưa đủ dữ liệu", KHÔNG hiện 0 và KHÔNG điền số ước
   * lượng. Khảo sát Xưởng nói thẳng về tỷ lệ lỗi và giá trị thất thoát: "không nên ước lượng
   * một con số để điền".
   *
   * Test canh CÂU CHỮ chứ không canh nơi dùng: câu này phải tồn tại đúng một bản trong thư
   * viện nội dung để mọi màn hình dùng lại, thay vì mỗi nơi tự nghĩ một cách diễn đạt (Content
   * Guidelines 5: "dùng lại, đừng nghĩ cách diễn đạt mới"). Nơi dùng thì còn thêm mãi; câu
   * chuẩn thì chỉ có một.
   */
  it('thư viện nội dung có sẵn câu chuẩn để mọi màn hình dùng lại', async () => {
    const { EMPTY_STATES, MODULE_EMPTY_STATES } = await import('@nvg/shared');
    expect(EMPTY_STATES.notEnoughData).toContain('Chưa đủ dữ liệu');
    expect(MODULE_EMPTY_STATES.BC).toBe(EMPTY_STATES.notEnoughData);
  });
});

describe('Nạp phông cho tiếng Việt', () => {
  const css = source('index.css');

  /**
   * Tệp phông theo BỘ KÝ TỰ của fontsource (`vietnamese-400.css`, `latin-400.css`) không có
   * `unicode-range`. Nạp cả hai là khai hai `@font-face` cùng family, cùng nét, cùng kiểu, không
   * phân định phạm vi — theo quy tắc CSS thì khai báo SAU đè khai báo trước.
   *
   * Hệ quả đã gặp thật: `latin` thắng, toàn bộ chữ có dấu (ă â đ ê ô ơ ư và mọi dấu thanh) rơi về
   * phông hệ thống, chữ Việt hiện ra lẫn hai phông ngay giữa một từ. Với sản phẩm 100% tiếng Việt
   * thì đây là lỗi thấy ngay ở mọi màn hình — nhưng chỉ thấy khi MỞ TRÌNH DUYỆT, còn typecheck và
   * build đều xanh.
   */
  it('nạp theo NÉT chứ không theo bộ ký tự — tệp theo bộ ký tự thiếu unicode-range', () => {
    expect(css).not.toMatch(/@fontsource\/[^']*\/(vietnamese|latin|latin-ext|cyrillic)-\d/);
    expect(css).toMatch(/@fontsource\/be-vietnam-pro\/400\.css/);
  });

  it('khai phông tiếng Việt làm họ chữ chính', () => {
    expect(css).toMatch(/--font-sans:\s*\n?\s*'Be Vietnam Pro'/);
  });
});

describe('Tương phản màu đạt WCAG AA', () => {
  const css = source('index.css');

  function token(name: string): string {
    const found = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
    if (!found) throw new Error(`Không tìm thấy token --color-${name} trong index.css`);
    return found[1]!;
  }

  function channel(value: number): number {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }

  function luminance(hex: string): number {
    const h = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(h.slice(i, i + 2), 16)));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  }

  function contrast(a: string, b: string): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  }

  /**
   * 4.5:1 cho chữ thường. Nhãn trạng thái là chữ 12px nên KHÔNG được tính là "chữ lớn" của WCAG
   * — đây chính là chỗ bảng màu gốc của CGD 6.3 không đạt và đã phải sửa.
   */
  it.each([
    ['chữ chính trên nền trắng', 'fg', 'surface'],
    ['chữ chính trên nền trũng', 'fg', 'surface-sunken'],
    ['chữ phụ trên nền trắng', 'fg-subtle', 'surface'],
    ['chữ phụ trên nền trũng', 'fg-subtle', 'surface-sunken'],
    ['nhãn Nháp', 'status-draft', 'status-draft-bg'],
    ['nhãn Chờ duyệt', 'status-pending', 'status-pending-bg'],
    ['nhãn Đang xử lý', 'status-progress', 'status-progress-bg'],
    ['nhãn Hoàn thành', 'status-completed', 'status-completed-bg'],
    ['nhãn Quá hạn', 'status-overdue', 'status-overdue-bg'],
    ['nhãn Tranh chấp', 'status-disputed', 'status-disputed-bg'],
  ])('%s đạt ≥ 4.5:1', (_label, fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it('chữ trắng trên nút hành động chính đạt ≥ 4.5:1', () => {
    expect(contrast(token('fg-inverse'), token('brand'))).toBeGreaterThanOrEqual(4.5);
  });

  /** Bộ màu theo logo NVG (Bước 0b) — mọi cặp chữ / nền mà giao diện thật dùng. */
  it.each([
    ['chữ trắng trên nút khi rê chuột', 'fg-inverse', 'brand-hover'],
    ['liên kết trên nền trũng', 'brand', 'surface-sunken'],
    ['liên kết trên nền nhạt của thương hiệu', 'brand', 'brand-subtle'],
    ['chữ mục điều hướng đang chọn', 'brand-forest', 'brand-subtle'],
    ['chữ trên pill mint', 'brand-mint-ink', 'brand-mint'],
    ['chữ mint trên avatar', 'brand-mint', 'brand-forest'],
    ['chữ chính trên nền cam nhấn', 'fg', 'brand-accent'],
  ])('%s đạt ≥ 4.5:1', (_label, fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });

  /** Chữ trắng trên cam logo chỉ 2.36:1 — cam chỉ được đi với chữ tối. */
  it('cam logo không đạt với chữ trắng, nên không lớp nào ghép nền cam với chữ trắng', () => {
    expect(contrast(token('fg-inverse'), token('brand-accent'))).toBeLessThan(4.5);
    for (const { path, text } of uiSources()) {
      for (const cls of text.match(/className=(["'`])[^"'`]*\1/g) ?? []) {
        if (/\bbg-brand-accent\b/.test(cls)) {
          expect(cls, path).not.toMatch(/\btext-(white|fg-inverse)\b/);
        }
      }
    }
  });

  /**
   * Xanh dương logo cùng sắc với «Đang xử lý»: chỉ được nằm trong logo (ảnh), không lớp giao
   * diện nào được tô bằng nó — dùng làm liên kết / nhãn là bắt người dùng đọc nó như trạng thái.
   */
  it('xanh dương logo không được dùng làm màu giao diện', () => {
    for (const { path, text } of uiSources()) {
      expect(text, path).not.toMatch(/brand-blue/);
    }
  });

  /**
   * WCAG 1.4.11: viền của ô nhập cần ≥3:1. Viền là thứ DUY NHẤT cho biết đâu là chỗ gõ được —
   * viền mờ quá thì ô nhập trông như một dòng chữ thường.
   */
  it('viền ô nhập đạt ≥ 3:1 trên nền trắng', () => {
    expect(contrast(token('border-strong'), token('surface'))).toBeGreaterThanOrEqual(3);
  });
});

describe('Vùng bấm cho ngón tay', () => {
  /**
   * Tối thiểu ~40×40px (Content Guidelines 6.8). Đây là loại quy tắc mòn dần điển hình: nút
   * lịch trong ô nhập ngày lúc đầu được đặt bằng `p-1.5` quanh một biểu tượng 16px — ra đúng
   * 28×28, nhìn trên máy tính thì gọn gàng, còn ngón tay ở công trường thì bấm trượt.
   *
   * Ô nhập chỉ cao 36px nên vùng bấm phải nhô ra khỏi ô; nó nằm ở lớp tuyệt đối nên không đẩy
   * bố cục, và phần nhô ra là vùng bấm trong suốt chứ không phải hình vẽ.
   */
  it('nút mở lịch có vùng bấm 40×40, không co theo kích thước biểu tượng', () => {
    const code = source('components/ui/date-input.tsx');
    const button = code.slice(code.indexOf('aria-label="Chọn ngày trên lịch"'));
    expect(button).toContain('size-10');
  });

  /**
   * Nút "Menu tài khoản" ở Top Bar từng chỉ có `px-2 py-1` quanh một avatar 24px — ra khoảng
   * 32px cao, dưới mức tối thiểu dù cạnh nó (chuông thông báo, Việc cần làm) đều đã đúng quy
   * tắc `size-10 sm:size-8`. Không cố định thành hình vuông như hai nút kia vì còn chứa chữ
   * tên, nên canh bằng `min-h` thay vì `size`.
   */
  it('nút Menu tài khoản có chiều cao tối thiểu 40px trên di động', () => {
    const code = source('components/layout/top-bar.tsx');
    const trigger = code.slice(code.indexOf('aria-label="Menu tài khoản"') - 300);
    expect(trigger).toContain('min-h-10');
  });

  /**
   * Nút đóng banner cài đặt/cập nhật PWA từng chỉ `size-8` (32px) — banner này hiện chủ yếu
   * trên điện thoại (lời mời cài PWA), đúng nơi ngón tay cần vùng bấm lớn nhất.
   */
  it('nút đóng banner PWA có vùng bấm 40×40 trên di động', () => {
    const code = source('components/layout/pwa-status.tsx');
    const button = code.slice(code.indexOf('aria-label={dismissLabel}'));
    expect(button).toContain('size-10');
  });

  /**
   * Bộ chọn pháp nhân dạng `compact` (đợt rà 4C thứ hai) — CHỈ hiện dưới `lg:` ở Top Bar
   * (top-bar.tsx), đúng nơi ngón tay cần vùng bấm lớn nhất. Từng chỉ `px-2 py-1` quanh icon
   * 16px + mã pháp nhân, cùng lớp lỗi đã vá cho "Menu tài khoản".
   */
  it('bộ chọn pháp nhân compact có chiều cao tối thiểu 40px trên di động', () => {
    const code = source('components/layout/company-switcher.tsx');
    const trigger = code.slice(code.indexOf('DropdownMenu.Trigger'));
    expect(trigger).toContain('min-h-10');
  });

  /**
   * Nút chuyển tháng trong lịch chọn ngày dùng `Button size="sm"` (28px cao) — dưới lịch tháng
   * dùng chung ở mọi ô nhập ngày (DateInput), nên một lỗi ở đây lan ra toàn bộ ứng dụng.
   */
  it('nút chuyển tháng trong lịch chọn ngày có vùng bấm 40×40 trên di động', () => {
    const code = source('components/ui/calendar-popover.tsx');
    const prevStart = code.indexOf('aria-label="Tháng trước"') - 200;
    const nextStart = code.indexOf('aria-label="Tháng sau"') - 200;
    // Chặn cuối slice của nút TRƯỚC ở đầu slice của nút SAU — nếu không, slice "prev" chạy tới
    // hết tệp và luôn chứa "size-10" của nút "Tháng sau", làm test xanh giả kể cả khi chỉ một
    // trong hai nút thật sự có class đó.
    const prev = code.slice(prevStart, nextStart);
    const next = code.slice(nextStart);
    expect(prev).toContain('size-10');
    expect(next).toContain('size-10');
  });

  /**
   * Nút chuyển "Pipeline"/"Danh sách" ở màn hình Cơ hội kinh doanh ẩn chữ nhãn dưới `sm:` —
   * dưới ngưỡng đó nó chỉ còn icon, và `Button size="sm"` mặc định (28px) không đủ.
   */
  it('nút chuyển chế độ xem Pipeline/Danh sách có vùng bấm 40×40 khi chỉ còn icon', () => {
    const code = source('pages/crm/opportunity-pipeline.tsx');
    const viewButton = code.slice(code.indexOf('function ViewButton'));
    expect(viewButton).toContain('size-10');
  });
});

describe('Không để trình duyệt tự sinh chữ tiếng Anh', () => {
  /**
   * Ba điều khiển gốc của trình duyệt tự sinh chữ theo NGÔN NGỮ CỦA TRÌNH DUYỆT, không theo
   * `lang` của trang, và không thuộc tính HTML nào ép được:
   *
   *  - `<input type="date">` — ô hiện `mm/dd/yyyy`, bảng lịch hiện "September", "Su Mo Tu".
   *    KHÔNG ép được bằng cách nào, nên phải thay hẳn bằng `DateInput`.
   *  - Ràng buộc biểu mẫu (`required`, `min`, `pattern`…) — "Please fill out this field."
   *    Ép được bằng `setCustomValidity`, nên chỉ cần chốt ở `main.tsx` là phủ hết, kể cả
   *    `<input type="number">`.
   *
   * Chữ này không nằm trong mã nguồn nên đọc code không thấy, và trên máy người lập trình nó
   * trông vẫn bình thường. Chỉ có test đọc thẳng mã nguồn mới giữ được ranh giới.
   */
  const PAGES = 'web/src/pages';

  function allPageSources(): { file: string; code: string }[] {
    const out: { file: string; code: string }[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(resolve(process.cwd(), dir), { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__') walk(path);
        } else if (entry.name.endsWith('.tsx')) {
          out.push({ file: path, code: readFileSync(resolve(process.cwd(), path), 'utf8') });
        }
      }
    };
    walk(dir(PAGES));
    return out;
  }
  const dir = (d: string) => d;

  it('không màn hình nào dùng ô ngày / giờ gốc — phải dùng `DateInput` / `DateTimeInput`', () => {
    // `datetime-local` hiện `10/18/2026 09:32 AM` trên Chrome tiếng Anh — lọt tới 18/10/2026 vì
    // phép thử cũ chỉ tìm `type="date"`.
    const offenders = allPageSources()
      .filter(({ code }) => /type="(date|datetime-local|time|month|week)"/.test(code))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it('«hôm nay» lấy theo giờ Việt Nam, không cắt chuỗi giờ UTC', () => {
    // `toISOString().slice(0, 10)` là ngày UTC: từ 0 tới 7 giờ sáng nó vẫn là hôm qua. Lỗi thật
    // 01/10/2026 lúc 00:40 — ô «Ngày lập» biên bản giàn giáo, ngày nhật ký công trường, ngày
    // nghiệm thu đều điền sẵn 30/09. Dùng `toNvgDateInput(new Date())`.
    const offenders = allPageSources()
      .filter(({ code }) =>
        /new Date\(\)\.toISOString\(\)\.(?:slice\(0, 10\)|split\('T'\))/.test(code),
      )
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it('không màn hình nào hỏi bằng `window.prompt` — phải dùng `usePromptDialog`', () => {
    // Nút của hộp gốc là «OK/Cancel» theo tiếng của trình duyệt; 20 chỗ đã thay 30/09/2026.
    const offenders = allPageSources()
      .filter(({ code }) => /window\.prompt\(/.test(code))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it('gợi ý / mô tả trên màn hình không để lộ mã tài liệu nội bộ («MH-08», «PRD Mục 2.2»)', () => {
    // Người dùng NVG không có PRD trong tay; mã yêu cầu thuộc về chú thích mã nguồn.
    const code = String.raw`(?:PRD|(?:NEN|CRM|DA|TK|HD|TC|MH|KHO|KT|NS|BC|SX)-\d{2})`;
    const visible = new RegExp(`(?:hint|description|title)="[^"]*${code}[^"]*"`);
    const offenders = allPageSources()
      .filter(({ code: src }) => visible.test(src))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it('thanh tab của phân hệ cuộn ngang được và mục tab không co — chữ không đè nhau trên điện thoại', () => {
    // Lỗi thật 30/09/2026: 7 tab Kho trên khổ 390px co lại, «Quét mã» đè «Tồn kho».
    const navs = allPageSources().filter(
      ({ file }) => /-nav\.tsx$/.test(file) && !file.includes('/tk/'),
    );
    expect(navs.length).toBeGreaterThan(5);
    const offenders = navs
      .filter(
        ({ code }) =>
          !code.includes('overflow-x-auto') || !code.includes('shrink-0 whitespace-nowrap'),
      )
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it('chốt dịch lời thoại ràng buộc được gắn ngay khi ứng dụng khởi động', () => {
    // Thiếu dòng này thì mọi ô `required` ngoài `Input` lại báo tiếng Anh.
    expect(source('main.tsx')).toContain('installVietnameseValidation()');
  });
});
