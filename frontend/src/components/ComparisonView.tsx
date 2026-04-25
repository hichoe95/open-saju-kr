import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ReadingResponse, BirthInput, CompatibilityResponse, CompatibilityJobStatusResponse, ElementStats } from '@/types';
import ElementalRadar from './ElementalRadar';
import { X, Sparkles, Loader2, Coins, AlertCircle, Save, Check, Zap } from 'lucide-react';
import { getCompatibilityJobStatus, saveCompatibilityResult, startCompatibilityJob } from '@/lib/api';
import { usePayment } from '@/contexts/PaymentContext';
import { useAuth } from '@/contexts/AuthContext';
import styles from './ComparisonView.module.css';
import CompatibilityResult from './CompatibilityResult';

const COMPATIBILITY_POLL_INTERVAL_MS = 2000;

interface ComparisonViewProps {
    dataA: ReadingResponse;
    nameA: string;
    inputA: BirthInput;
    dataB: ReadingResponse;
    nameB: string;
    inputB: BirthInput;
    onClose: () => void;
}

export default function ComparisonView({ dataA, nameA, inputA, dataB, nameB, inputB, onClose }: ComparisonViewProps) {
    const router = useRouter();
    const { token } = useAuth();
    const [aiResult, setAiResult] = useState<CompatibilityResponse | null>(null);
    const [isLoadingAi, setIsLoadingAi] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [paymentError, setPaymentError] = useState<string | null>(null);
    const [jobProgress, setJobProgress] = useState(0);
    const isMountedRef = useRef(true);
    const activeJobIdRef = useRef<string | null>(null);

    const { canUseFeature, refreshWallet } = usePayment();
    const { canUse, price } = canUseFeature('compatibility');

    const storageKey = useMemo(() => {
        const birthA = `${inputA.birth_solar}:${inputA.birth_time}:${inputA.gender}`;
        const birthB = `${inputB.birth_solar}:${inputB.birth_time}:${inputB.gender}`;
        return `compatibility-job:${birthA}:${birthB}:${nameA}:${nameB}`;
    }, [inputA.birth_solar, inputA.birth_time, inputA.gender, inputB.birth_solar, inputB.birth_time, inputB.gender, nameA, nameB]);

    const clearPendingJob = useCallback(() => {
        activeJobIdRef.current = null;
        if (typeof window !== 'undefined') {
            window.sessionStorage.removeItem(storageKey);
        }
    }, [storageKey]);

    const persistPendingJob = useCallback((jobId: string) => {
        activeJobIdRef.current = jobId;
        if (typeof window !== 'undefined') {
            window.sessionStorage.setItem(storageKey, jobId);
        }
    }, [storageKey]);

    const handleJobTerminalState = useCallback(async (status: CompatibilityJobStatusResponse) => {
        if (!isMountedRef.current) return;
        setJobProgress(status.progress);

        if (status.status === 'completed' && status.result) {
            clearPendingJob();
            setAiResult(status.result);
            setPaymentError(null);
            await refreshWallet();
            setIsLoadingAi(false);
            return;
        }

        if (status.status === 'failed') {
            clearPendingJob();
            await refreshWallet();
            setIsLoadingAi(false);
            const message = status.payment_state === 'refunded'
                ? '궁합 분석에 실패해 엽전이 환불되었습니다. 잠시 후 다시 시도해주세요.'
                : (status.error || '궁합 분석에 실패했습니다. 고객센터에 문의해주세요.');
            setPaymentError(message);
        }
    }, [clearPendingJob, refreshWallet]);

    const pollCompatibilityJob = useCallback(async (jobId: string) => {
        persistPendingJob(jobId);
        while (activeJobIdRef.current === jobId) {
            const status = await getCompatibilityJobStatus(jobId, token || undefined);
            if (!isMountedRef.current) {
                return;
            }
            setJobProgress(status.progress);
            if (status.status === 'completed' || status.status === 'failed') {
                await handleJobTerminalState(status);
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, COMPATIBILITY_POLL_INTERVAL_MS));
        }
    }, [handleJobTerminalState, persistPendingJob, token]);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            activeJobIdRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined' || !token || aiResult) return;
        const pendingJobId = window.sessionStorage.getItem(storageKey);
        if (!pendingJobId) return;
        setIsLoadingAi(true);
        void pollCompatibilityJob(pendingJobId).catch((error) => {
            if (!isMountedRef.current) return;
            clearPendingJob();
            setIsLoadingAi(false);
            setPaymentError(error instanceof Error ? error.message : '궁합 분석 상태 복구에 실패했습니다.');
        });
    }, [aiResult, clearPendingJob, pollCompatibilityJob, storageKey, token]);

    // 띠 계산
    const getAnimal = (ganji: string) => {
        const ANIMALS: Record<string, string> = {
            '자': '子', '축': '丑', '인': '寅', '묘': '卯', '진': '辰', '사': '巳',
            '오': '午', '미': '未', '신': '申', '유': '酉', '술': '戌', '해': '亥'
        };
        const korean = ganji.match(/[가-힣]+/g)?.join('') || '';
        const ji = korean.slice(-1);
        return ANIMALS[ji] || '?';
    };

    const handleAiAnalysis = async () => {
        setPaymentError(null);

        if (!canUse) {
            setPaymentError(`엽전이 부족합니다. (필요: ${price}엽전)`);
            return;
        }

        setIsLoadingAi(true);
        setJobProgress(10);
        try {
            const sanitize = (input: BirthInput): BirthInput => ({
                name: input.name || undefined,
                birth_solar: input.birth_solar,
                birth_time: input.birth_time || '12:00',
                timezone: input.timezone || 'Asia/Seoul',
                birth_place: input.birth_place || '대한민국',
                calendar_type: input.calendar_type || 'solar',
                gender: input.gender || 'male',
                persona: input.persona || 'classic',
            });
            const clientRequestId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                ? crypto.randomUUID()
                : `compat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
            const startResponse = await startCompatibilityJob({
                user_a: sanitize(inputA),
                user_b: sanitize(inputB),
                model: { provider: 'openai', model_id: 'auto', temperature: 0.9 },
                client_request_id: clientRequestId,
            }, token || undefined);
            setJobProgress(startResponse.progress);
            await pollCompatibilityJob(startResponse.job_id);
        } catch (e) {
            activeJobIdRef.current = null;
            clearPendingJob();
            const errorMessage = e instanceof Error ? e.message : '분석에 실패했습니다.';
            if (errorMessage.includes('부족') || errorMessage.includes('402')) {
                setPaymentError(errorMessage);
            } else {
                console.error(e);
                setPaymentError(errorMessage);
            }
        } finally {
            if (activeJobIdRef.current === null) {
                setIsLoadingAi(false);
            }
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(255,255,255,0.98)', zIndex: 3000,
            display: 'flex', flexDirection: 'column', overflowY: 'auto'
        }}>
            {/* Header */}
            <div style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>사주 비교 분석</h2>
                <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '8px' }}>
                    <X size={24} />
                </button>
            </div>

            <div style={{ flex: 1, padding: '20px', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
                {/* Players */}
                <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', marginBottom: '30px' }}>
                    <div style={{ textAlign: 'center', color: '#6366F1' }}>
                        <div style={{ fontSize: '40px' }}>{getAnimal(dataA.pillars.year)}</div>
                        <div style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '8px' }}>{nameA}</div>
                        <div style={{ fontSize: '14px', color: '#666' }}>{dataA.pillars.year}</div>
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#9CA3AF' }}>VS</div>
                    <div style={{ textAlign: 'center', color: '#EF4444' }}>
                        <div style={{ fontSize: '40px' }}>{getAnimal(dataB.pillars.year)}</div>
                        <div style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '8px' }}>{nameB}</div>
                        <div style={{ fontSize: '14px', color: '#666' }}>{dataB.pillars.year}</div>
                    </div>
                </div>

                {/* Radar Chart */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '40px', background: '#fff', borderRadius: '20px', padding: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', border: '1px solid #F3F4F6' }}>
                    <ElementalRadar
                        stats={dataA.card.stats}
                        stats2={dataB.card.stats}
                        size={280}
                        color1="#6366F1"
                        color2="#EF4444"
                    />
                    <div style={{ display: 'flex', gap: '20px', marginTop: '16px', fontSize: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#6366F1' }}></div>
                            <span>{nameA}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#EF4444' }}></div>
                            <span>{nameB}</span>
                        </div>
                    </div>
                </div>

                {/* Key Stats Comparison Table */}
                <div style={{ marginBottom: '30px' }}>
                    <h3 style={{ fontSize: '18px', marginBottom: '15px', fontWeight: 'bold' }}><Zap size={18} /> 기운 비교</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1px', background: '#E5E7EB', border: '1px solid #E5E7EB', borderRadius: '12px', overflow: 'hidden' }}>
                        {/* Headers */}
                        <div style={{ padding: '12px', background: '#F9FAFB', fontWeight: 'bold', color: '#4B5563', textAlign: 'center' }}>항목</div>
                        <div style={{ padding: '12px', background: '#EEF2FF', fontWeight: 'bold', color: '#6366F1', textAlign: 'center' }}>{nameA}</div>
                        <div style={{ padding: '12px', background: '#FEF2F2', fontWeight: 'bold', color: '#EF4444', textAlign: 'center' }}>{nameB}</div>

                        {/* Rows */}
                        <div style={{ padding: '12px', background: '#fff', textAlign: 'center', fontSize: '14px' }}>일주 (본원)</div>
                        <div style={{ padding: '12px', background: '#fff', textAlign: 'center', fontSize: '14px' }}>{dataA.pillars.day}</div>
                        <div style={{ padding: '12px', background: '#fff', textAlign: 'center', fontSize: '14px' }}>{dataB.pillars.day}</div>

                        <div style={{ padding: '12px', background: '#fff', textAlign: 'center', fontSize: '14px' }}>가장 약한 기운</div>
                        <div style={{ padding: '12px', background: '#fff', textAlign: 'center', fontSize: '14px' }}>{getLacking(dataA.card.stats)}</div>
                        <div style={{ padding: '12px', background: '#fff', textAlign: 'center', fontSize: '14px' }}>{getLacking(dataB.card.stats)}</div>

                        <div style={{ padding: '12px', background: '#fff', textAlign: 'center', fontSize: '14px' }}>핵심 키워드</div>
                        <div style={{ padding: '12px', background: '#fff', textAlign: 'center', fontSize: '14px' }}>{dataA.card.tags[0] || '-'}</div>
                        <div style={{ padding: '12px', background: '#fff', textAlign: 'center', fontSize: '14px' }}>{dataB.card.tags[0] || '-'}</div>
                    </div>
                </div>

                {/* Summary */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '40px' }}>
                    <div style={{ padding: '20px', background: '#EEF2FF', borderRadius: '16px' }}>
                        <h4 style={{ color: '#6366F1', marginBottom: '8px', fontWeight: 'bold', fontSize: '14px' }}>{nameA}</h4>
                        <p style={{ fontSize: '14px', lineHeight: '1.6', color: '#3730A3' }}>{dataA.one_liner}</p>
                    </div>
                    <div style={{ padding: '20px', background: '#FEF2F2', borderRadius: '16px' }}>
                        <h4 style={{ color: '#EF4444', marginBottom: '8px', fontWeight: 'bold', fontSize: '14px' }}>{nameB}</h4>
                        <p style={{ fontSize: '14px', lineHeight: '1.6', color: '#991B1B' }}>{dataB.one_liner}</p>
                    </div>
                </div>

                {/* AI Analysis Button & Result */}
                {!aiResult && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {/* 결제 오류 메시지 */}
                        {paymentError && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                padding: '12px 16px', background: '#FEF2F2',
                                border: '1px solid #FECACA', borderRadius: '12px',
                                color: '#B91C1C', fontSize: '14px'
                            }}>
                                <AlertCircle size={16} />
                                <span style={{ flex: 1 }}>{paymentError}</span>
                                <button
                                    onClick={() => router.push('/charge')}
                                    style={{
                                        background: '#EF4444', color: 'white', border: 'none',
                                        padding: '6px 12px', borderRadius: '6px',
                                        fontSize: '13px', fontWeight: '600', cursor: 'pointer'
                                    }}
                                >
                                    충전하기
                                </button>
                            </div>
                        )}

                        <button
                            onClick={handleAiAnalysis}
                            disabled={isLoadingAi}
                            style={{
                                width: '100%', padding: '16px', borderRadius: '24px',
                                background: 'linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%)',
                                color: 'white', border: 'none',
                                fontSize: '16px', fontWeight: 'bold',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                cursor: isLoadingAi ? 'not-allowed' : 'pointer',
                                opacity: isLoadingAi ? 0.7 : 1,
                                boxShadow: '0 4px 15px rgba(255, 107, 107, 0.3)'
                            }}
                        >
                            {isLoadingAi ? <Loader2 className={styles.spinner} /> : <Sparkles size={20} />}
                            {isLoadingAi ? `AI가 둘의 궁합을 분석 중... (${jobProgress}%)` : (
                                <>AI 정밀 궁합 분석 보기 ({price}엽전)</>
                            )}
                        </button>

                        {/* 가격 안내 */}
                        <p style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                            fontSize: '13px', color: '#6B7280', margin: 0
                        }}>
                            <Coins size={14} />
                            AI 궁합 분석은 {price}엽전이 필요해요
                        </p>
                    </div>
                )}

                {aiResult && <CompatibilityResult data={aiResult} />}

                {/* Save Button */}
                {aiResult && (
                    <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {!saveSuccess ? (
                            <button
                                onClick={async () => {
                                    if (!token) return;
                                    setIsSaving(true);
                                     try {
                                         await saveCompatibilityResult(token, {
                                             user_a: { name: nameA, birth_date: inputA.birth_solar, hour_branch: inputA.birth_jiji || '', gender: inputA.gender || 'male' },
                                             user_b: { name: nameB, birth_date: inputB.birth_solar, hour_branch: inputB.birth_jiji || '', gender: inputB.gender || 'male' },
                                             compatibility_data: aiResult ? JSON.parse(JSON.stringify(aiResult)) as Record<string, unknown> : {},
                                             scenario: 'lover',
                                         });
                                         setSaveSuccess(true);
                                    } catch (e) {
                                        alert(e instanceof Error ? e.message : '저장 실패');
                                    } finally {
                                        setIsSaving(false);
                                    }
                                }}
                                disabled={isSaving}
                                style={{
                                    width: '100%', padding: '14px', borderRadius: '12px',
                                    background: '#10B981', color: 'white', border: 'none',
                                    fontSize: '15px', fontWeight: '600',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                    cursor: isSaving ? 'not-allowed' : 'pointer',
                                    opacity: isSaving ? 0.7 : 1,
                                }}
                            >
                                {isSaving ? <Loader2 className={styles.spinner} /> : <Save size={18} />}
                                {isSaving ? '저장 중...' : '결과 저장하기'}
                            </button>
                        ) : (
                            <div style={{
                                width: '100%', padding: '14px', borderRadius: '12px',
                                background: '#D1FAE5', color: '#065F46',
                                fontSize: '15px', fontWeight: '600',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                            }}>
                                <Check size={18} />
                                저장 완료! 마이페이지에서 확인하세요
                            </div>
                        )}
                        <p style={{ fontSize: '12px', color: '#9CA3AF', textAlign: 'center', margin: 0 }}>
                            저장하지 않으면 결과가 사라집니다
                        </p>
                    </div>
                )}

                {/* 하단 여백 */}
                <div style={{ height: '40px' }} />
            </div>
        </div>
    );
}

function getLacking(stats: ElementStats | undefined) {
    if (!stats) return '';
    const entries = Object.entries(stats) as [string, number][];
    entries.sort((a, b) => a[1] - b[1]);
    const minVal = entries[0][1];
    return entries.filter(e => e[1] === minVal).map(e => convertElement(e[0])).join(', ');
}

function convertElement(el: string) {
    const map: Record<string, string> = { wood: '목', fire: '화', earth: '토', metal: '금', water: '수' };
    return map[el] || el;
}
