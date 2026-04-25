'use client';

import { useState, useEffect, useCallback, startTransition } from 'react';
import { Sparkles, Loader2, AlertCircle, Coins, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import styles from './DailyFortuneButton.module.css';
import { useAuth } from '@/contexts/AuthContext';
import {
    checkDailyFortuneEligibility,
    generateDailyFortune,
    getLatestFortune,
    DailyFortuneEligibility,
    DailyFortune,
    DailyFortuneGenerateResult,
} from '@/lib/api';

interface DailyFortuneButtonProps {
    profileId: string;
    onFortuneGenerated?: (fortune: DailyFortune) => void;
    onFortuneLoaded?: (fortune: DailyFortune) => void;
    onPromptEligible?: () => void;
}

type ButtonState =
    | 'loading'
    | 'ready-free'
    | 'ready-paid'
    | 'refresh-free'
    | 'refresh-paid'
    | 'up-to-date'
    | 'insufficient'
    | 'no-profile'
    | 'generating'
    | 'error';

export default function DailyFortuneButton({
    profileId,
    onFortuneGenerated,
    onFortuneLoaded,
    onPromptEligible,
}: DailyFortuneButtonProps) {
    const router = useRouter();
    const { token } = useAuth();
    const [state, setState] = useState<ButtonState>('loading');
    const [eligibility, setEligibility] = useState<DailyFortuneEligibility | null>(null);
    const [existingFortune, setExistingFortune] = useState<DailyFortune | null>(null);
    const [error, setError] = useState<string | null>(null);

    const checkEligibility = useCallback(async () => {
        if (!profileId) {
            startTransition(() => {
                setState('no-profile');
            });
            return;
        }

        startTransition(() => {
            setState('loading');
            setError(null);
        });

        try {
            const authToken = token || undefined;
            
            const latestFortune = await getLatestFortune(profileId, authToken);
            
            if (latestFortune) {
                onFortuneLoaded?.(latestFortune);
                
                const todayKST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
                if (latestFortune.fortune_date === todayKST) {
                    startTransition(() => {
                        setExistingFortune(latestFortune);
                        setState('up-to-date');
                    });
                    return;
                }
                
                const elig = await checkDailyFortuneEligibility(profileId, authToken);
                startTransition(() => {
                    setEligibility(elig);
                    setExistingFortune(latestFortune);
                    
                    if (elig.can_generate) {
                        setState(elig.is_free ? 'refresh-free' : 'refresh-paid');
                    } else {
                        if (elig.reason.includes('엽전') || elig.reason.includes('코인')) {
                            setState('insufficient');
                        } else {
                            setState('error');
                            setError(elig.reason);
                        }
                    }
                });
            } else {
                const elig = await checkDailyFortuneEligibility(profileId, authToken);
                startTransition(() => {
                    setEligibility(elig);
                    
                    if (elig.can_generate) {
                        setState(elig.is_free ? 'ready-free' : 'ready-paid');
                    } else {
                        if (elig.existing_fortune_id) {
                            setState('up-to-date');
                        } else if (elig.reason.includes('엽전') || elig.reason.includes('코인')) {
                            setState('insufficient');
                        } else if (elig.reason.includes('프로필')) {
                            setState('no-profile');
                        } else {
                            setState('error');
                            setError(elig.reason);
                        }
                    }
                });
            }
        } catch (err) {
            startTransition(() => {
                setState('error');
                setError(err instanceof Error ? err.message : '알 수 없는 오류');
            });
        }
    }, [onFortuneLoaded, profileId, token]);

    useEffect(() => {
        checkEligibility();
    }, [checkEligibility]);

    const handleGenerate = async () => {
        if (state !== 'ready-free' && state !== 'ready-paid' && state !== 'refresh-free' && state !== 'refresh-paid') return;

        startTransition(() => {
            setState('generating');
            setError(null);
        });

        try {
            const result: DailyFortuneGenerateResult = await generateDailyFortune(profileId, token || undefined);

            startTransition(() => {
                if (result.success && result.fortune) {
                    setState('up-to-date');
                    setExistingFortune(result.fortune);
                    onFortuneGenerated?.(result.fortune);
                    onPromptEligible?.();
                } else {
                    setState('error');
                    let errorMsg = result.error || '생성 실패';
                    if (result.refunded) {
                        errorMsg += ' (엽전 환불됨)';
                    }
                    setError(errorMsg);
                }
            });
        } catch (err) {
            startTransition(() => {
                setState('error');
                setError(err instanceof Error ? err.message : '알 수 없는 오류');
            });
        }
    };

    const handleChargeClick = () => {
        router.push('/charge');
    };

    if (state === 'up-to-date') {
        return null;
    }

    const renderButton = () => {
        switch (state) {
            case 'loading':
                return (
                    <button type="button" className={styles.button} disabled>
                        <Loader2 className={styles.spinner} size={18} />
                        확인 중...
                    </button>
                );

            case 'ready-free':
                return (
                    <button type="button" className={`${styles.button} ${styles.free}`} onClick={handleGenerate}>
                        <Sparkles size={18} />
                        오늘의 운세 받기
                        <span className={styles.freeBadge}>무료</span>
                    </button>
                );

            case 'ready-paid':
                return (
                    <button type="button" className={`${styles.button} ${styles.paid}`} onClick={handleGenerate}>
                        <Coins size={18} />
                        오늘의 운세 받기
                        <span className={styles.costBadge}>{eligibility?.cost}엽전</span>
                    </button>
                );
                
            case 'refresh-free':
                return (
                    <button type="button" className={`${styles.button} ${styles.refresh}`} onClick={handleGenerate}>
                        <RefreshCw size={18} />
                        오늘의 운세 보기
                        <span className={styles.freeBadge}>무료</span>
                    </button>
                );

            case 'refresh-paid':
                return (
                    <button type="button" className={`${styles.button} ${styles.refresh}`} onClick={handleGenerate}>
                        <RefreshCw size={18} />
                        오늘의 운세 보기
                        <span className={styles.costBadge}>{eligibility?.cost}엽전</span>
                    </button>
                );

            case 'generating':
                return (
                    <button type="button" className={styles.button} disabled>
                        <Loader2 className={styles.spinner} size={18} />
                        운세 생성 중...
                    </button>
                );

            case 'insufficient':
                return (
                    <button type="button" className={`${styles.button} ${styles.insufficient}`} onClick={handleChargeClick}>
                        <AlertCircle size={18} />
                        엽전 부족 ({eligibility?.cost}엽전 필요)
                    </button>
                );

            case 'no-profile':
                return (
                    <button type="button" className={`${styles.button} ${styles.disabled}`} disabled>
                        <AlertCircle size={18} />
                        프로필을 선택해주세요
                    </button>
                );

            case 'error':
                return (
                    <button type="button" className={`${styles.button} ${styles.error}`} onClick={checkEligibility}>
                        <RefreshCw size={18} />
                        {error || '오류 발생'} (재시도)
                    </button>
                );
                
            default:
                return null;
        }
    };

    return (
        <div className={styles.container}>
            {(state.startsWith('refresh-') || state.startsWith('ready-')) && eligibility && (
                <div className={styles.dateLabel}>
                    {eligibility.formatted_date}
                </div>
            )}
            {existingFortune && !state.startsWith('refresh-') && !state.startsWith('ready-') && (
                <div className={styles.dateLabel}>
                    {existingFortune.formatted_date}
                </div>
            )}
            {renderButton()}
            {(state === 'ready-paid' || state === 'refresh-paid') && eligibility && eligibility.user_balance !== null && eligibility.user_balance !== undefined && (
                <div className={styles.balanceInfo}>
                    내 엽전: {eligibility.user_balance.toLocaleString()}엽전
                </div>
            )}
        </div>
    );
}
