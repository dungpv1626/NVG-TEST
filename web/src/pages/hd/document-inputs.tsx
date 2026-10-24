/**
 * Nội dung riêng của văn bản hợp đồng (0186): mọi chỗ trống của mẫu — dải chấm, lựa chọn trong
 * ngoặc vuông, «☐ Phương án» — nhập ở một chỗ, chia theo Điều, lưu dần theo hợp đồng.
 *
 * Anh Dũng chạy thử 21/10/2026: gói thầu, phạm vi loại trừ, hạng mục, tỷ lệ… vẫn tô vàng —
 * «chưa thành một bộ hoàn chỉnh». Trước đây chỉ ~20 chỗ trống chuẩn điền được; phần còn lại phải
 * điền tay trên bản giấy, và ô điền tay mất khi tải lại trang.
 */

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { TemplateValue } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { FIELD_BOX } from '@/components/ui/field-box';
import { Input } from '@/components/ui/input';
import {
  useContractDocumentInputs,
  useSaveContractDocumentInputs,
  type ContractTemplateRecord,
  type TemplateFreeField,
  type TemplateOptionGroup,
} from '@/hooks/use-contract-templates';
import type { ContractDetailRecord } from '@/hooks/use-contracts';
import { cn } from '@/lib/utils';

export type DocumentInputs = Record<string, string>;

/** Khoá lưu của chỗ trống tự do — gắn mẫu, vì `o_12` của hai mẫu là hai chỗ khác nhau. */
export const freeKey = (templateId: string, key: string) => `${templateId}:${key}`;

const groupOf = (optionKey: string) => optionKey.replace(/_[a-z]$/, '');
const letterOf = (optionKey: string) => optionKey.slice(-1).toUpperCase();

/** Chỗ trống đang có nghĩa: ngoài phương án, hoặc trong phương án đã chọn / nhóm chưa chọn. */
function isVisible(
  field: TemplateFreeField,
  template: ContractTemplateRecord,
  values: DocumentInputs,
) {
  if (!field.option) return true;
  const chosen = values[freeKey(template.id, groupOf(field.option))];
  return !chosen || chosen === letterOf(field.option);
}

/**
 * Đưa người dùng tới ô cần điền: mở các khối `<details>` chứa nó, cuộn tới giữa màn hình, đặt
 * con trỏ. Dùng khi bấm chỗ vàng trong bản xem trước, hoặc một Điều trong khung ô thiếu.
 */
export function focusTemplateField(key: string): boolean {
  const el = document.getElementById(`free-${key}`) ?? document.getElementById(`manual-${key}`);
  if (!el) return false;
  for (let d = el.closest('details'); d; d = d.parentElement?.closest('details') ?? null) {
    d.open = true;
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  (el as HTMLInputElement).focus({ preventScroll: true });
  return true;
}

/** Chỗ trống tự do còn trống theo từng Điều — thứ tự văn bản; khoá đầu tiên để nhảy tới. */
export function missingByArticle(template: ContractTemplateRecord | null, values: DocumentInputs) {
  if (!template) return [];
  const out = new Map<string, { article: string; missing: number; firstKey: string }>();
  const order = [...(template.free_fields ?? [])].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  for (const f of order) {
    if (!isVisible(f, template, values) || values[freeKey(template.id, f.key)]?.trim()) continue;
    const row = out.get(f.article) ?? { article: f.article, missing: 0, firstKey: f.key };
    row.missing++;
    out.set(f.article, row);
  }
  return [...out.values()];
}

/** Chỗ trống tự do đang hiện mà chưa điền — bản xem trước gắn khoá vào chỗ vàng để bấm tới. */
export function emptyFreeKeys(template: ContractTemplateRecord | null, values: DocumentInputs) {
  if (!template) return [];
  return (template.free_fields ?? [])
    .filter((f) => isVisible(f, template, values) && !values[freeKey(template.id, f.key)]?.trim())
    .map((f) => f.key);
}

export function freeFieldStatus(template: ContractTemplateRecord | null, values: DocumentInputs) {
  if (!template) return { total: 0, missing: 0, unchosen: 0, defaults: 0 };
  const visible = (template.free_fields ?? []).filter((f) => isVisible(f, template, values));
  const empty = visible.filter((f) => !values[freeKey(template.id, f.key)]?.trim());
  return {
    total: visible.length,
    missing: empty.length,
    unchosen: (template.options ?? []).filter((g) => !values[freeKey(template.id, g.id)]).length,
    defaults: empty.filter((f) => f.default).length,
  };
}

/**
 * Giá trị chỗ trống tự do cho bộ điền. Phương án chưa chọn → in cả các phương án với ô «☐» (như
 * bản giấy); đã chọn → chỉ phương án đó, ô «☒». Chỗ trống rỗng để bộ điền in dải chấm.
 */
export function templateInputData(
  template: ContractTemplateRecord | null,
  values: DocumentInputs,
): { data: Record<string, TemplateValue>; filledKeys: Set<string> } {
  const data: Record<string, TemplateValue> = {};
  const filledKeys = new Set<string>();
  if (!template) return { data, filledKeys };
  for (const f of template.free_fields ?? []) {
    const v = values[freeKey(template.id, f.key)]?.trim();
    if (v) {
      data[f.key] = v;
      filledKeys.add(f.key);
    }
  }
  for (const g of template.options ?? []) {
    const chosen = values[freeKey(template.id, g.id)];
    for (const o of g.options) {
      const on = chosen === o.letter;
      data[o.key] = chosen ? on : true;
      data[`${o.key}_o`] = on ? '☒' : '☐';
    }
  }
  return { data, filledKeys };
}

/** Giá trị đang điền + lưu dần (0,8 giây sau lần gõ cuối) vào `contract_document_inputs`. */
export function useDocumentInputsState(contract: ContractDetailRecord, editable: boolean) {
  const query = useContractDocumentInputs(contract.id);
  const save = useSaveContractDocumentInputs();
  const [values, setValues] = useState<DocumentInputs>({});
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const loaded = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    if (query.data && !loaded.current) {
      loaded.current = true;
      setValues(query.data);
    }
  }, [query.data]);

  useEffect(() => {
    if (!dirty.current || !editable) return;
    setStatus('saving');
    const t = setTimeout(() => {
      save.mutate(
        { contractId: contract.id, companyId: contract.company_id, values },
        {
          onSuccess: () => setStatus('saved'),
          onError: () => setStatus('error'),
        },
      );
    }, 800);
    return () => clearTimeout(t);
    // `save` đổi danh tính mỗi lần render — chỉ lưu khi giá trị đổi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, editable, contract.id, contract.company_id]);

  function setMany(patch: DocumentInputs) {
    dirty.current = true;
    setValues((v) => ({ ...v, ...patch }));
  }

  return {
    values,
    ready: loaded.current || query.isError,
    status,
    setValue: (key: string, value: string) => setMany({ [key]: value }),
    setMany,
  };
}

interface ArticleBlock {
  article: string;
  groups: TemplateOptionGroup[];
  fields: TemplateFreeField[];
}

function byArticle(template: ContractTemplateRecord): ArticleBlock[] {
  const blocks = new Map<string, ArticleBlock>();
  const get = (article: string) => {
    let b = blocks.get(article);
    if (!b) {
      b = { article, groups: [], fields: [] };
      blocks.set(article, b);
    }
    return b;
  };
  // Thứ tự theo văn bản (`seq` do convert.py ghi); nhóm phương án gắn vào Điều của nó.
  const order = [...(template.free_fields ?? [])].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  // Điều xếp theo chỗ trống đầu tiên của nó; nhóm phương án không có chỗ trống thì thêm sau.
  for (const f of order) get(f.article).fields.push(f);
  for (const g of template.options ?? []) get(g.article).groups.push(g);
  return [...blocks.values()];
}

export function DocInputsSection({
  template,
  values,
  setValue,
  setMany,
  status,
  editable,
}: {
  template: ContractTemplateRecord;
  values: DocumentInputs;
  setValue: (key: string, value: string) => void;
  setMany: (patch: DocumentInputs) => void;
  status: 'idle' | 'saving' | 'saved' | 'error';
  editable: boolean;
}) {
  if (!(template.free_fields?.length || template.options?.length)) return null;
  const st = freeFieldStatus(template, values);
  const blocks = byArticle(template);

  function applyDefaults() {
    const patch: DocumentInputs = {};
    for (const f of template.free_fields) {
      const k = freeKey(template.id, f.key);
      if (f.default && !values[k]?.trim() && isVisible(f, template, values)) patch[k] = f.default;
    }
    setMany(patch);
  }

  return (
    <section
      id="noi-dung-van-ban"
      className="scroll-mt-48 rounded-card bg-surface p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">Nội dung riêng của văn bản</h3>
        <span className="text-xs text-fg-subtle">
          {status === 'saving'
            ? 'Đang lưu…'
            : status === 'saved'
              ? 'Đã lưu'
              : status === 'error'
                ? 'Chưa lưu được — kiểm tra kết nối'
                : ''}
        </span>
      </div>
      <p className="mt-1 text-sm text-fg-subtle">
        Mẫu «{template.title}»: đã điền {st.total - st.missing}/{st.total} chỗ trống
        {st.unchosen > 0 ? ` · ${st.unchosen} nhóm phương án chưa chọn` : ''}. Chỗ để trống in dải
        chấm để điền tay.
      </p>
      {editable && st.defaults > 0 && (
        <Button variant="secondary" size="sm" className="mt-2" onClick={applyDefaults}>
          Điền các mức mặc định của mẫu ({st.defaults})
        </Button>
      )}

      <div className="mt-3 space-y-2">
        {blocks.map((b) => {
          const visible = b.fields.filter((f) => isVisible(f, template, values));
          const missing =
            visible.filter((f) => !values[freeKey(template.id, f.key)]?.trim()).length +
            b.groups.filter((g) => !values[freeKey(template.id, g.id)]).length;
          return (
            <details key={b.article} className="rounded-md border border-border">
              <summary className="flex cursor-pointer items-center gap-2 px-3 py-2">
                <span className="font-medium">{b.article}</span>
                <span
                  className={cn(
                    'ml-auto shrink-0 text-xs',
                    missing ? 'text-status-pending' : 'text-status-completed',
                  )}
                >
                  {missing ? (
                    `còn ${missing}`
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2 className="size-3.5" aria-hidden /> đã đủ
                    </span>
                  )}
                </span>
              </summary>
              <div className="space-y-3 border-t border-border px-3 py-3">
                {b.groups.map((g) => (
                  <OptionGroup
                    key={g.id}
                    group={g}
                    chosen={values[freeKey(template.id, g.id)] ?? ''}
                    onChoose={(letter) => setValue(freeKey(template.id, g.id), letter)}
                    editable={editable}
                  />
                ))}
                {visible.map((f) => (
                  <FreeFieldInput
                    key={f.key}
                    field={f}
                    value={values[freeKey(template.id, f.key)] ?? ''}
                    onChange={(v) => setValue(freeKey(template.id, f.key), v)}
                    editable={editable}
                  />
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}

function OptionGroup({
  group,
  chosen,
  onChoose,
  editable,
}: {
  group: TemplateOptionGroup;
  chosen: string;
  onChoose: (letter: string) => void;
  editable: boolean;
}) {
  return (
    <fieldset className="rounded-sm bg-surface-sunken px-3 py-2">
      <legend className="sr-only">{group.label || 'Chọn phương án'}</legend>
      {group.label && <p className="text-sm text-fg-subtle">{group.label}</p>}
      <div className="mt-1 space-y-1">
        {group.options.map((o) => (
          <label key={o.key} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name={group.id}
              checked={chosen === o.letter}
              disabled={!editable}
              onChange={() => onChoose(o.letter)}
              className="mt-1"
            />
            <span>{o.text}</span>
          </label>
        ))}
        <label className="flex items-start gap-2 text-sm text-fg-subtle">
          <input
            type="radio"
            name={group.id}
            checked={!chosen}
            disabled={!editable}
            onChange={() => onChoose('')}
            className="mt-1"
          />
          <span>Chưa chọn — văn bản in cả các phương án</span>
        </label>
      </div>
    </fieldset>
  );
}

function FreeFieldInput({
  field,
  value,
  onChange,
  editable,
}: {
  field: TemplateFreeField;
  value: string;
  onChange: (v: string) => void;
  editable: boolean;
}) {
  const id = `free-${field.key}`;
  return (
    <div>
      <label htmlFor={id} className="block text-sm">
        {(field.party || field.cell) && (
          <span className="mr-1 font-medium">
            {[field.party, field.cell].filter(Boolean).join(' · ')}
            {field.cell ? '' : ':'}
          </span>
        )}
        <span className="text-fg-subtle">
          {field.cell ? '' : field.before ? `…${field.before}` : ''}
        </span>
        <span className="mx-1 rounded-sm bg-status-pending-bg px-1 font-medium">
          {field.option ? `(phương án ${letterOf(field.option)}) ` : ''}___
        </span>
        <span className="text-fg-subtle">
          {field.cell ? '' : field.after ? `${field.after}…` : ''}
        </span>
      </label>
      {field.choices?.length ? (
        <select
          id={id}
          value={value}
          disabled={!editable}
          onChange={(e) => onChange(e.target.value)}
          className={cn(FIELD_BOX, 'mt-1 w-full', value && 'border-status-progress')}
        >
          <option value="">— Chọn —</option>
          {field.choices.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      ) : (
        <Input
          id={id}
          value={value}
          disabled={!editable}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.default ? `Mặc định của mẫu: ${field.default}` : ''}
          className={cn('mt-1', value.trim() && 'border-status-progress')}
        />
      )}
    </div>
  );
}
