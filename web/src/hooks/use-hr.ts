/**
 * Truy vấn và thao tác của Module NS — Hành chính và Nhân sự.
 *
 * Nguồn: PRD NS-01 → NS-11, Backend Schema 4.10.
 *
 * Ranh giới giữa hai lớp (CLAUDE.md Mục 3.1) chạy đúng ở đây:
 *  - Đọc danh sách, soạn hồ sơ nhân sự, hợp đồng lao động, giấy tờ, đơn nghỉ, ứng viên →
 *    gọi thẳng Supabase, RLS lo phân quyền.
 *  - Mọi thứ có ĐIỀU KIỆN mà trình duyệt không được phép bỏ qua thì đi qua hàm CSDL: ghi
 *    công (đúng khối, đúng tháng, nghỉ phép phải có đơn), xác nhận và chốt kỳ (đủ ba khối),
 *    điều chỉnh sau chốt (lý do + người phê duyệt), biên bản tài sản (đổi người giữ), nghỉ
 *    việc (sinh checklist theo tài sản đang giữ), tuyển dụng (qua Hộp thư Phê duyệt).
 *
 * ⚠️ LƯƠNG VÀ CĂN CƯỚC KHÔNG nằm trong bất kỳ câu `select` nào ở file này. Chúng bị thu hồi
 * quyền đọc ở tầng CSDL và chỉ ra qua `employee_salary` / `employee_personal_details` — mỗi
 * lượt gọi được ghi vào `sensitive_access_logs` (NEN-07). Đó cũng là lý do KHÔNG dùng
 * `select('*')` trên `employees`: PostgREST sẽ từ chối vì có cột không được cấp quyền.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AssetCondition,
  AssetEventType,
  AttendanceKind,
  CandidateStage,
  ChecklistItemGroup,
  ChecklistKind,
  EmployeeStatus,
  EmploymentContractStatus,
  EmploymentContractType,
  HrDocumentType,
  InsuranceStatus,
  LeaveRequestStatus,
  LeaveType,
  PayrollAdjustmentKind,
  RecruitmentPositionStatus,
  SalaryType,
  TimesheetPeriodStatus,
  WorkBlock,
} from '@nvg/shared';
import { useCompanyScope, withCompanyScope } from '@/lib/company-scope';
import { supabase } from '@/lib/supabase';

/* ========================================================================== *
 * Hồ sơ nhân sự — NS-01
 * ========================================================================== */

export interface EmployeeRecord {
  id: string;
  company_id: string;
  code: string | null;
  full_name: string;
  user_id: string | null;
  block: WorkBlock;
  department: string | null;
  position: string;
  manager_user_id: string | null;
  construction_site_id: string | null;
  status: EmployeeStatus;
  hire_date: string | null;
  probation_end_date: string | null;
  termination_date: string | null;
  phone: string | null;
  email: string | null;
  date_of_birth: string | null;
  address: string | null;
  salary_type: SalaryType;
  notes: string | null;
  created_at: string;
  site: { id: string; code: string | null; name: string } | null;
  manager: { full_name: string } | null;
}

/** Danh sách cột an toàn — KHÔNG có lương, căn cước, sức khỏe, kỷ luật. */
const EMPLOYEE_SELECT =
  'id, company_id, code, full_name, user_id, block, department, position, manager_user_id, ' +
  'construction_site_id, status, hire_date, probation_end_date, termination_date, phone, ' +
  'email, date_of_birth, address, salary_type, notes, created_at, ' +
  'site:construction_sites(id, code, name), ' +
  'manager:users!employees_manager_user_id_users_id_fk(full_name)';

export function useEmployees() {
  const scope = useCompanyScope();

  return useQuery<EmployeeRecord[], Error>({
    queryKey: ['employees', scope.companyId],
    queryFn: async () => {
      const { data, error } = await withCompanyScope(
        supabase.from('employees').select(EMPLOYEE_SELECT),
        scope,
      )
        .is('deleted_at', null)
        .order('full_name');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as EmployeeRecord[];
    },
    enabled: scope.isReady,
  });
}

export function useEmployee(id: string | undefined) {
  return useQuery<EmployeeRecord | null, Error>({
    queryKey: ['employees', 'one', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select(EMPLOYEE_SELECT)
        .eq('id', id!)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as unknown as EmployeeRecord | null;
    },
    enabled: Boolean(id),
  });
}

export interface EmployeeSalary {
  salary_type: SalaryType;
  base_salary: string | number | null;
  allowance: string | number | null;
  insurance_salary: string | number | null;
}

/**
 * Lương của một nhân sự — chỉ gọi khi người dùng CHỦ ĐỘNG bấm xem.
 *
 * `enabled` mặc định tắt là có chủ đích: mỗi lượt gọi ghi một dòng nhật ký truy cập (NEN-07),
 * nên tải sẵn cho cả danh sách sẽ biến nhật ký thành rác và làm mất ý nghĩa của nó.
 */
export function useEmployeeSalary(id: string | undefined, enabled: boolean) {
  return useQuery<EmployeeSalary | null, Error>({
    queryKey: ['employees', 'salary', id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('employee_salary', { p_employee_id: id! });
      if (error) throw new Error(error.message);
      return ((data as EmployeeSalary[])?.[0] ?? null) as EmployeeSalary | null;
    },
    enabled: Boolean(id) && enabled,
    staleTime: 0,
    gcTime: 0,
  });
}

export interface NewEmployeeInput {
  companyId: string;
  fullName: string;
  position: string;
  block: WorkBlock;
  department?: string | null;
  constructionSiteId?: string | null;
  managerUserId?: string | null;
  hireDate?: string | null;
  probationEndDate?: string | null;
  phone?: string | null;
  email?: string | null;
  dateOfBirth?: string | null;
  address?: string | null;
  salaryType?: SalaryType;
  /** Cột nhạy cảm — ghi được, đọc lại phải qua hàm có ghi nhật ký. */
  idNumber?: string | null;
  baseSalary?: string | null;
  allowance?: string | null;
  insuranceSalary?: string | null;
  notes?: string | null;
}

export function useCreateEmployee() {
  const queryClient = useQueryClient();

  return useMutation<string, Error, NewEmployeeInput>({
    mutationFn: async (input) => {
      const { data, error } = await supabase
        .from('employees')
        .insert({
          company_id: input.companyId,
          full_name: input.fullName.trim(),
          position: input.position.trim(),
          block: input.block,
          department: input.department?.trim() || null,
          construction_site_id: input.constructionSiteId || null,
          manager_user_id: input.managerUserId || null,
          hire_date: input.hireDate || null,
          probation_end_date: input.probationEndDate || null,
          phone: input.phone?.trim() || null,
          email: input.email?.trim() || null,
          date_of_birth: input.dateOfBirth || null,
          address: input.address?.trim() || null,
          salary_type: input.salaryType ?? 'thang',
          id_number: input.idNumber?.trim() || null,
          base_salary: input.baseSalary || null,
          allowance: input.allowance || null,
          insurance_salary: input.insuranceSalary || null,
          notes: input.notes?.trim() || null,
        })
        // `select('id')` chứ không phải bản ghi đầy đủ: đọc lại cột nhạy cảm sẽ bị từ chối.
        .select('id')
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
  });
}

export function useUpdateEmployee() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    {
      id: string;
      changes: Partial<{
        full_name: string;
        position: string;
        block: WorkBlock;
        department: string | null;
        construction_site_id: string | null;
        manager_user_id: string | null;
        status: EmployeeStatus;
        hire_date: string | null;
        probation_end_date: string | null;
        phone: string | null;
        email: string | null;
        date_of_birth: string | null;
        address: string | null;
        salary_type: SalaryType;
        id_number: string | null;
        base_salary: string | null;
        allowance: string | null;
        insurance_salary: string | null;
        notes: string | null;
      }>;
    }
  >({
    mutationFn: async ({ id, changes }) => {
      const { error } = await supabase.from('employees').update(changes).eq('id', id).select('id');
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
  });
}

/* ========================================================================== *
 * Hợp đồng lao động và giấy tờ — NS-07, NS-10
 * ========================================================================== */

export interface EmploymentContractRecord {
  id: string;
  employee_id: string;
  code: string | null;
  type: EmploymentContractType;
  status: EmploymentContractStatus;
  start_date: string;
  end_date: string | null;
  signed_date: string | null;
  insurance_status: InsuranceStatus;
  insurance_from_date: string | null;
  insurance_to_date: string | null;
  notes: string | null;
}

export function useEmploymentContracts(employeeId: string | undefined) {
  return useQuery<EmploymentContractRecord[], Error>({
    queryKey: ['employment-contracts', employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employment_contracts')
        .select(
          'id, employee_id, code, type, status, start_date, end_date, signed_date, ' +
            'insurance_status, insurance_from_date, insurance_to_date, notes',
        )
        .eq('employee_id', employeeId!)
        .is('deleted_at', null)
        .order('start_date', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as EmploymentContractRecord[];
    },
    enabled: Boolean(employeeId),
  });
}

export function useCreateEmploymentContract() {
  const queryClient = useQueryClient();

  return useMutation<
    string,
    Error,
    {
      companyId: string;
      employeeId: string;
      type: EmploymentContractType;
      startDate: string;
      endDate?: string | null;
      signedDate?: string | null;
      salaryAmount?: string | null;
      insuranceStatus?: InsuranceStatus;
      insuranceNumber?: string | null;
      notes?: string | null;
    }
  >({
    mutationFn: async (input) => {
      const { data, error } = await supabase
        .from('employment_contracts')
        .insert({
          company_id: input.companyId,
          employee_id: input.employeeId,
          type: input.type,
          status: 'dang_hieu_luc',
          start_date: input.startDate,
          end_date: input.endDate || null,
          signed_date: input.signedDate || null,
          salary_amount: input.salaryAmount || null,
          insurance_status: input.insuranceStatus ?? 'chua_tham_gia',
          insurance_number: input.insuranceNumber?.trim() || null,
          notes: input.notes?.trim() || null,
        })
        .select('id')
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['employment-contracts'] });
    },
  });
}

export interface HrDocumentRecord {
  id: string;
  company_id: string;
  employee_id: string | null;
  labor_worker_id: string | null;
  type: HrDocumentType;
  title: string;
  issued_date: string | null;
  expiry_date: string | null;
  original_location: string | null;
  last_reminded_stage: number | null;
  notes: string | null;
  employee: { id: string; full_name: string; code: string | null } | null;
  worker: { id: string; full_name: string } | null;
}

const HR_DOCUMENT_SELECT =
  'id, company_id, employee_id, labor_worker_id, type, title, issued_date, expiry_date, ' +
  'original_location, last_reminded_stage, notes, ' +
  'employee:employees(id, full_name, code), worker:labor_workers(id, full_name)';

/** Giấy tờ của một người, hoặc toàn bộ giấy tờ của pháp nhân khi không truyền `employeeId`. */
export function useHrDocuments(employeeId?: string) {
  const scope = useCompanyScope();

  return useQuery<HrDocumentRecord[], Error>({
    queryKey: ['hr-documents', scope.companyId, employeeId ?? 'all'],
    queryFn: async () => {
      let query = withCompanyScope(
        supabase.from('hr_documents').select(HR_DOCUMENT_SELECT),
        scope,
      ).is('deleted_at', null);
      if (employeeId) query = query.eq('employee_id', employeeId);

      const { data, error } = await query.order('expiry_date', {
        ascending: true,
        nullsFirst: false,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as HrDocumentRecord[];
    },
    enabled: scope.isReady,
  });
}

export function useCreateHrDocument() {
  const queryClient = useQueryClient();

  return useMutation<
    string,
    Error,
    {
      companyId: string;
      employeeId?: string | null;
      laborWorkerId?: string | null;
      type: HrDocumentType;
      title: string;
      documentNumber?: string | null;
      issuedDate?: string | null;
      expiryDate?: string | null;
      originalLocation?: string | null;
      notes?: string | null;
    }
  >({
    mutationFn: async (input) => {
      const { data, error } = await supabase
        .from('hr_documents')
        .insert({
          company_id: input.companyId,
          employee_id: input.employeeId || null,
          labor_worker_id: input.laborWorkerId || null,
          type: input.type,
          title: input.title.trim(),
          document_number: input.documentNumber?.trim() || null,
          issued_date: input.issuedDate || null,
          expiry_date: input.expiryDate || null,
          original_location: input.originalLocation?.trim() || null,
          notes: input.notes?.trim() || null,
        })
        .select('id')
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['hr-documents'] });
    },
  });
}

/* ========================================================================== *
 * Chấm công ba khối — NS-04, NS-05
 * ========================================================================== */

export interface TimesheetPeriodRecord {
  id: string;
  company_id: string;
  year: number;
  month: number;
  source_type: WorkBlock;
  status: TimesheetPeriodStatus;
  confirmed_at: string | null;
  closed_at: string | null;
  notes: string | null;
  confirmer: { full_name: string } | null;
}

export function useTimesheetPeriods(year: number, month: number) {
  const scope = useCompanyScope();

  return useQuery<TimesheetPeriodRecord[], Error>({
    queryKey: ['timesheet-periods', scope.companyId, year, month],
    queryFn: async () => {
      const { data, error } = await withCompanyScope(
        supabase
          .from('timesheet_periods')
          .select(
            'id, company_id, year, month, source_type, status, confirmed_at, closed_at, notes, ' +
              'confirmer:users!timesheet_periods_confirmed_by_users_id_fk(full_name)',
          ),
        scope,
      )
        .eq('year', year)
        .eq('month', month)
        .order('source_type');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as TimesheetPeriodRecord[];
    },
    enabled: scope.isReady,
  });
}

export interface TimesheetEntryRecord {
  id: string;
  employee_id: string;
  work_date: string;
  kind: AttendanceKind;
  hours: string | null;
  overtime_hours: string | null;
  output_quantity: string | null;
  leave_request_id: string | null;
  notes: string | null;
  employee: { id: string; full_name: string; code: string | null } | null;
}

export function useTimesheetEntries(periodId: string | undefined) {
  return useQuery<TimesheetEntryRecord[], Error>({
    queryKey: ['timesheet-entries', periodId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('timesheet_entries')
        .select(
          'id, employee_id, work_date, kind, hours, overtime_hours, output_quantity, ' +
            'leave_request_id, notes, employee:employees(id, full_name, code)',
        )
        .eq('timesheet_period_id', periodId!)
        .order('work_date');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as TimesheetEntryRecord[];
    },
    enabled: Boolean(periodId),
  });
}

export interface TimesheetRecord {
  id: string;
  company_id: string;
  employee_id: string;
  year: number;
  month: number;
  source_type: WorkBlock;
  workdays: string;
  worked_hours: string;
  overtime_hours: string;
  leave_days: number;
  unpaid_absence_days: number;
  holiday_days: number;
  business_trip_days: number;
  output_quantity: string;
  bonus_amount: string;
  penalty_amount: string;
  closed_at: string;
  transferred_at: string | null;
  employee: { id: string; full_name: string; code: string | null } | null;
}

/** Bảng công ĐÃ CHỐT của một kỳ — thứ Kế toán đọc để tính lương (NS-05). */
export function useTimesheets(year: number, month: number, employeeId?: string) {
  const scope = useCompanyScope();

  return useQuery<TimesheetRecord[], Error>({
    queryKey: ['timesheets', scope.companyId, year, month, employeeId ?? 'all'],
    queryFn: async () => {
      let query = withCompanyScope(
        supabase
          .from('timesheets')
          .select(
            'id, company_id, employee_id, year, month, source_type, workdays, worked_hours, ' +
              'overtime_hours, leave_days, unpaid_absence_days, holiday_days, business_trip_days, ' +
              'output_quantity, bonus_amount, penalty_amount, closed_at, transferred_at, ' +
              'employee:employees(id, full_name, code)',
          ),
        scope,
      ).eq('year', year);
      if (employeeId) query = query.eq('employee_id', employeeId);
      else query = query.eq('month', month);

      const { data, error } = await query.order('month', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as TimesheetRecord[];
    },
    enabled: scope.isReady,
  });
}

export interface AttendanceEntryInput {
  employee_id: string;
  work_date: string;
  kind: AttendanceKind;
  hours?: number | string | null;
  overtime_hours?: number | string | null;
  output_quantity?: number | string | null;
  construction_site_id?: string | null;
  notes?: string | null;
}

export function useOpenTimesheetPeriod() {
  const queryClient = useQueryClient();

  return useMutation<
    string,
    Error,
    { companyId: string; year: number; month: number; sourceType: WorkBlock }
  >({
    mutationFn: async (input) => {
      const { data, error } = await supabase.rpc('open_timesheet_period', {
        p_company_id: input.companyId,
        p_year: input.year,
        p_month: input.month,
        p_source_type: input.sourceType,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['timesheet-periods'] });
    },
  });
}

/** Ghi công cả nhóm trong MỘT giao dịch — không có tình trạng nửa tổ đã ghi nửa tổ chưa. */
export function useSaveAttendance() {
  const queryClient = useQueryClient();

  return useMutation<number, Error, { periodId: string; entries: AttendanceEntryInput[] }>({
    mutationFn: async ({ periodId, entries }) => {
      const { data, error } = await supabase.rpc('save_attendance', {
        p_period_id: periodId,
        p_entries: entries,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['timesheet-entries'] });
    },
  });
}

export function useSubmitTimesheetPeriod() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { periodId: string }>({
    mutationFn: async ({ periodId }) => {
      const { error } = await supabase.rpc('submit_timesheet_period', { p_period_id: periodId });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['timesheet-periods'] });
    },
  });
}

export function useConfirmTimesheetPeriod() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { periodId: string }>({
    mutationFn: async ({ periodId }) => {
      const { error } = await supabase.rpc('confirm_timesheet_period', { p_period_id: periodId });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['timesheet-periods'] });
    },
  });
}

export function useConsolidateTimesheets() {
  const queryClient = useQueryClient();

  return useMutation<number, Error, { companyId: string; year: number; month: number }>({
    mutationFn: async ({ companyId, year, month }) => {
      const { data, error } = await supabase.rpc('consolidate_timesheets', {
        p_company_id: companyId,
        p_year: year,
        p_month: month,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['timesheet-periods'] });
      void queryClient.invalidateQueries({ queryKey: ['timesheets'] });
    },
  });
}

export function useAdjustTimesheet() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    { timesheetId: string; field: string; newValue: number; reason: string }
  >({
    mutationFn: async ({ timesheetId, field, newValue, reason }) => {
      const { error } = await supabase.rpc('adjust_timesheet', {
        p_timesheet_id: timesheetId,
        p_field: field,
        p_new_value: newValue,
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['timesheets'] });
    },
  });
}

export function useTransferTimesheets() {
  const queryClient = useQueryClient();

  return useMutation<number, Error, { companyId: string; year: number; month: number }>({
    mutationFn: async ({ companyId, year, month }) => {
      const { data, error } = await supabase.rpc('transfer_timesheets_to_accounting', {
        p_company_id: companyId,
        p_year: year,
        p_month: month,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['timesheets'] });
    },
  });
}

/* ========================================================================== *
 * Nghỉ phép và thưởng – phạt — NS-05
 * ========================================================================== */

export interface LeaveRequestRecord {
  id: string;
  company_id: string;
  employee_id: string;
  code: string | null;
  type: LeaveType;
  status: LeaveRequestStatus;
  from_date: string;
  to_date: string;
  day_count: string;
  reason: string;
  decided_at: string | null;
  reject_reason: string | null;
  created_at: string;
  employee: { id: string; full_name: string; code: string | null } | null;
}

export function useLeaveRequests(employeeId?: string) {
  const scope = useCompanyScope();

  return useQuery<LeaveRequestRecord[], Error>({
    queryKey: ['leave-requests', scope.companyId, employeeId ?? 'all'],
    queryFn: async () => {
      let query = withCompanyScope(
        supabase
          .from('leave_requests')
          .select(
            'id, company_id, employee_id, code, type, status, from_date, to_date, day_count, ' +
              'reason, decided_at, reject_reason, created_at, ' +
              'employee:employees(id, full_name, code)',
          ),
        scope,
      ).is('deleted_at', null);
      if (employeeId) query = query.eq('employee_id', employeeId);

      const { data, error } = await query.order('from_date', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as LeaveRequestRecord[];
    },
    enabled: scope.isReady,
  });
}

export function useCreateLeaveRequest() {
  const queryClient = useQueryClient();

  return useMutation<
    string,
    Error,
    {
      companyId: string;
      employeeId: string;
      type: LeaveType;
      fromDate: string;
      toDate: string;
      dayCount: string;
      reason: string;
      coveringUserId?: string | null;
    }
  >({
    mutationFn: async (input) => {
      const { data, error } = await supabase
        .from('leave_requests')
        .insert({
          company_id: input.companyId,
          employee_id: input.employeeId,
          type: input.type,
          from_date: input.fromDate,
          to_date: input.toDate,
          day_count: input.dayCount,
          reason: input.reason.trim(),
          covering_user_id: input.coveringUserId || null,
        })
        .select('id')
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
    },
  });
}

export function useSubmitLeaveRequest() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { leaveId: string }>({
    mutationFn: async ({ leaveId }) => {
      const { error } = await supabase.rpc('submit_leave_request', { p_leave_id: leaveId });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
  });
}

export function useCancelLeaveRequest() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { leaveId: string; reason: string }>({
    mutationFn: async ({ leaveId, reason }) => {
      const { error } = await supabase.rpc('cancel_leave_request', {
        p_leave_id: leaveId,
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
    },
  });
}

export interface PayrollAdjustmentRecord {
  id: string;
  employee_id: string;
  year: number;
  month: number;
  kind: PayrollAdjustmentKind;
  amount: string;
  reason: string;
  decided_at: string;
  employee: { id: string; full_name: string } | null;
}

export function usePayrollAdjustments(year: number, month: number) {
  const scope = useCompanyScope();

  return useQuery<PayrollAdjustmentRecord[], Error>({
    queryKey: ['payroll-adjustments', scope.companyId, year, month],
    queryFn: async () => {
      const { data, error } = await withCompanyScope(
        supabase
          .from('payroll_adjustments')
          .select(
            'id, employee_id, year, month, kind, amount, reason, decided_at, ' +
              'employee:employees(id, full_name)',
          ),
        scope,
      )
        .eq('year', year)
        .eq('month', month)
        .is('deleted_at', null)
        .order('decided_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as PayrollAdjustmentRecord[];
    },
    enabled: scope.isReady,
  });
}

export function useCreatePayrollAdjustment() {
  const queryClient = useQueryClient();

  return useMutation<
    string,
    Error,
    {
      companyId: string;
      employeeId: string;
      year: number;
      month: number;
      kind: PayrollAdjustmentKind;
      amount: string;
      reason: string;
    }
  >({
    mutationFn: async (input) => {
      const { data, error } = await supabase
        .from('payroll_adjustments')
        .insert({
          company_id: input.companyId,
          employee_id: input.employeeId,
          year: input.year,
          month: input.month,
          kind: input.kind,
          amount: input.amount,
          reason: input.reason.trim(),
        })
        .select('id')
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['payroll-adjustments'] });
    },
  });
}

/* ========================================================================== *
 * Tài sản cấp phát — NS-08
 * ========================================================================== */

export interface AssetRecord {
  id: string;
  company_id: string;
  code: string | null;
  name: string;
  serial_number: string | null;
  category: string | null;
  value: string | null;
  purchase_date: string | null;
  condition: AssetCondition;
  current_holder_id: string | null;
  location: string | null;
  notes: string | null;
  created_at: string;
  holder: { id: string; full_name: string; code: string | null } | null;
}

export function useAssets(holderId?: string) {
  const scope = useCompanyScope();

  return useQuery<AssetRecord[], Error>({
    queryKey: ['assets', scope.companyId, holderId ?? 'all'],
    queryFn: async () => {
      let query = withCompanyScope(
        supabase
          .from('assets')
          .select(
            'id, company_id, code, name, serial_number, category, value, purchase_date, ' +
              'condition, current_holder_id, location, notes, created_at, ' +
              'holder:employees(id, full_name, code)',
          ),
        scope,
      ).is('deleted_at', null);
      if (holderId) query = query.eq('current_holder_id', holderId);

      const { data, error } = await query.order('name');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as AssetRecord[];
    },
    enabled: scope.isReady,
  });
}

export interface AssetEventRecord {
  id: string;
  asset_id: string;
  type: AssetEventType;
  event_date: string;
  condition: AssetCondition | null;
  amount: string | null;
  notes: string | null;
  from_employee: { full_name: string } | null;
  to_employee: { full_name: string } | null;
}

export function useAssetEvents(assetId: string | undefined) {
  return useQuery<AssetEventRecord[], Error>({
    queryKey: ['asset-events', assetId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('asset_events')
        .select(
          'id, asset_id, type, event_date, condition, amount, notes, ' +
            'from_employee:employees!asset_events_from_employee_id_employees_id_fk(full_name), ' +
            'to_employee:employees!asset_events_to_employee_id_employees_id_fk(full_name)',
        )
        .eq('asset_id', assetId!)
        .order('event_date', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as AssetEventRecord[];
    },
    enabled: Boolean(assetId),
  });
}

export function useCreateAsset() {
  const queryClient = useQueryClient();

  return useMutation<
    string,
    Error,
    {
      companyId: string;
      code?: string | null;
      name: string;
      serialNumber?: string | null;
      category?: string | null;
      value?: string | null;
      purchaseDate?: string | null;
      location?: string | null;
      notes?: string | null;
    }
  >({
    mutationFn: async (input) => {
      const { data, error } = await supabase
        .from('assets')
        .insert({
          company_id: input.companyId,
          code: input.code?.trim() || null,
          name: input.name.trim(),
          serial_number: input.serialNumber?.trim() || null,
          category: input.category?.trim() || null,
          value: input.value || null,
          purchase_date: input.purchaseDate || null,
          location: input.location?.trim() || null,
          notes: input.notes?.trim() || null,
        })
        .select('id')
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });
}

/** Cửa DUY NHẤT đổi người giữ và tình trạng tài sản — trigger CSDL chặn đường còn lại. */
export function useRecordAssetEvent() {
  const queryClient = useQueryClient();

  return useMutation<
    string,
    Error,
    {
      assetId: string;
      type: AssetEventType;
      eventDate?: string | null;
      toEmployeeId?: string | null;
      condition?: AssetCondition | null;
      amount?: string | null;
      notes?: string | null;
    }
  >({
    mutationFn: async (input) => {
      const { data, error } = await supabase.rpc('record_asset_event', {
        p_asset_id: input.assetId,
        p_type: input.type,
        p_event_date: input.eventDate ?? null,
        p_to_employee_id: input.toEmployeeId ?? null,
        p_condition: input.condition ?? null,
        p_amount: input.amount ?? null,
        p_notes: input.notes ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
      void queryClient.invalidateQueries({ queryKey: ['asset-events'] });
    },
  });
}

/* ========================================================================== *
 * Tiếp nhận và nghỉ việc — NS-03, NS-11
 * ========================================================================== */

export interface ChecklistItemRecord {
  id: string;
  item_group: ChecklistItemGroup;
  title: string;
  asset_id: string | null;
  done_at: string | null;
  notes: string | null;
  done_by_user: { full_name: string } | null;
}

export interface ChecklistRecord {
  id: string;
  employee_id: string;
  kind: ChecklistKind;
  effective_date: string;
  completed_at: string | null;
  items: ChecklistItemRecord[];
}

export function useChecklists(employeeId: string | undefined) {
  return useQuery<ChecklistRecord[], Error>({
    queryKey: ['hr-checklists', employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hr_checklists')
        .select(
          'id, employee_id, kind, effective_date, completed_at, ' +
            'items:hr_checklist_items(id, item_group, title, asset_id, done_at, notes, ' +
            'done_by_user:users!hr_checklist_items_done_by_users_id_fk(full_name))',
        )
        .eq('employee_id', employeeId!)
        .order('effective_date', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ChecklistRecord[];
    },
    enabled: Boolean(employeeId),
  });
}

export function useStartOnboarding() {
  const queryClient = useQueryClient();

  return useMutation<string, Error, { employeeId: string; effectiveDate?: string | null }>({
    mutationFn: async ({ employeeId, effectiveDate }) => {
      const { data, error } = await supabase.rpc('start_onboarding', {
        p_employee_id: employeeId,
        p_effective_date: effectiveDate ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['hr-checklists'] });
    },
  });
}

/**
 * Ghi nhận nghỉ việc — sinh checklist bàn giao gồm ĐÚNG tài sản người đó đang giữ (NS-11).
 *
 * Hàm CSDL không tự thu hồi tài sản và không tự khóa tài khoản: PRD NS ranh giới đặt quyết
 * định ở người quản lý. Nó dựng danh sách việc, người làm bấm xong từng dòng.
 */
export function useOffboardEmployee() {
  const queryClient = useQueryClient();

  return useMutation<string, Error, { employeeId: string; terminationDate: string }>({
    mutationFn: async ({ employeeId, terminationDate }) => {
      const { data, error } = await supabase.rpc('offboard_employee', {
        p_employee_id: employeeId,
        p_termination_date: terminationDate,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['hr-checklists'] });
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });
}

export function useToggleChecklistItem() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { itemId: string; done: boolean; userId: string | null }>({
    mutationFn: async ({ itemId, done, userId }) => {
      const { error } = await supabase
        .from('hr_checklist_items')
        .update({
          done_at: done ? new Date().toISOString() : null,
          done_by: done ? userId : null,
        })
        .eq('id', itemId)
        .select('id');
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['hr-checklists'] });
    },
  });
}

/* ========================================================================== *
 * Tuyển dụng — NS-02
 * ========================================================================== */

export interface RecruitmentPositionRecord {
  id: string;
  company_id: string;
  code: string | null;
  title: string;
  department: string | null;
  block: WorkBlock;
  status: RecruitmentPositionStatus;
  headcount: number;
  hired_count: number;
  needed_by_date: string | null;
  requirements: string | null;
  created_at: string;
  requester: { full_name: string } | null;
}

export function useRecruitmentPositions() {
  const scope = useCompanyScope();

  return useQuery<RecruitmentPositionRecord[], Error>({
    queryKey: ['recruitment-positions', scope.companyId],
    queryFn: async () => {
      const { data, error } = await withCompanyScope(
        supabase
          .from('recruitment_positions')
          .select(
            'id, company_id, code, title, department, block, status, headcount, hired_count, ' +
              'needed_by_date, requirements, created_at, ' +
              'requester:users!recruitment_positions_requested_by_users_id_fk(full_name)',
          ),
        scope,
      )
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as RecruitmentPositionRecord[];
    },
    enabled: scope.isReady,
  });
}

export interface CandidateRecord {
  id: string;
  recruitment_position_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  stage: CandidateStage;
  applied_date: string | null;
  interview_at: string | null;
  evaluation: string | null;
  reject_reason: string | null;
  employee_id: string | null;
}

export function useCandidates(positionId: string | undefined) {
  return useQuery<CandidateRecord[], Error>({
    queryKey: ['recruitment-candidates', positionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recruitment_candidates')
        .select(
          'id, recruitment_position_id, full_name, phone, email, stage, applied_date, ' +
            'interview_at, evaluation, reject_reason, employee_id',
        )
        .eq('recruitment_position_id', positionId!)
        .is('deleted_at', null)
        .order('created_at');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as CandidateRecord[];
    },
    enabled: Boolean(positionId),
  });
}

export function useCreateRecruitmentPosition() {
  const queryClient = useQueryClient();

  return useMutation<
    string,
    Error,
    {
      companyId: string;
      title: string;
      department?: string | null;
      block: WorkBlock;
      headcount: number;
      neededByDate?: string | null;
      requirements: string;
    }
  >({
    mutationFn: async (input) => {
      const { data, error } = await supabase
        .from('recruitment_positions')
        .insert({
          company_id: input.companyId,
          title: input.title.trim(),
          department: input.department?.trim() || null,
          block: input.block,
          headcount: input.headcount,
          needed_by_date: input.neededByDate || null,
          requirements: input.requirements.trim(),
        })
        .select('id')
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recruitment-positions'] });
    },
  });
}

export function useSubmitRecruitmentApproval() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { positionId: string }>({
    mutationFn: async ({ positionId }) => {
      const { error } = await supabase.rpc('submit_recruitment_approval', {
        p_position_id: positionId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recruitment-positions'] });
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
  });
}

export function useCreateCandidate() {
  const queryClient = useQueryClient();

  return useMutation<
    string,
    Error,
    {
      companyId: string;
      positionId: string;
      fullName: string;
      phone?: string | null;
      email?: string | null;
      appliedDate?: string | null;
    }
  >({
    mutationFn: async (input) => {
      const { data, error } = await supabase
        .from('recruitment_candidates')
        .insert({
          company_id: input.companyId,
          recruitment_position_id: input.positionId,
          full_name: input.fullName.trim(),
          phone: input.phone?.trim() || null,
          email: input.email?.trim() || null,
          applied_date: input.appliedDate || null,
        })
        .select('id')
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recruitment-candidates'] });
    },
  });
}

/**
 * Chuyển ứng viên sang cột Kanban khác — NS-02.
 *
 * ⚠️ Phần mềm KHÔNG chấm điểm và KHÔNG gợi ý chọn ai (PRD NS ranh giới). Người phỏng vấn kéo
 * thẻ và ghi kết luận; hệ thống chỉ lưu lại.
 */
export function useMoveCandidate() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    { candidateId: string; stage: CandidateStage; evaluation?: string; rejectReason?: string }
  >({
    mutationFn: async ({ candidateId, stage, evaluation, rejectReason }) => {
      const { error } = await supabase
        .from('recruitment_candidates')
        .update({
          stage,
          ...(evaluation === undefined ? {} : { evaluation: evaluation.trim() || null }),
          ...(rejectReason === undefined ? {} : { reject_reason: rejectReason.trim() || null }),
        })
        .eq('id', candidateId)
        .select('id');
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recruitment-candidates'] });
    },
  });
}

/** Ứng viên nhận việc → sinh hồ sơ nhân sự và checklist tiếp nhận, không nhập lại dữ liệu. */
export function useHireCandidate() {
  const queryClient = useQueryClient();

  return useMutation<
    string,
    Error,
    {
      candidateId: string;
      hireDate: string;
      position?: string | null;
      probationEndDate?: string | null;
    }
  >({
    mutationFn: async (input) => {
      const { data, error } = await supabase.rpc('hire_candidate', {
        p_candidate_id: input.candidateId,
        p_hire_date: input.hireDate,
        p_position: input.position ?? null,
        p_probation_end_date: input.probationEndDate ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recruitment-candidates'] });
      void queryClient.invalidateQueries({ queryKey: ['recruitment-positions'] });
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
  });
}

/* ========================================================================== *
 * Lao động thời vụ — NS-09
 * ========================================================================== */

export interface LaborWorkerRecord {
  id: string;
  company_id: string;
  subcontractor_id: string | null;
  construction_site_id: string | null;
  full_name: string;
  phone: string | null;
  trade: string | null;
  status: 'dang_lam' | 'thieu_giay_to' | 'da_nghi';
  start_date: string | null;
  end_date: string | null;
  safety_commitment_signed: boolean;
  site: { id: string; name: string } | null;
  team: { id: string; name: string } | null;
}

export function useLaborWorkers(siteId?: string) {
  const scope = useCompanyScope();

  return useQuery<LaborWorkerRecord[], Error>({
    queryKey: ['labor-workers', scope.companyId, siteId ?? 'all'],
    queryFn: async () => {
      let query = withCompanyScope(
        supabase
          .from('labor_workers')
          .select(
            'id, company_id, subcontractor_id, construction_site_id, full_name, phone, trade, ' +
              'status, start_date, end_date, safety_commitment_signed, ' +
              'site:construction_sites(id, name), team:subcontractors(id, name)',
          ),
        scope,
      ).is('deleted_at', null);
      if (siteId) query = query.eq('construction_site_id', siteId);

      const { data, error } = await query.order('full_name');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as LaborWorkerRecord[];
    },
    enabled: scope.isReady,
  });
}

export function useCreateLaborWorker() {
  const queryClient = useQueryClient();

  return useMutation<
    string,
    Error,
    {
      companyId: string;
      constructionSiteId: string;
      subcontractorId?: string | null;
      fullName: string;
      phone?: string | null;
      trade?: string | null;
      startDate?: string | null;
      safetyCommitmentSigned?: boolean;
    }
  >({
    mutationFn: async (input) => {
      const { data, error } = await supabase
        .from('labor_workers')
        .insert({
          company_id: input.companyId,
          construction_site_id: input.constructionSiteId,
          subcontractor_id: input.subcontractorId || null,
          full_name: input.fullName.trim(),
          phone: input.phone?.trim() || null,
          trade: input.trade?.trim() || null,
          start_date: input.startDate || null,
          safety_commitment_signed: input.safetyCommitmentSigned ?? false,
        })
        .select('id')
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['labor-workers'] });
    },
  });
}
