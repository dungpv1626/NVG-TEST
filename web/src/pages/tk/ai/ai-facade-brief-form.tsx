/**
 * Phiếu yêu cầu mặt đứng của kỹ sư (T59 Đợt F2, 19/09/2026) — nằm ĐẦU màn hình bước Mặt đứng.
 *
 * Haan chốt: mục đã điền là BẮT BUỘC (chương trình áp thẳng vào ý tưởng), mục bỏ trống để AI đề xuất;
 * kỹ sư nhập CHIỀU CAO cửa, BỀ RỘNG là của mặt bằng — hiện chỉ đọc kèm lời nhắc sửa ở bước 1.
 *
 * Bốn ràng buộc của màn hình:
 *  · danh sách chọn lấy từ danh mục qua Worker (`kb/facade_vocabulary.yaml`), không viết cứng;
 *  · không dùng `type=number` — trình duyệt tự sinh chữ tiếng Anh (CLAUDE.md 4.1);
 *  · màu luôn kèm chữ: tên và mã hex cạnh ô màu (CGD 6.8);
 *  · không mất dữ liệu đang nhập: nháp giữ trong trình duyệt khi đang gõ, hỏi trước khi rời trang
 *    (CLAUDE.md 5.4). Nháp chỉ là tiện ích của người đang gõ — bản thật là bản đã lưu lên máy chủ.
 */

import { formatDateTime, formatNumber } from '@nvg/shared';
import { STYLE_LABEL, STYLES, type AiFacadeBrief } from '@nvg/shared/design';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/states';
import {
  useFacadeBrief,
  useFacadeVocabulary,
  useSaveFacadeBrief,
  type FacadeBriefState,
  type FacadeOption,
  type FacadeVocabularyView,
} from '@/hooks/use-ai-design';
import { DesignApiError } from '@/lib/design-api';
import { toUserMessage } from '@/hooks/use-error-message';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { Chip, Panel } from '../tk-ui';

const AI_PICKS = 'Để AI đề xuất';

/** Phiếu trống — cùng hình dạng với `emptyFacadeBrief()` phía Worker. */
export function emptyBrief(): AiFacadeBrief {
  const finish = () => ({ material: null, colour: null });
  const door = () => ({ material: null, colour: null, type: null, h_cm: null });
  return {
    schema_version: '1.0.0',
    // Máy chủ đặt lại hai khoá này lúc lưu — ở đây chỉ để phiếu nháp đúng hình dạng.
    saved_at: new Date(0).toISOString(),
    plan_ref: null,
    style: null,
    ground_raise_cm: null,
    roof: { type: null, material: null, colour: null, pitch_deg: null, parapet_cm: null },
    palette: { primary: null, secondary: null, accent: null },
    surfaces: { body: finish(), base: finish(), accent: finish(), trim: finish() },
    main_door: door(),
    side_door: door(),
    window: { material: null, colour: null, glass: null },
    garage_door: { type: null, material: null, colour: null },
    balcony: { railing: null, colour: null },
    gate: { wanted: null, type: null, material: null, colour: null, h_cm: null },
    fence: { type: null, material: null, colour: null, h_cm: null },
    decorations: [],
    notes: null,
  };
}

const draftKey = (projectId: string) => `nvg.facade-brief-draft.${projectId}`;

function readDraft(projectId: string): AiFacadeBrief | null {
  try {
    const raw = window.localStorage.getItem(draftKey(projectId));
    return raw ? (JSON.parse(raw) as AiFacadeBrief) : null;
  } catch {
    return null;
  }
}

function writeDraft(projectId: string, brief: AiFacadeBrief | null): void {
  try {
    if (brief) window.localStorage.setItem(draftKey(projectId), JSON.stringify(brief));
    else window.localStorage.removeItem(draftKey(projectId));
  } catch {
    // Trình duyệt chặn bộ nhớ (cửa sổ riêng tư…): phiếu vẫn dùng được, chỉ mất nháp khi rời trang.
  }
}

/** Hai phiếu có cùng nội dung không — bỏ qua hai trường máy chủ tự điền. */
function sameBrief(a: AiFacadeBrief, b: AiFacadeBrief): boolean {
  const strip = ({ plan_ref: _p, schema_version: _s, saved_at: _t, ...rest }: AiFacadeBrief) =>
    rest;
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
}

export interface FacadeBriefController {
  loading: boolean;
  error: Error | null;
  draft: AiFacadeBrief;
  setDraft: (next: AiFacadeBrief) => void;
  /** Có thay đổi so với bản đã lưu trên máy chủ. */
  dirty: boolean;
  /** Lưu lên máy chủ. Trả `false` khi lưu hỏng — nơi gọi (nút chạy) phải dừng. */
  save: () => Promise<boolean>;
  saving: boolean;
  saveError: string | null;
  /** Mục nào hỏng — Worker trả kèm, đã là tiếng Việt. Rỗng khi lỗi không thuộc về một mục nào. */
  saveIssues: readonly string[];
  saved: FacadeBriefState | undefined;
}

/**
 * Trạng thái phiếu cho cả màn hình bước Mặt đứng — nút «Dựng ý tưởng mặt đứng» cần biết phiếu có thay
 * đổi chưa lưu để lưu trước khi chạy, nên trạng thái nằm ở trên, không nằm trong biểu mẫu.
 */
export function useFacadeBriefController(projectId: string): FacadeBriefController {
  const saved = useFacadeBrief(projectId);
  const saveBrief = useSaveFacadeBrief();
  const [draft, setDraftState] = useState<AiFacadeBrief | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveIssues, setSaveIssues] = useState<readonly string[]>([]);

  // Nạp lần đầu: nháp trong trình duyệt (nếu có) thắng bản trên máy chủ — đó là thứ kỹ sư đang gõ dở.
  useEffect(() => {
    if (draft !== null || !saved.data) return;
    setDraftState(readDraft(projectId) ?? saved.data.brief ?? emptyBrief());
  }, [draft, saved.data, projectId]);

  const base = saved.data?.brief ?? emptyBrief();
  const current = draft ?? base;
  const dirty = draft !== null && !sameBrief(current, base);

  const setDraft = (next: AiFacadeBrief) => {
    setDraftState(next);
    writeDraft(projectId, sameBrief(next, base) ? null : next);
  };

  const save = async () => {
    setSaveError(null);
    setSaveIssues([]);
    try {
      await saveBrief.mutateAsync({ projectId, brief: current });
      writeDraft(projectId, null);
      return true;
    } catch (error) {
      setSaveError(toUserMessage(error));
      // Câu tổng không đủ để sửa: phiếu có mười bốn mục. Danh sách mục hỏng đi kèm lỗi.
      setSaveIssues(error instanceof DesignApiError ? (error.issues ?? []) : []);
      return false;
    }
  };

  return {
    loading: saved.isLoading,
    error: saved.error,
    draft: current,
    setDraft,
    dirty,
    save,
    saving: saveBrief.isPending,
    saveError,
    saveIssues,
    saved: saved.data,
  };
}

export function FacadeBriefForm({
  controller,
  readOnly,
}: {
  controller: FacadeBriefController;
  readOnly: boolean;
}): React.ReactElement {
  const vocab = useFacadeVocabulary();
  useUnsavedChangesGuard(controller.dirty && !readOnly);

  if (controller.loading || vocab.isLoading) return <Skeleton className="h-40 w-full" />;
  if (controller.error || vocab.error || !vocab.data) {
    return (
      <Panel title="Yêu cầu mặt đứng của kỹ sư">
        <p className="text-status-overdue">{toUserMessage(controller.error ?? vocab.error)}</p>
      </Panel>
    );
  }

  const { draft, saved } = controller;
  const plan = saved?.plan ?? null;
  const set = (mutate: (b: AiFacadeBrief) => void) => {
    const next = structuredClone(draft);
    mutate(next);
    controller.setDraft(next);
  };
  const staleBrief = Boolean(
    saved?.brief?.plan_ref && plan && saved.brief.plan_ref !== plan.artifactId,
  );

  return (
    <Panel
      title="Yêu cầu mặt đứng của kỹ sư"
      aside={
        controller.dirty ? (
          <Chip tone="am">Có thay đổi chưa lưu</Chip>
        ) : saved?.savedAt ? (
          <Chip tone="gr">Đã lưu {formatDateTime(saved.savedAt)}</Chip>
        ) : (
          <Chip tone="mute">Chưa điền</Chip>
        )
      }
    >
      <p className="text-fg-subtle">
        Mục nào đã chọn thì AI và chương trình phải theo đúng. Mục để «{AI_PICKS}» thì AI chọn cho
        hợp phong cách. Khung nhà, vị trí và bề rộng cửa lấy từ phương án mặt bằng đang chọn.
      </p>
      {staleBrief && (
        <p className="mt-2 text-tk-am-fg">
          Phiếu này lưu khi đang chọn một phương án mặt bằng khác. Xem lại chiều cao cửa trước khi
          dựng.
        </p>
      )}

      <fieldset disabled={readOnly} className="mt-3 space-y-2">
        <Group title="Chung" open>
          <Select
            label="Phong cách"
            value={draft.style}
            options={STYLES.map((code) => ({ code, label: STYLE_LABEL[code] }))}
            onChange={(v) => set((b) => (b.style = v as AiFacadeBrief['style']))}
          />
          <NumberField
            label="Cốt sàn tầng 1 cao hơn vỉa hè (cm)"
            value={draft.ground_raise_cm}
            fallback={vocab.data.defaults.groundRaiseCm}
            onChange={(v) => set((b) => (b.ground_raise_cm = v))}
          />
        </Group>

        <Group title="Mái" open>
          <Select
            label="Loại mái"
            value={draft.roof.type}
            options={vocab.data.roofTypes}
            onChange={(v) => set((b) => (b.roof.type = v as AiFacadeBrief['roof']['type']))}
          />
          <Select
            label="Vật liệu mái"
            value={draft.roof.material}
            options={vocab.data.roofMaterials}
            onChange={(v) => set((b) => (b.roof.material = v))}
          />
          <ColourSelect
            label="Màu mái"
            value={draft.roof.colour}
            colours={vocab.data.colours}
            onChange={(v) => set((b) => (b.roof.colour = v))}
          />
          <NumberField
            label="Độ dốc mái (độ)"
            value={draft.roof.pitch_deg}
            fallback={null}
            onChange={(v) => set((b) => (b.roof.pitch_deg = v))}
          />
          <NumberField
            label="Tường chắn mái cao (cm, mái bằng)"
            value={draft.roof.parapet_cm}
            fallback={vocab.data.defaults.parapetCm}
            onChange={(v) => set((b) => (b.roof.parapet_cm = v))}
          />
        </Group>

        <Group title="Màu sơn" open>
          {(
            [
              ['primary', 'Màu chính'],
              ['secondary', 'Màu phụ'],
              ['accent', 'Màu nhấn'],
            ] as const
          ).map(([key, label]) => (
            <ColourSelect
              key={key}
              label={label}
              value={draft.palette[key]}
              colours={vocab.data.colours}
              onChange={(v) => set((b) => (b.palette[key] = v))}
            />
          ))}
        </Group>

        <Group title="Vật liệu mặt tiền">
          {(
            [
              ['body', 'Thân nhà'],
              ['base', 'Phần đế, chân tường'],
              ['accent', 'Mảng nhấn'],
              ['trim', 'Chỉ, phào, khung'],
            ] as const
          ).map(([zone, label]) => (
            <div key={zone} className="contents">
              <Select
                label={`${label} — vật liệu`}
                value={draft.surfaces[zone].material}
                options={vocab.data.materials}
                onChange={(v) => set((b) => (b.surfaces[zone].material = v))}
              />
              <ColourSelect
                label={`${label} — màu`}
                value={draft.surfaces[zone].colour}
                colours={vocab.data.colours}
                onChange={(v) => set((b) => (b.surfaces[zone].colour = v))}
              />
            </div>
          ))}
        </Group>

        <Group title="Cửa chính (tầng 1)" open>
          <DoorFields
            door={draft.main_door}
            vocab={vocab.data}
            fallbackH={vocab.data.defaults.doorHeightCm}
            width={
              plan?.mainDoorW
                ? `${formatNumber(plan.mainDoorW * 10)} mm`
                : 'Mặt bằng chưa có cửa chính mặt tiền'
            }
            onChange={(door) => set((b) => (b.main_door = door))}
          />
        </Group>

        <Group title="Cửa phụ, cửa ra ban công">
          <DoorFields
            door={draft.side_door}
            vocab={vocab.data}
            fallbackH={vocab.data.defaults.doorHeightCm}
            width={
              plan?.sideDoorWs.length
                ? plan.sideDoorWs.map((w) => `${formatNumber(w * 10)} mm`).join(' · ')
                : 'Mặt tiền không có cửa phụ'
            }
            onChange={(door) => set((b) => (b.side_door = door))}
          />
        </Group>

        <Group title="Cửa sổ">
          <Select
            label="Vật liệu khung"
            value={draft.window.material}
            options={vocab.data.doorMaterials}
            onChange={(v) => set((b) => (b.window.material = v))}
          />
          <ColourSelect
            label="Màu khung"
            value={draft.window.colour}
            colours={vocab.data.colours}
            onChange={(v) => set((b) => (b.window.colour = v))}
          />
          <Select
            label="Loại kính"
            value={draft.window.glass}
            options={vocab.data.glassTypes}
            onChange={(v) => set((b) => (b.window.glass = v))}
          />
        </Group>

        <Group title="Cửa để xe">
          <Select
            label="Kiểu cửa"
            value={draft.garage_door.type}
            options={vocab.data.garageDoorTypes}
            onChange={(v) => set((b) => (b.garage_door.type = v))}
          />
          <Select
            label="Vật liệu"
            value={draft.garage_door.material}
            options={vocab.data.doorMaterials}
            onChange={(v) => set((b) => (b.garage_door.material = v))}
          />
          <ColourSelect
            label="Màu"
            value={draft.garage_door.colour}
            colours={vocab.data.colours}
            onChange={(v) => set((b) => (b.garage_door.colour = v))}
          />
          <ReadOnly
            label="Bề rộng"
            value={
              plan?.garageW
                ? `${formatNumber(plan.garageW * 10)} mm — theo mặt bằng`
                : 'Mặt tiền không có cửa để xe'
            }
          />
        </Group>

        {/* Nhóm này LUÔN hiện, kể cả khi phương án mặt bằng chưa có ban công nào ra mặt trước.
            Bản trước ẩn hẳn nó, và ẩn LẶNG LẼ — kỹ sư mở phiếu ra không thấy mục lan can đâu mà
            cũng không biết vì sao (Haan báo 20/09/2026). Nhóm cổng và tường rào bên dưới cũng bị
            ẩn theo điều kiện, nhưng nó NÓI ra lý do; chỗ này thì không. */}
        <Group title="Lan can ban công">
          {plan !== null && plan.balconies === 0 && (
            <p className="text-fg-subtle sm:col-span-2">
              Phương án mặt bằng đang chọn chưa có ban công nào ra mặt trước, nên mặt đứng chưa có
              lan can để vẽ. Điền sẵn ở đây vẫn được — các ô này áp dụng ngay khi mặt bằng có ban
              công.
            </p>
          )}
          <Select
            label="Kiểu lan can"
            value={draft.balcony.railing}
            options={vocab.data.railings}
            onChange={(v) => set((b) => (b.balcony.railing = v))}
          />
          <Select
            label="Vật liệu lan can"
            value={draft.balcony.material ?? null}
            options={vocab.data.materials}
            onChange={(v) => set((b) => (b.balcony.material = v))}
          />
          <ColourSelect
            label="Màu lan can"
            value={draft.balcony.colour}
            colours={vocab.data.colours}
            onChange={(v) => set((b) => (b.balcony.colour = v))}
          />
          {/* Chiều cao lan can là số DUY NHẤT của nhóm Lan can mà thước chấm đo (tiêu chí R1), và
                nó do chương trình đặt chứ không do mô hình chọn — nên điền ở đây là cách duy nhất
                đổi nó cho một hồ sơ. Mặc định 110 cm của quy ước cấu tạo đang lệch 80–90 cm đo được
                trên hồ sơ thật (chờ Haan quyết, Q-48). */}
          <NumberField
            label="Chiều cao lan can (cm)"
            value={draft.balcony.h_cm ?? null}
            fallback={vocab.data.defaults.railingHCm}
            onChange={(v) => set((b) => (b.balcony.h_cm = v))}
          />
        </Group>

        {plan?.frontYard === false ? (
          <p className="px-1 text-fg-subtle">
            Nhà sát ranh mặt tiền, không có sân trước — không có cổng và tường rào trên mặt đứng.
          </p>
        ) : (
          <Group title="Cổng và tường rào">
            <Select
              label="Có làm cổng"
              value={draft.gate.wanted === null ? null : draft.gate.wanted ? 'co' : 'khong'}
              options={[
                { code: 'co', label: 'Có cổng' },
                { code: 'khong', label: 'Không làm cổng' },
              ]}
              onChange={(v) => set((b) => (b.gate.wanted = v === null ? null : v === 'co'))}
            />
            {draft.gate.wanted !== false && (
              <>
                <Select
                  label="Kiểu cổng"
                  value={draft.gate.type}
                  options={vocab.data.gateTypes}
                  onChange={(v) => set((b) => (b.gate.type = v as AiFacadeBrief['gate']['type']))}
                />
                <Select
                  label="Vật liệu cổng"
                  value={draft.gate.material}
                  options={vocab.data.materials}
                  onChange={(v) => set((b) => (b.gate.material = v))}
                />
                <ColourSelect
                  label="Màu cổng"
                  value={draft.gate.colour}
                  colours={vocab.data.colours}
                  onChange={(v) => set((b) => (b.gate.colour = v))}
                />
                <NumberField
                  label="Cổng cao (cm)"
                  value={draft.gate.h_cm}
                  fallback={null}
                  onChange={(v) => set((b) => (b.gate.h_cm = v))}
                />
              </>
            )}
            <Select
              label="Kiểu tường rào"
              value={draft.fence.type}
              options={vocab.data.fenceTypes}
              onChange={(v) => set((b) => (b.fence.type = v))}
            />
            <Select
              label="Vật liệu tường rào"
              value={draft.fence.material}
              options={vocab.data.materials}
              onChange={(v) => set((b) => (b.fence.material = v))}
            />
            <ColourSelect
              label="Màu tường rào"
              value={draft.fence.colour}
              colours={vocab.data.colours}
              onChange={(v) => set((b) => (b.fence.colour = v))}
            />
            <NumberField
              label="Tường rào cao (cm)"
              value={draft.fence.h_cm}
              fallback={null}
              onChange={(v) => set((b) => (b.fence.h_cm = v))}
            />
          </Group>
        )}

        <Group title="Chi tiết trang trí mong muốn">
          <fieldset className="sm:col-span-2">
            <legend className="text-fg-subtle">
              Chọn những chi tiết phải có. Không chọn gì thì AI đề xuất.
            </legend>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
              {vocab.data.elements.map((element) => (
                <label key={element.code} className="flex min-h-10 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draft.decorations.includes(
                      element.code as AiFacadeBrief['decorations'][number],
                    )}
                    onChange={(event) =>
                      set((b) => {
                        const code = element.code as AiFacadeBrief['decorations'][number];
                        b.decorations = event.target.checked
                          ? [...b.decorations, code]
                          : b.decorations.filter((d) => d !== code);
                      })
                    }
                  />
                  {element.label}
                </label>
              ))}
            </div>
          </fieldset>
        </Group>

        <Group title="Ghi chú" open>
          <label className="block sm:col-span-2">
            <span className="block text-fg-subtle">Yêu cầu khác của kỹ sư</span>
            <textarea
              className="mt-1 min-h-20 w-full rounded border border-border bg-surface p-2"
              maxLength={1000}
              value={draft.notes ?? ''}
              onChange={(event) => set((b) => (b.notes = event.target.value || null))}
            />
            <span className="mt-1 block text-xs text-fg-subtle">
              Nội dung này được gửi cho nhà cung cấp mô hình AI — không ghi tên khách, số điện
              thoại, địa chỉ.
            </span>
          </label>
        </Group>
      </fieldset>

      {!readOnly && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => void controller.save()}
            disabled={controller.saving || !controller.dirty}
          >
            {controller.saving ? 'Đang lưu…' : 'Lưu yêu cầu'}
          </Button>
          <span className="text-fg-subtle">
            Lưu yêu cầu không gọi AI và không tốn tiền. Bấm «Dựng ý tưởng mặt đứng» bên dưới thì
            phiếu được lưu trước rồi mới chạy.
          </span>
        </div>
      )}
      {controller.saveError && (
        <div className="mt-2 text-status-overdue">
          <p>{controller.saveError}</p>
          {controller.saveIssues.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {controller.saveIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Panel>
  );
}

/** Một nhóm mục gập được — `<details>` của trình duyệt, không cần mã mở/đóng. */
function Group({
  title,
  open,
  children,
}: {
  title: string;
  open?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <details open={open} className="rounded-md border border-tk-line p-3">
      <summary className="cursor-pointer font-medium">{title}</summary>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">{children}</div>
    </details>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: readonly FacadeOption[];
  onChange: (value: string | null) => void;
}): React.ReactElement {
  return (
    <label className="block">
      <span className="block text-fg-subtle">{label}</span>
      <select
        className="mt-1 min-h-10 w-full rounded border border-border bg-surface px-2"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value="">{AI_PICKS}</option>
        {options.map((option) => (
          <option key={option.code} value={option.code}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Ô chọn màu: tên màu kèm mã hex trong danh sách, và ô màu + mã hex cạnh bên khi đã chọn. */
function ColourSelect({
  label,
  value,
  colours,
  onChange,
}: {
  label: string;
  value: string | null;
  colours: FacadeVocabularyView['colours'];
  onChange: (value: string | null) => void;
}): React.ReactElement {
  const picked = colours.find((colour) => colour.code === value);
  return (
    <label className="block">
      <span className="block text-fg-subtle">{label}</span>
      <span className="mt-1 flex items-center gap-2">
        <select
          className="min-h-10 w-full rounded border border-border bg-surface px-2"
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value || null)}
        >
          <option value="">{AI_PICKS}</option>
          {colours.map((colour) => (
            <option key={colour.code} value={colour.code}>
              {colour.label} — {colour.hex}
            </option>
          ))}
        </select>
        {picked && (
          <span
            aria-hidden
            className="inline-block size-8 shrink-0 rounded border border-tk-line"
            style={{ backgroundColor: picked.hex }}
          />
        )}
      </span>
    </label>
  );
}

/** Ô số nguyên — `inputMode` thay cho `type=number` (trình duyệt tự sinh chữ tiếng Anh). */
function NumberField({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: number | null;
  /** Giá trị dùng khi để trống — hiện làm chữ gợi ý. */
  fallback: number | null;
  onChange: (value: number | null) => void;
}): React.ReactElement {
  const [text, setText] = useState(value === null ? '' : String(value));
  useEffect(() => setText(value === null ? '' : String(value)), [value]);
  const invalid = text.trim() !== '' && !/^\d+$/.test(text.trim());
  return (
    <label className="block">
      <span className="block text-fg-subtle">{label}</span>
      <Input
        className="mt-1"
        inputMode="numeric"
        value={text}
        placeholder={fallback === null ? AI_PICKS : `${AI_PICKS} (mặc định ${fallback})`}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          const trimmed = next.trim();
          if (trimmed === '') onChange(null);
          else if (/^\d+$/.test(trimmed)) onChange(Number(trimmed));
        }}
      />
      {invalid && <span className="mt-1 block text-status-overdue">Chỉ nhập số nguyên.</span>}
    </label>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div>
      <span className="block text-fg-subtle">{label}</span>
      <span className="mt-1 block">{value}</span>
    </div>
  );
}

function DoorFields({
  door,
  vocab,
  fallbackH,
  width,
  onChange,
}: {
  door: AiFacadeBrief['main_door'];
  vocab: FacadeVocabularyView;
  fallbackH: number | null;
  width: string;
  onChange: (door: AiFacadeBrief['main_door']) => void;
}): React.ReactElement {
  const doorTypes = useMemo(() => vocab.doorTypes, [vocab.doorTypes]);
  return (
    <>
      <Select
        label="Vật liệu"
        value={door.material}
        options={vocab.doorMaterials}
        onChange={(v) => onChange({ ...door, material: v })}
      />
      <ColourSelect
        label="Màu"
        value={door.colour}
        colours={vocab.colours}
        onChange={(v) => onChange({ ...door, colour: v })}
      />
      <Select
        label="Kiểu mở"
        value={door.type}
        options={doorTypes}
        onChange={(v) => onChange({ ...door, type: v })}
      />
      <NumberField
        label="Chiều cao (cm)"
        value={door.h_cm}
        fallback={fallbackH}
        onChange={(v) => onChange({ ...door, h_cm: v })}
      />
      <ReadOnly label="Bề rộng (theo mặt bằng)" value={`${width}. Muốn đổi, sửa ở bước 1.`} />
    </>
  );
}
