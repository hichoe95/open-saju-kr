import { BirthInput, ReadingResponse } from '@/types';

export const SUMMARY_HUB_RESUME_VERSION = 'summary_hub_resume.v1' as const;
export const SUMMARY_HUB_RESUME_TOKEN_PREFIX = 'shr.v1' as const;
export const SUMMARY_HUB_RESUME_STORAGE_NAMESPACE = 'summary-hub-resume:v1' as const;
export const SUMMARY_HUB_RESUME_ACTIVE_STORAGE_KEY = `${SUMMARY_HUB_RESUME_STORAGE_NAMESPACE}:active` as const;
export const SUMMARY_HUB_RESUME_PAYMENT_STORAGE_KEY = `${SUMMARY_HUB_RESUME_STORAGE_NAMESPACE}:payment` as const;
export const SUMMARY_HUB_RESUME_ANON_CACHE_PREFIX = 'anon-cache' as const;
const SUMMARY_HUB_RESUME_PAYMENT_TTL_MS = 30 * 60 * 1000;

export const SUMMARY_HUB_DETAIL_TABS = [
  'summary',
  'lucky',
  'love',
  'money',
  'career',
  'study',
  'health',
  'compatibility',
  'life',
  'daeun',
] as const;

export type SummaryHubDetailTab = (typeof SUMMARY_HUB_DETAIL_TABS)[number];

export type ResumeContractEvent =
  | 'created'
  | 'auth_return'
  | 'signup_complete'
  | 'payment_success'
  | 'payment_failure'
  | 'payment_cancel'
  | 'refresh';

export type ResumeDestinationFocus =
  | 'payment_gate'
  | 'payment_retry'
  | 'paid_detail';

export interface ResumeEntitlementTarget {
  type: 'tab_detail';
  domainTab: SummaryHubDetailTab;
  featureKey: string;
}

export interface ResumeCtaOrigin {
  surface:
    | 'summary_hub_card'
    | 'summary_tab_cta'
    | 'locked_tab_banner'
    | 'result_header_cta';
  tab: SummaryHubDetailTab;
  action: 'open_paid_detail';
}

export interface ResumeDestinationState {
  pathname: '/';
  screen: 'summary_hub';
  readingId: string;
  activeTab: SummaryHubDetailTab;
  focus: ResumeDestinationFocus;
  detailUnlocked: boolean;
}

export interface SummaryHubResumeToken {
  version: typeof SUMMARY_HUB_RESUME_VERSION;
  issuedAt: number;
  readingId: string;
  entitlementTarget: ResumeEntitlementTarget;
  ctaOrigin: ResumeCtaOrigin;
  returnState: {
    authReturn: ResumeDestinationState;
    signupComplete: ResumeDestinationState;
    paymentSuccess: ResumeDestinationState;
    paymentFailure: ResumeDestinationState;
    paymentCancel: ResumeDestinationState;
  };
  checkpoint: {
    lastEvent: Exclude<ResumeContractEvent, 'refresh'>;
    updatedAt: number;
  };
}

export interface SummaryHubResumeSnapshot {
  readingId: string;
  birthInput: BirthInput;
  result: ReadingResponse;
  profileId?: string;
}

export function buildAnonymousSummaryHubResumeReadingId(cacheId: string): string {
  return `${SUMMARY_HUB_RESUME_ANON_CACHE_PREFIX}:${cacheId}`;
}

export function isAnonymousSummaryHubResumeReadingId(readingId: string): boolean {
  return readingId.startsWith(`${SUMMARY_HUB_RESUME_ANON_CACHE_PREFIX}:`);
}

export function extractCacheIdFromAnonymousSummaryHubResumeReadingId(
  readingId: string
): string | null {
  if (!isAnonymousSummaryHubResumeReadingId(readingId)) {
    return null;
  }

  const cacheId = readingId.slice(`${SUMMARY_HUB_RESUME_ANON_CACHE_PREFIX}:`.length).trim();
  return cacheId || null;
}

interface CreateResumeTokenInput {
  readingId: string;
  targetTab: SummaryHubDetailTab;
  featureKey: string;
  ctaOriginSurface: ResumeCtaOrigin['surface'];
}

function createDestinationState(
  readingId: string,
  activeTab: SummaryHubDetailTab,
  focus: ResumeDestinationFocus,
  detailUnlocked: boolean
): ResumeDestinationState {
  return {
    pathname: '/',
    screen: 'summary_hub',
    readingId,
    activeTab,
    focus,
    detailUnlocked,
  };
}

export function createSummaryHubResumeToken(
  input: CreateResumeTokenInput
): SummaryHubResumeToken {
  const issuedAt = Date.now();

  return {
    version: SUMMARY_HUB_RESUME_VERSION,
    issuedAt,
    readingId: input.readingId,
    entitlementTarget: {
      type: 'tab_detail',
      domainTab: input.targetTab,
      featureKey: input.featureKey,
    },
    ctaOrigin: {
      surface: input.ctaOriginSurface,
      tab: input.targetTab,
      action: 'open_paid_detail',
    },
    returnState: {
      authReturn: createDestinationState(
        input.readingId,
        input.targetTab,
        'payment_gate',
        false
      ),
      signupComplete: createDestinationState(
        input.readingId,
        input.targetTab,
        'payment_gate',
        false
      ),
      paymentSuccess: createDestinationState(
        input.readingId,
        input.targetTab,
        'paid_detail',
        true
      ),
      paymentFailure: createDestinationState(
        input.readingId,
        input.targetTab,
        'payment_retry',
        false
      ),
      paymentCancel: createDestinationState(
        input.readingId,
        input.targetTab,
        'payment_retry',
        false
      ),
    },
    checkpoint: {
      lastEvent: 'created',
      updatedAt: issuedAt,
    },
  };
}

export function serializeSummaryHubResumeToken(token: SummaryHubResumeToken): string {
  return `${SUMMARY_HUB_RESUME_TOKEN_PREFIX}.${encodeURIComponent(JSON.stringify(token))}`;
}

export function parseSummaryHubResumeToken(rawToken: string): SummaryHubResumeToken | null {
  if (!rawToken.startsWith(`${SUMMARY_HUB_RESUME_TOKEN_PREFIX}.`)) {
    return null;
  }

  const encodedPayload = rawToken.slice(`${SUMMARY_HUB_RESUME_TOKEN_PREFIX}.`.length);
  try {
    const parsed = JSON.parse(decodeURIComponent(encodedPayload)) as SummaryHubResumeToken;
    if (!isSummaryHubResumeToken(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function isSummaryHubResumeToken(value: unknown): value is SummaryHubResumeToken {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const token = value as Partial<SummaryHubResumeToken>;
  return token.version === SUMMARY_HUB_RESUME_VERSION
    && typeof token.readingId === 'string'
    && typeof token.issuedAt === 'number'
    && !!token.returnState
    && !!token.checkpoint;
}

function resolveEventKey(
  token: SummaryHubResumeToken,
  event: ResumeContractEvent
): keyof SummaryHubResumeToken['returnState'] {
  if (event === 'refresh') {
    const checkpointToKey: Record<
      Exclude<ResumeContractEvent, 'refresh'>,
      keyof SummaryHubResumeToken['returnState']
    > = {
      created: 'authReturn',
      auth_return: 'authReturn',
      signup_complete: 'signupComplete',
      payment_success: 'paymentSuccess',
      payment_failure: 'paymentFailure',
      payment_cancel: 'paymentCancel',
    };
    return checkpointToKey[token.checkpoint.lastEvent];
  }

  if (event === 'created') {
    return 'authReturn';
  }

  const eventToKey: Record<
    Exclude<ResumeContractEvent, 'created' | 'refresh'>,
    keyof SummaryHubResumeToken['returnState']
  > = {
    auth_return: 'authReturn',
    signup_complete: 'signupComplete',
    payment_success: 'paymentSuccess',
    payment_failure: 'paymentFailure',
    payment_cancel: 'paymentCancel',
  };

  return eventToKey[event];
}

export function resolveSummaryHubResumeDestination(
  token: SummaryHubResumeToken,
  event: ResumeContractEvent
): { nextToken: SummaryHubResumeToken; destination: ResumeDestinationState } {
  const eventKey = resolveEventKey(token, event);
  const destination = token.returnState[eventKey];

  if (event === 'refresh') {
    return { nextToken: token, destination };
  }

  return {
    nextToken: {
      ...token,
      checkpoint: {
        lastEvent: event,
        updatedAt: Date.now(),
      },
    },
    destination,
  };
}

export function buildSummaryHubResumeStorageKey(readingId: string): string {
  return `${SUMMARY_HUB_RESUME_STORAGE_NAMESPACE}:${readingId}`;
}

export function buildSummaryHubResumeSnapshotStorageKey(readingId: string): string {
  return `${SUMMARY_HUB_RESUME_STORAGE_NAMESPACE}:snapshot:${readingId}`;
}

export function saveSummaryHubResumeToken(token: SummaryHubResumeToken): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    buildSummaryHubResumeStorageKey(token.readingId),
    serializeSummaryHubResumeToken(token)
  );
}

export function loadSummaryHubResumeToken(
  readingId: string
): SummaryHubResumeToken | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(buildSummaryHubResumeStorageKey(readingId));
  if (!raw) {
    return null;
  }

  return parseSummaryHubResumeToken(raw);
}

export function clearSummaryHubResumeToken(readingId: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(buildSummaryHubResumeStorageKey(readingId));
}

export function saveSummaryHubResumeSnapshot(snapshot: SummaryHubResumeSnapshot): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(
    buildSummaryHubResumeSnapshotStorageKey(snapshot.readingId),
    JSON.stringify(snapshot)
  );
}

export function loadSummaryHubResumeSnapshot(readingId: string): SummaryHubResumeSnapshot | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.sessionStorage.getItem(buildSummaryHubResumeSnapshotStorageKey(readingId));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as SummaryHubResumeSnapshot;
    if (
      !parsed
      || parsed.readingId !== readingId
      || typeof parsed.birthInput !== 'object'
      || typeof parsed.result !== 'object'
    ) {
      window.sessionStorage.removeItem(buildSummaryHubResumeSnapshotStorageKey(readingId));
      return null;
    }

    return parsed;
  } catch {
    window.sessionStorage.removeItem(buildSummaryHubResumeSnapshotStorageKey(readingId));
    return null;
  }
}

export function replaceSummaryHubResumeSnapshotResult(
  readingId: string,
  result: ReadingResponse
): SummaryHubResumeSnapshot | null {
  const snapshot = loadSummaryHubResumeSnapshot(readingId);
  if (!snapshot) {
    return null;
  }

  const nextSnapshot: SummaryHubResumeSnapshot = {
    ...snapshot,
    result,
  };

  saveSummaryHubResumeSnapshot(nextSnapshot);
  return nextSnapshot;
}

export function clearSummaryHubResumeSnapshot(readingId: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.removeItem(buildSummaryHubResumeSnapshotStorageKey(readingId));
}

export function setActiveSummaryHubResumeReadingId(readingId: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(SUMMARY_HUB_RESUME_ACTIVE_STORAGE_KEY, readingId);
}

export function getActiveSummaryHubResumeReadingId(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const readingId = window.localStorage.getItem(SUMMARY_HUB_RESUME_ACTIVE_STORAGE_KEY)?.trim();
  return readingId || null;
}

export function clearActiveSummaryHubResumeReadingId(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(SUMMARY_HUB_RESUME_ACTIVE_STORAGE_KEY);
}

export function armSummaryHubResumePayment(readingId: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(
    SUMMARY_HUB_RESUME_PAYMENT_STORAGE_KEY,
    JSON.stringify({ readingId, armedAt: Date.now() })
  );
}

export function getArmedSummaryHubResumePaymentReadingId(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.sessionStorage.getItem(SUMMARY_HUB_RESUME_PAYMENT_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as { readingId?: string; armedAt?: number };
    if (
      typeof parsed.readingId !== 'string'
      || typeof parsed.armedAt !== 'number'
      || Date.now() - parsed.armedAt > SUMMARY_HUB_RESUME_PAYMENT_TTL_MS
    ) {
      clearArmedSummaryHubResumePayment();
      return null;
    }

    return parsed.readingId.trim() || null;
  } catch {
    clearArmedSummaryHubResumePayment();
    return null;
  }
}

export function resolveSummaryHubResumeReadingIdForPaymentReturn(): string | null {
  const armedReadingId = getArmedSummaryHubResumePaymentReadingId();
  if (armedReadingId && loadSummaryHubResumeToken(armedReadingId)) {
    return armedReadingId;
  }

  const activeReadingId = getActiveSummaryHubResumeReadingId();
  if (activeReadingId && loadSummaryHubResumeToken(activeReadingId)) {
    return activeReadingId;
  }

  return null;
}

export function clearArmedSummaryHubResumePayment(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.removeItem(SUMMARY_HUB_RESUME_PAYMENT_STORAGE_KEY);
}

export function loadActiveSummaryHubResumeToken(): SummaryHubResumeToken | null {
  const readingId = getActiveSummaryHubResumeReadingId();
  return readingId ? loadSummaryHubResumeToken(readingId) : null;
}

export function loadActiveSummaryHubResumeSnapshot(): SummaryHubResumeSnapshot | null {
  const readingId = getActiveSummaryHubResumeReadingId();
  return readingId ? loadSummaryHubResumeSnapshot(readingId) : null;
}

export function beginSummaryHubResumeFlow(input: {
  readingId: string;
  targetTab: SummaryHubDetailTab;
  featureKey: string;
  ctaOriginSurface: ResumeCtaOrigin['surface'];
  birthInput: BirthInput;
  result: ReadingResponse;
  profileId?: string;
}): SummaryHubResumeToken {
  const token = createSummaryHubResumeToken({
    readingId: input.readingId,
    targetTab: input.targetTab,
    featureKey: input.featureKey,
    ctaOriginSurface: input.ctaOriginSurface,
  });

  saveSummaryHubResumeToken(token);
  saveSummaryHubResumeSnapshot({
    readingId: input.readingId,
    birthInput: input.birthInput,
    result: input.result,
    profileId: input.profileId,
  });
  setActiveSummaryHubResumeReadingId(input.readingId);

  return token;
}

export function advanceSummaryHubResumeToken(
  readingId: string,
  event: ResumeContractEvent
): { nextToken: SummaryHubResumeToken; destination: ResumeDestinationState } | null {
  const token = loadSummaryHubResumeToken(readingId);
  if (!token) {
    return null;
  }

  const resolved = resolveSummaryHubResumeDestination(token, event);
  saveSummaryHubResumeToken(resolved.nextToken);
  setActiveSummaryHubResumeReadingId(readingId);
  return resolved;
}

export function advanceActiveSummaryHubResume(
  event: ResumeContractEvent
): { nextToken: SummaryHubResumeToken; destination: ResumeDestinationState } | null {
  const readingId = getActiveSummaryHubResumeReadingId();
  return readingId ? advanceSummaryHubResumeToken(readingId, event) : null;
}

export function migrateSummaryHubResumeReadingId(
  previousReadingId: string,
  nextReadingId: string,
  nextResult?: ReadingResponse
): SummaryHubResumeToken | null {
  if (previousReadingId === nextReadingId) {
    return loadSummaryHubResumeToken(previousReadingId);
  }

  const token = loadSummaryHubResumeToken(previousReadingId);
  const snapshot = loadSummaryHubResumeSnapshot(previousReadingId);

  if (!token || !snapshot) {
    return null;
  }

  const migratedToken: SummaryHubResumeToken = {
    ...token,
    readingId: nextReadingId,
    returnState: {
      authReturn: { ...token.returnState.authReturn, readingId: nextReadingId },
      signupComplete: { ...token.returnState.signupComplete, readingId: nextReadingId },
      paymentSuccess: { ...token.returnState.paymentSuccess, readingId: nextReadingId },
      paymentFailure: { ...token.returnState.paymentFailure, readingId: nextReadingId },
      paymentCancel: { ...token.returnState.paymentCancel, readingId: nextReadingId },
    },
  };

  const baseResult = nextResult ?? snapshot.result;
  const migratedSnapshot: SummaryHubResumeSnapshot = {
    ...snapshot,
    readingId: nextReadingId,
    result: {
      ...baseResult,
      meta: {
        ...baseResult.meta,
        reading_id: nextReadingId,
      },
    },
  };

  saveSummaryHubResumeToken(migratedToken);
  saveSummaryHubResumeSnapshot(migratedSnapshot);

  if (getActiveSummaryHubResumeReadingId() === previousReadingId) {
    setActiveSummaryHubResumeReadingId(nextReadingId);
  }

  if (getArmedSummaryHubResumePaymentReadingId() === previousReadingId) {
    armSummaryHubResumePayment(nextReadingId);
  }

  clearSummaryHubResumeToken(previousReadingId);
  clearSummaryHubResumeSnapshot(previousReadingId);
  return migratedToken;
}

export function clearSummaryHubResumeFlow(readingId: string): void {
  clearSummaryHubResumeToken(readingId);
  clearSummaryHubResumeSnapshot(readingId);

  if (getActiveSummaryHubResumeReadingId() === readingId) {
    clearActiveSummaryHubResumeReadingId();
  }

  if (getArmedSummaryHubResumePaymentReadingId() === readingId) {
    clearArmedSummaryHubResumePayment();
  }
}
