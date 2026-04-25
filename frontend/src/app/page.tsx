'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import styles from './page.module.css';
import InputForm from '@/components/InputForm';
import LoadingScreen from '@/components/LoadingScreen';
import ReferralCTA from '@/components/ReferralCTA';
import ResultTabs from '@/components/ResultTabs';
import { startReadingWithPolling, getPendingJob, getPendingReadingStart, clearPendingReadingStart, pollJobResult, clearPendingJob, saveProfile, ProgressInfo, getCachedReading, getCachedReadingByProfile, getProfiles, getReadingDetail, trackFunnelStep } from '@/lib/api';
import { BirthInput, ModelSelection, ReadingResponse } from '@/types';
import { ArrowLeft, RefreshCw, Clover, User, AlertCircle } from 'lucide-react';
import { jijiToTime, normalizeJijiKey } from '@/utils/jijiTime';
import { clearProgressInput, saveRecentInput } from '@/utils/cachedInput';
import IOSInstallPrompt from '@/components/IOSInstallPrompt';
import ThemeToggle from '@/components/ThemeToggle';
import WelcomeModal from '@/components/WelcomeModal';
import SeasonalBanner from '@/components/SeasonalBanner';
import { useAuth } from '@/contexts/AuthContext';
import { usePayment } from '@/contexts/PaymentContext';
import { useAnalytics } from '@/hooks/useAnalytics';
import { getSessionId } from '@/lib/analytics';
import { ONBOARDING_ANALYSIS_KEY } from '@/types/onboarding';
import { TabKey } from '@/components/result/types';
import {
  clearSummaryHubResumeFlow,
  loadActiveSummaryHubResumeSnapshot,
  loadActiveSummaryHubResumeToken,
  ResumeDestinationFocus,
  resolveSummaryHubResumeDestination,
} from '@/lib/summaryHubResume';
import {
  buildSummaryHubResumeOutcomeTrackingKey,
  hasTrackedSummaryHubResumeOutcome,
  markSummaryHubResumeOutcomeTracked,
  trackSummaryHubResumeOutcome,
} from '@/lib/summaryHubAnalytics';
import { publicBusinessSummary, publicContactSummary, publicMailOrderNumber, publicSiteUrl } from '@/lib/publicConfig';

const siteUrl = publicSiteUrl;

const serviceJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  name: 'AI 사주 분석',
  description: '전통 명리학과 AI를 결합한 사주팔자 해석 서비스. 연애운, 금전운, 커리어운, 대운 분석, 궁합까지 생년월일만 입력하면 무료로 확인할 수 있습니다.',
  provider: {
    '@type': 'Organization',
    name: '사주 리포트',
    url: siteUrl,
  },
  serviceType: 'AI 사주 분석',
  areaServed: {
    '@type': 'Country',
    name: 'KR',
  },
  availableChannel: {
    '@type': 'ServiceChannel',
    serviceUrl: siteUrl,
    serviceType: '온라인 서비스',
  },
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'KRW',
    description: '무료 사주 분석 제공',
  },
};

function normalizeLegacyCompatibilityLabel(response: ReadingResponse): ReadingResponse {
  const compatibility = response.tabs?.compatibility;
  const legacyLabel = (compatibility as { chemistry_mbti?: string } | undefined)?.chemistry_mbti;

  if (!compatibility || compatibility.relationship_label || !legacyLabel) {
    return response;
  }

  const restCompatibility = {
    ...compatibility,
  } as typeof compatibility & {
    chemistry_mbti?: string;
  };

  delete restCompatibility.chemistry_mbti;

  return {
    ...response,
    tabs: {
      ...response.tabs,
      compatibility: {
        ...restCompatibility,
        relationship_label: legacyLabel,
      },
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeLoadedBirthInput(raw: unknown): BirthInput | null {
  if (!isRecord(raw)) return null;

  const birthSolar = typeof raw.birth_solar === 'string' ? raw.birth_solar.trim() : '';
  const birthJiji = typeof raw.birth_jiji === 'string' && raw.birth_jiji.trim()
    ? raw.birth_jiji.trim()
    : undefined;
  const birthTimeRaw = typeof raw.birth_time === 'string' ? raw.birth_time.trim() : '';
  const birthTime = birthTimeRaw || (birthJiji ? jijiToTime(birthJiji) : '12:00');
  const gender = raw.gender === 'female' ? 'female' : raw.gender === 'male' ? 'male' : null;

  if (!birthSolar || !gender) {
    return null;
  }

  const personaCandidate = typeof raw.persona === 'string' ? raw.persona : '';
  const persona =
    personaCandidate === 'classic'
    || personaCandidate === 'warm'
    || personaCandidate === 'witty'
    || personaCandidate === 'mz'
      ? personaCandidate
      : 'classic';

  return {
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : undefined,
    birth_solar: birthSolar,
    birth_time: birthTime,
    birth_jiji: birthJiji,
    timezone: typeof raw.timezone === 'string' && raw.timezone.trim() ? raw.timezone : 'Asia/Seoul',
    birth_place: typeof raw.birth_place === 'string' ? raw.birth_place : '',
    calendar_type: raw.calendar_type === 'lunar' ? 'lunar' : 'solar',
    gender,
    persona,
  };
}

function isReadingResponseShape(raw: unknown): raw is ReadingResponse {
  if (!isRecord(raw)) return false;
  return typeof raw.one_liner === 'string'
    && typeof raw.rendered_markdown === 'string'
    && isRecord(raw.tabs)
    && isRecord(raw.meta)
    && isRecord(raw.pillars)
    && isRecord(raw.card);
}

function normalizeLoadedReadingResponse(raw: unknown): ReadingResponse | null {
  if (!isReadingResponseShape(raw)) {
    return null;
  }

  return raw;
}

function getApiErrorStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return null;
  }

  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : null;
}

export default function Home() {
  const router = useRouter();
  const { token, isLoading: isAuthLoading, isAuthenticated, user, isFirstSignup, oauthProfile, clearFirstSignupState } = useAuth();
  useAnalytics({ autoTrackPageView: true, pageName: 'home' });

  const trackFunnel = useCallback(
    (step: 'input_started' | 'result_received' | 'profile_saved', stepData?: Record<string, unknown>) => {
      const sessionId = getSessionId();
      if (!sessionId) return;
      void trackFunnelStep(sessionId, step, stepData, token || undefined);
    },
    [token]
  );

  // 결제 관련
  const { refreshWallet } = usePayment();
  const [isPaidReading, setIsPaidReading] = useState(false);
  const [paymentTransactionId, setPaymentTransactionId] = useState<string | null>(null);

  // 첫 가입 시 OAuth 정보로 폼 초기값 계산
  const oauthInitialValues = useMemo(() => {
    if (!isFirstSignup || !oauthProfile) {
      return undefined; // 기존 default 값 사용
    }

    const values: {
      name?: string;
      gender?: 'male' | 'female';
      birthYear?: string;
      birthMonth?: string;
      birthDay?: string;
    } = {};

    // 이름 설정
    if (oauthProfile.name) {
      values.name = oauthProfile.name;
    }

    // 성별 설정 (향후 OAuth 승인 후 사용)
    if (oauthProfile.gender) {
      const g = oauthProfile.gender.toLowerCase();
      if (g === 'male' || g === 'm') values.gender = 'male';
      else if (g === 'female' || g === 'f') values.gender = 'female';
    }

    // 생년월일 설정 (향후 OAuth 승인 후 사용)
    if (oauthProfile.birthyear) {
      values.birthYear = oauthProfile.birthyear;
    }
    if (oauthProfile.birthday) {
      // MMDD 또는 MM-DD 형식 파싱
      const bd = oauthProfile.birthday.replace('-', '');
      if (bd.length >= 4) {
        values.birthMonth = bd.substring(0, 2);
        values.birthDay = bd.substring(2, 4);
      }
    }

    return Object.keys(values).length > 0 ? values : undefined;
  }, [isFirstSignup, oauthProfile]);

  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ReadingResponse | null>(null);
  const [birthInput, setBirthInput] = useState<BirthInput | null>(null);
  const [profileId, setProfileId] = useState<string | undefined>(undefined);
  const [isReadOnlyShared, setIsReadOnlyShared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileSaveWarning, setProfileSaveWarning] = useState<string | null>(null);
  const [, setJobStatus] = useState<string>('');
  const [progressInfo, setProgressInfo] = useState<ProgressInfo | null>(null);
  const [isWelcomeModalOpen, setIsWelcomeModalOpen] = useState(false);
  const [initialResultTab, setInitialResultTab] = useState<TabKey | null>(null);
  const [initialResumeTargetTab, setInitialResumeTargetTab] = useState<TabKey | null>(null);
  const [initialResumeFocus, setInitialResumeFocus] = useState<ResumeDestinationFocus | null>(null);

  const birthInputInitialValues = useMemo(() => {
    if (!birthInput || result) return undefined;
    const values: {
      name?: string;
      gender?: 'male' | 'female';
      birthYear?: string;
      birthMonth?: string;
      birthDay?: string;
      birthJiji?: string;
      calendarType?: 'solar' | 'lunar';
    } = {};
    if (birthInput.name) values.name = birthInput.name;
    if (birthInput.gender) values.gender = birthInput.gender;
    if (birthInput.calendar_type) values.calendarType = birthInput.calendar_type;
    if (birthInput.birth_jiji) values.birthJiji = normalizeJijiKey(birthInput.birth_jiji);
    if (birthInput.birth_solar) {
      const parts = birthInput.birth_solar.split('-');
      if (parts.length === 3) {
        values.birthYear = parts[0];
        values.birthMonth = parts[1];
        values.birthDay = parts[2];
      }
    }
    return Object.keys(values).length > 0 ? values : undefined;
  }, [birthInput, result]);

  const formInitialValues = oauthInitialValues ?? birthInputInitialValues;

  // 첫 가입 시 환영 모달 표시
  useEffect(() => {
    if (isFirstSignup && isAuthenticated) {
      const activeResume = loadActiveSummaryHubResumeToken();
      if (activeResume) {
        return;
      }
      setIsWelcomeModalOpen(true);
    }
  }, [isFirstSignup, isAuthenticated]);

  const handleWelcomeModalClose = () => {
    setIsWelcomeModalOpen(false);
    clearFirstSignupState();
  };

  const abortControllerRef = useRef<AbortController | null>(null);
  const loadingHandoffKeyRef = useRef<string | null>(null);
  const recoveringPendingRef = useRef(false);

  const hydrateEntitledLoadedResult = useCallback(async (
    sourceResult: ReadingResponse,
    options: {
      allowDetailHydration: boolean;
      authToken?: string;
    }
  ): Promise<{ resolvedResult: ReadingResponse; hasDetailEntitlement: boolean }> => {
    const summaryResult = normalizeLegacyCompatibilityLabel(sourceResult);

    if (!options.allowDetailHydration) {
      return { resolvedResult: summaryResult, hasDetailEntitlement: false };
    }

    const readingId = sourceResult.meta?.reading_id;
    if (!readingId) {
      return { resolvedResult: summaryResult, hasDetailEntitlement: false };
    }

    try {
      const detailResult = await getReadingDetail(readingId, options.authToken);
      return {
        resolvedResult: normalizeLegacyCompatibilityLabel(detailResult),
        hasDetailEntitlement: true,
      };
    } catch (error) {
      const status = getApiErrorStatus(error);
      if (status === 403 || status === 404) {
        console.info('[Loaded result] Detail entitlement not available, falling back to summary result.', { readingId, status });
      } else {
        console.warn('[Loaded result] Failed to hydrate detail entitlement, falling back to summary result.', { readingId, status, error });
      }

      return { resolvedResult: summaryResult, hasDetailEntitlement: false };
    }
  }, []);

  const proceedWithAnalysis = useCallback(async (input: BirthInput, model: ModelSelection, forcedProfileId?: string) => {
    setIsLoading(true);
    setIsReadOnlyShared(false);
    setIsPaidReading(false);
    setPaymentTransactionId(null);
    setProfileSaveWarning(null);
    setInitialResultTab(null);
    setInitialResumeTargetTab(null);
    setInitialResumeFocus(null);

    abortControllerRef.current?.abort();

    const previousProfileId = profileId;
    const activeProfileId = forcedProfileId ?? profileId;

    if (activeProfileId) {
      setProfileId(activeProfileId);
    }

    setBirthInput(input);
    setJobStatus('pending');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const tokenForApi = token || undefined;
      const response = await startReadingWithPolling(
        { input, model, profile_id: activeProfileId },
        setJobStatus,
        undefined,
        controller.signal,
        tokenForApi,
        setProgressInfo
      );

      if (isAuthenticated) {
        await refreshWallet();
      }

      setResult(normalizeLegacyCompatibilityLabel(response));
      setInitialResultTab(null);
      setInitialResumeTargetTab(null);
      setInitialResumeFocus(null);
      clearProgressInput(user?.user_id);
      sessionStorage.removeItem(ONBOARDING_ANALYSIS_KEY);
      saveRecentInput({
        name: input.name,
        birth_solar: input.birth_solar,
        birth_time: input.birth_time,
        birth_jiji: input.birth_jiji ? normalizeJijiKey(input.birth_jiji) : undefined,
        timezone: input.timezone,
        birth_place: input.birth_place,
        calendar_type: input.calendar_type,
        gender: input.gender,
        persona: input.persona,
      }, user?.user_id);

      if (isAuthenticated && input.birth_solar) {
        const birthJiji = input.birth_jiji || '';
        try {
          const existingProfiles = await getProfiles(tokenForApi);
          const duplicateProfile = existingProfiles.find(p =>
            p.birth_date === input.birth_solar
            && p.hour_branch === birthJiji
            && p.calendar_type === (input.calendar_type || 'solar')
            && p.gender === (input.gender || 'male')
            && (p.persona || 'classic') === (input.persona || 'classic')
          );

          if (duplicateProfile) {
            setProfileId(duplicateProfile.id);
          } else {
            const saved = await saveProfile(tokenForApi, {
              label: input.name || '내 사주',
              birth_date: input.birth_solar,
              hour_branch: birthJiji,
              calendar_type: input.calendar_type || 'solar',
              gender: input.gender || 'male',
              persona: input.persona || 'classic',
              source_cache_id: response.meta?.cache_id || undefined,
              source_reading_id: response.meta?.reading_id || undefined,
            });
            setProfileId(saved.id);
            trackFunnel('profile_saved', {
              profile_id: saved.id,
              reading_id: response.meta?.reading_id,
            });
          }
        } catch (e) {
          console.error('[Auto-save] Failed to save profile:', e);
          setProfileSaveWarning('분석은 완료됐지만 마이페이지 저장이 바로 끝나지 않았어요. 잠시 후 다시 확인하거나 한 번 더 저장해 주세요.');
        }
      }

      trackFunnel('result_received', {
        reading_id: response.meta?.reading_id,
        source: 'input_submit',
      });
    } catch (err) {
      if (isAuthenticated) {
        await refreshWallet();
      }
      setProfileId(previousProfileId);
      const status =
        typeof err === 'object' && err !== null && 'status' in err
          ? (err as { status?: unknown }).status
          : undefined;
      if (status === 400 || status === 401 || status === 402 || status === 403 || status === 429) {
        clearPendingReadingStart();
      }
      if (!(err instanceof Error && (err.message.includes('취소') || err.name === 'AbortError'))) {
        setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다');
      }
    } finally {
      setIsLoading(false);
      setJobStatus('');
      setProgressInfo(null);
      abortControllerRef.current = null;
    }
  }, [isAuthenticated, profileId, refreshWallet, token, trackFunnel, user?.user_id]);

  useEffect(() => {
    if (isAuthLoading) return;

    if (isAuthenticated) {
      // 0. 온보딩 완료 후 자동 분석 시작 체크
      const onboardingData = sessionStorage.getItem(ONBOARDING_ANALYSIS_KEY);
      if (onboardingData) {
        try {
          const { input, model, shouldAutoStart } = JSON.parse(onboardingData);
          if (shouldAutoStart && input) {
            setBirthInput(input);
            void proceedWithAnalysis(input, model);
            return;
          }
        } catch (e) {
          console.error('Failed to parse onboarding analysis data:', e);
        }
      }
    }

    // 1. 마이페이지에서 불러온 저장된 결과가 있는지 확인
    const loadedProfileId = sessionStorage.getItem('loaded_profile_id');
    const loadedInput = sessionStorage.getItem('loaded_input');
    const loadedHistoryId = sessionStorage.getItem('loaded_history_id');
    const loadedResult = sessionStorage.getItem('loaded_result');
    const needsReanalysis = sessionStorage.getItem('loaded_needs_reanalysis');
    const loadedReadonlyMode = sessionStorage.getItem('loaded_readonly_mode');

    if (loadedInput && (loadedProfileId || loadedResult)) {
      const handoffKey = `${loadedProfileId}::${loadedHistoryId || ''}::${loadedInput}`;
      if (loadingHandoffKeyRef.current === handoffKey) {
        return;
      }
      loadingHandoffKeyRef.current = handoffKey;

      const clearLoadedKeys = () => {
        sessionStorage.removeItem('loaded_profile_id');
        sessionStorage.removeItem('loaded_input');
        sessionStorage.removeItem('loaded_history_id');
        sessionStorage.removeItem('loaded_result');
        sessionStorage.removeItem('loaded_needs_reanalysis');
        sessionStorage.removeItem('loaded_readonly_mode');
        loadingHandoffKeyRef.current = null;
      };

      try {
        const input = normalizeLoadedBirthInput(JSON.parse(loadedInput));
        if (!input) {
          setIsLoading(false);
          setError('불러온 프로필 데이터 형식이 올바르지 않습니다. 마이페이지에서 다시 선택해 주세요.');
          clearLoadedKeys();
          return;
        }

        setBirthInput(input);
        setProfileId(loadedProfileId || undefined);
        setIsReadOnlyShared(loadedReadonlyMode === 'received');
        setIsLoading(true);

        const applyLoadedResult = async (sourceResult: ReadingResponse) => {
          const { resolvedResult, hasDetailEntitlement } = await hydrateEntitledLoadedResult(sourceResult, {
            allowDetailHydration: isAuthenticated && loadedReadonlyMode !== 'received',
            authToken: token || undefined,
          });

          setResult(resolvedResult);
          setIsPaidReading(hasDetailEntitlement);
          setPaymentTransactionId(null);
          setInitialResultTab(null);
          setInitialResumeTargetTab(null);
          setInitialResumeFocus(null);
          setError(null);
          setIsLoading(false);
          clearLoadedKeys();
        };

        if (loadedResult) {
          try {
            const parsedRawResult = normalizeLoadedReadingResponse(JSON.parse(loadedResult));
            if (parsedRawResult) {
              void applyLoadedResult(parsedRawResult);
              return;
            }

            console.error('Loaded result missing required fields');
          } catch (e) {
            console.error('Failed to parse loaded result:', e);
          }
        }

        // 재분석 요청: 캐시 조회 없이 InputForm pre-fill만 수행
        if (needsReanalysis) {
          setIsLoading(false);
          clearLoadedKeys();
          return;
        }

        if (!loadedProfileId) {
          setIsLoading(false);
          setError('공유 데이터 연결이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.');
          clearLoadedKeys();
          return;
        }

        const activeLoadedProfileId = loadedProfileId;


        const fetchCachedResult = async () => {
          try {
            const resolvedToken = token || undefined;

            const byProfileResult = await getCachedReadingByProfile(activeLoadedProfileId, resolvedToken);
            let cachedResult = byProfileResult;

            if (byProfileResult === null) {
              cachedResult = await getCachedReading({
                birth_date: input.birth_solar,
                hour_branch: input.birth_jiji || '',
                calendar_type: input.calendar_type || 'solar',
                gender: input.gender,
                persona: input.persona
              }, resolvedToken);
            }

            if (cachedResult) {
              await applyLoadedResult(cachedResult);
            } else {
              setIsLoading(false);
              setError('이전 분석 결과를 찾지 못했습니다. 아래 정보를 확인하고 다시 분석해주세요.');
              clearLoadedKeys();
            }
          } catch (e) {
            console.error('Failed to fetch cached result:', e);
            setIsLoading(false);
            if (e instanceof Error && e.message === 'AUTH_REQUIRED') {
              setError('로그인 세션이 만료되었습니다. 다시 로그인 후 시도해주세요.');
              loadingHandoffKeyRef.current = null;
              return;
            }
            setError(e instanceof Error ? e.message : '데이터를 불러오는데 실패했습니다.');
            clearLoadedKeys();
          }
        };
        fetchCachedResult();
        return;
      } catch (e) {
        console.error('Failed to parse loaded input:', e);
        clearLoadedKeys();
      }
    }

    // 2. 마이페이지에서 선택한 프로필 (결과 없음 → 입력만 복원, 자동 재분석 없음)
    const selectedProfile = sessionStorage.getItem('selected_profile');
    if (selectedProfile) {
      sessionStorage.removeItem('selected_profile');
      try {
        const profile = JSON.parse(selectedProfile);
        setIsReadOnlyShared(false);
        const input: BirthInput = {
          name: profile.label,
          birth_solar: profile.birth_date,
          birth_time: jijiToTime(profile.hour_branch), // 지지 → 대표 시간 변환
          birth_jiji: profile.hour_branch, // 지지 한자 (子, 丑 등)
          calendar_type: profile.calendar_type,
          gender: profile.gender,
          timezone: profile.timezone || 'Asia/Seoul',
          birth_place: profile.birth_place || '',
          persona: profile.persona || 'classic', // 페르소나 (기본값: 정통도사)
        };

        setProfileId(profile.id);
        setBirthInput(input);
        setInitialResultTab(null);
        setInitialResumeTargetTab(null);
        setInitialResumeFocus(null);
        setError('저장된 캐시가 없어 자동 재분석은 수행하지 않았습니다. 필요하면 직접 분석 버튼을 눌러주세요.');
        return;
      } catch (e) {
        console.error('Failed to parse selected profile:', e);
      }
    }

    const activeResumeToken = loadActiveSummaryHubResumeToken();
    const activeResumeSnapshot = loadActiveSummaryHubResumeSnapshot();

    if (activeResumeToken && activeResumeSnapshot) {
      const { destination } = resolveSummaryHubResumeDestination(activeResumeToken, 'refresh');
      const outcomeTrackingKey = buildSummaryHubResumeOutcomeTrackingKey(activeResumeToken);

      if (destination.pathname === '/') {
        setBirthInput(activeResumeSnapshot.birthInput);
        setProfileId(activeResumeSnapshot.profileId);
        setIsReadOnlyShared(false);
        setResult(normalizeLegacyCompatibilityLabel(activeResumeSnapshot.result));
        setIsPaidReading(destination.detailUnlocked);
        setPaymentTransactionId(null);
        setInitialResultTab(destination.focus === 'paid_detail' ? destination.activeTab : null);
        setInitialResumeTargetTab(destination.activeTab);
        setInitialResumeFocus(destination.focus);
        setError(null);
        setProfileSaveWarning(null);
        setIsLoading(false);
        setProgressInfo(null);
        abortControllerRef.current = null;
        recoveringPendingRef.current = false;
        const resumeOutcome = activeResumeToken.checkpoint.lastEvent;
        if (resumeOutcome !== 'created' && !hasTrackedSummaryHubResumeOutcome(outcomeTrackingKey)) {
          markSummaryHubResumeOutcomeTracked(outcomeTrackingKey);
          void trackSummaryHubResumeOutcome({
            token: activeResumeToken,
            destination,
            outcome: resumeOutcome,
          });
        }
        return;
      }
    }

    // 3. 이전에 진행 중이던 작업 복구
    const recoverPendingJob = async () => {
      if (recoveringPendingRef.current) {
        return;
      }

      const pendingStart = getPendingReadingStart();
      if (pendingStart) {
        recoveringPendingRef.current = true;
        setIsLoading(true);
        setBirthInput(pendingStart.request.input);

        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
          const response = await startReadingWithPolling(
            pendingStart.request,
            setJobStatus,
            undefined,
            controller.signal,
            token || undefined,
            setProgressInfo,
            pendingStart.clientRequestId,
          );
          setResult(normalizeLegacyCompatibilityLabel(response));
          setInitialResultTab(null);
          setInitialResumeTargetTab(null);
          setInitialResumeFocus(null);
          trackFunnel('result_received', {
            reading_id: response.meta?.reading_id,
            source: 'pending_start_recovery',
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : '이전 분석 복구 실패';
          const isCancelled = err instanceof Error && err.message.includes('취소');

          if (!isCancelled) {
            setError(message);
            clearPendingReadingStart();
          }
        } finally {
          setIsLoading(false);
          setProgressInfo(null);
          abortControllerRef.current = null;
          recoveringPendingRef.current = false;
        }
        return;
      }

      const pendingJob = getPendingJob();
      if (pendingJob) {
        recoveringPendingRef.current = true;
        setIsLoading(true);
        setBirthInput(pendingJob.request.input);

        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
          const response = await pollJobResult(pendingJob.jobId, setJobStatus, 900, 1000, controller.signal, undefined, setProgressInfo);
          setResult(normalizeLegacyCompatibilityLabel(response));
          setInitialResultTab(null);
          setInitialResumeTargetTab(null);
          setInitialResumeFocus(null);
          trackFunnel('result_received', {
            reading_id: response.meta?.reading_id,
            source: 'pending_recovery',
          });
        } catch (err) {
          if (!(err instanceof Error && err.message.includes('취소'))) {
            setError(err instanceof Error ? err.message : '이전 분석 복구 실패');
          }
          clearPendingJob();
        } finally {
          setIsLoading(false);
          setProgressInfo(null);
          abortControllerRef.current = null;
          recoveringPendingRef.current = false;
        }
      } else {
        recoveringPendingRef.current = false;
      }
    };

    recoverPendingJob();
  }, [hydrateEntitledLoadedResult, isAuthLoading, isAuthenticated, proceedWithAnalysis, token, trackFunnel]);

  const handleMyPage = () => {
    router.push('/mypage');
  };



  const handleSubmit = async (input: BirthInput, model: ModelSelection) => {
    setError(null);

    trackFunnel('input_started', {
      calendar_type: input.calendar_type || 'solar',
      persona: input.persona || 'classic',
    });

    // 첫 가입 상태 초기화 (다음 접속 시에는 미리 채우지 않음)
    if (isFirstSignup) {
      clearFirstSignupState();
    }

    // Duplicate profile warning
    let duplicateProfileId: string | undefined;

    if (isAuthenticated && input.birth_solar) {
      try {
        const existingProfiles = await getProfiles(token || undefined);
        const birthJiji = input.birth_jiji || '';
        const duplicateProfile = existingProfiles.find(p =>
          p.birth_date === input.birth_solar &&
          p.hour_branch === birthJiji &&
          p.calendar_type === (input.calendar_type || 'solar') &&
          p.gender === (input.gender || 'male') &&
          (p.persona || 'classic') === (input.persona || 'classic')
        );
        if (duplicateProfile) {
          const confirmed = window.confirm('이미 분석한 사주가 있어요.\n다시 분석하면 새 사주가 저장됩니다. 계속할까요?');
          if (!confirmed) return;
          duplicateProfileId = duplicateProfile.id;
        }
      } catch (e) {
        console.error('[Duplicate check] Failed:', e);
        setError('프로필 상태를 확인하지 못해 분석을 시작할 수 없어요. 잠시 후 다시 시도해 주세요.');
        return;
      }
    }

    await proceedWithAnalysis(input, model, duplicateProfileId);
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsLoading(false);
    setJobStatus('');
    setProgressInfo(null);
    clearPendingReadingStart();
    clearPendingJob();
  };

  const handleReset = () => {
    const activeReadingId = result?.meta?.reading_id;
    if (activeReadingId) {
      clearSummaryHubResumeFlow(activeReadingId);
    }

    // 현재 사주 이미지 sessionStorage 클리어
    const imageKey = `saju_image_${result?.meta?.reading_id || profileId || 'default'}`;
    sessionStorage.removeItem(imageKey);

    setResult(null);
    setBirthInput(null);
    setProfileId(undefined);
    setIsReadOnlyShared(false);
    setError(null);
    setProfileSaveWarning(null);
    setIsPaidReading(false);
    setPaymentTransactionId(null);
    setInitialResultTab(null);
    setInitialResumeTargetTab(null);
    setInitialResumeFocus(null);
  };


  if (isAuthLoading) {
    return (
      <main className={styles.main}>
        <div className={styles.loadingContainer}>
          <div className={styles.spinner} />
        </div>
      </main>
    );
  }

  return (
    <main className={styles.main} data-testid="home-page">
      <script type="application/ld+json">{JSON.stringify(serviceJsonLd)}</script>
      <LoadingScreen
        isVisible={isLoading}
        onCancel={handleCancel}
        progress={progressInfo?.progress}
        completedTabs={progressInfo?.completedTabs}
        totalTabs={progressInfo?.totalTabs}
      />

      <div className={styles.content}>

        {/* 항상 보이는 상단 액션 버튼들 */}
        <div className={styles.topActions}>
          <ThemeToggle />
          <button
            type="button"
            className={styles.mypageButton}
            onClick={handleMyPage}
            title="마이페이지"
            aria-label="마이페이지"
            data-testid="mypage-open-button"
          >
            <User size={20} />
          </button>
        </div>

        {!result && (
          <>
            <SeasonalBanner />
            <header className={styles.header}>
              <div className={styles.title}>
                <Image
                  src="/icons/saju_dosa_v2.png"
                  alt="귀여운 AI 점술가"
                  width={540}
                  height={540}
                  priority
                  className={styles.titleIcon}
                />
                <h1>AI 운세 리포트</h1>
              </div>
              <p className={styles.subtitle}>
                당신의 운명, 귀여운 AI 도사가 알려드려요! <Clover size={20} className={styles.inlineIcon} />
              </p>
              <div className={styles.trustBadges} data-testid="trust-badges">
                <span className={styles.trustBadge}>🔮 AI + 전통 명리학</span>
                <span className={styles.trustBadge}>🔒 개인정보 암호화</span>
                <span className={styles.trustBadge}>⚡ 최대 1분 분석</span>
              </div>
            </header>
          </>
        )}

        {!result ? (
          // 입력 폼 (Glass Card Style)
          <div className={`${styles.formCard} glass-card`} data-testid="analysis-form-card">
            <div className={styles.formCardInner}>
              <div className={`${styles.analysisNotice} ${styles.analysisNoticePaid}`} data-testid="summary-hub-entry-notice">
                <Clover size={14} />
                사주 입력 후 무료 요약 허브로 바로 이어집니다
              </div>

              <InputForm
                key={JSON.stringify(formInitialValues ?? {})}
                onSubmit={handleSubmit}
                isLoading={isLoading}
                cacheNamespace={user?.user_id}
                initialValues={formInitialValues}
              />
            </div>
          </div>
        ) : (
          // 결과 화면
          <div className={styles.resultContainer} data-testid="analysis-result-container">
            <div className={styles.resultHeader}>
              <button
                type="button"
                className={styles.backButton}
                onClick={handleReset}
              >
                <ArrowLeft size={16} />
                <span>처음으로</span>
              </button>
            </div>

            {profileSaveWarning && (
              <div className={`${styles.analysisNotice} ${styles.analysisNoticePaid}`}>
                <AlertCircle size={14} />
                {profileSaveWarning}
              </div>
            )}

            <ResultTabs
              key={`${result.meta?.reading_id || 'result'}:${initialResultTab ?? 'hub'}`}
              data={result}
              birthInput={birthInput}
              profileId={profileId}
              readingId={result.meta?.reading_id}
              isReadOnlyShared={isReadOnlyShared}
              isPaidReading={isPaidReading}
              paymentTransactionId={paymentTransactionId}
              initialActiveTab={initialResultTab}
              initialResumeTargetTab={initialResumeTargetTab}
              initialResumeFocus={initialResumeFocus}
            />

            <ReferralCTA variant="inline" surface="reading_result" />

            <div className={styles.actionSection}>
              <button
                type="button"
                className={styles.retryButton}
                onClick={handleReset}
                data-testid="reset-analysis-button"
              >
                <RefreshCw size={18} />
                <span>다른 운세도 볼래요?</span>
              </button>
            </div>
          </div>
        )}

        {/* 에러 메시지 */}
        {error && (
          <div className={styles.error}>
            <p>{error}</p>
            <button type="button" onClick={() => setError(null)}>닫기</button>
          </div>
        )}
      </div>


      <WelcomeModal
        isOpen={isWelcomeModalOpen}
        onClose={handleWelcomeModalClose}
        bonusAmount={100}
      />

      <footer className={styles.footer}>
        <p>AI가 분석한 운세입니다 · 재미로만 봐주세요!</p>
        <nav className={styles.footerNav}>
          <Link href="/about">서비스 소개</Link>
          <Link href="/privacy">개인정보처리방침</Link>
          <Link href="/terms">이용약관</Link>
        </nav>
        <p className={styles.businessInfo}>
          {publicBusinessSummary}
        </p>
        <p className={styles.businessInfo}>
          통신판매업신고: {publicMailOrderNumber}
        </p>
        <p className={styles.businessInfo}>
          {publicContactSummary}
        </p>
      </footer>

      {/* iOS 홈 화면 추가 안내 */}
      <IOSInstallPrompt />
    </main>
  );
}
