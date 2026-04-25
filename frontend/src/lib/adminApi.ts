// Admin API Functions
// 관리자 전용 API 호출 함수들

import { API_BASE_URL } from '@/lib/apiBase';
import { buildClientAuthHeaders } from '@/utils/authToken';

function getAuthHeaders(): Record<string, string> {
    if (typeof window === 'undefined') return {};
    return buildClientAuthHeaders();
}

async function adminFetch(url: string, init: RequestInit = {}): Promise<Response> {
    try {
        return await fetch(url, {
            ...init,
            credentials: 'include',
        });
    } catch (err) {
        throw new Error(err instanceof Error ? err.message : '네트워크 오류가 발생했습니다');
    }
}

// =============================================================================
// Types
// =============================================================================

export interface AdminCheckResponse {
    is_admin: boolean;
}

export interface DashboardStats {
    total_users: number;
    today_users: number;
    total_readings: number;
    today_readings: number;
    total_revenue: number;
    pending_feedbacks: number;
    failed_payments: number;
}

export interface RefundInfo {
    user_id: string;
    amount: number;
    reason: string;
    created_at: string;
    admin_id?: string;
}

export interface DashboardResponse {
    stats: DashboardStats;
    recent_refunds: RefundInfo[];
}

export interface ConfigItem {
    key: string;
    value: string;
    description: string;
    updated_at: string;
}

export interface ConfigUpdateResponse {
    status: string;
    key: string;
    value: string;
}

export interface AdminUser {
    id: string;
    created_at: string;
    provider: string;
    name?: string;
    email?: string;
    status?: 'active' | 'banned';
    balance: number;
    is_admin: boolean;
}

export interface UserListResponse {
    users: AdminUser[];
    total: number;
    page: number;
    limit: number;
}

export interface AuditLog {
    id: string;
    admin_id: string;
    action: string;
    target_type?: string | null;
    target_id?: string | null;
    reason?: string | null;
    before_data?: unknown;
    after_data?: unknown;
    metadata?: unknown;
    created_at: string;
}

export interface AuditLogsResponse {
    logs: AuditLog[];
    total: number;
    page: number;
    limit: number;
}

export interface WalletInfo {
    balance: number;
    total_charged: number;
    total_spent: number;
}

export interface Transaction {
    id: string;
    type: string;
    amount: number;
    description: string;
    created_at: string;
}

export interface ReadingInfo {
    id: string;
    birth_date: string;
    created_at: string;
    model_used?: string;
}

export interface UserDetailResponse {
    user: AdminUser;
    wallet: WalletInfo;
    transactions: Transaction[];
    readings: ReadingInfo[];
}

export interface BalanceAdjustResponse {
    status: string;
    previous_balance: number;
    new_balance: number;
    adjustment: number;
}

export interface UserStatusUpdateResponse {
    status: string;
    previous_status: string;
    current_status: string;
}

export interface Feedback {
    id: string;
    user_id: string;
    category: string;
    content: string;
    status: 'pending' | 'reviewed' | 'resolved';
    admin_note?: string;
    response?: string;
    responded_at?: string;
    created_at: string;
    updated_at: string;
}

export interface FeedbackListResponse {
    feedbacks: Feedback[];
    total: number;
    page: number;
    limit: number;
}

export interface FeedbackUpdateResponse {
    status: string;
    feedback_id: string;
}

export interface FailedPayment {
    id: string;
    user_id: string;
    amount: number;
    failure_code: string | null;
    failure_message: string | null;
    created_at: string;
}

export interface PaymentIssuesResponse {
    failed_payments: FailedPayment[];
    total_failed: number;
    recent_refunds: RefundInfo[];
}

export interface RefundResponse {
    status: string;
    user_id: string;
    amount: number;
    new_balance: number;
}

export interface RevenueTrendData {
  date: string;
  revenue: number;
  transactions: number;
}

export interface RevenueTrendResponse {
  trend: RevenueTrendData[];
  total: number;
  prev_total: number;
  change_percent: number;
  days: number;
}

export interface KPIOverview {
  new_users: number;
  new_users_change: number;
  dau: number;
  dau_change: number;
  revenue: number;
  revenue_change: number;
  success_rate: number;
  success_rate_change: number;
  error_count: number;
  error_count_change: number;
  conversion_rate: number;
  unique_payers: number;
  total_signups: number;
  period_days: number;
}

export interface TrackingReportSampleSize {
  tracked_users: number;
  tracked_sessions: number;
  total_events: number;
}

export interface TrackingReportKPI {
  key: string;
  label: string;
  value: string;
  context: string;
  tone: 'neutral' | 'positive' | 'warning' | 'critical';
}

export interface TrackingReportFunnelStep {
  name: string;
  count: number;
  conversion_rate: number;
  note?: string | null;
}

export interface TrackingReportPageItem {
  page: string;
  views: number;
  visitors: number;
}

export interface TrackingReportFeatureItem {
  feature: string;
  usage_count: number;
  unique_users: number;
  insight: string;
}

export interface TrackingReportTabInsight {
  tab_name: string;
  event_count: number;
  avg_dwell_seconds: number;
  bounce_rate: number;
  insight: string;
}

export interface TrackingReportSegmentItem {
  segment: string;
  users: number;
  avg_readings: number;
  avg_paid_amount: number;
  insight: string;
}

export interface TrackingReportFinding {
  title: string;
  summary: string;
  detail: string;
  tone: 'positive' | 'warning' | 'critical';
}

export interface TrackingReportRecommendation {
  priority: 'high' | 'medium' | 'low';
  title: string;
  rationale: string;
  actions: string[];
  expected_impact: string;
}

export interface TrackingReportEvidence {
  title: string;
  source: string;
  url: string;
  takeaway: string;
  supports: string;
}

export interface TrackingReportResponse {
  scope_label: string;
  generated_at: string;
  executive_summary: string;
  executive_subtitle: string;
  sample_size: TrackingReportSampleSize;
  kpis: TrackingReportKPI[];
  journey_funnel: TrackingReportFunnelStep[];
  journey_funnel_note: string;
  page_focus: TrackingReportPageItem[];
  feature_focus: TrackingReportFeatureItem[];
  tab_insights: TrackingReportTabInsight[];
  payer_segments: TrackingReportSegmentItem[];
  risks: TrackingReportFinding[];
  opportunities: TrackingReportFinding[];
  recommendations: TrackingReportRecommendation[];
  evidence: TrackingReportEvidence[];
  limitations: string[];
}

export async function getRevenueTrend(days: number = 7, startDate?: string, endDate?: string): Promise<RevenueTrendResponse> {
  let url = `${API_BASE_URL}/api/admin/revenue/trend?days=${days}`;
  if (startDate && endDate) {
      url += `&start_date=${startDate}&end_date=${endDate}`;
  }
  const response = await adminFetch(url, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error('매출 추이 조회 실패');
  return response.json();
}

export async function getKPIOverview(days: number = 7, startDate?: string, endDate?: string): Promise<KPIOverview> {
  let url = `${API_BASE_URL}/api/admin/kpi/overview?days=${days}`;
  if (startDate && endDate) {
      url += `&start_date=${startDate}&end_date=${endDate}`;
  }
  const response = await adminFetch(url, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error('KPI 조회 실패');
  return response.json();
}

export async function getTrackingReport(): Promise<TrackingReportResponse> {
  const response = await adminFetch(`${API_BASE_URL}/api/admin/analytics/tracking-report`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: '알 수 없는 오류' }));
    throw new Error(error.detail || '추적 리포트 조회 실패');
  }

  return response.json();
}

export async function triggerAggregation(): Promise<{ status: string; date: string }> {
  const response = await adminFetch(`${API_BASE_URL}/api/admin/analytics/aggregate`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error('집계 실행 실패');
  return response.json();
}

// =============================================================================
// API Functions
// =============================================================================

/**
 * 관리자 권한 확인
 */
export async function checkAdminStatus(): Promise<AdminCheckResponse> {
    const response = await adminFetch(`${API_BASE_URL}/api/admin/check`, {
        headers: getAuthHeaders(),
    });

    if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
            return { is_admin: false };
        }
        throw new Error('관리자 확인 실패');
    }

    return response.json();
}

export async function getDashboard(): Promise<DashboardResponse> {
    const response = await adminFetch(`${API_BASE_URL}/api/admin/dashboard`, {
        headers: getAuthHeaders(),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '알 수 없는 오류' }));
        throw new Error(error.detail || '대시보드 조회 실패');
    }

    return response.json();
}

export interface AnalysisStats {
    [feature: string]: {
        started: number;
        completed: number;
        failed: number;
        success_rate: number;
        unique_users: number;
    };
}

export interface KPIData {
  new_users: number;
  dau: number;
  daily_revenue: number;
  ai_success_rate: number;
  error_count: number;
  conversion_rate: number;
  new_users_prev: number;
  dau_prev: number;
  daily_revenue_prev: number;
  ai_success_rate_prev: number;
  error_count_prev: number;
  conversion_rate_prev: number;
}

export interface FunnelStep {
  name: string;
  count: number;
  conversion_rate: number;
}

export interface FunnelResponse {
  steps: FunnelStep[];
  days: number;
}

export interface CohortData {
  label: string;
  size: number;
  retention: number[];
}

export interface CohortResponse {
  cohorts: CohortData[];
  weeks: number;
}

export interface SegmentData {
  name: string;
  count: number;
  total_charged: number;
  avg_charged: number;
}

export interface SegmentResponse {
  segments: SegmentData[];
}

export interface LLMModelStat {
  provider: string;
  model: string;
  call_count: number;
  success_count: number;
  failure_count: number;
  avg_tokens: number;
  success_rate: number;
}

export interface LLMDailyTrend {
  date: string;
  call_count: number;
  success_count: number;
  failure_count: number;
  avg_tokens: number;
}

export interface LLMStatsResponse {
  days: number;
  models: LLMModelStat[];
  daily_trend: LLMDailyTrend[];
}

function normalizeConfigValue(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return '';
    return String(value);
}

export interface AlertConfig {
  error_rate_threshold: number;
  payment_failure_threshold: number;
  refund_spike_threshold: number;
  slack_webhook_url: string;
  slack_webhook_masked?: string;
  slack_webhook_configured?: boolean;
}

export async function getFunnelAnalysis(days: number = 30, startDate?: string, endDate?: string): Promise<FunnelResponse> {
  let url = `${API_BASE_URL}/api/admin/analytics/funnel?days=${days}`;
  if (startDate && endDate) {
      url += `&start_date=${startDate}&end_date=${endDate}`;
  }
  const response = await adminFetch(url, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error('퍼널 분석 조회 실패');
  return response.json();
}

export async function getCohortAnalysis(weeks: number = 8): Promise<CohortResponse> {
  const response = await adminFetch(`${API_BASE_URL}/api/admin/analytics/cohort?weeks=${weeks}`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error('코호트 분석 조회 실패');
  return response.json();
}

export async function getSegmentAnalysis(): Promise<SegmentResponse> {
  const response = await adminFetch(`${API_BASE_URL}/api/admin/analytics/segments`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error('세그먼트 분석 조회 실패');
  return response.json();
}

export async function getLLMStats(days: number = 30): Promise<LLMStatsResponse> {
  const response = await adminFetch(`${API_BASE_URL}/api/admin/analytics/llm-stats?days=${days}`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error('LLM 사용량 조회 실패');
  return response.json();
}

export async function getAlertConfig(): Promise<AlertConfig> {
  const response = await adminFetch(`${API_BASE_URL}/api/admin/config/alerts`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error('알림 설정 조회 실패');
  return response.json();
}

export async function updateAlertConfig(config: Partial<AlertConfig>): Promise<{ status: string }> {
  const response = await adminFetch(`${API_BASE_URL}/api/admin/config/alerts`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(config),
  });
  if (!response.ok) throw new Error('알림 설정 업데이트 실패');
  return response.json();
}

export async function testAlert(): Promise<{ success: boolean }> {
  const response = await adminFetch(`${API_BASE_URL}/api/admin/alerts/test`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error('테스트 알림 발송 실패');
  return response.json();
}

export async function checkAlerts(): Promise<{ alerts_triggered: Array<Record<string, unknown>> }> {
  const response = await adminFetch(`${API_BASE_URL}/api/admin/alerts/check`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error('알림 체크 실패');
  return response.json();
}

export async function sendDailyReport(): Promise<{ success: boolean }> {
  const response = await adminFetch(`${API_BASE_URL}/api/admin/alerts/daily-report`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error('일일 리포트 발송 실패');
  return response.json();
}


export interface TrendData {
    date: string;
    started: number;
    completed: number;
    failed: number;
}

export interface TopUser {
    user_id: string;
    name: string;
    email: string;
    count: number;
}

export async function getAnalysisStats(days: number = 30, startDate?: string, endDate?: string): Promise<AnalysisStats> {
    let url = `${API_BASE_URL}/api/admin/analytics/analysis-stats?days=${days}`;
    if (startDate && endDate) {
        url += `&start_date=${startDate}&end_date=${endDate}`;
    }
    const response = await adminFetch(url, {
        headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error('분석 통계 조회 실패');
    const data = await response.json();
    // Backend returns { stats: [{feature_type, started, completed, failed, success_rate}, ...], days }
    // Convert to { [feature_type]: { started, completed, failed, success_rate, unique_users } }
    const result: AnalysisStats = {};
    for (const item of data.stats || []) {
        result[item.feature_type] = {
            started: item.started,
            completed: item.completed,
            failed: item.failed,
            success_rate: item.success_rate,
            unique_users: 0, // Not tracked at this level
        };
    }
    return result;
}

export async function getAnalysisTrend(featureType: string, days: number = 30, startDate?: string, endDate?: string): Promise<TrendData[]> {
    // If 'total' is requested, fetch all feature types and aggregate
    if (featureType === 'total') {
        const features = ['reading', 'flow_ai_advice', 'compatibility', 'ai_chat'];
        const allTrends = await Promise.all(
            features.map(async (f) => {
                let url = `${API_BASE_URL}/api/admin/analytics/analysis-trend?feature_type=${f}&days=${days}`;
                if (startDate && endDate) {
                    url += `&start_date=${startDate}&end_date=${endDate}`;
                }
                return adminFetch(url, {
                    headers: getAuthHeaders(),
                }).then(r => r.ok ? r.json() : { trend: [] });
            })
        );
        
        // Aggregate by date
        const dateMap: Record<string, TrendData> = {};
        for (const resp of allTrends) {
            for (const item of resp.trend || []) {
                if (!dateMap[item.date]) {
                    dateMap[item.date] = { date: item.date, started: 0, completed: 0, failed: 0 };
                }
                dateMap[item.date].started += item.started;
                dateMap[item.date].completed += item.completed;
                dateMap[item.date].failed += item.failed;
            }
        }
        return Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
    }
    
    let url = `${API_BASE_URL}/api/admin/analytics/analysis-trend?feature_type=${featureType}&days=${days}`;
    if (startDate && endDate) {
        url += `&start_date=${startDate}&end_date=${endDate}`;
    }
    const response = await adminFetch(url, {
        headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error('분석 트렌드 조회 실패');
    const data = await response.json();
    return data.trend || [];
}

export async function getTopAnalysisUsers(days: number = 30, limit: number = 20, featureType?: string, startDate?: string, endDate?: string): Promise<TopUser[]> {
    const params = new URLSearchParams({ days: String(days), limit: String(limit) });
    if (featureType) params.append('feature_type', featureType);
    if (startDate && endDate) {
        params.append('start_date', startDate);
        params.append('end_date', endDate);
    }
    
    const response = await adminFetch(`${API_BASE_URL}/api/admin/analytics/top-users?${params}`, {
        headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Top 사용자 조회 실패');
    const data = await response.json();
    // Backend returns { users: [{user_id, name, email, analysis_count}, ...], days, feature_type }
    return (data.users || []).map((u: { user_id: string; name: string; email: string; analysis_count: number }) => ({
        user_id: u.user_id,
        name: u.name,
        email: u.email,
        count: u.analysis_count,
    }));
}

export async function getRevenueByFeature(days: number = 30, startDate?: string, endDate?: string): Promise<Record<string, number>> {
    let url = `${API_BASE_URL}/api/admin/analytics/revenue-by-feature?days=${days}`;
    if (startDate && endDate) {
        url += `&start_date=${startDate}&end_date=${endDate}`;
    }
    const response = await adminFetch(url, {
        headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error('기능별 매출 조회 실패');
    const data = await response.json();
    // Backend returns { revenue: [{feature_type, total_coins}, ...], days }
    // Convert to { [feature_type]: total_coins }
    const result: Record<string, number> = {};
    for (const item of data.revenue || []) {
        result[item.feature_type] = item.total_coins;
    }
    return result;
}

/**
 * 설정 목록 조회
 */
export async function getConfig(): Promise<ConfigItem[]> {
    const response = await adminFetch(`${API_BASE_URL}/api/admin/config`, {
        headers: getAuthHeaders(),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '알 수 없는 오류' }));
        throw new Error(error.detail || '설정 조회 실패');
    }

    const data = (await response.json()) as ConfigItem[];
    return data.map((item) => ({
        ...item,
        value: normalizeConfigValue(item.value),
    }));
}

/**
 * 설정 업데이트
 */
export async function updateConfig(key: string, value: string): Promise<ConfigUpdateResponse> {
    const response = await adminFetch(`${API_BASE_URL}/api/admin/config/${key}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
        },
        body: JSON.stringify({ value }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '알 수 없는 오류' }));
        throw new Error(error.detail || '설정 업데이트 실패');
    }

    const data = (await response.json()) as ConfigUpdateResponse;
    return {
        ...data,
        value: normalizeConfigValue(data.value),
    };
}

export interface UserFilters {
    search?: string;
    provider?: string;
    adminOnly?: boolean;
}

export async function getUsers(
    page: number = 1,
    limit: number = 20,
    filters?: UserFilters
): Promise<UserListResponse> {
    const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
    });
    
    if (filters?.search) params.append('search', filters.search);
    if (filters?.provider) params.append('provider', filters.provider);
    if (filters?.adminOnly) params.append('admin_only', 'true');
    
    const response = await adminFetch(`${API_BASE_URL}/api/admin/users?${params}`, {
        headers: getAuthHeaders(),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '알 수 없는 오류' }));
        throw new Error(error.detail || '사용자 조회 실패');
    }

    return response.json();
}

export async function getAuditLogs(
    page: number = 1,
    limit: number = 20,
    action?: string,
    startDate?: string,
    endDate?: string
): Promise<AuditLogsResponse> {
    const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
    });

    if (action) params.append('action', action);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);

    const response = await adminFetch(`${API_BASE_URL}/api/admin/audit-logs?${params}`, {
        headers: getAuthHeaders(),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '알 수 없는 오류' }));
        throw new Error(error.detail || '감사 로그 조회 실패');
    }

    return response.json();
}

/**
 * 사용자 상세 조회
 */
export async function getUserDetail(userId: string): Promise<UserDetailResponse> {
    const response = await adminFetch(`${API_BASE_URL}/api/admin/users/${userId}`, {
        headers: getAuthHeaders(),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '알 수 없는 오류' }));
        throw new Error(error.detail || '사용자 상세 조회 실패');
    }

    return response.json();
}

/**
 * 사용자 잔액 조정
 */
export async function adjustUserBalance(
    userId: string,
    amount: number,
    reason: string,
    idempotencyKey: string
): Promise<BalanceAdjustResponse> {
    const response = await adminFetch(`${API_BASE_URL}/api/admin/users/${userId}/balance`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
        },
        body: JSON.stringify({ amount, reason, idempotency_key: idempotencyKey }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '알 수 없는 오류' }));
        throw new Error(error.detail || '잔액 조정 실패');
    }

    return response.json();
}

export async function updateUserStatus(
    userId: string,
    status: string,
    reason: string
): Promise<UserStatusUpdateResponse> {
    const response = await adminFetch(`${API_BASE_URL}/api/admin/users/${userId}/status`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
        },
        body: JSON.stringify({ status, reason }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '알 수 없는 오류' }));
        throw new Error(error.detail || '사용자 상태 변경 실패');
    }

    return response.json();
}

/**
 * 피드백 목록 조회
 */
export async function getFeedbacks(
    page: number = 1,
    limit: number = 20,
    status?: string,
    category?: string
): Promise<FeedbackListResponse> {
    const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
    });
    if (status) params.append('status', status);
    if (category) params.append('category', category);

    const response = await adminFetch(`${API_BASE_URL}/api/admin/feedbacks?${params}`, {
        headers: getAuthHeaders(),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '알 수 없는 오류' }));
        throw new Error(error.detail || '피드백 조회 실패');
    }

    return response.json();
}

/**
 * 피드백 상태 업데이트
 */
export async function updateFeedback(
    feedbackId: string,
    status: string,
    adminNote?: string,
    adminResponse?: string
): Promise<FeedbackUpdateResponse> {
    const body: Record<string, string | undefined> = { status, admin_note: adminNote };
    if (adminResponse !== undefined) {
        body.response = adminResponse;
    }
    const response = await adminFetch(`${API_BASE_URL}/api/admin/feedbacks/${feedbackId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '알 수 없는 오류' }));
        throw new Error(error.detail || '피드백 업데이트 실패');
    }

    return response.json();
}

/**
 * 결제 이슈 조회
 */
export async function getPaymentIssues(): Promise<PaymentIssuesResponse> {
    const response = await adminFetch(`${API_BASE_URL}/api/admin/payments/issues`, {
        headers: getAuthHeaders(),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '알 수 없는 오류' }));
        throw new Error(error.detail || '결제 이슈 조회 실패');
    }

    return response.json();
}

/**
 * 수동 환불 처리
 */
export async function processRefund(
    userId: string,
    amount: number,
    reason: string,
    originalTxId: string,
    idempotencyKey?: string
): Promise<RefundResponse> {
    const response = await adminFetch(`${API_BASE_URL}/api/admin/payments/${userId}/refund`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
        },
        body: JSON.stringify({
            amount,
            reason,
            original_tx_id: originalTxId,
            idempotency_key: idempotencyKey,
        }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '알 수 없는 오류' }));
        throw new Error(error.detail || '환불 처리 실패');
    }

    return response.json();
}

export interface TrendDataPoint {
    date: string;
    count: number;
}

export interface UserTrendByProvider {
    date: string;
    kakao: number;
    naver: number;
    google?: number;
    total: number;
}

export interface ProviderDistribution {
    name: string;
    value: number;
    label: string;
}

export interface PersonaDistribution {
    name: string;
    value: number;
}

export interface DashboardTrendsResponse {
    user_trend: TrendDataPoint[];
    user_trend_by_provider: UserTrendByProvider[];
    reading_trend: TrendDataPoint[];
    provider_distribution: ProviderDistribution[];
    persona_distribution: PersonaDistribution[];
    period: {
        start: string;
        end: string;
        days: number;
    };
}

export async function getDashboardTrends(days: number = 7, startDate?: string, endDate?: string): Promise<DashboardTrendsResponse> {
    let url = `${API_BASE_URL}/api/admin/dashboard/trends?days=${days}`;
    if (startDate && endDate) {
        url += `&start_date=${startDate}&end_date=${endDate}`;
    }
    const response = await adminFetch(url, {
        headers: getAuthHeaders(),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '알 수 없는 오류' }));
        throw new Error(error.detail || '트렌드 데이터 조회 실패');
    }

    return response.json();
}

// =============================================================================
// Analytics Stats Types & Functions
// =============================================================================

export interface ShareStats {
    total_shares: number;
    total_views: number;
    total_conversions: number;
    conversion_rate: number;
    by_type: Record<string, number>;
    by_method: Record<string, number>;
}

export interface FeatureStats {
    period_days: number;
    by_feature: Record<string, { count: number; unique_users: number }>;
}

export interface TabStats {
    period_days: number;
    by_tab: Record<string, number>;
}

export interface ViralFunnel {
    shares_created: number;
    shares_viewed: number;
    signups_from_share: number;
    reshares: number;
    funnel_rates: {
        view_rate: number;
        conversion_rate: number;
        reshare_rate: number;
    };
}

export interface SessionFunnelStep {
    step: 'input_started' | 'result_received' | 'tab_clicked' | 'profile_saved';
    count: number;
    conversion_rate: number;
}

export interface SessionFunnelData {
    days: number;
    steps: SessionFunnelStep[];
}

/**
 * 공유 통계 조회
 */
export async function getShareStats(days: number = 30, startDate?: string, endDate?: string): Promise<ShareStats> {
    let url = `${API_BASE_URL}/api/analytics/stats/shares?days=${days}`;
    if (startDate && endDate) {
        url += `&start_date=${startDate}&end_date=${endDate}`;
    }
    const response = await adminFetch(url, {
        headers: getAuthHeaders(),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '알 수 없는 오류' }));
        throw new Error(error.detail || '공유 통계 조회 실패');
    }

    return response.json();
}

/**
 * 기능 사용 통계 조회
 */
export async function getFeatureStats(days: number = 30, startDate?: string, endDate?: string): Promise<FeatureStats> {
    let url = `${API_BASE_URL}/api/analytics/stats/features?days=${days}`;
    if (startDate && endDate) {
        url += `&start_date=${startDate}&end_date=${endDate}`;
    }
    const response = await adminFetch(url, {
        headers: getAuthHeaders(),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '알 수 없는 오류' }));
        throw new Error(error.detail || '기능 통계 조회 실패');
    }

    return response.json();
}

/**
 * 탭 사용 통계 조회
 */
export async function getTabStats(days: number = 30, startDate?: string, endDate?: string): Promise<TabStats> {
    let url = `${API_BASE_URL}/api/analytics/stats/tabs?days=${days}`;
    if (startDate && endDate) {
        url += `&start_date=${startDate}&end_date=${endDate}`;
    }
    const response = await adminFetch(url, {
        headers: getAuthHeaders(),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '알 수 없는 오류' }));
        throw new Error(error.detail || '탭 통계 조회 실패');
    }

    return response.json();
}

export interface TabEngagementData {
    avg_dwell_ms: number;
    bounce_rate: number;
    event_count: number;
}

export interface TabEngagementResponse {
    by_tab: Record<string, TabEngagementData>;
    days: number;
}

export async function getTabEngagementStats(days: number = 7, startDate?: string, endDate?: string): Promise<TabEngagementResponse> {
    let url = `${API_BASE_URL}/api/analytics/stats/tab-engagement?days=${days}`;
    if (startDate && endDate) {
        url += `&start_date=${startDate}&end_date=${endDate}`;
    }
    const response = await adminFetch(url, {
        headers: getAuthHeaders(),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '알 수 없는 오류' }));
        throw new Error(error.detail || '탭 체류 분석 조회 실패');
    }

    return response.json();
}

/**
 * 바이럴 퍼널 통계 조회
 */
export interface PaymentModeStatus {
    mode: 'test' | 'live';
    has_live_keys: boolean;
}

export interface PaymentModeChangeResult {
    status: 'changed' | 'unchanged';
    previous_mode?: string;
    mode: string;
}

export async function getPaymentMode(): Promise<PaymentModeStatus> {
    const response = await adminFetch(`${API_BASE_URL}/api/admin/payment-mode`, {
        headers: getAuthHeaders(),
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '알 수 없는 오류' }));
        throw new Error(error.detail || '결제 모드 조회 실패');
    }
    return response.json();
}

export async function setPaymentMode(mode: 'test' | 'live'): Promise<PaymentModeChangeResult> {
    const response = await adminFetch(`${API_BASE_URL}/api/admin/payment-mode`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, confirm: true }),
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '알 수 없는 오류' }));
        throw new Error(error.detail || '결제 모드 변경 실패');
    }
    return response.json();
}

export async function getViralFunnel(days: number = 30, startDate?: string, endDate?: string): Promise<ViralFunnel> {
    let url = `${API_BASE_URL}/api/analytics/stats/viral-funnel?days=${days}`;
    if (startDate && endDate) {
        url += `&start_date=${startDate}&end_date=${endDate}`;
    }
    const response = await adminFetch(url, {
        headers: getAuthHeaders(),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '알 수 없는 오류' }));
        throw new Error(error.detail || '바이럴 퍼널 조회 실패');
    }

    return response.json();
}

export async function getSessionFunnel(
    days: number = 7,
    startDate?: string,
    endDate?: string
): Promise<SessionFunnelData> {
    let url = `${API_BASE_URL}/api/analytics/stats/session-funnel?days=${days}`;
    if (startDate && endDate) {
        url += `&start_date=${startDate}&end_date=${endDate}`;
    }

    const response = await adminFetch(url, {
        headers: getAuthHeaders(),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '알 수 없는 오류' }));
        throw new Error(error.detail || '세션 퍼널 조회 실패');
    }

    return response.json();
}

// =============================================================================
// Activity Log Types & Functions
// =============================================================================

export interface ActivitySearchResult {
    id: string;
    name?: string;
    email?: string;
    provider?: string;
    status?: string;
    last_activity?: string;
}

export interface ActivitySearchResponse {
    users: ActivitySearchResult[];
    total: number;
    page: number;
    limit: number;
}

export interface TimelineItem {
    id: string;
    timestamp: string;
    source: 'analytics' | 'api_log' | 'coin' | 'payment';
    event_type: string;
    summary: string;
    details: Record<string, unknown>;
}

export interface TimelineResponse {
    timeline: TimelineItem[];
    total: number;
    page: number;
    limit: number;
    user_info?: {
        id: string;
        status?: string;
        provider?: string;
        name?: string;
        email?: string;
    };
}

export async function searchUserActivity(
    query: string,
    page: number = 1,
    limit: number = 20
): Promise<ActivitySearchResponse> {
    const params = new URLSearchParams({
        query,
        page: String(page),
        limit: String(limit),
    });
    const response = await adminFetch(`${API_BASE_URL}/api/admin/activity/search?${params}`, {
        headers: getAuthHeaders(),
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '알 수 없는 오류' }));
        throw new Error(error.detail || '사용자 활동 검색 실패');
    }
    return response.json();
}

export async function getUserTimeline(
    userId: string,
    page: number = 1,
    limit: number = 50,
    startDate?: string,
    endDate?: string,
    eventTypes?: string
): Promise<TimelineResponse> {
    const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
    });
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (eventTypes) params.append('event_types', eventTypes);
    const response = await adminFetch(`${API_BASE_URL}/api/admin/activity/${userId}?${params}`, {
        headers: getAuthHeaders(),
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '알 수 없는 오류' }));
        throw new Error(error.detail || '사용자 타임라인 조회 실패');
    }
    return response.json();
}
