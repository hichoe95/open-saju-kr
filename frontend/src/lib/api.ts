// API 호출 함수들

import {
    BirthInput,
    ReadingRequest,
    ReadingResponse,
    ModelInfo,
    DecisionInput,
    DecisionResponse,
    FlowMonthlyRequest,
    FlowMonthlyResponse,
    FlowDailyRequest,
    FlowDailyResponse,
    FlowDetailRequest,
    FlowDetailResponse,
    FlowAiAdviceRequest,
    FlowAiAdviceResponse,
    CompatibilityRequest,
    CompatibilityJobStartRequest,
    CompatibilityJobStartResponse,
    CompatibilityJobStatusResponse,
    CompatibilityResponse,
    PastTimelineRequest,
    PastTimelineResponse,
    VsBattleJoinRequest,
    VsBattleJoinResponse,
    VsBattleResult,
    QuickCompatibilityRequest,
    QuickCompatibilityResponse,
} from '@/types';
import { API_BASE_URL } from '@/lib/apiBase';
import { AUTH_MODE, buildClientAuthHeaders } from '@/utils/authToken';
const DEFAULT_API_TIMEOUT_MS = 30000;
const READING_API_TIMEOUT_MS = 180000;
const JOB_API_TIMEOUT_MS = 15000;
const DECISION_API_TIMEOUT_MS = 60000;
const FLOW_AI_API_TIMEOUT_MS = 60000;
const DAILY_FORTUNE_API_TIMEOUT_MS = 75000;
const GET_RETRY_LIMIT = 2;
const GET_RETRY_BASE_DELAY_MS = 300;
const PROFILE_READ_TTL_MS = 3000;
const RECEIVED_PROFILE_READ_TTL_MS = 2000;

type MemoizedValue = {
    expiresAt: number;
    data: unknown;
};

const readMemoCache = new Map<string, MemoizedValue>();
const inFlightReads = new Map<string, Promise<unknown>>();
function getAuthHeaders(token?: string): Record<string, string> {
    if (typeof window === 'undefined') return {};
    if (token) {
        return buildClientAuthHeaders(token);
    }
    if (AUTH_MODE === 'cookie') {
        return {};
    }
    return buildClientAuthHeaders(token);
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new Error('분석이 취소되었습니다.'));
            return;
        }
        const timer = setTimeout(resolve, ms);
        const onAbort = () => {
            clearTimeout(timer);
            reject(new Error('분석이 취소되었습니다.'));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
        }, ms + 10);
    });
}

function sanitizeErrorMessage(status: number, detail?: string, fallback = '요청 처리 중 오류가 발생했습니다.'): string {
    const safeDetail = typeof detail === 'string' ? detail.trim() : '';

    const detailMappings: Record<string, string> = {
        'Internal server error': '서버에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.',
        'Request timed out': '요청 시간이 초과되었습니다. 다시 시도해 주세요.',
        'Service unavailable': '서비스를 이용할 수 없습니다. 잠시 후 다시 시도해 주세요.',
    };

    switch (status) {
        case 400:
            return '요청 형식이 올바르지 않습니다.';
        case 401:
            return '로그인이 필요합니다. 다시 로그인해 주세요.';
        case 403:
            return '접근 권한이 없습니다.';
        case 404:
            return '요청한 자원을 찾을 수 없습니다.';
        case 422:
            return safeDetail || '요청 데이터가 올바르지 않습니다.';
        case 429:
            return '요청이 몰려 일시적으로 제한되었습니다. 잠시 후 다시 시도해 주세요.';
        case 500:
            return '현재 서비스에 일시적인 문제가 있습니다. 잠시 후 다시 시도해 주세요.';
        default:
            if (safeDetail) {
                const mapped = detailMappings[safeDetail];
                if (mapped) return mapped;
                if (safeDetail.length <= 120 && !/\r|\n/.test(safeDetail) && !/trace|stack|exception|error|sql/i.test(safeDetail)) {
                    return safeDetail;
                }
            }
            return fallback;
    }
}

function isRetryableStatus(status: number): boolean {
    return status === 408 || status >= 500;
}

function cleanupExpiredReadCache(): void {
    const now = Date.now();
    for (const [key, entry] of readMemoCache.entries()) {
        if (entry.expiresAt <= now) {
            readMemoCache.delete(key);
        }
    }
}

async function withInFlightRead<T>(key: string, fetcher: () => Promise<T>, ttlMs = 0): Promise<T> {
    cleanupExpiredReadCache();

    const cached = readMemoCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
        return Promise.resolve(cached.data as T);
    }

    const existingPromise = inFlightReads.get(key);
    if (existingPromise) {
        return existingPromise as Promise<T>;
    }

    const promise = (async () => {
        const data = await fetcher();
        if (ttlMs > 0) {
            readMemoCache.set(key, {
                data,
                expiresAt: Date.now() + ttlMs,
            });
        }
        return data;
    })();

    inFlightReads.set(key, promise as Promise<unknown>);
    return await promise.finally(() => {
        inFlightReads.delete(key);
    });
}

function invalidateReadCache(prefixes: string[]): void {
    for (const key of Array.from(readMemoCache.keys())) {
        if (prefixes.some((prefix) => key.startsWith(prefix))) {
            readMemoCache.delete(key);
        }
    }
    for (const key of Array.from(inFlightReads.keys())) {
        if (prefixes.some((prefix) => key.startsWith(prefix))) {
            inFlightReads.delete(key);
        }
    }
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = DEFAULT_API_TIMEOUT_MS): Promise<Response> {
    const { signal, cleanup } = combineAbortSignals(init.signal, timeoutMs);
    const resolvedCredentials = init.credentials
        ?? (AUTH_MODE === 'cookie' ? 'include' : undefined);

    try {
        return await fetch(url, {
            ...init,
            ...(resolvedCredentials ? { credentials: resolvedCredentials } : {}),
            signal,
        });
    } finally {
        cleanup();
    }
}

function combineAbortSignals(signal: AbortSignal | null | undefined, timeoutMs = DEFAULT_API_TIMEOUT_MS): { signal: AbortSignal; cleanup: () => void } {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort(new DOMException('요청 시간이 초과되었습니다.', 'TimeoutError'));
    }, timeoutMs);

    if (!signal) {
        return { signal: controller.signal, cleanup: () => clearTimeout(timeoutId) };
    }

    if (signal.aborted) {
        controller.abort(signal.reason);
        clearTimeout(timeoutId);
        return {
            signal: controller.signal,
            cleanup: () => clearTimeout(timeoutId),
        };
    }

    const onAbort = () => {
        controller.abort(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });

    return {
        signal: controller.signal,
        cleanup: () => {
            clearTimeout(timeoutId);
            signal.removeEventListener('abort', onAbort);
        },
    };
}

async function fetchWithRetry(url: string, init: RequestInit = {}, timeoutMs = DEFAULT_API_TIMEOUT_MS): Promise<Response> {
    const method = (init.method || 'GET').toUpperCase();
    const maxRetries = method === 'GET' ? GET_RETRY_LIMIT : 0;

    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        try {
            const response = await fetchWithTimeout(url, init, timeoutMs);

            if (method === 'GET' && !response.ok && isRetryableStatus(response.status) && attempt < maxRetries) {
                lastError = new Error(`요청 처리 실패 (${response.status})`);
                await abortableSleep(GET_RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
                continue;
            }

            return response;
        } catch (error) {
            lastError = error;
            if (
                method === 'GET'
                && attempt < maxRetries
                && error instanceof Error
                && (error.name === 'AbortError' || error.name === 'TimeoutError')
            ) {
                await abortableSleep(GET_RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
                continue;
            }
            throw error;
        }
    }

    if (lastError instanceof Error) {
        throw lastError;
    }
    throw new Error('요청 처리에 실패했습니다.');
}

async function apiFetch(url: string, init: RequestInit = {}, timeoutMs = DEFAULT_API_TIMEOUT_MS): Promise<Response> {
    return fetchWithRetry(url, init, timeoutMs);
}

async function getErrorMessage(response: Response, fallback: string): Promise<string> {
    const payload = await response.json().catch(() => ({ detail: '' }));
    let detail: string | undefined;
    if (typeof payload?.detail === 'string') {
        detail = payload.detail;
    } else if (Array.isArray(payload?.detail) && payload.detail.length > 0) {
        const first = payload.detail[0];
        const field = Array.isArray(first?.loc) ? first.loc[first.loc.length - 1] : '';
        detail = field ? `입력값 오류: ${field} - ${first?.msg ?? ''}` : (first?.msg ?? '');
    }
    return sanitizeErrorMessage(response.status, detail, fallback);
}

async function throwSanitizedApiError(response: Response, fallback: string): Promise<never> {
    const message = await getErrorMessage(response, fallback);
    const error = new Error(message) as Error & { status?: number; detail?: string; retryAfter?: number };
    error.status = response.status;

    if (response.status === 429) {
        const retryAfterValue = response.headers.get('Retry-After');
        const retryAfterSeconds = retryAfterValue ? Number.parseInt(retryAfterValue, 10) : NaN;
        if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
            error.retryAfter = retryAfterSeconds;
            error.message = `요청이 몰려 제한되었습니다. 약 ${retryAfterSeconds}초 후 다시 시도해 주세요.`;
        }
    }

    throw error;
}

export type FunnelStep =
    | 'input_started'
    | 'result_received'
    | 'tab_clicked'
    | 'profile_saved'
    | 'shared';

export interface TabEngagementPayload {
    tab_name: string;
    dwell_ms: number;
    reading_id?: string;
    source_tab?: string;
}

export interface TrackTabEngagementResult {
    success: boolean;
    retriable: boolean;
    status: number;
}

export async function trackTabEngagement(
    payload: TabEngagementPayload,
    token?: string,
    options: { keepalive?: boolean } = {}
): Promise<TrackTabEngagementResult> {
    try {
        const response = await apiFetch(`${API_BASE_URL}/api/analytics/track/tab-engagement`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders(token),
            },
            body: JSON.stringify(payload),
            keepalive: options.keepalive === true,
        });

        if (response.ok) {
            return { success: true, retriable: false, status: response.status };
        }

        const nonRetriableStatuses = new Set([400, 401, 403, 404, 422]);
        return {
            success: false,
            retriable: !nonRetriableStatuses.has(response.status),
            status: response.status,
        };
    } catch (error) {
        console.error('[trackTabEngagement] Error:', error);
        return { success: false, retriable: true, status: 0 };
    }
}

export async function trackFunnelStep(
    sessionId: string,
    step: FunnelStep,
    stepData?: Record<string, unknown>,
    token?: string
): Promise<boolean> {
    if (!sessionId) return false;

    try {
        const response = await apiFetch(`${API_BASE_URL}/api/analytics/track/funnel`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders(token),
            },
            body: JSON.stringify({
                session_id: sessionId,
                step,
                step_data: stepData ?? {},
            }),
        });

        return response.ok;
    } catch (error) {
        console.error('[trackFunnelStep] Error:', error);
        return false;
    }
}

/**
 * 결정 Q&A 요청
 */
export async function createDecision(input: DecisionInput, token?: string): Promise<DecisionResponse> {
    const response = await apiFetch(`${API_BASE_URL}/api/decision`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(token),
        },
        body: JSON.stringify(input),
    }, DECISION_API_TIMEOUT_MS);

    if (!response.ok) {
        await throwSanitizedApiError(response, '결정 분석 요청에 실패했습니다.');
    }

    return response.json();
}

// =============================================================================
// 프로필 공유 코드 API
// =============================================================================

export interface ShareCodeResponse {
    code: string;
    expires_at: string;
}

export interface ProfileByCodeResponse {
    name?: string;
    birth_date?: string;
    hour_branch?: string;
    gender?: string;
    birth_input?: Record<string, unknown>;
    reading_data?: Record<string, unknown>;
    sharer_name?: string | null;
}

export interface ProfileByCodeRedeemResponse {
    sharer_name: string | null;
    birth_input: Record<string, unknown>;
    reading_data: Record<string, unknown>;
}

export async function generateShareCode(token?: string, profileId?: string): Promise<ShareCodeResponse> {
    if (!profileId) {
        throw new Error('프로필 정보가 없습니다.');
    }
    const response = await apiFetch(`${API_BASE_URL}/api/profile/${profileId}/share-code`, {
        method: 'POST',
        headers: { ...getAuthHeaders(token) },
    });
    if (!response.ok) {
        await throwSanitizedApiError(response, '공유 코드 생성에 실패했습니다.');
    }
    return response.json();
}

export async function getProfileByCode(code: string): Promise<ProfileByCodeResponse> {
    const response = await apiFetch(`${API_BASE_URL}/api/profile/by-code/${code}`);
    if (response.status === 410) {
        throw new Error('만료되었거나 사용 횟수를 초과한 코드입니다');
    }
    if (!response.ok) {
        await throwSanitizedApiError(response, '유효하지 않은 코드입니다');
    }
    return response.json();
}

export async function redeemProfileByCode(
    code: string,
    token?: string,
): Promise<ProfileByCodeRedeemResponse> {
    const response = await apiFetch(`${API_BASE_URL}/api/profile/by-code/${code}/redeem`, {
        method: 'POST',
        headers: { ...getAuthHeaders(token) },
    });
    if (response.status === 410) {
        throw new Error('만료되었거나 사용 횟수를 초과한 코드입니다');
    }
    if (!response.ok) {
        await throwSanitizedApiError(response, '유효하지 않은 코드입니다');
    }
    return response.json();
}

/**
 * 궁합 분석 요청
 */
export async function analyzeCompatibility(request: CompatibilityRequest, token?: string): Promise<CompatibilityResponse> {
    const response = await apiFetch(`${API_BASE_URL}/api/analyze/compatibility`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(token),
        },
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        console.error('[analyzeCompatibility] Error:', response.status);
        await throwSanitizedApiError(response, '궁합 분석 요청에 실패했습니다.');
    }

    return response.json();
}

export async function startCompatibilityJob(
    request: CompatibilityJobStartRequest,
    token?: string,
): Promise<CompatibilityJobStartResponse> {
    const response = await apiFetch(`${API_BASE_URL}/api/analyze/compatibility/start`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(token),
        },
        body: JSON.stringify(request),
    }, JOB_API_TIMEOUT_MS);

    if (!response.ok) {
        await throwSanitizedApiError(response, '궁합 분석 시작에 실패했습니다.');
    }

    return response.json();
}

export async function getCompatibilityJobStatus(
    jobId: string,
    token?: string,
): Promise<CompatibilityJobStatusResponse> {
    const response = await apiFetch(`${API_BASE_URL}/api/analyze/compatibility/status/${jobId}`, {
        method: 'GET',
        headers: {
            ...getAuthHeaders(token),
        },
    }, JOB_API_TIMEOUT_MS);

    if (!response.ok) {
        await throwSanitizedApiError(response, '궁합 분석 상태 조회에 실패했습니다.');
    }

    return response.json();
}

/**
 * 사주 리딩 요청 (동기식 - 기존 방식)
 */
export async function createReading(request: ReadingRequest, token?: string, signal?: AbortSignal): Promise<ReadingResponse> {
    const response = await apiFetch(`${API_BASE_URL}/api/reading`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(token),
        },
        body: JSON.stringify(request),
        signal,
    }, READING_API_TIMEOUT_MS);

    if (!response.ok) {
        await throwSanitizedApiError(response, '사주 리딩 요청에 실패했습니다.');
    }

    return response.json();
}

export async function getReadingDetail(readingId: string, token?: string): Promise<ReadingResponse> {
    const response = await apiFetch(`${API_BASE_URL}/api/reading/${readingId}`, {
        method: 'GET',
        headers: {
            ...getAuthHeaders(token),
        },
    }, DEFAULT_API_TIMEOUT_MS);

    if (!response.ok) {
        await throwSanitizedApiError(response, '상세 리딩을 불러오지 못했습니다.');
    }

    return response.json();
}

export interface ReadingResumeBootstrapResponse {
    reading_id: string;
    cache_id: string;
    reused_existing: boolean;
}

export async function bootstrapResumeReading(
    cacheId: string,
    input: BirthInput,
    token?: string,
    profileId?: string
): Promise<ReadingResumeBootstrapResponse> {
    const response = await apiFetch(`${API_BASE_URL}/api/reading/bootstrap`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(token),
        },
        body: JSON.stringify({
            cache_id: cacheId,
            input,
            profile_id: profileId,
        }),
    }, DEFAULT_API_TIMEOUT_MS);

    if (!response.ok) {
        await throwSanitizedApiError(response, '리딩 컨텍스트를 복구하지 못했습니다.');
    }

    return response.json();
}

// =============================================================================
// 비동기 작업 API (모바일 백그라운드 대응)
// =============================================================================

interface JobStartResponse {
    job_id: string;
    status: string;
    message: string;
}

interface JobStatusResponse {
    job_id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress?: number;           // 0-100
    completed_tabs?: number;     // 0-11
    total_tabs?: number;         // 11
    result: ReadingResponse | null;
    error: string | null;
    created_at: string | null;
    updated_at: string | null;
}

export interface ProgressInfo {
    progress: number;        // 0-100
    completedTabs: number;   // 0-11
    totalTabs: number;       // 11
}

interface PushSubscription {
    endpoint: string;
    keys: { p256dh: string; auth: string };
}

const PENDING_READING_START_KEY = 'saju_pending_reading_start';

function scopedPendingReadingStartKey(namespace?: string): string {
    const safeNamespace = namespace?.trim();
    return safeNamespace ? `${PENDING_READING_START_KEY}:${safeNamespace}` : PENDING_READING_START_KEY;
}

interface PendingReadingStart {
    request: ReadingRequest;
    clientRequestId: string;
    startedAt: number;
}

function makeClientRequestId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `reading-${crypto.randomUUID()}`;
    }
    return `reading-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function savePendingReadingStart(request: ReadingRequest, clientRequestId: string, namespace?: string): void {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    sessionStorage.setItem(
        scopedPendingReadingStartKey(namespace),
        JSON.stringify({ request, clientRequestId, startedAt: Date.now() } satisfies PendingReadingStart)
    );
}

export function getPendingReadingStart(namespace?: string): PendingReadingStart | null {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    const raw = sessionStorage.getItem(scopedPendingReadingStartKey(namespace));
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as PendingReadingStart;
        if (Date.now() - parsed.startedAt > 10 * 60 * 1000) {
            clearPendingReadingStart(namespace);
            return null;
        }
        return parsed;
    } catch {
        clearPendingReadingStart(namespace);
        return null;
    }
}

export function clearPendingReadingStart(namespace?: string): void {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    sessionStorage.removeItem(scopedPendingReadingStartKey(namespace));
}

/**
 * 비동기 사주 리딩 시작 - 즉시 job_id 반환
 */
/**
 * 비동기 사주 리딩 시작 - 즉시 job_id 반환
 */
export async function startReading(
    request: ReadingRequest,
    pushSubscription?: PushSubscription,
    signal?: AbortSignal,
    token?: string,
    clientRequestId?: string,
): Promise<JobStartResponse> {
    const body = {
        input: request.input,
        model: request.model,
        profile_id: request.profile_id ?? null,
        client_request_id: clientRequestId ?? makeClientRequestId(),
        push_subscription: pushSubscription || null,
    };

    const response = await apiFetch(`${API_BASE_URL}/api/reading/start`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(token),
        },
        body: JSON.stringify(body),
        signal
    });

    if (!response.ok) {
        await throwSanitizedApiError(response, '분석 시작에 실패했습니다.');
    }

    return response.json();
}

/**
 * 작업 상태 조회
 */
export async function getJobStatus(
    jobId: string,
    signal?: AbortSignal,
    token?: string
): Promise<JobStatusResponse> {
    const response = await apiFetch(`${API_BASE_URL}/api/reading/status/${jobId}`, {
        signal,
        headers: {
            ...getAuthHeaders(token),
        },
    });

    if (!response.ok) {
        if (response.status === 404) {
            const error = new Error('작업을 찾을 수 없습니다.') as Error & { status?: number };
            error.status = 404;
            throw error;
        }
        await throwSanitizedApiError(response, '작업 상태 조회에 실패했습니다.');
    }

    return response.json();
}

// ... (PendingJob 관련 코드는 유지 - replace 범위 밖이면 생략 가능하나 범위 안에 있다면 포함)
// 여기서는 PendingJob 부분은 건드리지 않으므로 getJobStatus 끝난 후부터 pollJobResult 전까지는 skip하려면 범위를 나눠야 함.
// 하지만 한 덩어리로 교체하는 게 안전.

// 로컬 스토리지 키 (jobId만 저장)
const PENDING_JOB_KEY = 'saju_pending_job_id';
// 세션 스토리지 키 (민감한 입력 데이터)
const PENDING_JOB_REQUEST_KEY = 'saju_pending_job_request';

interface PendingJob {
    jobId: string;
    request: ReadingRequest;
    startedAt: number;
}

/**
 * 진행 중인 작업 저장 (jobId는 localStorage, 입력 데이터는 sessionStorage)
 */
export function savePendingJob(jobId: string, request: ReadingRequest): void {
    // localStorage에는 jobId만 저장
    localStorage.setItem(PENDING_JOB_KEY, JSON.stringify({
        jobId,
        startedAt: Date.now(),
    }));
    // sessionStorage에 입력 데이터 저장 (탭 닫으면 자동 삭제)
    if (typeof window !== 'undefined' && window.sessionStorage) {
        sessionStorage.setItem(PENDING_JOB_REQUEST_KEY, JSON.stringify(request));
    }
}

/**
 * 진행 중인 작업 가져오기
 */
export function getPendingJob(): PendingJob | null {
    if (typeof window === 'undefined') return null;

    const jobData = localStorage.getItem(PENDING_JOB_KEY);
    if (!jobData) return null;

    try {
        const parsed = JSON.parse(jobData) as { jobId: string; startedAt: number };
        // 1시간 이상 된 작업은 무시
        if (Date.now() - parsed.startedAt > 60 * 60 * 1000) {
            clearPendingJob();
            return null;
        }

        // sessionStorage에서 요청 데이터 가져오기
        const requestData = sessionStorage.getItem(PENDING_JOB_REQUEST_KEY);
        if (!requestData) {
            // 요청 데이터가 없으면 jobId만 반환 (폴링 재개용)
            return {
                jobId: parsed.jobId,
                request: {} as ReadingRequest,
                startedAt: parsed.startedAt,
            };
        }

        const request = JSON.parse(requestData) as ReadingRequest;
        return {
            jobId: parsed.jobId,
            request,
            startedAt: parsed.startedAt,
        };
    } catch {
        return null;
    }
}

/**
 * 진행 중인 작업 삭제
 */
export function clearPendingJob(): void {
    localStorage.removeItem(PENDING_JOB_KEY);
    if (typeof window !== 'undefined' && window.sessionStorage) {
        sessionStorage.removeItem(PENDING_JOB_REQUEST_KEY);
    }
}

/**
 * 비동기 리딩 + 폴링 통합 함수
 * - 작업 시작 → job_id를 localStorage에 저장 → 폴링으로 결과 대기
 * - 페이지 복귀 시 자동 복구 가능
 */
export async function startReadingWithPolling(
    request: ReadingRequest,
    onStatusChange?: (status: string) => void,
    pushSubscription?: PushSubscription,
    signal?: AbortSignal,
    token?: string,
    onProgressChange?: (progress: ProgressInfo) => void,
    clientRequestId?: string,
): Promise<ReadingResponse> {
    const effectiveClientRequestId = clientRequestId ?? makeClientRequestId();
    savePendingReadingStart(request, effectiveClientRequestId);
    let startResponse: JobStartResponse;
    try {
        startResponse = await startReading(
            request,
            pushSubscription,
            signal,
            token,
            effectiveClientRequestId
        );
    } catch (error) {
        const status =
            typeof error === 'object' && error !== null && 'status' in error
                ? (error as { status?: unknown }).status
                : undefined;
        if (status === 400 || status === 401 || status === 402 || status === 403 || status === 429) {
            clearPendingReadingStart();
        }
        throw error;
    }
    const jobId = startResponse.job_id;

    clearPendingReadingStart();
    savePendingJob(jobId, request);

    return pollJobResult(jobId, onStatusChange, 450, 2000, signal, token, onProgressChange);
}

/**
 * 작업 결과 폴링
 */
export async function pollJobResult(
    jobId: string,
    onStatusChange?: (status: string) => void,
    maxAttempts: number = 450,
    intervalMs: number = 2000,
    signal?: AbortSignal,
    token?: string,
    onProgressChange?: (progress: ProgressInfo) => void
): Promise<ReadingResponse> {
    let attempts = 0;

    while (attempts < maxAttempts) {
        if (signal?.aborted) {
            clearPendingJob();
            throw new Error('분석이 취소되었습니다.');
        }

        try {
            const status = await getJobStatus(jobId, signal, token);

            if (onStatusChange) {
                onStatusChange(status.status);
            }

            if (onProgressChange) {
                onProgressChange({
                    progress: status.progress ?? 0,
                    completedTabs: status.completed_tabs ?? 0,
                    totalTabs: status.total_tabs ?? 11,
                });
            }

            if (status.status === 'completed' && status.result) {
                // TODO FRONT-8: pollJobResult 종료 경로별 clearPendingJob 정리/메모리 누수 점검 필요
                clearPendingJob();
                return status.result;
            }

            if (status.status === 'failed') {
                clearPendingJob();
                throw new Error(sanitizeErrorMessage(500, status.error ?? undefined, '분석 실패'));
            }

            await abortableSleep(intervalMs, signal);
            attempts++;

        } catch (error) {
            const status =
                typeof error === 'object' && error !== null && 'status' in error
                    ? (error as { status?: unknown }).status
                    : undefined;

            if (signal?.aborted || (error instanceof Error && error.message.includes('취소'))) {
                clearPendingJob();
                throw error;
            }

            if (status === 401 || status === 404) {
                clearPendingJob();
                throw error;
            }

            if (attempts < maxAttempts - 1) {
                await abortableSleep(intervalMs * 2, signal);
                attempts++;
                continue;
            }

            clearPendingJob();
            throw error;
        }
    }

    clearPendingJob();
    throw new Error('분석 시간 초과. 다시 시도해주세요.');
}


/**
 * 사용 가능한 모델 목록 조회
 */
export async function getModels(): Promise<ModelInfo[]> {
    const response = await apiFetch(`${API_BASE_URL}/api/models`);

    if (!response.ok) {
        await throwSanitizedApiError(response, '모델 목록 조회에 실패했습니다.');
    }

    const data = await response.json();
    return data.models;
}

export async function getFeatureFlags(): Promise<Record<string, boolean>> {
    try {
        const response = await apiFetch(`${API_BASE_URL}/api/config/features`);
        if (!response.ok) {
            return {};
        }
        return response.json();
    } catch {
        return {};
    }
}

/**
 * 헬스체크
 */
export async function healthCheck(): Promise<boolean> {
    try {
        const response = await apiFetch(`${API_BASE_URL}/api/health`);
        return response.ok;
    } catch {
        return false;
    }
}

/**
 * 기운 캘린더 - 월별 흐름
 */
export async function getFlowMonthly(request: FlowMonthlyRequest): Promise<FlowMonthlyResponse> {
    const response = await apiFetch(`${API_BASE_URL}/api/flow/monthly`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        await throwSanitizedApiError(response, '월별 흐름 조회에 실패했습니다.');
    }

    return response.json();
}

/**
 * 기운 캘린더 - 일별 흐름
 */
export async function getFlowDaily(request: FlowDailyRequest): Promise<FlowDailyResponse> {
    const response = await apiFetch(`${API_BASE_URL}/api/flow/daily`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        await throwSanitizedApiError(response, '일별 흐름 조회에 실패했습니다.');
    }

    return response.json();
}

/**
 * 기운 캘린더 - 날짜 상세
 */
export async function getFlowDetail(request: FlowDetailRequest): Promise<FlowDetailResponse> {
    const response = await apiFetch(`${API_BASE_URL}/api/flow/detail`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        await throwSanitizedApiError(response, '날짜 상세 조회에 실패했습니다.');
    }

    return response.json();
}

export interface SavedAdviceResponse {
    found: boolean;
    advice: FlowAiAdviceResponse | null;
    created_at: string | null;
}

export async function getSavedFlowAdvice(
    profileId: string,
    date: string,
    category: string,
    token?: string
): Promise<SavedAdviceResponse> {
    const response = await apiFetch(
        `${API_BASE_URL}/api/flow/ai-advice/${profileId}/${date}?category=${category}`,
        {
            headers: getAuthHeaders(token),
        }
    );

    if (!response.ok) {
        return { found: false, advice: null, created_at: null };
    }

    return response.json();
}

export async function getFlowAiAdvice(request: FlowAiAdviceRequest, token?: string): Promise<FlowAiAdviceResponse> {
    const response = await apiFetch(`${API_BASE_URL}/api/flow/ai-advice`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(token),
        },
        body: JSON.stringify(request),
    }, FLOW_AI_API_TIMEOUT_MS);

    if (!response.ok) {
        await throwSanitizedApiError(response, 'AI 상세 조언 요청에 실패했습니다.');
    }

    return response.json();
}

// =============================================================================
// 동의 & 프로필 API
// =============================================================================

export interface ConsentStatus {
    granted: boolean;
    version?: string;
}

export async function getConsentStatus(
    token: string | undefined,
    consentType: string
): Promise<ConsentStatus> {
    const response = await apiFetch(
        `${API_BASE_URL}/api/consents/status?consent_type=${encodeURIComponent(consentType)}`,
        {
            headers: getAuthHeaders(token),
        }
    );

    if (!response.ok) {
        await throwSanitizedApiError(response, '동의 상태 확인에 실패했습니다.');
    }

    return response.json();
}

export async function grantConsent(
    token: string | undefined,
    consentType: string,
    version: string = 'v1'
): Promise<void> {
    const response = await apiFetch(`${API_BASE_URL}/api/consents/grant`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(token),
        },
        body: JSON.stringify({
            consent_type: consentType,
            version,
            is_granted: true,
        }),
    });

    if (!response.ok) {
        await throwSanitizedApiError(response, '동의 저장에 실패했습니다.');
    }
}

export interface SavedProfile {
    id: string;
    label: string;
    birth_date: string;
    hour_branch: string;
    calendar_type: string;
    gender: string;
    persona?: string;
    source_cache_id?: string;
    source_reading_id?: string;
    created_at: string;
}

interface ProfilePayload {
    label: string;
    birth_date: string;
    hour_branch: string;
    calendar_type: string;
    gender: string;
    persona?: string;
    payment_transaction_id?: string;
    source_cache_id?: string;
    source_reading_id?: string;
}

export interface ProfileSourceLink {
    cache_id: string | null;
    reading_id: string | null;
}


export async function saveProfile(
    token: string | undefined,
    profile: ProfilePayload
): Promise<{ id: string; status: string }> {
    const response = await apiFetch(`${API_BASE_URL}/api/saju/profiles`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(token),
        },
        body: JSON.stringify(profile),
    });

    if (!response.ok) {
        if (response.status === 403) {
            throw new Error('CONSENT_REQUIRED');
        }
        await throwSanitizedApiError(response, '프로필 저장에 실패했습니다.');
    }

    const saved = await response.json();
    invalidateReadCache(['profiles:', 'cache-by-profile:', 'cache-by-params:']);
    return saved;
}

export async function resolveProfileSourceLink(
    token: string | undefined,
    profile: ProfilePayload
): Promise<ProfileSourceLink> {
    const response = await apiFetch(`${API_BASE_URL}/api/saju/profiles/resolve-link`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(token),
        },
        body: JSON.stringify(profile),
    });

    if (!response.ok) {
        await throwSanitizedApiError(response, '프로필 링크 확인에 실패했습니다.');
    }

    return response.json();
}

export async function getProfiles(token?: string): Promise<SavedProfile[]> {
    const cacheKey = `profiles:${token || 'auth-session'}`;
    return withInFlightRead(cacheKey, async () => {
        const response = await apiFetch(`${API_BASE_URL}/api/saju/profiles`, {
            headers: { ...getAuthHeaders(token) },
        });

        if (!response.ok) {
            await throwSanitizedApiError(response, '프로필 목록 조회에 실패했습니다.');
        }

        return response.json();
    }, PROFILE_READ_TTL_MS);
}

export async function deleteProfile(token: string | undefined, profileId: string): Promise<void> {
    const response = await apiFetch(`${API_BASE_URL}/api/saju/profiles/${profileId}`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders(token) },
    });

    if (!response.ok) {
        await throwSanitizedApiError(response, '프로필 삭제에 실패했습니다.');
    }

    invalidateReadCache(['profiles:', 'cache-by-profile:', 'cache-by-params:']);
}

// 지지 한자 → 시간(hour) 매핑 (백엔드 캐시 키 생성용)
const JIJI_TO_HOUR: Record<string, string> = {
    '子': '00', '丑': '02', '寅': '04', '卯': '06', '辰': '08', '巳': '10',
    '午': '12', '未': '14', '申': '16', '酉': '18', '戌': '20', '亥': '22',
};

function normalizeHourForCache(hourBranch: string): string {
    const raw = (hourBranch || '').trim();
    const mapped = JIJI_TO_HOUR[raw] || raw;

    if (!mapped) {
        return '12';
    }

    if (mapped.includes(':')) {
        const [hourPart] = mapped.split(':');
        return hourPart.padStart(2, '0');
    }

    return /^\d+$/.test(mapped) ? mapped.padStart(2, '0') : mapped;
}

/**
 * Raw 파라미터로 캐시된 분석 결과 조회
 * 백엔드에서 HMAC birth_key를 생성하여 조회합니다.
 * 프론트엔드는 해싱 없이 원본 값만 전달하면 됩니다.
 */
export async function getCachedReading(
    profile: {
        birth_date: string;
        hour_branch: string;
        calendar_type: string;
        gender: string;
        persona?: string;
    },
    token?: string
): Promise<ReadingResponse | null> {
    const calendar = profile.calendar_type || 'solar';
    const gender = profile.gender || 'male';
    const persona = profile.persona?.trim();
    const hourValue = normalizeHourForCache(profile.hour_branch);

    const params = new URLSearchParams();
    params.set('birth_date', profile.birth_date);
    params.set('hour', hourValue);
    params.set('calendar_type', calendar);
    params.set('gender', gender);
    if (persona) {
        params.set('persona', persona);
    }

    const cacheKey = `cache-by-params:${params.toString()}:${token || 'auth-session'}`;

    return withInFlightRead(cacheKey, async () => {
        try {
            const response = await apiFetch(`${API_BASE_URL}/api/cache/by-params?${params}`, {
                headers: {
                    ...getAuthHeaders(token),
                },
            });

            if (response.status === 401 || response.status === 403) {
                throw new Error('AUTH_REQUIRED');
            }

            if (response.status === 404) {
                return null;
            }

            if (!response.ok) {
                if (response.status === 429 || response.status >= 500) {
                    await throwSanitizedApiError(response, '캐시 조회 요청이 일시적으로 제한되었습니다. 잠시 후 다시 시도해 주세요.');
                }
                console.error('캐시 조회 실패:', response.status);
                return null;
            }

            return response.json();
        } catch (error) {
            if (error instanceof Error && error.message === 'AUTH_REQUIRED') {
                throw error;
            }
            console.error('캐시 조회 에러:', error);
            return null;
        }
    }, PROFILE_READ_TTL_MS);
}

export async function getCachedReadingByProfile(profileId: string, token?: string): Promise<ReadingResponse | null> {
    const cacheKey = `cache-by-profile:${profileId}:${token || 'auth-session'}`;
    return withInFlightRead(cacheKey, async () => {
        try {
            const response = await apiFetch(`${API_BASE_URL}/api/cache/by-profile/${profileId}`, {
                headers: {
                    ...getAuthHeaders(token),
                },
            });

            if (response.status === 401 || response.status === 403) {
                throw new Error('AUTH_REQUIRED');
            }

            if (response.status === 404) {
                return null;
            }

            if (!response.ok) {
                if (response.status === 429 || response.status >= 500) {
                    await throwSanitizedApiError(response, '프로필 기반 캐시 조회 요청이 일시적으로 제한되었습니다. 잠시 후 다시 시도해 주세요.');
                }
                console.error('프로필 기반 캐시 조회 실패:', response.status);
                return null;
            }

            return response.json();
        } catch (error) {
            if (error instanceof Error && error.message === 'AUTH_REQUIRED') {
                throw error;
            }
            console.error('프로필 기반 캐시 조회 에러:', error);
            return null;
        }
    }, PROFILE_READ_TTL_MS);
}

/**
 * 프로필 정보로 birth_key 생성 (로컬 히스토리 매칭용)
 * NOTE: 서버 캐시 조회는 getCachedReading()을 사용하세요 (HMAC 해싱은 백엔드에서 처리)
 */
export function makeBirthKey(profile: {
    birth_date: string;
    hour_branch: string;
    calendar_type: string;
    gender: string;
    persona?: string;
}): string {
    const calendar = profile.calendar_type || 'solar';
    const gender = profile.gender || 'male';
    const persona = profile.persona || 'classic';
    const hourValue = normalizeHourForCache(profile.hour_branch);
    return `${profile.birth_date}_${hourValue}_${calendar}_${gender}_${persona}`;
}

// =============================================================================
// 공유 API
// =============================================================================

export interface ShareGetResponse {
    share_code: string;
    sharer_name: string | null;
    birth_input: Record<string, unknown>;
    reading_data: Record<string, unknown>;
    created_at: string;
    view_count: number;
}

/**
 * 공유된 사주 조회 (인증 불필요)
 */
export async function getSharedSaju(shareCode: string): Promise<ShareGetResponse> {
    const response = await apiFetch(`${API_BASE_URL}/api/share/${shareCode}`);

    if (response.status === 404) {
        throw new Error('공유 링크를 찾을 수 없습니다');
    }

    if (response.status === 410) {
        throw new Error('공유 링크가 만료되었습니다');
    }

    if (!response.ok) {
        await throwSanitizedApiError(response, '공유 사주 조회에 실패했습니다.');
    }

    return response.json();
}

export interface ReferralLinkResponse {
    referral_code: string;
    share_url: string;
    created_at: string;
}

export interface ReferralStatusResponse {
    referral_code: string | null;
    total_referred: number;
    total_completed: number;
    total_coins_earned: number;
}

export async function createReferralLink(token?: string): Promise<ReferralLinkResponse> {
    const response = await apiFetch(`${API_BASE_URL}/api/referrals/create`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...buildClientAuthHeaders(token),
        },
    });

    if (!response.ok) {
        throw new Error('리퍼럴 링크 생성 실패');
    }

    return response.json();
}

export async function getReferralStatus(token?: string): Promise<ReferralStatusResponse> {
    const response = await apiFetch(`${API_BASE_URL}/api/referrals/status`, {
        headers: buildClientAuthHeaders(token),
    });

    if (!response.ok) {
        throw new Error('리퍼럴 상태 조회 실패');
    }

    return response.json();
}

// =============================================================================
// 궁합 저장 API
// =============================================================================

export interface CompatibilityHistoryItem {
    id: string;
    label: string;
    scenario: string;
    created_at: string;
}

export interface CompatibilityDetailResponse {
    id: string;
    user_a: { name: string; birth_date: string; hour_branch: string; gender: string };
    user_b: { name: string; birth_date: string; hour_branch: string; gender: string };
    compatibility_data: CompatibilityResponse;
    scenario: string;
    created_at: string;
}

export async function saveCompatibilityResult(
    token: string | undefined,
    data: {
        user_a: { name: string; birth_date: string; hour_branch: string; gender: string };
        user_b: { name: string; birth_date: string; hour_branch: string; gender: string };
        compatibility_data: Record<string, unknown>;
        scenario?: string;
    }
): Promise<{ id: string; status: string }> {
    const response = await apiFetch(`${API_BASE_URL}/api/compatibility/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders(token) },
        body: JSON.stringify(data),
    });
    if (!response.ok) {
        await throwSanitizedApiError(response, '궁합 결과 저장에 실패했습니다.');
    }
    return response.json();
}

export async function getCompatibilityHistory(token?: string): Promise<CompatibilityHistoryItem[]> {
    const response = await apiFetch(`${API_BASE_URL}/api/compatibility/history`, {
        headers: { ...getAuthHeaders(token) },
    });
    if (!response.ok) return [];
    return response.json();
}

export async function getCompatibilityDetail(token: string | undefined, id: string): Promise<CompatibilityDetailResponse> {
    const response = await apiFetch(`${API_BASE_URL}/api/compatibility/${id}`, {
        headers: { ...getAuthHeaders(token) },
    });
    if (!response.ok) {
        await throwSanitizedApiError(response, '궁합 결과를 찾을 수 없습니다.');
    }
    return response.json();
}

export async function deleteCompatibilityResult(token: string | undefined, id: string): Promise<void> {
    const response = await apiFetch(`${API_BASE_URL}/api/compatibility/${id}`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders(token) },
    });
    if (!response.ok) {
        await throwSanitizedApiError(response, '궁합 결과 삭제에 실패했습니다.');
    }
}

// =============================================================================
// Streak & Daily Mission API
// =============================================================================

import type {
    StreakStatus,
    CheckInResponse,
    MissionListResponse,
    MissionCompleteResponse,
} from '@/types';

/**
 * 스트릭 상태 조회
 */
export async function getStreakStatus(token?: string): Promise<StreakStatus> {
    const response = await apiFetch(`${API_BASE_URL}/api/streak`, {
        headers: {
            ...getAuthHeaders(token),
        },
    });

    if (!response.ok) {
        await throwSanitizedApiError(response, '스트릭 조회에 실패했습니다.');
    }

    return response.json();
}

/**
 * 출석 체크
 */
export async function checkIn(token?: string): Promise<CheckInResponse> {
    const response = await apiFetch(`${API_BASE_URL}/api/streak/check-in`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(token),
        },
    });

    if (!response.ok) {
        await throwSanitizedApiError(response, '출석 체크에 실패했습니다.');
    }

    return response.json();
}

/**
 * 데일리 미션 목록 조회
 */
export async function getDailyMissions(token?: string): Promise<MissionListResponse> {
    const response = await apiFetch(`${API_BASE_URL}/api/streak/missions`, {
        headers: {
            ...getAuthHeaders(token),
        },
    });

    if (!response.ok) {
        await throwSanitizedApiError(response, '미션 목록 조회에 실패했습니다.');
    }

    return response.json();
}

/**
 * 미션 완료
 */
export async function completeMission(missionId: string, token?: string): Promise<MissionCompleteResponse> {
    const response = await apiFetch(`${API_BASE_URL}/api/streak/missions/${missionId}/complete`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(token),
        },
    });

    if (!response.ok) {
        await throwSanitizedApiError(response, '미션 완료에 실패했습니다.');
    }

    return response.json();
}

// =============================================================================
// Daily Fortune API (오늘의 운세)
// =============================================================================

export interface DailyFortuneLuckyItem {
    name: string;
    description: string;
    icon?: string;
}

export interface DailyFortuneData {
    today_message: string;
    today_advice: string;
    today_warning?: string;
    today_love?: string;
    today_money?: string;
    today_work?: string;
    today_health?: string;
    lucky_color: DailyFortuneLuckyItem;
    lucky_number: DailyFortuneLuckyItem;
    lucky_direction: DailyFortuneLuckyItem;
    lucky_food: DailyFortuneLuckyItem;
    lucky_activity: DailyFortuneLuckyItem;
    golden_time: string;
    avoid_time?: string;
    overall_score: number;
    mission_of_day?: string;
    power_hour?: string;
    talisman_phrase?: string;
}

export interface DailyFortuneEligibility {
    can_generate: boolean;
    is_free: boolean;
    cost: number;
    reason: string;
    existing_fortune_id?: string;
    days_since_profile_created?: number;
    user_balance?: number;
    today_kst: string;
    formatted_date: string;
}

export interface DailyFortune {
    id: string;
    profile_id: string;
    fortune_date: string;
    formatted_date: string;
    fortune_data: DailyFortuneData;
    cost_paid: number;
    is_free: boolean;
    created_at: string;
}

export interface DailyFortuneGenerateResult {
    success: boolean;
    fortune?: DailyFortune;
    error?: string;
    refunded?: boolean;
}

export async function checkDailyFortuneEligibility(
    profileId: string,
    token?: string
): Promise<DailyFortuneEligibility> {
    const response = await apiFetch(
        `${API_BASE_URL}/api/daily-fortune/eligibility/${profileId}`,
        {
            headers: getAuthHeaders(token),
        }
    );

    if (!response.ok) {
        await throwSanitizedApiError(response, '운세 자격 확인에 실패했습니다.');
    }

    return response.json();
}

export async function getTodayFortune(
    profileId: string,
    token?: string
): Promise<DailyFortune | null> {
    const response = await apiFetch(
        `${API_BASE_URL}/api/daily-fortune/today/${profileId}`,
        {
            headers: getAuthHeaders(token),
        }
    );

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        await throwSanitizedApiError(response, '운세 조회에 실패했습니다.');
    }

    return response.json();
}

export async function getLatestFortune(
    profileId: string,
    token?: string
): Promise<DailyFortune | null> {
    const response = await apiFetch(
        `${API_BASE_URL}/api/daily-fortune/latest/${profileId}`,
        {
            headers: getAuthHeaders(token),
        }
    );

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        await throwSanitizedApiError(response, '운세 조회에 실패했습니다.');
    }

    return response.json();
}

export async function generateDailyFortune(
    profileId: string,
    token?: string
): Promise<DailyFortuneGenerateResult> {
    const response = await apiFetch(`${API_BASE_URL}/api/daily-fortune/generate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(token),
        },
        body: JSON.stringify({ profile_id: profileId }),
    }, DAILY_FORTUNE_API_TIMEOUT_MS);

    if (!response.ok) {
        await throwSanitizedApiError(response, '운세 생성 요청에 실패했습니다.');
    }

    return response.json();
}

// =============================================================================
// Feedback API
// =============================================================================

export type FeedbackCategory = 'bug' | 'feature' | 'other' | 'payment' | 'account' | 'inquiry';

export interface FeedbackSubmitResponse {
    status: string;
    feedback_id: string;
    message: string;
}

export async function submitFeedback(
    category: FeedbackCategory,
    content: string,
    token?: string
): Promise<FeedbackSubmitResponse> {
    const response = await apiFetch(`${API_BASE_URL}/api/feedback`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(token),
        },
        body: JSON.stringify({ category, content }),
    });

    if (!response.ok) {
        await throwSanitizedApiError(response, '피드백 전송에 실패했습니다.');
    }

    return response.json();
}

export interface FeedbackHistoryItem {
    id: string;
    category: string;
    content: string;
    status: string;
    created_at: string;
    response: string | null;
    responded_at: string | null;
    has_unread_reply: boolean;
}

export interface FeedbackReadResponse {
    status: string;
    marked_count: number;
}

export async function getMyFeedbacks(token?: string): Promise<FeedbackHistoryItem[]> {
    const response = await apiFetch(`${API_BASE_URL}/api/feedback/my`, {
        headers: { ...getAuthHeaders(token) },
    });

    if (!response.ok) {
        await throwSanitizedApiError(response, '문의 내역 조회에 실패했습니다.');
    }

    return response.json();
}

export async function markFeedbackRepliesRead(token?: string): Promise<FeedbackReadResponse> {
    const response = await apiFetch(`${API_BASE_URL}/api/feedback/mark-replies-read`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(token),
        },
    });

    if (!response.ok) {
        await throwSanitizedApiError(response, '문의 답변 읽음 처리에 실패했습니다.');
    }

    return response.json();
}

// =============================================================================
// Past Timeline API
// =============================================================================

export async function getPastTimeline(
    request: PastTimelineRequest,
    token?: string
): Promise<PastTimelineResponse> {
    const response = await apiFetch(`${API_BASE_URL}/api/reading/past-timeline`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(token),
        },
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        await throwSanitizedApiError(response, '과거 타임라인 조회에 실패했습니다.');
    }

    return response.json();
}

// =============================================================================
// VS Battle API
// =============================================================================

export async function joinVsBattle(
    request: VsBattleJoinRequest
): Promise<VsBattleJoinResponse> {
    const response = await apiFetch(`${API_BASE_URL}/api/vs-battle/join`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
    });

    if (response.status === 404) {
        throw new Error('대결을 찾을 수 없습니다');
    }

    if (response.status === 410) {
        throw new Error('만료된 대결입니다');
    }

    if (!response.ok) {
        await throwSanitizedApiError(response, '대결 참여에 실패했습니다.');
    }

    return response.json();
}

export async function getVsBattleResult(battleCode: string): Promise<VsBattleResult> {
    const response = await apiFetch(`${API_BASE_URL}/api/vs-battle/${battleCode}/result`);

    if (response.status === 404) {
        throw new Error('대결을 찾을 수 없습니다');
    }

    if (response.status === 410) {
        throw new Error('만료된 대결입니다');
    }

    if (!response.ok) {
        await throwSanitizedApiError(response, '대결 결과 조회에 실패했습니다.');
    }

    return response.json();
}


// =============================================================================
// Quick Compatibility API (Viral Share Flow)
// =============================================================================

export async function requestQuickCompatibility(
    request: QuickCompatibilityRequest
): Promise<QuickCompatibilityResponse> {
    // 인증 불필요 (비로그인 User B)
    const response = await apiFetch(`${API_BASE_URL}/api/share/quick-compatibility`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    });
    if (!response.ok) {
        await throwSanitizedApiError(response, '궁합 분석에 실패했습니다');
    }
    return response.json();
}

// =============================================================================
// Image Generation API
// =============================================================================

import type { GenerateImageRequest, GenerateImageResponse } from '@/types';

export async function generateSajuImage(request: GenerateImageRequest, token?: string): Promise<GenerateImageResponse> {
    const response = await apiFetch(`${API_BASE_URL}/api/image/generate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(token),
        },
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        await throwSanitizedApiError(response, '이미지 생성에 실패했습니다.');
    }

    return response.json();
}

import type {
    ChatSessionCreateRequest,
    ChatSessionCreateResponse,
    ChatSessionResponse,
    ChatHistoryResponse,
    ChatMessageResponse,
    ChatMessageCreate,
    ChatSendResponse,
} from '@/types';

// =============================================================================
// Multi-turn Chat API
// =============================================================================

export async function createChatSession(request: ChatSessionCreateRequest, token?: string): Promise<ChatSessionCreateResponse> {
    const response = await apiFetch(`${API_BASE_URL}/api/chat/sessions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(token),
        },
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        await throwSanitizedApiError(response, '채팅 세션 생성에 실패했습니다.');
    }

    return response.json();
}

export async function getChatSessions(token?: string, birthInput?: { birth_solar: string; birth_time: string; gender: string; calendar_type?: string; persona?: string }): Promise<ChatSessionResponse[]> {
    const params = new URLSearchParams();
    if (birthInput) {
        params.append('birth_solar', birthInput.birth_solar);
        params.append('birth_time', birthInput.birth_time);
        params.append('gender', birthInput.gender);
        params.append('calendar_type', birthInput.calendar_type || 'solar');
        if (birthInput.persona) {
            params.append('persona', birthInput.persona);
        }
    }

    const queryString = params.toString();
    const endpoint = queryString
        ? `${API_BASE_URL}/api/chat/sessions?${queryString}`
        : `${API_BASE_URL}/api/chat/sessions`;

    const response = await apiFetch(endpoint, {
        headers: { ...getAuthHeaders(token) },
    });

    if (!response.ok) {
        await throwSanitizedApiError(response, '채팅 세션 목록 조회에 실패했습니다.');
    }

    return response.json();
}

export async function getChatSession(sessionId: string, token?: string): Promise<ChatHistoryResponse> {
    const response = await apiFetch(`${API_BASE_URL}/api/chat/sessions/${sessionId}`, {
        headers: { ...getAuthHeaders(token) },
    });

    if (!response.ok) {
        await throwSanitizedApiError(response, '채팅 세션 조회에 실패했습니다.');
    }

    return response.json();
}

export async function sendChatMessage(sessionId: string, request: ChatMessageCreate, token?: string): Promise<ChatSendResponse> {
    const response = await apiFetch(`${API_BASE_URL}/api/chat/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(token),
        },
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        await throwSanitizedApiError(response, '메시지 전송에 실패했습니다.');
    }

    return response.json();
}

export async function closeChatSession(sessionId: string, token?: string): Promise<ChatSessionResponse> {
    const response = await apiFetch(`${API_BASE_URL}/api/chat/sessions/${sessionId}/close`, {
        method: 'POST',
        headers: { ...getAuthHeaders(token) },
    });

    if (!response.ok) {
        await throwSanitizedApiError(response, '채팅 세션 종료에 실패했습니다.');
    }

    return response.json();
}

export async function deleteChatSession(sessionId: string, token?: string): Promise<{ ok: boolean }> {
    const response = await apiFetch(`${API_BASE_URL}/api/chat/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders(token) },
    });

    if (!response.ok) {
        await throwSanitizedApiError(response, '채팅 세션 삭제에 실패했습니다.');
    }

    return response.json();
}

/**
 * SSE 스트리밍으로 채팅 메시지 전송 (모든 턴 지원)
 */
export async function sendChatMessageStream(
    sessionId: string,
    content: string,
    token?: string,
    options?: {
        regenerate_turn?: number;
        onDelta?: (content: string) => void;
        onDone?: (data: { message: ChatMessageResponse; session: ChatSessionResponse; coins_spent: number }) => void;
        onError?: (error: { message: string; can_retry?: boolean }) => void;
    }
): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/chat/sessions/${sessionId}/messages/stream`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(token),
        },
        credentials: 'include',
        body: JSON.stringify({
            content,
            ...(options?.regenerate_turn !== undefined && { regenerate_turn: options.regenerate_turn }),
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || '스트리밍 연결에 실패했습니다.');
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('스트리밍을 지원하지 않는 브라우저입니다.');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const jsonStr = line.slice(6).trim();
                if (!jsonStr) continue;

                try {
                    const event = JSON.parse(jsonStr);

                    if (event.type === 'delta' && event.content) {
                        options?.onDelta?.(event.content);
                    } else if (event.type === 'done') {
                        options?.onDone?.(event);
                    } else if (event.type === 'error') {
                        options?.onError?.(event);
                    }
                } catch {
                    // Skip malformed JSON
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}



// ===== Received Profiles API =====

export interface ReceivedProfile {
    id: string;
    sharer_name: string | null;
    birth_date: string;
    hour_branch: string;
    calendar_type: string;
    gender: string;
    persona: string;
    source_profile_id?: string | null;
    analysis_data?: ReadingResponse | null;
    created_at: string;
}

export async function saveReceivedProfile(
    token: string | undefined,
    share_code: string
): Promise<ReceivedProfile> {
    const response = await apiFetch(`${API_BASE_URL}/api/profile/received`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(token),
        },
        body: JSON.stringify({ share_code }),
    });
    if (!response.ok) {
        await throwSanitizedApiError(response, '공유 코드 등록에 실패했습니다.');
    }
    const saved = await response.json();
    invalidateReadCache(['received-profiles:']);
    return saved;
}

export async function getReceivedProfiles(
    token: string | undefined
): Promise<ReceivedProfile[]> {
    const cacheKey = `received-profiles:${token || 'auth-session'}`;
    return withInFlightRead(cacheKey, async () => {
        const response = await apiFetch(`${API_BASE_URL}/api/profile/received`, {
            headers: getAuthHeaders(token),
        });
        if (!response.ok) {
            await throwSanitizedApiError(response, '공유받은 프로필 조회에 실패했습니다.');
        }
        return response.json();
    }, RECEIVED_PROFILE_READ_TTL_MS);
}

export async function deleteReceivedProfile(
    token: string | undefined,
    id: string
): Promise<void> {
    const response = await apiFetch(`${API_BASE_URL}/api/profile/received/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(token),
    });
    if (!response.ok) {
        await throwSanitizedApiError(response, '공유받은 프로필 삭제에 실패했습니다.');
    }

    invalidateReadCache(['received-profiles:']);
}
