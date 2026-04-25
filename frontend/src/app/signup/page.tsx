'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/lib/apiBase';
import { useAuth } from '@/contexts/AuthContext';
import { advanceActiveSummaryHubResume, loadActiveSummaryHubResumeToken } from '@/lib/summaryHubResume';
import { SIGNUP_PROFILE_KEY, SignupProfileData } from '@/types/onboarding';
import styles from './page.module.css';

// 심사/정책 문서 버전 (필요 시 날짜/버전만 교체)
const TERMS_VERSION = '2026-01-22';
const PRIVACY_VERSION = '2026-01-22';

const SIGNUP_COMPLETE_KEY = 'signup_complete_v1';
const SEEN_ABOUT_KEY = 'seen_about_before_signup';
const ACTIVE_RESUME_KEY = 'summary-hub-resume:v1:active';
const PENDING_SIGNUP_KEY = 'pending_signup_v1';

type Gender = 'male' | 'female';

const AGE_RANGES = [
  { value: '10-19', label: '10대' },
  { value: '20-29', label: '20대' },
  { value: '30-39', label: '30대' },
  { value: '40-49', label: '40대' },
  { value: '50-59', label: '50대' },
  { value: '60-69', label: '60대' },
  { value: '70+', label: '70대 이상' },
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function normalizeBirthdayToMmdd(birthday?: string): { month?: string; day?: string } {
  if (!birthday) return {};
  const raw = birthday.replace(/-/g, '');
  if (raw.length !== 4) return {};
  return { month: raw.substring(0, 2), day: raw.substring(2, 4) };
}

export default function SignupPage() {
  const router = useRouter();
  const { isLoading, isAuthenticated, isFirstSignup, oauthProfile, token } = useAuth();

  const nowYear = useMemo(() => new Date().getFullYear(), []);

  const prefillBirthday = useMemo(() => normalizeBirthdayToMmdd(oauthProfile?.birthday), [oauthProfile?.birthday]);

  const [name, setName] = useState(oauthProfile?.name || '');
  const [gender, setGender] = useState<Gender | ''>(() => {
    const g = (oauthProfile?.gender || '').toLowerCase();
    if (g === 'male' || g === 'm') return 'male';
    if (g === 'female' || g === 'f') return 'female';
    return '';
  });
  const [birthYear, setBirthYear] = useState(oauthProfile?.birthyear || '');
  const [birthMonth, setBirthMonth] = useState(prefillBirthday.month || '');
  const [birthDay, setBirthDay] = useState(prefillBirthday.day || '');
  const [ageRange, setAgeRange] = useState('');
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!oauthProfile) return;
    if (oauthProfile.name && !name) setName(oauthProfile.name);
    if (oauthProfile.gender) {
      const g = oauthProfile.gender.toLowerCase();
      if ((g === 'male' || g === 'm') && !gender) setGender('male');
      if ((g === 'female' || g === 'f') && !gender) setGender('female');
    }
    if (oauthProfile.birthyear && !birthYear) setBirthYear(oauthProfile.birthyear);
    if (oauthProfile.birthday) {
      const bd = normalizeBirthdayToMmdd(oauthProfile.birthday);
      if (bd.month && !birthMonth) setBirthMonth(bd.month);
      if (bd.day && !birthDay) setBirthDay(bd.day);
    }
  }, [oauthProfile, name, gender, birthYear, birthMonth, birthDay]);

  useEffect(() => {
    if (isLoading) return;

    const activeResume = loadActiveSummaryHubResumeToken();
    const hasActiveResumeFlow = Boolean(activeResume) || Boolean(localStorage.getItem(ACTIVE_RESUME_KEY));
    const pendingSignup = sessionStorage.getItem(PENDING_SIGNUP_KEY) === 'true';

    if (!isAuthenticated) {
      router.replace('/onboarding');
      return;
    }

    const signupComplete = sessionStorage.getItem(SIGNUP_COMPLETE_KEY);
    if (signupComplete === 'true') {
      router.replace(hasActiveResumeFlow || pendingSignup ? '/' : '/signup/onboarding');
      return;
    }

    if (!isFirstSignup) {
      router.replace('/');
      return;
    }

    const seenAbout = sessionStorage.getItem(SEEN_ABOUT_KEY);
    if (!seenAbout && !hasActiveResumeFlow && !pendingSignup) {
      router.replace('/about?from=signup&return=signup');
    }
  }, [isLoading, isAuthenticated, isFirstSignup, router]);

  const monthOptions = useMemo(() => Array.from({ length: 12 }, (_, i) => pad2(i + 1)), []);
  const dayOptions = useMemo(() => Array.from({ length: 31 }, (_, i) => pad2(i + 1)), []);

  const canSubmit =
    name.trim().length > 0 &&
    (gender === 'male' || gender === 'female') &&
    birthYear.length === 4 &&
    Number(birthYear) >= 1900 &&
    Number(birthYear) <= nowYear &&
    birthMonth.length === 2 &&
    birthDay.length === 2 &&
    ageRange.length > 0 &&
    agreedTerms &&
    agreedPrivacy &&
    !isSubmitting;

  const handleSubmit = async () => {
    setError(null);

    if (!canSubmit) {
      setError('필수 항목을 모두 입력하고 필수 동의에 체크해주세요.');
      return;
    }

    try {
      setIsSubmitting(true);
      const birthdayMmdd = `${birthMonth}${birthDay}`;

      const res = await fetch(`${API_BASE_URL}/api/auth/signup/complete`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          gender,
          birthyear: Number(birthYear),
          birthday_mmdd: birthdayMmdd,
          age_range: ageRange,
          terms_version: TERMS_VERSION,
          privacy_version: PRIVACY_VERSION,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || '회원가입 처리 중 오류가 발생했습니다.');
      }

      const signupProfile: SignupProfileData = {
        name: name.trim(),
        gender: gender as 'male' | 'female',
        birthYear,
        birthMonth,
        birthDay,
      };
      sessionStorage.setItem(SIGNUP_PROFILE_KEY, JSON.stringify(signupProfile));

      sessionStorage.setItem(SIGNUP_COMPLETE_KEY, 'true');
      const hasActiveResumeFlow = Boolean(loadActiveSummaryHubResumeToken()) || Boolean(localStorage.getItem(ACTIVE_RESUME_KEY));
      const pendingSignup = sessionStorage.getItem(PENDING_SIGNUP_KEY) === 'true';
      if (hasActiveResumeFlow || pendingSignup) {
        advanceActiveSummaryHubResume('signup_complete');
        router.replace('/');
        return;
      }

      router.replace('/signup/onboarding');
    } catch (e) {
      setError(e instanceof Error ? e.message : '회원가입 처리 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <p>회원가입 정보를 준비 중입니다...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>회원가입</h1>
          <p className={styles.subtitle}>
            소셜 로그인 이후, 서비스 이용을 위해 필요한 정보를 확인합니다.
          </p>
        </div>

        <div className={styles.notice}>
          <div className={styles.noticeTitle}>필수 수집 항목 (회원가입 기준)</div>
          <div className={styles.noticeBody}>
            이름, 성별, 연령대, 생일(월/일), 출생 연도
          </div>
          <div className={styles.noticeHint}>
            가입 후 언제든지 <Link href="/mypage">마이페이지</Link>에서 회원 탈퇴가 가능합니다.
          </div>
        </div>

        <div className={styles.form}>
          <label className={styles.field}>
            <span className={styles.label}>이름 (필수)</span>
            <input
              className={styles.input}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="이름을 입력해주세요"
              autoComplete="name"
            />
          </label>

          <div className={styles.field}>
            <span className={styles.label}>성별 (필수)</span>
            <div className={styles.radioRow}>
              <button
                type="button"
                className={`${styles.radioBtn} ${gender === 'male' ? styles.active : ''}`}
                onClick={() => setGender('male')}
              >
                남성
              </button>
              <button
                type="button"
                className={`${styles.radioBtn} ${gender === 'female' ? styles.active : ''}`}
                onClick={() => setGender('female')}
              >
                여성
              </button>
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.label}>출생 정보 (필수)</span>
            <div className={styles.row3}>
              <input
                className={styles.input}
                inputMode="numeric"
                maxLength={4}
                value={birthYear}
                onChange={e => setBirthYear(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                placeholder="출생 연도 (YYYY)"
                aria-label="출생 연도"
              />
              <select
                className={styles.select}
                value={birthMonth}
                onChange={e => setBirthMonth(e.target.value)}
                aria-label="생일 월"
              >
                <option value="">월</option>
                {monthOptions.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <select
                className={styles.select}
                value={birthDay}
                onChange={e => setBirthDay(e.target.value)}
                aria-label="생일 일"
              >
                <option value="">일</option>
                {dayOptions.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          <label className={styles.field}>
            <span className={styles.label}>연령대 (필수)</span>
            <select
              className={styles.select}
              value={ageRange}
              onChange={e => setAgeRange(e.target.value)}
            >
              <option value="">선택해주세요</option>
              {AGE_RANGES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </label>

          <div className={styles.agreements}>
            <label className={styles.checkbox}>
              <input type="checkbox" checked={agreedTerms} onChange={e => setAgreedTerms(e.target.checked)} />
              <span>
                <Link href="/terms" target="_blank">이용약관</Link> 동의 (필수)
              </span>
            </label>
            <label className={styles.checkbox}>
              <input type="checkbox" checked={agreedPrivacy} onChange={e => setAgreedPrivacy(e.target.checked)} />
              <span>
                <Link href="/privacy" target="_blank">개인정보처리방침</Link> 동의 (필수)
              </span>
            </label>
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <button
            type="button"
            className={styles.submit}
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {isSubmitting ? '처리 중...' : '회원가입 완료'}
          </button>
        </div>
      </div>
    </div>
  );
}
