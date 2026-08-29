/**
 * Chọn few-shot vừa sát đề bài vừa KHÁC nhau — tầng 3 của truy hồi.
 *
 * Nguồn: doc/design/06-knowledge-base.md mục 6.3 (Maximal Marginal Relevance).
 *
 * Vì sao không lấy thẳng năm bản ghi giống nhất: rất dễ được năm căn gần trùng nhau, mô hình
 * ngôn ngữ chỉ thấy MỘT cách bố trí, và bốn phương án sinh ra sẽ na ná nhau. Đây là hàm
 * thuần, không chạm mạng và không chạm CSDL — nên nó kiểm thử được bằng số cụ thể.
 */

/** Ứng viên do `kb_retrieve_candidates` trả về, đã bỏ phần payload nặng. */
export interface Candidate {
  id: string;
  project_code: string;
  quality_score: number;
  floors: number | null;
  site_width_m: number | null;
  site_depth_m: number | null;
  family_archetype: string | null;
  style: string | null;
  /** Độ tương đồng vector với đề bài, trong [0,1]. 0 khi bản ghi chưa được chú giải. */
  similarity: number;
  adjacency: AdjacencyEdge[];
  embedding: number[] | null;
}

export interface AdjacencyEdge {
  a: string;
  b: string;
  kind?: string;
}

export interface MmrOptions {
  /**
   * Cân giữa "sát đề bài" và "khác nhau". 1 = chỉ lấy giống nhất (bỏ hẳn tính đa dạng),
   * 0 = chỉ lấy khác nhau (bỏ hẳn tính sát đề bài).
   *
   * Mặc định 0,7: ở kho dưới 50 bộ thì tầng 1–2 đã lọc còn 3–8 kết quả và độ sát vẫn là thứ
   * quan trọng hơn; nghiêng về đa dạng chỉ có lợi khi tầng 1–2 trả về hàng chục kết quả.
   */
  lambda?: number;
  /** Số bản ghi cần chọn. */
  k: number;
  /** Liền kề mong muốn của đề bài, để tính phần độ sát không phụ thuộc vector. */
  wantedAdjacency?: AdjacencyEdge[];
}

/**
 * Độ sát đề bài của một ứng viên.
 *
 * Gộp ba tín hiệu vì không tín hiệu nào một mình đủ ở giai đoạn này: phần lớn bản ghi CHƯA
 * được kiến trúc sư chú giải nên chưa có vector, và nếu chỉ dựa vào vector thì mọi ứng viên
 * đều bằng 0 và thứ tự trở thành ngẫu nhiên.
 */
export function relevance(candidate: Candidate, wanted?: AdjacencyEdge[]): number {
  const vector = candidate.similarity;
  const adjacency = wanted?.length ? adjacencySimilarity(candidate.adjacency, wanted) : 0;
  const quality = candidate.quality_score;

  // Trọng số phân bổ theo mức tin cậy của từng tín hiệu, KHÔNG phải theo mức quan trọng: chất
  // lượng bản ghi luôn đo được nên nó là phần nền; hai tín hiệu kia có thì cộng thêm.
  return 0.45 * vector + 0.25 * adjacency + 0.3 * quality;
}

/**
 * Độ giống nhau giữa hai ứng viên — dùng cho phần "khác nhau" của MMR.
 *
 * Ưu tiên vector khi CẢ HAI đều có. Khi thiếu thì lùi về so hình học và liền kề, chứ không
 * trả 0: trả 0 nghĩa là "hai bản ghi này khác nhau hoàn toàn", và khi cả kho đều chưa chú
 * giải thì MMR sẽ lặng lẽ thoái hoá thành xếp hạng thuần — đúng thứ nó sinh ra để tránh.
 */
export function pairSimilarity(a: Candidate, b: Candidate): number {
  if (a.embedding && b.embedding) return clamp01(cosine(a.embedding, b.embedding));

  let score = 0;
  let weight = 0;

  const add = (value: number, w: number) => {
    score += value * w;
    weight += w;
  };

  if (a.floors !== null && b.floors !== null) add(a.floors === b.floors ? 1 : 0, 0.2);
  if (a.site_width_m !== null && b.site_width_m !== null) {
    // Hai lô lệch nhau 1 m trở lên coi như khác hẳn về bố cục: với nhà phố, bề rộng là biến
    // quyết định gần như mọi thứ còn lại.
    add(Math.max(0, 1 - Math.abs(a.site_width_m - b.site_width_m)), 0.3);
  }
  if (a.family_archetype && b.family_archetype) {
    add(a.family_archetype === b.family_archetype ? 1 : 0, 0.2);
  }
  if (a.style && b.style) add(a.style === b.style ? 1 : 0, 0.1);
  add(adjacencySimilarity(a.adjacency, b.adjacency), 0.3);

  return weight > 0 ? score / weight : 0;
}

/**
 * Jaccard trên tập cặp liền kề, quy về LOẠI phòng.
 *
 * Quy về loại vì `living_1` của công trình này và `living_1` của công trình kia là hai phòng
 * khác nhau — so mã phòng nguyên văn sẽ luôn ra kết quả gần 0 và tín hiệu này thành vô dụng.
 */
export function adjacencySimilarity(a: AdjacencyEdge[], b: AdjacencyEdge[]): number {
  const left = edgeKeys(a);
  const right = edgeKeys(b);
  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const key of left) if (right.has(key)) shared += 1;
  return shared / (left.size + right.size - shared);
}

function edgeKeys(edges: AdjacencyEdge[]): Set<string> {
  const keys = new Set<string>();
  for (const edge of edges ?? []) {
    const a = roomType(edge.a);
    const b = roomType(edge.b);
    if (!a || !b) continue;
    // Cặp không có thứ tự: "bếp cạnh ăn" và "ăn cạnh bếp" là một.
    const [first, second] = a <= b ? [a, b] : [b, a];
    keys.add(`${first}|${second}|${edge.kind ?? 'adjacent'}`);
  }
  return keys;
}

/** `living_1` → `living`. Số đuôi là số thứ tự phòng, không đổi loại phòng. */
function roomType(id: string): string {
  return (id ?? '').replace(/_\d+$/, '');
}

/**
 * Chọn `k` ứng viên theo MMR.
 *
 * Thuật toán: lấy cái sát nhất trước, rồi lần lượt lấy cái tối đa hoá
 * `λ·độ_sát − (1−λ)·độ_giống_cái_đã_chọn_nhất`.
 */
export function selectDiverse(candidates: Candidate[], options: MmrOptions): Candidate[] {
  const lambda = options.lambda ?? 0.7;
  const k = Math.max(0, Math.min(options.k, candidates.length));
  if (k === 0) return [];

  const remaining = [...candidates];
  const chosen: Candidate[] = [];
  const scores = new Map(remaining.map((c) => [c.id, relevance(c, options.wantedAdjacency)]));

  while (chosen.length < k && remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = -Infinity;

    remaining.forEach((candidate, index) => {
      const rel = scores.get(candidate.id) ?? 0;
      const closest = chosen.reduce((max, picked) => {
        return Math.max(max, pairSimilarity(candidate, picked));
      }, 0);
      const score = chosen.length === 0 ? rel : lambda * rel - (1 - lambda) * closest;

      // Hoà điểm thì lấy mã công trình nhỏ hơn: kết quả truy hồi phải LẶP LẠI ĐƯỢC giữa hai
      // lần chạy, nếu không thì cùng một đề bài sẽ sinh ra few-shot khác nhau.
      const better =
        score > bestScore ||
        (score === bestScore && candidate.project_code < remaining[bestIndex]!.project_code);
      if (better) {
        bestScore = score;
        bestIndex = index;
      }
    });

    chosen.push(remaining.splice(bestIndex, 1)[0]!);
  }

  return chosen;
}

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denominator = Math.sqrt(na) * Math.sqrt(nb);
  return denominator > 0 ? dot / denominator : 0;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
