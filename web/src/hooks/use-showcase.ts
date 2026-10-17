/**
 * Thư viện công trình mẫu + link gửi khách (Đợt 1 — 1H, migration 0179).
 *
 * Đọc / ghi thẳng Supabase, quyền ở RLS: cả công ty xem; Phòng Thiết kế, TGĐ, Ban Giám đốc sửa;
 * xoá qua `request_showcase_deletion` (Giám đốc xoá ngay, Thiết kế chờ Giám đốc đồng ý). Ảnh ở kho
 * riêng tư `showcase`, xem bằng đường dẫn ký ngắn hạn.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ShowcaseKind, ShowcaseMediaKind } from '@nvg/shared';
import { supabase } from '@/lib/supabase';

export const SHOWCASE_BUCKET = 'showcase';

export interface ShowcaseMedia {
  id: string;
  item_id: string;
  storage_path: string;
  kind: ShowcaseMediaKind;
  caption: string | null;
  sort_order: number;
}

export interface ShowcaseItem {
  id: string;
  company_id: string;
  sample_code: string | null;
  title: string;
  kind: ShowcaseKind;
  style: string | null;
  floors: number | null;
  bedrooms: number | null;
  land_area: number | null;
  frontage: number | null;
  depth: number | null;
  building_area: number | null;
  span: number | null;
  location_area: string | null;
  completed_year: number | null;
  description: string | null;
  cover_media_id: string | null;
  deletion_requested_at: string | null;
  deletion_reason: string | null;
  created_at: string;
  updated_at: string;
  company: { code: string; short_name: string } | null;
  media: ShowcaseMedia[];
}

const ITEM_SELECT =
  'id, company_id, sample_code, title, kind, style, floors, bedrooms, land_area, frontage, depth, ' +
  'building_area, span, location_area, completed_year, description, cover_media_id, ' +
  'deletion_requested_at, deletion_reason, created_at, updated_at, ' +
  'company:companies(code, short_name), ' +
  // Hai khoá ngoại nối hai bảng (ảnh → mẫu, ảnh bìa ← mẫu): phải gọi đích danh, không thì
  // PostgREST báo «more than one relationship» và cả trang hỏng.
  'media:showcase_media!showcase_media_item_id_fkey(id, item_id, storage_path, kind, caption, sort_order)';

/** PostgREST trả `numeric` dạng số hoặc chuỗi — quy về số một chỗ. */
function normalize(item: ShowcaseItem): ShowcaseItem {
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    ...item,
    land_area: num(item.land_area),
    frontage: num(item.frontage),
    depth: num(item.depth),
    building_area: num(item.building_area),
    span: num(item.span),
    media: [...(item.media ?? [])].sort((a, b) => a.sort_order - b.sort_order),
  };
}

export function useShowcaseItems() {
  return useQuery<ShowcaseItem[], Error>({
    queryKey: ['showcase'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('showcase_items')
        .select(ITEM_SELECT)
        .order('updated_at', { ascending: false });
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as ShowcaseItem[]).map(normalize);
    },
  });
}

export function useShowcaseItem(id: string | undefined) {
  return useQuery<ShowcaseItem | null, Error>({
    queryKey: ['showcase', 'detail', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('showcase_items')
        .select(ITEM_SELECT)
        .eq('id', id!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? normalize(data as unknown as ShowcaseItem) : null;
    },
    enabled: Boolean(id),
  });
}

/** Đường dẫn ký cho nhiều ảnh một lượt — 1 giờ. */
export function useShowcaseUrls(paths: string[]) {
  const key = [...paths].sort().join('|');
  return useQuery<Record<string, string>, Error>({
    queryKey: ['showcase-urls', key],
    queryFn: async () => {
      if (paths.length === 0) return {};
      const { data, error } = await supabase.storage
        .from(SHOWCASE_BUCKET)
        .createSignedUrls(paths, 3600);
      if (error) throw new Error(error.message);
      const out: Record<string, string> = {};
      for (const row of data ?? []) if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
      return out;
    },
    staleTime: 30 * 60 * 1000,
    enabled: paths.length > 0,
  });
}

export type ShowcaseInput = Omit<
  ShowcaseItem,
  | 'id'
  | 'cover_media_id'
  | 'deletion_requested_at'
  | 'deletion_reason'
  | 'created_at'
  | 'updated_at'
  | 'company'
  | 'media'
>;

export function useSaveShowcaseItem() {
  const queryClient = useQueryClient();
  return useMutation<string, Error, { id?: string; values: ShowcaseInput }>({
    mutationFn: async ({ id, values }) => {
      if (id) {
        const { company_id: _company, ...rest } = values;
        void _company;
        const { error } = await supabase
          .from('showcase_items')
          .update(rest)
          .eq('id', id)
          .select('id')
          .single();
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase
        .from('showcase_items')
        .insert(values)
        .select('id')
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['showcase'] }),
  });
}

export function useUploadShowcaseMedia() {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    { itemId: string; files: File[]; kind: ShowcaseMediaKind; start: number }
  >({
    mutationFn: async ({ itemId, files, kind, start }) => {
      let order = start;
      for (const file of files) {
        const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
        const path = `${itemId}/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage
          .from(SHOWCASE_BUCKET)
          .upload(path, file, { contentType: file.type || 'image/jpeg' });
        if (up.error) throw up.error;
        const { error } = await supabase
          .from('showcase_media')
          .insert({ item_id: itemId, storage_path: path, kind, sort_order: order++ });
        if (error) throw error;
      }
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['showcase'] }),
  });
}

export function useDeleteShowcaseMedia() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, ShowcaseMedia>({
    mutationFn: async (media) => {
      const { error } = await supabase.from('showcase_media').delete().eq('id', media.id);
      if (error) throw error;
      await supabase.storage.from(SHOWCASE_BUCKET).remove([media.storage_path]);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['showcase'] }),
  });
}

export function useSetShowcaseCover() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { itemId: string; mediaId: string }>({
    mutationFn: async ({ itemId, mediaId }) => {
      const { error } = await supabase
        .from('showcase_items')
        .update({ cover_media_id: mediaId })
        .eq('id', itemId)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['showcase'] }),
  });
}

/** Giám đốc: xoá ngay (`deleted`); Thiết kế: gửi đề nghị chờ Giám đốc (`requested`). */
export function useRequestShowcaseDeletion() {
  const queryClient = useQueryClient();
  return useMutation<'deleted' | 'requested', Error, { itemId: string; reason: string }>({
    mutationFn: async ({ itemId, reason }) => {
      const { data, error } = await supabase.rpc('request_showcase_deletion', {
        p_item_id: itemId,
        p_reason: reason,
      });
      if (error) throw error;
      return data as 'deleted' | 'requested';
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['showcase'] }),
  });
}

export interface ShowcaseShare {
  id: string;
  token: string;
  item_ids: string[];
  title: string | null;
  note: string | null;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
  lead_id: string | null;
  opportunity_id: string | null;
  customer_id: string | null;
  creator: { full_name: string } | null;
  views: { viewed_at: string }[];
}

export function useShowcaseShares() {
  return useQuery<ShowcaseShare[], Error>({
    queryKey: ['showcase-shares'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('showcase_shares')
        .select(
          'id, token, item_ids, title, note, expires_at, revoked_at, created_at, lead_id, ' +
            'opportunity_id, customer_id, creator:users!showcase_shares_created_by_fkey(full_name), ' +
            'views:showcase_share_views(viewed_at)',
        )
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ShowcaseShare[];
    },
  });
}

export interface ShareSubject {
  leadId?: string;
  opportunityId?: string;
  customerId?: string;
}

export function useCreateShare() {
  const queryClient = useQueryClient();
  return useMutation<
    { id: string; token: string },
    Error,
    {
      itemIds: string[];
      expiresAt: string;
      title: string | null;
      note: string | null;
      companyId: string | null;
      subject: ShareSubject;
    }
  >({
    mutationFn: async (input) => {
      const { data, error } = await supabase
        .from('showcase_shares')
        .insert({
          item_ids: input.itemIds,
          expires_at: input.expiresAt,
          title: input.title,
          note: input.note,
          company_id: input.companyId,
          lead_id: input.subject.leadId ?? null,
          opportunity_id: input.subject.opportunityId ?? null,
          customer_id: input.subject.customerId ?? null,
        })
        .select('id, token')
        .single();
      if (error) throw error;
      return data as { id: string; token: string };
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['showcase-shares'] }),
  });
}

export function useRevokeShare() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('showcase_shares')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['showcase-shares'] }),
  });
}

/** Địa chỉ trang khách xem — cùng tên miền với ứng dụng, không cần đăng nhập. */
export function shareUrl(token: string): string {
  return `${window.location.origin}/xem-mau/${token}`;
}
