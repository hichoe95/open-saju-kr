'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
    Swords, Crown, Trophy, AlertCircle, Shield, 
    Share2, CheckCircle, Sparkles, ChevronLeft,
    User, Calendar, Clock
} from 'lucide-react';
import styles from './page.module.css';
import { VsBattleJoinRequest, VsBattleResult } from '@/types';
import { joinVsBattle, getVsBattleResult } from '@/lib/api';

const JIJI_HOURS = [
    { value: 0, label: '자시 (23:00~01:00)', hanja: '子' },
    { value: 1, label: '축시 (01:00~03:00)', hanja: '丑' },
    { value: 2, label: '인시 (03:00~05:00)', hanja: '寅' },
    { value: 3, label: '묘시 (05:00~07:00)', hanja: '卯' },
    { value: 4, label: '진시 (07:00~09:00)', hanja: '辰' },
    { value: 5, label: '사시 (09:00~11:00)', hanja: '巳' },
    { value: 6, label: '오시 (11:00~13:00)', hanja: '午' },
    { value: 7, label: '미시 (13:00~15:00)', hanja: '未' },
    { value: 8, label: '신시 (15:00~17:00)', hanja: '申' },
    { value: 9, label: '유시 (17:00~19:00)', hanja: '酉' },
    { value: 10, label: '술시 (19:00~21:00)', hanja: '戌' },
    { value: 11, label: '해시 (21:00~23:00)', hanja: '亥' },
];

const getTierIcon = (tier?: string) => {
    switch (tier) {
        case 'diamond': return '/icons/emoji-replacements/misc/streak_gem.png';
        case 'gold': return '1위';
        case 'silver': return '2위';
        case 'bronze': return '3위';
        default: return '참가';
    }
};

function BattleResultView({ 
    result, 
    onShare, 
    isSharing 
}: { 
    result: VsBattleResult; 
    onShare: () => void;
    isSharing: boolean;
}) {
    const router = useRouter();
    const hostPercent = Math.min(100, Math.max(0, 
        (result.host.score / (result.host.score + result.challenger.score)) * 100
    ));

    return (
        <div className={styles.resultContainer}>
            {/* Winner Banner */}
            <div className={styles.winnerBanner}>
                <Crown size={32} />
                <span>{result.host.is_winner ? '주인장 승리!' : '도전자 승리!'}</span>
            </div>

            {/* Score Comparison */}
            <div className={styles.scoreComparison}>
                {/* Host */}
                <div className={`${styles.participantCard} ${result.host.is_winner ? styles.winnerCard : ''}`}>
                    <div className={styles.participantHeader}>
                        <Shield size={16} />
                        <span>주인장</span>
                    </div>
                    <div className={styles.participantName}>{result.host.name}</div>
                    <div className={styles.score}>{result.host.score}</div>
                    <div className={styles.tierBadge}>
                        {result.host.badge_tier === 'diamond' ? (
                            <img src={getTierIcon(result.host.badge_tier)} alt="diamond" width={24} height={24} />
                        ) : (
                            getTierIcon(result.host.badge_tier)
                        )}
                    </div>
                </div>

                {/* VS Badge */}
                <div className={styles.vsBadge}>VS</div>

                {/* Challenger */}
                <div className={`${styles.participantCard} ${result.challenger.is_winner ? styles.winnerCard : ''}`}>
                    <div className={styles.participantHeader}>
                        <Swords size={16} />
                        <span>도전자</span>
                    </div>
                    <div className={styles.participantName}>{result.challenger.name}</div>
                    <div className={styles.score}>{result.challenger.score}</div>
                    <div className={styles.tierBadge}>
                        {result.challenger.badge_tier === 'diamond' ? (
                            <img src={getTierIcon(result.challenger.badge_tier)} alt="diamond" width={24} height={24} />
                        ) : (
                            getTierIcon(result.challenger.badge_tier)
                        )}
                    </div>
                </div>
            </div>

            {/* Score Bar */}
            <div className={styles.scoreBarContainer}>
                <div className={styles.scoreBar}>
                    <div 
                        className={styles.scoreBarFill}
                        style={{ width: `${hostPercent}%` }}
                    />
                </div>
                <div className={styles.scoreLabels}>
                    <span>{Math.round(hostPercent)}%</span>
                    <span>{Math.round(100 - hostPercent)}%</span>
                </div>
            </div>

            {/* Message */}
            <div className={styles.messageCard}>
                <p>{result.message}</p>
            </div>

            {/* Actions */}
            <div className={styles.actions}>
                <button 
                    className={styles.shareButton}
                    onClick={onShare}
                    disabled={isSharing}
                >
                    {isSharing ? (
                        <>
                            <CheckCircle size={18} />
                            복사 완료!
                        </>
                    ) : (
                        <>
                            <Share2 size={18} />
                            결과 공유하기
                        </>
                    )}
                </button>
                
                <button 
                    className={styles.retryButton}
                    disabled
                    title="이미 사용된 대결입니다"
                >
                    <Swords size={18} />
                    다시 도전하기 (불가)
                </button>

                <button 
                    className={styles.primaryButton}
                    onClick={() => router.push('/')}
                >
                    <Sparkles size={18} />
                    내 사주도 볼러가기
                </button>
            </div>

            {/* Created At */}
            <div className={styles.createdAt}>
                <Clock size={14} />
                {new Date(result.created_at).toLocaleString('ko-KR')}
            </div>
        </div>
    );
}

export default function VsBattlePage() {
    const params = useParams();
    const router = useRouter();
    const battleCode = params.code as string;

    const [step, setStep] = useState<'form' | 'loading' | 'result'>('form');
    const [result, setResult] = useState<VsBattleResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isSharing, setIsSharing] = useState(false);

    const [formData, setFormData] = useState<VsBattleJoinRequest>({
        battle_code: battleCode,
        birth_year: 1990,
        birth_month: 1,
        birth_day: 1,
        birth_hour: 0,
        gender: 'male',
        calendar_type: 'solar',
    });

    useEffect(() => {
        const checkExistingResult = async () => {
            try {
                const existingResult = await getVsBattleResult(battleCode);
                setResult(existingResult);
                setStep('result');
            } catch {
                // No existing result, show form
            }
        };

        if (battleCode) {
            checkExistingResult();
        }
    }, [battleCode]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStep('loading');
        setError(null);

        try {
            const response = await joinVsBattle(formData);
            setResult(response.result);
            setStep('result');
        } catch (err) {
            setError(err instanceof Error ? err.message : '대결 참여에 실패했습니다');
            setStep('form');
        }
    };

    const handleShare = async () => {
        if (!result) return;
        
        try {
            const shareText = `사주 배틀 결과!\n\n주인장 ${result.host.name}: ${result.host.score}점\n도전자 ${result.challenger.name}: ${result.challenger.score}점\n\n${result.host.is_winner ? '주인장' : '도전자'} 승리!`;
            
            await navigator.clipboard.writeText(shareText);
            setIsSharing(true);
            setTimeout(() => setIsSharing(false), 2000);
        } catch {
            alert('복사에 실패했습니다');
        }
    };

    const getDaysInMonth = (year: number, month: number) => {
        return new Date(year, month, 0).getDate();
    };

    const maxDays = getDaysInMonth(formData.birth_year, formData.birth_month);

    if (step === 'result' && result) {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <button className={styles.backButton} onClick={() => router.push('/')}>
                        <ChevronLeft size={20} />
                    </button>
                    <h1 className={styles.title}>
                        <Swords size={24} />
                        사주 배틀 결과
                    </h1>
                </div>
                <BattleResultView 
                    result={result} 
                    onShare={handleShare}
                    isSharing={isSharing}
                />
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <button className={styles.backButton} onClick={() => router.push('/')}>
                    <ChevronLeft size={20} />
                </button>
                <h1 className={styles.title}>
                    <Swords size={24} />
                    사주 배틀
                </h1>
            </div>

            {step === 'loading' ? (
                <div className={styles.loadingState}>
                    <div className={styles.spinner} />
                    <p>사주를 분석하는 중...</p>
                    <span>잠시만 기다려주세요</span>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.introCard}>
                        <Trophy size={32} />
                        <h2>사주 대결에 도전하세요!</h2>
                        <p>당신의 사주와 주인장의 사주를 비교하여 승패를 가립니다.</p>
                    </div>

                    {error && (
                        <div className={styles.errorAlert}>
                            <AlertCircle size={18} />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className={styles.privacyNotice}>
                        <Shield size={16} />
                        <span>입력하신 정보는 저장되지 않습니다</span>
                    </div>

                    {/* Birth Year */}
                    <div className={styles.formGroup}>
                        <label>
                            <Calendar size={16} />
                            출생 연도
                        </label>
                        <input
                            type="number"
                            min={1920}
                            max={2030}
                            value={formData.birth_year}
                            onChange={(e) => setFormData(prev => ({ 
                                ...prev, 
                                birth_year: parseInt(e.target.value) || 1990 
                            }))}
                            required
                        />
                    </div>

                    {/* Birth Month & Day */}
                    <div className={styles.formRow}>
                        <div className={styles.formGroup}>
                            <label>월</label>
                            <select
                                value={formData.birth_month}
                                onChange={(e) => setFormData(prev => ({ 
                                    ...prev, 
                                    birth_month: parseInt(e.target.value)
                                }))}
                            >
                                {Array.from({ length: 12 }, (_, i) => (
                                    <option key={i + 1} value={i + 1}>{i + 1}월</option>
                                ))}
                            </select>
                        </div>
                        <div className={styles.formGroup}>
                            <label>일</label>
                            <select
                                value={formData.birth_day}
                                onChange={(e) => setFormData(prev => ({ 
                                    ...prev, 
                                    birth_day: parseInt(e.target.value)
                                }))}
                            >
                                {Array.from({ length: maxDays }, (_, i) => (
                                    <option key={i + 1} value={i + 1}>{i + 1}일</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Birth Hour */}
                    <div className={styles.formGroup}>
                        <label>
                            <Clock size={16} />
                            출생 시각
                        </label>
                        <select
                            value={formData.birth_hour}
                            onChange={(e) => setFormData(prev => ({ 
                                ...prev, 
                                birth_hour: parseInt(e.target.value)
                            }))}
                        >
                            {JIJI_HOURS.map((hour) => (
                                <option key={hour.value} value={hour.value}>
                                    {hour.hanja} {hour.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Gender */}
                    <div className={styles.formGroup}>
                        <label>
                            <User size={16} />
                            성별
                        </label>
                        <div className={styles.radioGroup}>
                            <label className={styles.radioLabel}>
                                <input
                                    type="radio"
                                    name="gender"
                                    value="male"
                                    checked={formData.gender === 'male'}
                                    onChange={(e) => setFormData(prev => ({ 
                                        ...prev, 
                                        gender: e.target.value as 'male' | 'female'
                                    }))}
                                />
                                <span>남자</span>
                            </label>
                            <label className={styles.radioLabel}>
                                <input
                                    type="radio"
                                    name="gender"
                                    value="female"
                                    checked={formData.gender === 'female'}
                                    onChange={(e) => setFormData(prev => ({ 
                                        ...prev, 
                                        gender: e.target.value as 'male' | 'female'
                                    }))}
                                />
                                <span>여자</span>
                            </label>
                        </div>
                    </div>

                    {/* Calendar Type */}
                    <div className={styles.formGroup}>
                        <label>달력</label>
                        <div className={styles.radioGroup}>
                            <label className={styles.radioLabel}>
                                <input
                                    type="radio"
                                    name="calendar"
                                    value="solar"
                                    checked={formData.calendar_type === 'solar'}
                                    onChange={(e) => setFormData(prev => ({ 
                                        ...prev, 
                                        calendar_type: e.target.value as 'solar' | 'lunar'
                                    }))}
                                />
                                <span>양력</span>
                            </label>
                            <label className={styles.radioLabel}>
                                <input
                                    type="radio"
                                    name="calendar"
                                    value="lunar"
                                    checked={formData.calendar_type === 'lunar'}
                                    onChange={(e) => setFormData(prev => ({ 
                                        ...prev, 
                                        calendar_type: e.target.value as 'solar' | 'lunar'
                                    }))}
                                />
                                <span>음력</span>
                            </label>
                        </div>
                    </div>

                    <button type="submit" className={styles.submitButton}>
                        <Swords size={20} />
                        대결 시작!
                    </button>
                </form>
            )}
        </div>
    );
}
