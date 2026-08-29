/**
 * Một trường của biểu mẫu Đầu bài, vẽ theo CẤU HÌNH.
 *
 * Nguồn: `doc/design/08-milestones.md` Mốc 2 — "logic hiện/ẩn nằm trong cấu hình JSON chứ
 * không viết cứng trong giao diện".
 *
 * Tệp này biết cách vẽ TỪNG KIỂU điều khiển; nó không biết trường nào thuộc loại hình nào,
 * trường nào bắt buộc, thứ tự ra sao. Tất cả những thứ đó nằm ở
 * `shared/src/design/brief-form.json`. Thêm một câu hỏi cho biệt thự là sửa tệp JSON đó,
 * không sửa tệp này.
 *
 * ⚠️ Không dùng điều khiển gốc nào TỰ SINH CHỮ của trình duyệt (CLAUDE.md 4.1): ô chọn ngày
 * gốc và ô số gốc đều hiện tiếng Anh trên máy đặt ngôn ngữ khác — bảng lịch ra "September",
 * nút tăng giảm và thông báo `step` ra tiếng Anh. Ngày dùng `DateInput`, số dùng ô chữ kèm
 * `inputMode`. Có kiểm thử grep canh trong `web/src/test/design-rules.test.ts`.
 */

import type { BriefFormField } from '@nvg/shared/design';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { cn } from '@/lib/utils';

const SIDES = [
  { key: 'front', label: 'Mặt trước' },
  { key: 'back', label: 'Mặt sau' },
  { key: 'left', label: 'Bên trái' },
  { key: 'right', label: 'Bên phải' },
] as const;

const FAMILY_ROLES = [
  { value: 'ong_ba', label: 'Ông bà' },
  { value: 'vo_chong', label: 'Vợ chồng' },
  { value: 'con', label: 'Con' },
  { value: 'khach', label: 'Khách' },
  { value: 'nguoi_giup_viec', label: 'Người giúp việc' },
] as const;

const FLOOR_PREFS = [
  { value: 'low', label: 'Tầng thấp' },
  { value: 'mid', label: 'Tầng giữa' },
  { value: 'top', label: 'Tầng trên cùng' },
] as const;

/** Nút viên thuốc — vùng bấm tối thiểu 40px cho ngón tay (CGD 6.8). */
function Chip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'min-h-10 rounded-full border px-3',
        active
          ? 'border-brand bg-brand-subtle font-semibold text-brand'
          : 'border-border text-fg-subtle',
      )}
    >
      {label}
    </button>
  );
}

export interface BriefFieldProps {
  field: BriefFormField;
  value: unknown;
  onChange: (value: unknown) => void;
  /** Mã lỗi nhất quán đang chỉ vào trường này — hiện ngay dưới ô. */
  issues?: string[];
}

export function BriefField({ field, value, onChange, issues = [] }: BriefFieldProps) {
  const hint = field.unit ? `${field.hint ?? ''} Đơn vị: ${field.unit}.`.trim() : field.hint;

  return (
    <div id={`brief-${field.path.replace(/\./g, '-')}`} className="scroll-mt-24">
      <Field label={field.label} hint={hint}>
        <BriefControl field={field} value={value} onChange={onChange} />
      </Field>
      {issues.map((message) => (
        <p key={message} className="mt-1 text-status-overdue">
          {message}
        </p>
      ))}
    </div>
  );
}

function BriefControl({ field, value, onChange }: Omit<BriefFieldProps, 'issues'>) {
  switch (field.control) {
    case 'textarea':
      return (
        <textarea
          rows={3}
          value={(value as string) ?? ''}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value.trim() === '' ? undefined : e.target.value)}
          className="w-full rounded border border-border bg-surface p-2"
        />
      );

    case 'text':
      return (
        <Input
          value={(value as string) ?? ''}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value.trim() === '' ? undefined : e.target.value)}
        />
      );

    case 'number':
      return (
        <Input
          // `inputMode` mở bàn phím số trên di động mà KHÔNG kéo theo nút tăng/giảm và
          // thông báo `step` tiếng Anh của ô số gốc.
          inputMode="decimal"
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(e) => onChange(parseNumber(e.target.value))}
        />
      );

    case 'money_range': {
      const range = (value as [number, number] | undefined) ?? undefined;
      const setBound = (index: 0 | 1) => (raw: string) => {
        const next: [number, number] = [range?.[0] ?? 0, range?.[1] ?? 0];
        next[index] = Number(raw || 0);
        onChange(next[0] === 0 && next[1] === 0 ? undefined : next);
      };
      return (
        <div className="flex flex-wrap items-center gap-2">
          <MoneyInput
            aria-label={`${field.label} — từ`}
            value={range ? String(range[0]) : ''}
            onChange={setBound(0)}
          />
          <span className="text-fg-subtle">đến</span>
          <MoneyInput
            aria-label={`${field.label} — đến`}
            value={range ? String(range[1]) : ''}
            onChange={setBound(1)}
          />
        </div>
      );
    }

    case 'choice':
      return (
        <div className="flex flex-wrap gap-2">
          {(field.options ?? []).map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              active={matchesChoice(field.path, value, option.value)}
              // Bấm lại lựa chọn đang chọn để bỏ chọn — không có nút "xoá" riêng cho từng ô.
              onClick={() =>
                onChange(
                  matchesChoice(field.path, value, option.value)
                    ? undefined
                    : toChoiceValue(field.path, option.value),
                )
              }
            />
          ))}
        </div>
      );

    case 'multi': {
      const selected = (value as string[] | undefined) ?? [];
      return (
        <div className="flex flex-wrap gap-2">
          {(field.options ?? []).map((option) => {
            const active = selected.includes(option.value);
            return (
              <Chip
                key={option.value}
                label={option.label}
                active={active}
                onClick={() => {
                  const next = active
                    ? selected.filter((v) => v !== option.value)
                    : [...selected, option.value];
                  onChange(next.length ? next : undefined);
                }}
              />
            );
          })}
        </div>
      );
    }

    case 'tristate':
      return (
        <div className="flex flex-wrap gap-2">
          {(field.options ?? []).map((option) => {
            const asBool = option.value === 'true';
            return (
              <Chip
                key={option.value}
                label={option.label}
                active={value === asBool}
                onClick={() => onChange(value === asBool ? undefined : asBool)}
              />
            );
          })}
        </div>
      );

    case 'sides': {
      const record = (value as Record<string, unknown> | undefined) ?? {};
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {SIDES.map((side) => (
            <label key={side.key} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-fg-subtle">{side.label}</span>
              {field.options ? (
                <select
                  value={(record[side.key] as string) ?? ''}
                  onChange={(e) => onChange(setSide(record, side.key, e.target.value || undefined))}
                  className="min-h-10 w-full rounded border border-border bg-surface px-2"
                >
                  {/* Danh sách đóng nên `<select>` là đúng chỗ: chữ trong đó do mình viết,
                      trình duyệt không tự sinh gì thêm. */}
                  <option value="">Chưa xác định</option>
                  {field.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  inputMode="decimal"
                  aria-label={`${field.label} — ${side.label}`}
                  value={record[side.key] === undefined ? '' : String(record[side.key])}
                  onChange={(e) => onChange(setSide(record, side.key, parseNumber(e.target.value)))}
                />
              )}
            </label>
          ))}
        </div>
      );
    }

    case 'family': {
      const members = (value as FamilyMember[] | undefined) ?? [];
      const update = (index: number, patch: Partial<FamilyMember>) => {
        const next = members.map((m, i) => (i === index ? { ...m, ...patch } : m));
        onChange(next);
      };
      return (
        <div className="space-y-3">
          {members.map((member, index) => (
            <div key={index} className="rounded border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Vai trò"
                  value={member.role}
                  onChange={(e) => update(index, { role: e.target.value })}
                  className="min-h-10 rounded border border-border bg-surface px-2"
                >
                  {FAMILY_ROLES.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
                <Input
                  inputMode="numeric"
                  aria-label="Số người"
                  className="w-20"
                  value={String(member.count ?? 0)}
                  onChange={(e) => update(index, { count: Number(e.target.value || 0) })}
                />
                <select
                  aria-label="Tầng ưu tiên"
                  value={member.floor_pref ?? ''}
                  onChange={(e) => update(index, { floor_pref: e.target.value || null })}
                  className="min-h-10 rounded border border-border bg-surface px-2"
                >
                  <option value="">Không ưu tiên tầng</option>
                  {FLOOR_PREFS.map((pref) => (
                    <option key={pref.value} value={pref.value}>
                      {pref.label}
                    </option>
                  ))}
                </select>
                <Button variant="subtle" onClick={() => onChange(dropAt(members, index))}>
                  Bỏ dòng
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(field.options ?? []).map((option) => {
                  const needs = member.needs ?? [];
                  const active = needs.includes(option.value);
                  return (
                    <Chip
                      key={option.value}
                      label={option.label}
                      active={active}
                      onClick={() =>
                        update(index, {
                          needs: active
                            ? needs.filter((n) => n !== option.value)
                            : [...needs, option.value],
                        })
                      }
                    />
                  );
                })}
              </div>
            </div>
          ))}
          <Button
            variant="secondary"
            onClick={() => onChange([...members, { role: 'vo_chong', count: 1 }])}
          >
            Thêm nhóm thành viên
          </Button>
        </div>
      );
    }
  }
}

interface FamilyMember {
  role: string;
  count: number;
  floor_pref?: string | null;
  needs?: string[];
}

function dropAt<T>(list: T[], index: number): T[] | undefined {
  const next = list.filter((_, i) => i !== index);
  return next.length ? next : undefined;
}

function setSide(
  record: Record<string, unknown>,
  key: string,
  value: unknown,
): Record<string, unknown> | undefined {
  const next = { ...record };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return Object.keys(next).length ? next : undefined;
}

/** Ô chữ rỗng KHÔNG thành `0`: `0` là một câu trả lời, rỗng là chưa trả lời. */
function parseNumber(raw: string): number | undefined {
  const text = raw.replace(',', '.').trim();
  if (text === '') return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Người quyết định cuối là ĐỐI TƯỢNG trong hợp đồng, không phải chuỗi.
 *
 * Lựa chọn "Chưa xác định được" ghi `{ name: null, relationship: null }` — có mặt nhưng
 * rỗng. Đó là cách phân biệt "đã hỏi, khách chưa quyết" với "chưa ai hỏi", điều mà hợp đồng
 * đòi hỏi tường minh ("bắt buộc THU THẬP dù được để trống").
 */
function toChoiceValue(path: string, option: string): unknown {
  if (path !== 'decision_maker') return option;
  return option === 'chua_xac_dinh'
    ? { name: null, relationship: null }
    : { name: null, relationship: option };
}

function matchesChoice(path: string, value: unknown, option: string): boolean {
  if (path !== 'decision_maker') return value === option;
  const dm = value as { relationship?: string | null } | undefined;
  if (dm === undefined) return false;
  return option === 'chua_xac_dinh' ? !dm.relationship : dm.relationship === option;
}
