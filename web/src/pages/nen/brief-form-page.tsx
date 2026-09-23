/**
 * «Biểu mẫu đầu bài» — nơi quản trị viên thêm, sửa, ẩn các mục khảo sát của Đầu bài thiết kế
 * mà không cần phát hành lại phần mềm (yêu cầu của Haan, 21/09/2026).
 *
 * ## Màn hình này KHÔNG phải một trình soạn biểu mẫu tổng quát
 *
 * Nó sửa một LỚP PHỦ lên cấu hình gốc (`shared/src/design/brief-form-overlay.ts` giải thích
 * vì sao là lớp phủ). Hệ quả nhìn thấy được trên màn hình, và phải nói thẳng ra chứ không để
 * người dùng tự đoán:
 *
 *  · Câu hỏi CÓ SẴN chỉ đổi được cách diễn đạt (nhãn, gợi ý), trọng số, bắt buộc hay không,
 *    và ẩn/hiện. Không đổi được kiểu ô nhập, đơn vị, khoảng giá trị — chúng là hình dạng dữ
 *    liệu của hợp đồng, không phải cách diễn đạt.
 *  · Câu hỏi có sẵn không XOÁ được, chỉ ẩn. Ẩn thì câu trả lời đã lưu vẫn còn; xoá thì mất.
 *    Hồ sơ đã xác nhận là bất biến, nên một biểu mẫu không đọc nổi chính nó là cái giá không
 *    đáng trả cho một nút «Xoá».
 *  · Câu hỏi TỰ THÊM thì xoá được — nó chưa bao giờ là một phần của hợp đồng.
 *  · Năm câu hỏi bắt buộc của hợp đồng (loại hình, địa phương, số tầng, rộng, sâu) khoá hẳn.
 *
 * ## Vì sao câu hỏi tự thêm không ràng buộc được hình học
 *
 * Câu trả lời của chúng nằm ở ô mở `custom.*`, đi tới mô hình dưới dạng «nhãn: câu trả lời»
 * đúng chỗ lời gia chủ vẫn đi. Engine KHÔNG đọc chúng. Một câu hỏi cần ràng buộc thật lên
 * mặt bằng (một tầng, một diện tích, một mặt của lô) phải là một trường có tên trong hợp
 * đồng — việc đó vẫn cần một đợt phát hành, và màn hình nói rõ điều đó.
 */

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  applyBriefFormOverlay,
  BRIEF_FORM,
  CUSTOM_CONTROLS,
  CUSTOM_PATH_PATTERN,
  LOCKED_PATHS,
  type BriefFormOverlay,
  type BriefFormOverlayField,
  type BriefFormOverlaySection,
  type CustomControl,
} from '@nvg/shared/design';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  useBriefFormConfig,
  useDesignCapabilities,
  useSaveBriefFormOverlay,
} from '@/hooks/use-design-projects';
import { NenNav } from './nen-nav';

const CONTROL_LABEL: Record<CustomControl, string> = {
  text: 'Ô chữ một dòng',
  textarea: 'Ô chữ nhiều dòng',
  number: 'Ô số',
  choice: 'Chọn một trong nhiều',
  tristate: 'Có / Không',
};

/** Lời giải thích đi kèm từng kiểu ô — để người chọn biết mình đang tạo ra cái gì. */
const CONTROL_HINT: Record<CustomControl, string> = {
  text: 'Một dòng ngắn, ví dụ tên đơn vị thi công.',
  textarea: 'Nhiều dòng, dành cho câu trả lời kể bằng lời.',
  number: 'Chỉ nhận số. Có thể khai đơn vị hiện cạnh ô.',
  choice: 'Người điền chọn đúng một mục trong danh sách khai bên dưới.',
  tristate: 'Hai lựa chọn Có và Không, bỏ chọn được.',
};

export function BriefFormAdminPage() {
  const { has } = useDesignCapabilities();
  const canEdit = has('design.settings.write');
  const { overlay: stored, broken } = useBriefFormConfig();
  const save = useSaveBriefFormOverlay();

  const [draft, setDraft] = useState<BriefFormOverlay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Bọc `useMemo` vì `preview` phụ thuộc vào nó: không bọc thì mỗi lượt vẽ lại sinh một đối
  // tượng mới, và cả cây biểu mẫu được ghép lại từ đầu sau mỗi phím gõ.
  const overlay: BriefFormOverlay = useMemo(
    () => draft ?? stored ?? { version: 1 },
    [draft, stored],
  );
  const dirty = draft !== null;

  /**
   * Cấu hình ĐANG XEM = bản gốc + lớp phủ đang sửa dở.
   *
   * Vẽ từ kết quả ghép chứ không vẽ từ bản gốc rồi chấm thêm: đây là đúng thứ kiến trúc sư sẽ
   * thấy, và nếu lớp phủ đang sai thì thấy ngay tại đây chứ không phải sau khi bấm Lưu.
   */
  const preview = useMemo(() => {
    try {
      return { config: applyBriefFormOverlay(BRIEF_FORM, overlay), error: null as string | null };
    } catch (e) {
      return { config: BRIEF_FORM, error: (e as Error).message };
    }
  }, [overlay]);

  function patch(next: BriefFormOverlay) {
    setDraft(next);
    setSaved(false);
    setError(null);
  }

  /** Lấy (hoặc tạo) phần chỉnh của một mục trong lớp phủ. */
  function sectionPatch(id: string): BriefFormOverlaySection {
    return (overlay.sections ?? []).find((s) => s.id === id) ?? { id };
  }

  function putSection(next: BriefFormOverlaySection) {
    const others = (overlay.sections ?? []).filter((s) => s.id !== next.id);
    patch({ ...overlay, sections: [...others, next] });
  }

  function fieldPatch(sectionId: string, path: string): BriefFormOverlayField {
    return (sectionPatch(sectionId).fields ?? []).find((f) => f.path === path) ?? { path };
  }

  function putField(sectionId: string, next: BriefFormOverlayField) {
    const section = sectionPatch(sectionId);
    const others = (section.fields ?? []).filter((f) => f.path !== next.path);
    putSection({ ...section, fields: [...others, next] });
  }

  function dropField(sectionId: string, path: string) {
    const section = sectionPatch(sectionId);
    putSection({ ...section, fields: (section.fields ?? []).filter((f) => f.path !== path) });
  }

  /** Thứ tự mục — luôn ghi ĐẦY ĐỦ danh sách id, xem chú thích của `section_order`. */
  function moveSection(id: string, delta: number) {
    const ids = preview.config.sections.map((s) => s.id);
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= ids.length) return;
    const next = [...ids];
    next.splice(to, 0, ...next.splice(from, 1));
    patch({ ...overlay, section_order: next });
  }

  async function submit() {
    setError(null);
    try {
      await save.mutateAsync({ overlay: isEmptyOverlay(overlay) ? null : overlay });
      setDraft(null);
      setSaved(true);
    } catch (e) {
      setError(toUserMessage(e));
    }
  }

  async function resetToBase() {
    setError(null);
    try {
      await save.mutateAsync({ overlay: null });
      setDraft(null);
      setSaved(true);
    } catch (e) {
      setError(toUserMessage(e));
    }
  }

  return (
    <div>
      <PageHeader
        title="Biểu mẫu đầu bài"
        description="Thêm, sửa và ẩn các mục khảo sát của Đầu bài thiết kế. Thay đổi áp dụng ngay cho mọi hồ sơ đang soạn."
      />
      <NenNav />

      {broken && (
        <p className="mb-4 rounded border border-status-overdue-border bg-status-overdue-bg p-3 text-status-overdue-fg">
          Cấu hình đang lưu không đọc được nên biểu mẫu đang chạy theo bản gốc. Sửa lại bên dưới rồi
          lưu, hoặc bấm «Trả về bản gốc».
        </p>
      )}

      {preview.error && (
        <p className="mb-4 rounded border border-status-overdue-border bg-status-overdue-bg p-3 text-status-overdue-fg">
          {preview.error}
        </p>
      )}

      {error && <ErrorState message={error} />}

      {saved && !dirty && (
        <p className="mb-4 rounded border border-status-done-border bg-status-done-bg p-3 text-status-done-fg">
          Đã lưu biểu mẫu đầu bài.
        </p>
      )}

      <p className="mb-4 max-w-3xl text-fg-subtle">
        Câu hỏi có sẵn đổi được cách diễn đạt, trọng số và ẩn hiện; kiểu ô nhập và đơn vị thì không
        — đó là hình dạng dữ liệu của hồ sơ. Câu hỏi có sẵn không xoá được, chỉ ẩn: ẩn thì câu trả
        lời đã lưu vẫn còn, xoá thì mất. Câu hỏi tự thêm là ghi chú đi kèm hồ sơ và gửi cho phần
        dựng phương án tự động dưới dạng lời văn; chúng không ràng buộc được kích thước hay vị trí
        phòng.
      </p>

      {!canEdit && (
        <p className="mb-4 rounded border border-border bg-surface-subtle p-3 text-fg-subtle">
          Tài khoản chỉ xem được cấu hình này. Quản trị hệ thống hoặc Trưởng phòng Thiết kế sửa
          được.
        </p>
      )}

      <div className="space-y-4">
        {preview.config.sections.map((section, index) => {
          const sPatch = sectionPatch(section.id);
          const isCustomSection = Boolean(sPatch.custom);
          return (
            <section key={section.id} className="rounded border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  aria-label={`Tên mục ${section.title}`}
                  className="max-w-xs font-semibold"
                  value={section.title}
                  disabled={!canEdit}
                  onChange={(e) => putSection({ ...sPatch, title: e.target.value })}
                />
                <Button
                  variant="subtle"
                  aria-label={`Đưa mục ${section.title} lên trên`}
                  disabled={!canEdit || index === 0}
                  onClick={() => moveSection(section.id, -1)}
                >
                  <ChevronUp className="size-4" aria-hidden />
                </Button>
                <Button
                  variant="subtle"
                  aria-label={`Đưa mục ${section.title} xuống dưới`}
                  disabled={!canEdit || index === preview.config.sections.length - 1}
                  onClick={() => moveSection(section.id, 1)}
                >
                  <ChevronDown className="size-4" aria-hidden />
                </Button>
                <span className="ml-auto text-fg-subtle">{section.fields.length} câu hỏi</span>
                <Button
                  variant="subtle"
                  disabled={!canEdit}
                  onClick={() => putSection({ ...sPatch, hidden: true })}
                >
                  Ẩn mục
                </Button>
              </div>

              <ul className="mt-3 divide-y divide-border">
                {section.fields.map((field) => {
                  const fPatch = fieldPatch(section.id, field.path);
                  const locked = LOCKED_PATHS.includes(field.path);
                  const isCustom = field.path.startsWith('custom.');
                  return (
                    <li key={field.path} className="grid gap-2 py-3 sm:grid-cols-12">
                      <div className="sm:col-span-5">
                        <Field label="Câu hỏi">
                          <Input
                            id={`label-${field.path}`}
                            value={field.label}
                            disabled={!canEdit}
                            onChange={(e) =>
                              putField(section.id, { ...fPatch, label: e.target.value })
                            }
                          />
                        </Field>
                        <p className="mt-1 text-xs text-fg-subtle">{field.path}</p>
                      </div>
                      <div className="sm:col-span-4">
                        <Field label="Gợi ý dưới ô nhập">
                          <Input
                            id={`hint-${field.path}`}
                            value={field.hint ?? ''}
                            disabled={!canEdit}
                            onChange={(e) =>
                              putField(section.id, { ...fPatch, hint: e.target.value || null })
                            }
                          />
                        </Field>
                      </div>
                      <div className="sm:col-span-1">
                        <Field label="Trọng số">
                          <Input
                            id={`weight-${field.path}`}
                            inputMode="numeric"
                            value={String(field.weight)}
                            disabled={!canEdit}
                            onChange={(e) => {
                              const weight = Number(e.target.value);
                              if (!Number.isFinite(weight) || weight < 0 || weight > 10) return;
                              putField(section.id, { ...fPatch, weight });
                            }}
                          />
                        </Field>
                      </div>
                      <div className="flex items-end gap-2 sm:col-span-2">
                        {locked ? (
                          <span className="text-xs text-fg-subtle">
                            Bắt buộc theo hồ sơ — không ẩn được
                          </span>
                        ) : isCustom ? (
                          <Button
                            variant="subtle"
                            aria-label={`Xoá câu hỏi ${field.label}`}
                            disabled={!canEdit}
                            onClick={() => dropField(section.id, field.path)}
                          >
                            <Trash2 className="size-4" aria-hidden /> Xoá
                          </Button>
                        ) : (
                          <Button
                            variant="subtle"
                            disabled={!canEdit}
                            onClick={() => putField(section.id, { ...fPatch, hidden: true })}
                          >
                            Ẩn
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>

              <AddQuestion
                disabled={!canEdit}
                existing={preview.config.sections.flatMap((s) => s.fields.map((f) => f.path))}
                onAdd={(field) => putField(section.id, field)}
              />

              {isCustomSection && (
                <p className="mt-2 text-xs text-fg-subtle">Mục do quản trị viên tạo.</p>
              )}
            </section>
          );
        })}
      </div>

      <HiddenList overlay={overlay} canEdit={canEdit} onRestore={patch} />

      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={() => void submit()} disabled={!canEdit || !dirty || save.isPending}>
          {save.isPending ? 'Đang lưu…' : 'Lưu biểu mẫu'}
        </Button>
        <Button variant="subtle" onClick={() => setDraft(null)} disabled={!dirty}>
          Bỏ thay đổi chưa lưu
        </Button>
        <Button
          variant="subtle"
          onClick={() => void resetToBase()}
          disabled={!canEdit || save.isPending}
        >
          <RotateCcw className="size-4" aria-hidden /> Trả về bản gốc
        </Button>
      </div>
    </div>
  );
}

/**
 * Danh sách những gì đang bị ẩn, kèm nút bỏ ẩn.
 *
 * Không có danh sách này thì ẩn là một chiều: mục đã ẩn biến mất khỏi màn hình sửa, và lối
 * duy nhất đưa nó về là «Trả về bản gốc» — thứ xoá luôn mọi chỉnh sửa khác.
 */
function HiddenList({
  overlay,
  canEdit,
  onRestore,
}: {
  overlay: BriefFormOverlay;
  canEdit: boolean;
  onRestore: (next: BriefFormOverlay) => void;
}) {
  const hiddenSections = (overlay.sections ?? []).filter((s) => s.hidden);
  const hiddenFields = (overlay.sections ?? []).flatMap((s) =>
    (s.fields ?? []).filter((f) => f.hidden).map((f) => ({ section: s, field: f })),
  );
  if (!hiddenSections.length && !hiddenFields.length) return null;

  const baseLabel = (path: string) =>
    BRIEF_FORM.sections.flatMap((s) => s.fields).find((f) => f.path === path)?.label ?? path;
  const baseSection = (id: string) => BRIEF_FORM.sections.find((s) => s.id === id)?.title ?? id;

  function show(sectionId: string, path?: string) {
    const sections = (overlay.sections ?? []).map((s) => {
      if (s.id !== sectionId) return s;
      if (!path) return { ...s, hidden: false };
      return { ...s, fields: (s.fields ?? []).filter((f) => f.path !== path) };
    });
    onRestore({ ...overlay, sections });
  }

  return (
    <section className="mt-6 rounded border border-border bg-surface-subtle p-4">
      <h2 className="font-semibold">Đang ẩn</h2>
      <p className="mt-1 text-fg-subtle">
        Câu trả lời đã lưu của những mục này vẫn còn nguyên trong hồ sơ, chỉ là biểu mẫu thôi hỏi.
      </p>
      <ul className="mt-2 space-y-1">
        {hiddenSections.map((s) => (
          <li key={s.id} className="flex items-center gap-2">
            <span>Mục «{s.title ?? baseSection(s.id)}»</span>
            <Button variant="subtle" disabled={!canEdit} onClick={() => show(s.id)}>
              Hiện lại
            </Button>
          </li>
        ))}
        {hiddenFields.map(({ section, field }) => (
          <li key={`${section.id}-${field.path}`} className="flex items-center gap-2">
            <span>{field.label ?? baseLabel(field.path)}</span>
            <Button
              variant="subtle"
              disabled={!canEdit}
              onClick={() => show(section.id, field.path)}
            >
              Hiện lại
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Biểu mẫu nhỏ để thêm một câu hỏi vào mục. */
function AddQuestion({
  disabled,
  existing,
  onAdd,
}: {
  disabled: boolean;
  existing: string[];
  onAdd: (field: BriefFormOverlayField) => void;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [key, setKey] = useState('');
  const [control, setControl] = useState<CustomControl>('text');
  /**
   * Người dùng đã tự sửa mã chưa.
   *
   * Không có cờ này thì điều kiện gợi ý phải là «mã đang rỗng» — và vì người ta gõ từng ký
   * tự, mã chỉ được gợi ý đúng MỘT lần, ở ký tự đầu tiên: «Có bếp nướng ngoài trời không» ra
   * mã `c`. Phép thử của màn hình này bắt đúng chỗ đó.
   */
  const [keyTouched, setKeyTouched] = useState(false);
  const [unit, setUnit] = useState('');
  const [choices, setChoices] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  function add() {
    const path = `custom.${key.trim()}`;
    if (!label.trim()) return setProblem('Chưa đặt tên cho câu hỏi.');
    if (!CUSTOM_PATH_PATTERN.test(path)) {
      return setProblem(
        'Mã câu hỏi chỉ gồm chữ thường không dấu, chữ số và dấu gạch dưới, tối đa 40 ký tự.',
      );
    }
    if (existing.includes(path)) return setProblem('Mã câu hỏi này đã có trong biểu mẫu.');

    const options =
      control === 'tristate'
        ? [
            { value: 'true', label: 'Có' },
            { value: 'false', label: 'Không' },
          ]
        : control === 'choice'
          ? choices
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line, i) => ({ value: `lc_${i + 1}`, label: line }))
          : undefined;

    if (control === 'choice' && (!options || options.length < 2)) {
      return setProblem('Câu hỏi dạng chọn cần ít nhất hai lựa chọn, mỗi lựa chọn một dòng.');
    }

    onAdd({
      path,
      label: label.trim(),
      ...(options ? { options } : {}),
      custom: { control, ...(control === 'number' && unit.trim() ? { unit: unit.trim() } : {}) },
    });
    setOpen(false);
    setLabel('');
    setKey('');
    setKeyTouched(false);
    setChoices('');
    setUnit('');
    setProblem(null);
  }

  if (!open) {
    return (
      <Button variant="subtle" className="mt-3" disabled={disabled} onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden /> Thêm câu hỏi
      </Button>
    );
  }

  return (
    <div className="mt-3 rounded border border-border p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Tên câu hỏi">
          <Input
            id="new-label"
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              if (!keyTouched) setKey(suggestKey(e.target.value));
            }}
          />
        </Field>
        <Field label="Mã câu hỏi" hint="Chữ thường không dấu, dùng làm khoá lưu.">
          <Input
            id="new-key"
            value={key}
            onChange={(e) => {
              setKeyTouched(true);
              setKey(e.target.value);
            }}
          />
        </Field>
        <Field label="Kiểu trả lời" hint={CONTROL_HINT[control]}>
          {/* Danh sách đóng, chữ bên trong là chữ của mình — `<select>` không tự sinh câu nào. */}
          <select
            id="new-control"
            className="min-h-10 w-full rounded border border-border bg-surface px-2"
            value={control}
            onChange={(e) => setControl(e.target.value as CustomControl)}
          >
            {CUSTOM_CONTROLS.map((c) => (
              <option key={c} value={c}>
                {CONTROL_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>
        {control === 'number' && (
          <Field label="Đơn vị" hint="Hiện cạnh ô nhập. Để trống nếu không có.">
            <Input id="new-unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
          </Field>
        )}
        {control === 'choice' && (
          <Field label="Các lựa chọn" hint="Mỗi dòng một lựa chọn.">
            <textarea
              id="new-choices"
              rows={4}
              className="w-full rounded border border-border bg-surface p-2"
              value={choices}
              onChange={(e) => setChoices(e.target.value)}
            />
          </Field>
        )}
      </div>
      {problem && <p className="mt-2 text-status-overdue-fg">{problem}</p>}
      <div className="mt-2 flex gap-2">
        <Button onClick={add}>Thêm vào mục</Button>
        <Button variant="subtle" onClick={() => setOpen(false)}>
          Hủy
        </Button>
      </div>
    </div>
  );
}

/**
 * Gợi ý mã câu hỏi từ tên — bỏ dấu, thay khoảng trắng bằng gạch dưới.
 *
 * Chỉ là GỢI Ý và sửa được: mã đi vào dữ liệu hồ sơ, nên để máy chốt thay người là cách tạo ra
 * những khoá như `cau_hoi_1` mà ba tháng sau không ai đọc ra nghĩa.
 */
function suggestKey(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

/** Lớp phủ không còn thay đổi nào — lưu nó bằng «xoá hàng», xem tuyến `POST /design/brief/form`. */
function isEmptyOverlay(overlay: BriefFormOverlay): boolean {
  const sections = (overlay.sections ?? []).filter(
    (s) =>
      s.title !== undefined ||
      s.hint !== undefined ||
      s.hidden ||
      s.custom ||
      (s.fields ?? []).length > 0,
  );
  return sections.length === 0 && !overlay.section_order?.length;
}
