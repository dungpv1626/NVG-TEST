/**
 * Trang KHÁCH xem «Bộ ý tưởng» ngôi nhà — không cần đăng nhập (B5, migration 0259).
 *
 * «Đi xem nhà theo tầng» (anh Dũng chọn «Cách 1», 31/10/2026): phần «Bên ngoài» (mặt tiền ngày / tối đứng đầu, các góc
 * khác và mặt đứng bên dưới), rồi mỗi tầng một phần — câu tóm tắt tất định từ đầu bài, sơ đồ công năng của tầng ấy
 * (khối màu, mặt đường ở dưới, KHÔNG số đo; khối có ảnh bấm được để mở ảnh phòng) và ảnh các phòng của tầng xếp từ mặt
 * đường vào. Đầu bài không vừa lô thì Worker không gửi sơ đồ — trang chỉ còn câu tóm tắt và ảnh theo tầng.
 *
 * Dữ liệu từ Worker `GET /public/concept/:token`: tiêu đề trung tính (loại nhà, khổ lô, số tầng — không tên khách), danh
 * sách ảnh, cấu trúc từng tầng; byte ảnh qua `/public/concept/:token/image/:key` (Worker kiểm link mỗi lần). Không kích
 * thước, không bản vẽ kỹ thuật, không nút tải về. Câu «Phương án ý tưởng — chưa phải thiết kế» luôn hiện ở đầu trang và
 * trên từng ảnh — là CHỮ của trang, không in vào ảnh (T154). Chặn chuột phải / kéo ảnh chỉ là rào nhẹ: ảnh đã hiện trên
 * màn hình thì người xem vẫn chụp được.
 */

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Image as ImageIcon, Phone, X } from 'lucide-react';
import { formatDate } from '@nvg/shared';
import { BrandLogo } from '@/components/layout/brand-logo';

const BASE = (import.meta.env.VITE_DESIGN_API_URL ?? '').replace(/\/+$/, '');

export const CONCEPT_CAPTION = 'Phương án ý tưởng — chưa phải thiết kế';

/** Tham số «Xem như khách» của trang nội bộ — Worker không tính lượt xem. */
export const CONCEPT_PREVIEW_PARAM = 'xem-truoc';

type Group = 'mat-dung' | 'phoi-canh' | 'phong';

interface ConceptImageInfo {
  key: string;
  group: Group;
  label: string;
  hero?: boolean;
}

export interface TourCell {
  label: string;
  fill: string;
  share: number;
  images: string[];
}

export interface TourFloor {
  level: number;
  summary: string | null;
  diagram: {
    aspect: number;
    rows: Array<{ share: number; passage: number; cells: TourCell[] }>;
  } | null;
  images: string[];
}

export interface ConceptPayload {
  status: 'ok' | 'expired' | 'not_found' | 'error';
  title?: string;
  note?: string | null;
  expires_at?: string;
  sender_name?: string | null;
  sender_phone?: string | null;
  company_name?: string | null;
  images?: ConceptImageInfo[];
  tour?: {
    diagrams: boolean;
    palette: { stroke: string; text: string; passage: string };
    floors: TourFloor[];
    others: string[];
  } | null;
}

const block = (e: { preventDefault: () => void }) => e.preventDefault();

const imageUrl = (token: string, key: string) => `${BASE}/public/concept/${token}/image/${key}`;

function ConceptImage({ token, image }: { token: string; image: { key: string; label: string } }) {
  const [failed, setFailed] = useState(false);
  return (
    <figure id={`anh-${image.key}`} className="overflow-hidden rounded-card bg-surface">
      <div className="relative select-none" onContextMenu={block} onDragStart={block}>
        {failed ? (
          <div className="flex aspect-video items-center justify-center p-4 text-center text-sm text-fg-subtle">
            Chưa hiện được ảnh này — tải lại trang để thử lại.
          </div>
        ) : (
          <img
            src={imageUrl(token, image.key)}
            alt={image.label}
            loading="lazy"
            draggable={false}
            onError={() => setFailed(true)}
            className="pointer-events-none block h-auto w-full"
          />
        )}
        <span className="absolute bottom-2 left-2 rounded bg-shell px-2 py-1 text-xs font-medium text-shell-fg">
          {CONCEPT_CAPTION}
        </span>
      </div>
      <figcaption className="px-3 py-2 text-sm">{image.label}</figcaption>
    </figure>
  );
}

/** Ảnh phòng mở lớn khi bấm khối trên sơ đồ. */
function RoomLightbox({
  token,
  image,
  onClose,
}: {
  token: string;
  image: { key: string; label: string };
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={image.label}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-shell/90 p-4"
      onClick={onClose}
      onContextMenu={block}
    >
      <div
        className="relative max-w-4xl select-none"
        onClick={(e) => e.stopPropagation()}
        onDragStart={block}
      >
        <img
          src={imageUrl(token, image.key)}
          alt={image.label}
          draggable={false}
          className="pointer-events-none block max-h-[75dvh] w-auto max-w-full rounded-card"
        />
        <span className="absolute bottom-2 left-2 rounded bg-shell px-2 py-1 text-xs font-medium text-shell-fg">
          {CONCEPT_CAPTION}
        </span>
      </div>
      <p className="text-center font-medium text-shell-fg">{image.label}</p>
      <button
        type="button"
        onClick={onClose}
        className="inline-flex min-h-10 items-center gap-2 rounded-full bg-surface px-4 font-medium text-fg"
      >
        <X className="size-4" aria-hidden />
        Đóng
      </button>
    </div>
  );
}

/** Sơ đồ công năng một tầng: mặt đường ở dưới, đi lên là đi vào trong. Không số đo — chỉ tỉ lệ tương đối. */
function FloorDiagram({
  floor,
  palette,
  labelOf,
  onOpen,
}: {
  floor: TourFloor;
  palette: { stroke: string; text: string; passage: string };
  labelOf: (key: string) => string;
  onOpen: (key: string) => void;
}) {
  const diagram = floor.diagram!;
  // Lô rất hẹp vẫn đủ chỗ cho chữ — sơ đồ là hình ý tưởng, không phải bản vẽ theo tỉ lệ.
  const aspect = Math.max(0.5, diagram.aspect);
  return (
    <div className="mt-4">
      <div
        className="mx-auto"
        style={{ width: `min(100%, calc(60dvh * ${aspect}))`, aspectRatio: String(aspect) }}
      >
        <div
          className="flex h-full flex-col-reverse overflow-hidden rounded border-2"
          style={{ borderColor: palette.stroke }}
        >
          {diagram.rows.map((row, i) => (
            <div key={i} className="flex min-h-0" style={{ flex: `${row.share} 1 0` }}>
              {row.cells.map((cell, j) => {
                const style = {
                  flex: `${cell.share} 1 0`,
                  background: cell.fill,
                  color: palette.text,
                  borderColor: palette.stroke,
                };
                const cls =
                  'flex min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden border p-1 text-center text-xs leading-tight break-words';
                const first = cell.images[0];
                return first ? (
                  <button
                    key={j}
                    type="button"
                    style={style}
                    className={`${cls} font-semibold underline decoration-dotted underline-offset-2`}
                    aria-label={`Xem ảnh ${labelOf(first)}`}
                    onClick={() => onOpen(first)}
                  >
                    <ImageIcon className="size-3.5 shrink-0" aria-hidden />
                    {cell.label}
                  </button>
                ) : (
                  <div key={j} style={style} className={cls}>
                    {cell.label}
                  </div>
                );
              })}
              {row.passage > 0 && (
                <div
                  className="flex min-w-0 items-center justify-center border border-dashed p-1 text-center text-xs"
                  style={{
                    flex: `${row.passage} 1 0`,
                    background: palette.passage,
                    color: palette.text,
                    borderColor: palette.stroke,
                  }}
                >
                  Lối đi
                </div>
              )}
            </div>
          ))}
        </div>
        <div
          className="mt-1 border-t-4 pt-1 text-center text-sm"
          style={{ borderColor: palette.stroke }}
        >
          Mặt đường
        </div>
      </div>
      {floor.images.length > 0 && (
        <p className="mt-2 text-center text-sm text-fg-subtle">
          Bấm vào phòng có biểu tượng ảnh để xem không gian bên trong.
        </p>
      )}
    </div>
  );
}

/** Các phần của trang theo thứ tự — dùng cho thanh chuyển phần và cho thân trang. */
export function conceptSections(data: ConceptPayload): Array<{ id: string; title: string }> {
  const images = data.images ?? [];
  const out: Array<{ id: string; title: string }> = [];
  if (images.some((i) => i.group !== 'phong')) out.push({ id: 'ben-ngoai', title: 'Bên ngoài' });
  for (const floor of data.tour?.floors ?? []) {
    if (floor.summary || floor.diagram || floor.images.length) {
      out.push({ id: `tang-${floor.level}`, title: `Tầng ${floor.level}` });
    }
  }
  if (data.tour?.others.length) out.push({ id: 'khac', title: 'Không gian khác' });
  if (!data.tour && images.some((i) => i.group === 'phong')) {
    out.push({ id: 'ben-trong', title: 'Bên trong' });
  }
  return out;
}

export function ConceptView({ token, data }: { token: string; data: ConceptPayload | null }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!data) return <p className="text-fg-subtle">Đang mở phương án…</p>;
  if (data.status !== 'ok') {
    return (
      <div className="rounded-card bg-surface p-6 text-center">
        <p className="text-lg font-semibold">
          {data.status === 'expired'
            ? 'Link xem phương án đã hết hạn'
            : data.status === 'error'
              ? 'Chưa mở được phương án'
              : 'Không tìm thấy phương án'}
        </p>
        <p className="mt-2 text-fg-subtle">
          {data.status === 'error'
            ? 'Kiểm tra kết nối mạng rồi tải lại trang.'
            : 'Liên hệ nhân viên Nhà Việt đã gửi link để nhận link mới.'}
        </p>
        {data.sender_phone && (
          <a
            href={`tel:${data.sender_phone}`}
            className="mt-4 inline-flex min-h-10 items-center gap-2 font-medium text-brand"
          >
            <Phone className="size-4" aria-hidden />
            Gọi {data.sender_name ?? 'nhân viên'}: {data.sender_phone}
          </a>
        )}
      </div>
    );
  }
  const images = data.images ?? [];
  const byKey = new Map(images.map((i) => [i.key, i] as const));
  const labelOf = (key: string) => byKey.get(key)?.label ?? 'Nội thất';
  const imagesOf = (keys: readonly string[]) =>
    keys.map((k) => byKey.get(k)).filter((i): i is ConceptImageInfo => Boolean(i));
  const hero = images.filter((i) => i.group === 'phoi-canh' && i.hero);
  const outside = [
    ...images.filter((i) => i.group === 'phoi-canh' && !i.hero),
    ...images.filter((i) => i.group === 'mat-dung'),
  ];
  const tour = data.tour ?? null;
  const opened = open ? byKey.get(open) : undefined;

  return (
    <>
      <h1 className="text-xl font-semibold">{data.title}</h1>
      {data.expires_at && (
        <p className="mt-1 text-sm text-fg-subtle">Link mở tới {formatDate(data.expires_at)}</p>
      )}
      {data.note && <p className="mt-3">{data.note}</p>}
      <p className="mt-3 text-sm text-fg-subtle">
        Đây là phương án ý tưởng để hình dung ngôi nhà. Kích thước, kết cấu, vật liệu và chi phí sẽ
        được kiến trúc sư tính toán ở bước thiết kế.
      </p>
      {images.length === 0 && !tour?.floors.some((f) => f.summary) ? (
        <p className="mt-6 text-fg-subtle">Phương án chưa có ảnh nào để xem.</p>
      ) : (
        <>
          {(hero.length > 0 || outside.length > 0) && (
            <section id="ben-ngoai" className="mt-6 scroll-mt-40">
              <h2 className="mb-3 text-lg font-semibold">Bên ngoài</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {hero.map((image) => (
                  <ConceptImage key={image.key} token={token} image={image} />
                ))}
              </div>
              {outside.length > 0 && (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {outside.map((image) => (
                    <ConceptImage key={image.key} token={token} image={image} />
                  ))}
                </div>
              )}
            </section>
          )}
          {tour ? (
            <>
              {tour.floors.map((floor) => {
                if (!floor.summary && !floor.diagram && !floor.images.length) return null;
                const rooms = imagesOf(floor.images);
                return (
                  <section
                    key={floor.level}
                    id={`tang-${floor.level}`}
                    className="mt-8 scroll-mt-40"
                  >
                    <h2 className="text-lg font-semibold">Tầng {floor.level}</h2>
                    {floor.summary && <p className="mt-1">{floor.summary}</p>}
                    {floor.diagram && (
                      <FloorDiagram
                        floor={floor}
                        palette={tour.palette}
                        labelOf={labelOf}
                        onOpen={setOpen}
                      />
                    )}
                    {rooms.length > 0 && (
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        {rooms.map((image) => (
                          <ConceptImage key={image.key} token={token} image={image} />
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
              {tour.others.length > 0 && (
                <section id="khac" className="mt-8 scroll-mt-40">
                  <h2 className="mb-3 text-lg font-semibold">Không gian khác</h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {imagesOf(tour.others).map((image) => (
                      <ConceptImage key={image.key} token={token} image={image} />
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : (
            images.some((i) => i.group === 'phong') && (
              <section id="ben-trong" className="mt-8 scroll-mt-40">
                <h2 className="mb-3 text-lg font-semibold">Bên trong</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {images
                    .filter((i) => i.group === 'phong')
                    .map((image) => (
                      <ConceptImage key={image.key} token={token} image={image} />
                    ))}
                </div>
              </section>
            )
          )}
        </>
      )}
      {data.sender_phone && (
        <a
          href={`tel:${data.sender_phone}`}
          className="mt-8 inline-flex min-h-10 items-center gap-2 font-medium text-brand"
        >
          <Phone className="size-4" aria-hidden />
          Trao đổi thêm với {data.sender_name ?? 'nhân viên'}: {data.sender_phone}
        </a>
      )}
      {opened && <RoomLightbox token={token} image={opened} onClose={() => setOpen(null)} />}
    </>
  );
}

export function PublicConceptPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [params] = useSearchParams();
  const preview = params.get(CONCEPT_PREVIEW_PARAM) === '1';
  const [data, setData] = useState<ConceptPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`${BASE}/public/concept/${token}${preview ? `?${CONCEPT_PREVIEW_PARAM}=1` : ''}`)
      .then((r) => r.json() as Promise<ConceptPayload>)
      .catch(() => ({ status: 'error' }) as ConceptPayload)
      .then((d) => {
        if (!cancelled) setData(d);
      });
    return () => {
      cancelled = true;
    };
  }, [token, preview]);

  const sections = data?.status === 'ok' ? conceptSections(data) : [];

  return (
    <div className="min-h-[100dvh] bg-surface-sunken" onContextMenu={block}>
      <header className="sticky top-0 z-10 border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <BrandLogo variant="compact" className="w-28" />
          {data?.company_name && (
            <span className="text-sm text-fg-subtle">{data.company_name}</span>
          )}
        </div>
        <p className="bg-brand-accent px-4 py-1.5 text-center text-sm font-medium text-fg">
          {CONCEPT_CAPTION}
        </p>
        {sections.length > 1 && (
          <nav aria-label="Các phần của phương án" className="mx-auto max-w-5xl">
            <ul className="flex gap-2 overflow-x-auto px-4 py-2">
              {sections.map((s) => (
                <li key={s.id} className="shrink-0">
                  <a
                    href={`#${s.id}`}
                    className="inline-flex min-h-10 items-center rounded-full border border-border px-4 text-sm font-medium"
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <ConceptView token={token} data={data} />
      </main>
    </div>
  );
}
