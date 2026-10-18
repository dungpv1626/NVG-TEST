/**
 * Xem báo cáo khảo sát NGAY TRONG Hộp thư Phê duyệt (khối nền K2 — Đợt 1).
 *
 * Ban Giám đốc duyệt khi đọc được đủ sáu ô báo cáo và nghe lại được đoạn ghi âm, không phải mở
 * hồ sơ cơ hội rồi tìm (AFD 4.6: «đủ thông tin để quyết định mà không rời Hộp thư»). Trả về thì ghi
 * ý kiến ở ô quyết định bên dưới — người khảo sát thấy ngay trên thẻ khảo sát của mình.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  SURVEY_REPORT_FIELDS,
  filledSiteDetails,
  formatDateTime,
  surveySiteForm,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/states';
import { recordingUrl, useSurveyRecordings } from '@/hooks/use-site-surveys';
import { supabase } from '@/lib/supabase';

interface SurveyRow {
  id: string;
  started_at: string | null;
  finished_at: string | null;
  surveyed_at: string | null;
  needs: string | null;
  decision_maker: string | null;
  budget_note: string | null;
  schedule_note: string | null;
  commercial_terms: string | null;
  notes: string | null;
  site_details: Record<string, string> | null;
  surveyor: { full_name: string } | null;
  opportunity: { company: { code: string } | null } | null;
}

export function SurveyReportPreview({ surveyId }: { surveyId: string }) {
  const { data: survey, isLoading } = useQuery<SurveyRow | null>({
    queryKey: ['site_surveys', 'detail', surveyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_surveys')
        .select(
          'id, started_at, finished_at, surveyed_at, needs, decision_maker, budget_note, ' +
            'schedule_note, commercial_terms, notes, site_details, ' +
            'opportunity:opportunities(company:companies(code)), ' +
            'surveyor:users!site_surveys_surveyed_by_users_id_fk(full_name)',
        )
        .eq('id', surveyId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as unknown as SurveyRow | null;
    },
  });
  const { data: recordings } = useSurveyRecordings(surveyId);

  if (isLoading) return <Skeleton className="h-32" />;
  if (!survey) return null;
  const companyCode = survey.opportunity?.company?.code ?? null;
  const siteDetails = filledSiteDetails(companyCode, survey.site_details);

  return (
    <div className="space-y-3">
      <p className="text-xs text-fg-subtle">
        Khảo sát {formatDateTime(survey.started_at ?? survey.surveyed_at)}
        {survey.finished_at && ` → ${formatDateTime(survey.finished_at)}`}
        {survey.surveyor && ` · ${survey.surveyor.full_name}`}
      </p>
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {SURVEY_REPORT_FIELDS.map((f) => (
          <div
            key={f.key}
            className={f.key === 'needs' || f.key === 'notes' ? 'sm:col-span-2' : ''}
          >
            <dt className="text-xs text-fg-subtle">{f.label}</dt>
            <dd className="whitespace-pre-wrap">{survey[f.key] || 'Chưa ghi'}</dd>
          </div>
        ))}
      </dl>
      {siteDetails.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-fg-subtle">
            {surveySiteForm(companyCode)?.title ?? 'Thông tin hiện trường'}
          </p>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {siteDetails.map((d) => (
              <div key={d.key}>
                <dt className="text-xs text-fg-subtle">{d.label}</dt>
                <dd className="whitespace-pre-wrap">{d.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {(recordings ?? []).length > 0 && (
        <div>
          <p className="mb-1 text-xs text-fg-subtle">Ghi âm buổi khảo sát</p>
          <ul className="space-y-2">
            {recordings!.map((r, i) => (
              <RecordingRow
                key={r.id}
                index={i + 1}
                path={r.storage_path}
                seconds={r.duration_seconds}
                transcript={r.transcript}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RecordingRow({
  index,
  path,
  seconds,
  transcript,
}: {
  index: number;
  path: string;
  seconds: number | null;
  transcript: string | null;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-sm border border-border p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">
          Đoạn {index}
          {seconds != null && <span className="font-normal text-fg-subtle"> · {seconds} giây</span>}
        </span>
        {!src && (
          <Button size="sm" variant="subtle" onClick={() => void recordingUrl(path).then(setSrc)}>
            Nghe
          </Button>
        )}
        {transcript && (
          <Button size="sm" variant="subtle" onClick={() => setOpen((v) => !v)}>
            {open ? 'Ẩn chữ' : 'Xem chữ'}
          </Button>
        )}
      </div>
      {src && <audio controls src={src} className="mt-2 w-full" />}
      {open && transcript && (
        <p className="mt-2 whitespace-pre-wrap text-fg-subtle">{transcript}</p>
      )}
    </li>
  );
}
