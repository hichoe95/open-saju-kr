'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import styles from './InputForm.module.css';
import { BirthInput, ModelSelection, Provider, ContextTopic, PersonaType, PersonaInfo } from '@/types';
import { JIJI_HOURS } from '@/types/onboarding';
import { Calendar, Clock, Sparkles, Target, User, MessageCircle } from 'lucide-react';
import { saveProgressInput, getProgressInput, getRecentInput } from '@/utils/cachedInput';
import { normalizeJijiKey } from '@/utils/jijiTime';

// 도사 페르소나 목록 (이미지 경로 포함)
const PERSONAS: Array<PersonaInfo & { image: string }> = [
    { value: 'mz', label: 'MZ 도사', description: '친근하고 트렌디한 분석', emoji: '', image: '/icons/persona/dosa_mz.png' },
    { value: 'witty', label: '위트있는 도사', description: '팩폭과 유머의 조화', emoji: '', image: '/icons/persona/dosa_witty.png' },
    { value: 'warm', label: '따뜻한 도사', description: '공감과 응원의 멘토', emoji: '', image: '/icons/persona/dosa_warm.png' },
    { value: 'classic', label: '정통 도사', description: '신비롭고 권위있는 전통', emoji: '', image: '/icons/persona/dosa_classic.png' },
];

interface InputFormProps {
    onSubmit: (input: BirthInput, model: ModelSelection) => void;
    isLoading: boolean;
    cacheNamespace?: string;
    initialValues?: {
        name?: string;
        gender?: 'male' | 'female';
        birthYear?: string;
        birthMonth?: string;
        birthDay?: string;
        birthJiji?: string;
        calendarType?: 'solar' | 'lunar';
    };
}

export default function InputForm({ onSubmit, isLoading, initialValues, cacheNamespace }: InputFormProps) {
    const progress = typeof window !== 'undefined' ? getProgressInput(cacheNamespace) : null;
    const recent = typeof window !== 'undefined' ? getRecentInput(cacheNamespace) : null;
    const [name, setName] = useState(initialValues?.name ?? progress?.name ?? recent?.name ?? '');
    const [gender, setGender] = useState<'male' | 'female'>(initialValues?.gender ?? progress?.gender ?? recent?.gender ?? 'male');
    const [birthYear, setBirthYear] = useState(initialValues?.birthYear ?? progress?.birth_solar?.split('-')[0] ?? recent?.birth_solar?.split('-')[0] ?? '1990');
    const [birthMonth, setBirthMonth] = useState(initialValues?.birthMonth ?? progress?.birth_solar?.split('-')[1] ?? recent?.birth_solar?.split('-')[1] ?? '01');
    const [birthDay, setBirthDay] = useState(initialValues?.birthDay ?? progress?.birth_solar?.split('-')[2] ?? recent?.birth_solar?.split('-')[2] ?? '01');
    const [calendarType, setCalendarType] = useState<'solar' | 'lunar'>(initialValues?.calendarType ?? progress?.calendar_type ?? recent?.calendar_type ?? 'solar');
    const [birthJiji, setBirthJiji] = useState(initialValues?.birthJiji ?? progress?.birth_jiji ?? (recent?.birth_jiji ? normalizeJijiKey(recent.birth_jiji) : 'unknown'));

    const [topic] = useState<ContextTopic>('general');
    const [details, setDetails] = useState('');
    const [isAgreed, setIsAgreed] = useState(false);
    const [persona, setPersona] = useState<PersonaType>('classic'); // 도사 페르소나

    // 입력값 변경 시 sessionStorage에 progress 저장
    const persistProgress = useCallback(() => {
        const solar = `${birthYear}-${birthMonth}-${birthDay}`;
        if (solar === '1990-01-01' && !name) return; // 기본값 미입력시 저장 안 함
        const selectedJiji = JIJI_HOURS.find(j => j.value === birthJiji);
        saveProgressInput({
            name,
            birth_solar: solar,
            birth_time: selectedJiji?.time || '12:00',
            birth_jiji: selectedJiji?.hanja || '',
            timezone: 'Asia/Seoul',
            birth_place: '대한민국',
            calendar_type: calendarType,
            gender,
            persona,
        }, cacheNamespace);
    }, [name, gender, birthYear, birthMonth, birthDay, birthJiji, calendarType, cacheNamespace, persona]);

    useEffect(() => {
        persistProgress();
    }, [persistProgress]);
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const birthDate = `${birthYear}-${birthMonth}-${birthDay}`;

        // 12지지 시간대에서 실제 시간 및 한자 추출
        const selectedJiji = JIJI_HOURS.find(j => j.value === birthJiji);
        const actualBirthTime = selectedJiji?.time || '12:00';
        const jijiHanja = selectedJiji?.hanja || '';

        const input: BirthInput = {
            name,
            birth_solar: birthDate,
            birth_time: actualBirthTime,
            birth_jiji: jijiHanja, // 지지 한자 (子, 丑 등) - 표시용
            timezone: 'Asia/Seoul',
            birth_place: '대한민국',
            birth_lunar: undefined,
            calendar_type: calendarType,
            gender,
            persona, // 도사 페르소나 스타일
            context: {
                topic,
                details: birthJiji === 'unknown' ? `[시간 미상] ${details}` : details,
            },
        };

        const model: ModelSelection = {
            provider: 'openai' as Provider,
            model_id: 'auto',
            temperature: 0.7,
        };

        onSubmit(input, model);
    };

    // 연도 생성
    const years = Array.from({ length: 85 }, (_, i) => String(2024 - i));
    const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
    const days = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));

    return (
        <form
            className={`${styles.form} ${isLoading ? styles.formLoading : ''}`}
            onSubmit={handleSubmit}
            data-testid="reading-input-form"
        >
            {/* 고지 배너 */}
            <div className={styles.disclaimer}>
                <Sparkles className={styles.disclaimerIcon} size={20} />
                <div>
                    <p>AI가 명리학 데이터를 기반으로 분석해드려요!</p>
                    <small>재미로만 참고해주세요. 맹신은 금물!</small>
                </div>
            </div>

            {/* 출생 정보 */}
            <div className={styles.section}>
                <h3 className={styles.sectionTitle}>
                    <Calendar size={18} style={{ display: 'inline', marginRight: '8px' }} />
                    출생 정보
                </h3>

                <div className={styles.field}>
                    <label className={styles.label} htmlFor="nameInput">
                        <User size={14} style={{ display: 'inline', marginRight: '4px' }} />
                        이름 (선택)
                    </label>
                    <input
                        id="nameInput"
                        type="text"
                        className={`input ${styles.input}`}
                        placeholder="이름을 알려주세요"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        data-testid="birth-name-input"
                    />
                </div>

                <div className={styles.field}>
                    <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
                        <legend className={styles.label}>성별</legend>
                        <div style={{ display: 'flex', gap: '16px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input
                                    type="radio"
                                    name="gender"
                                    value="male"
                                    checked={gender === 'male'}
                                    onChange={(e) => setGender(e.target.value as 'male' | 'female')}
                                    data-testid="gender-male"
                                />
                                남성
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input
                                    type="radio"
                                    name="gender"
                                    value="female"
                                    checked={gender === 'female'}
                                    onChange={(e) => setGender(e.target.value as 'male' | 'female')}
                                    data-testid="gender-female"
                                />
                                여성
                            </label>
                        </div>
                    </fieldset>
                </div>

                <div className={styles.field}>
                    <div className={styles.label} id="birthDateLabel">
                        출생 년/월/일
                    </div>
                    <fieldset style={{ border: 'none', padding: 0, margin: 0 }} aria-labelledby="birthDateLabel">
                        <legend className={styles.label}>양력/음력</legend>
                        <div style={{ display: 'flex', gap: '16px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input
                                    type="radio"
                                    name="calendarType"
                                    value="solar"
                                    checked={calendarType === 'solar'}
                                    onChange={() => setCalendarType('solar')}
                                    data-testid="calendar-solar"
                                />
                                양력
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input
                                    type="radio"
                                    name="calendarType"
                                    value="lunar"
                                    checked={calendarType === 'lunar'}
                                    onChange={() => setCalendarType('lunar')}
                                    data-testid="calendar-lunar"
                                />
                                음력
                            </label>
                        </div>
                    </fieldset>
                </div>

                <div className={styles.field}>
                    <div className={styles.dateRow}>
                        <div className={styles.selectWrapper}>
                            <select
                                className={`input ${styles.input}`}
                                value={birthYear}
                                onChange={(e) => setBirthYear(e.target.value)}
                                data-testid="birth-year-select"
                            >
                                {years.map(y => <option key={y} value={y}>{y}년</option>)}
                            </select>
                        </div>
                        <div className={styles.selectWrapper}>
                            <select
                                className={`input ${styles.input}`}
                                value={birthMonth}
                                onChange={(e) => setBirthMonth(e.target.value)}
                                data-testid="birth-month-select"
                            >
                                {months.map(m => <option key={m} value={m}>{m}월</option>)}
                            </select>
                        </div>
                        <div className={styles.selectWrapper}>
                            <select
                                className={`input ${styles.input}`}
                                value={birthDay}
                                onChange={(e) => setBirthDay(e.target.value)}
                                data-testid="birth-day-select"
                            >
                                {days.map(d => <option key={d} value={d}>{d}일</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                <div className={styles.field}>
                    <label className={styles.label} htmlFor="birthJijiSelect">
                        <Clock size={14} style={{ display: 'inline', marginRight: '4px' }} />
                        태어난 시간 (시주)
                    </label>
                    <div className={styles.selectWrapper}>
                        <select
                            id="birthJijiSelect"
                            className={`input ${styles.input}`}
                            value={birthJiji}
                            onChange={(e) => setBirthJiji(e.target.value)}
                            data-testid="birth-time-select"
                        >
                            {JIJI_HOURS.map(j => (
                                <option key={j.value} value={j.value}>{j.label}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* 도사 페르소나 선택 */}
            <div className={styles.section}>
                <h3 className={styles.sectionTitle}>
                    <MessageCircle size={18} style={{ display: 'inline', marginRight: '8px' }} />
                    분석 스타일 선택
                </h3>
                <p className={styles.sectionDesc}>
                    어떤 스타일의 도사에게 분석을 받고 싶으세요?
                </p>
                <div className={styles.personaGrid}>
                    {PERSONAS.map((p) => (
                        <button
                            key={p.value}
                            type="button"
                            className={`${styles.personaCard} ${persona === p.value ? styles.personaCardSelected : ''}`}
                            onClick={() => setPersona(p.value)}
                            data-testid={`persona-${p.value}`}
                        >
                            <div className={styles.personaImageWrapper}>
                                <Image
                                    src={p.image}
                                    alt={p.label}
                                    width={64}
                                    height={64}
                                    className={styles.personaImage}
                                />
                            </div>
                            <span className={styles.personaLabel}>{p.label}</span>
                            <span className={styles.personaDesc}>{p.description}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* 분석 내용 안내 */}
            <div className={styles.analysisInfo}>
                <div className={styles.analysisHeader}>
                    <h3>AI 심층 사주 분석</h3>
                </div>
                <p className={styles.analysisDesc}>
                    생년월일시를 바탕으로 <strong>사주팔자(四柱八字)</strong>를 해석하여
                    당신만의 맞춤 운세 리포트를 생성합니다.
                </p>
                <div className={styles.featureList}>
                    <div className={styles.featureRow}>
                        <Image src="/icons/daeun.png" alt="대운" width={24} height={24} />
                        <span><strong>대운 분석</strong> · 10년 주기 인생 흐름</span>
                    </div>
                    <div className={styles.featureRow}>
                        <Image src="/icons/lifeflow.png" alt="세운" width={24} height={24} />
                        <span><strong>연운/월운</strong> · 올해와 이번 달 운세</span>
                    </div>
                    <div className={styles.featureRow}>
                        <Image src="/icons/calendar.png" alt="일운" width={24} height={24} />
                        <span><strong>오늘의 운세</strong> · 매일 업데이트되는 일운</span>
                    </div>
                    <div className={styles.featureRow}>
                        <Image src="/icons/love.png" alt="분야별" width={24} height={24} />
                        <span><strong>분야별 분석</strong> · 연애, 금전, 직장, 학업, 건강 등</span>
                    </div>
                    <div className={styles.featureRow}>
                        <Image src="/icons/compatibility.png" alt="궁합" width={24} height={24} />
                        <span><strong>궁합 분석</strong> · 상대방과의 인연 확인</span>
                    </div>
                    <div className={styles.featureRow}>
                        <Image src="/icons/ai_dosa_v2.png" alt="AI도사" width={24} height={24} />
                        <span><strong>AI 도사</strong> · 사주 기반 맞춤 상담</span>
                    </div>
                </div>
                <p className={styles.timeNotice}>
                    ※ 정밀한 분석을 위해 <strong>최대 1분</strong> 정도 소요됩니다
                </p>
            </div>

            <div className={styles.section}>
                <label className={styles.label} htmlFor="detailsTextarea">고민 상세 (선택)</label>
                <textarea
                    id="detailsTextarea"
                    className={`input ${styles.textarea}`}
                    style={{ height: '100px', paddingTop: '12px' }}
                    placeholder="구체적인 상황을 적어주시면 더 정확한 분석이 가능해요!"
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    data-testid="concern-details-input"
                />
            </div>

            {/* 이용약관 동의 */}
            <div className={styles.agreementSection}>
                <label className={styles.agreementLabel}>
                    <input
                        type="checkbox"
                        checked={isAgreed}
                        onChange={(e) => setIsAgreed(e.target.checked)}
                        className={styles.agreementCheckbox}
                        data-testid="analysis-agreement-checkbox"
                    />
                    <span>
                        <Link href="/privacy" target="_blank" className={styles.agreementLink}>개인정보처리방침</Link> 및{' '}
                        <Link href="/terms" target="_blank" className={styles.agreementLink}>이용약관</Link>에 동의합니다
                    </span>
                </label>
            </div>

            <button
                type="submit"
                className="btn btn-primary"
                disabled={isLoading || !isAgreed}
                style={{ width: '100%', marginTop: '16px' }}
                data-testid="analysis-submit-button"
            >
                {isLoading ? (
                    <div className={styles.spinner} />
                ) : (
                    <>
                        <Target size={18} style={{ marginRight: '8px' }} />
                        심층 분석 시작하기
                    </>
                )}
            </button>
        </form >
    );
}
