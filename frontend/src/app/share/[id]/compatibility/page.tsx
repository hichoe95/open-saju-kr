'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ReferralCTA from '@/components/ReferralCTA';
import { QuickCompatibilityResponse } from '@/types';
import styles from './page.module.css';
import { Sparkles, ArrowLeft, Lightbulb } from 'lucide-react';
function readSessionResult(): QuickCompatibilityResponse | null {
    if (typeof window === 'undefined') return null;
    try {
        const stored = sessionStorage.getItem('quickCompatResult');
        if (!stored) return null;
        const parsed = JSON.parse(stored) as QuickCompatibilityResponse;
        sessionStorage.removeItem('quickCompatResult');
        return parsed;
    } catch {
        return null;
    }
}
export default function CompatibilityResultPage() {
    const params = useParams();
    const router = useRouter();
    const shareCode = params.id as string;
    const [result] = useState<QuickCompatibilityResponse | null>(readSessionResult);

    // sessionStorage에 데이터 없으면 입력 페이지로 리다이렉트
    useEffect(() => {
        if (!result) {
            router.replace(`/share/${shareCode}`);
        }
    }, [result, shareCode, router]);

    if (!result) {
        return (
            <div className={styles.loadingContainer}>
                <div className={styles.loadingSpinner} />
                <p>결과를 불러오는 중...</p>
            </div>
        );
    }

    const { compatibility, user_b_summary } = result;
    const score = compatibility.score;
    
    // 점수에 따른 색상 클래스 결정
    let scoreClass = styles.scoreLow;
    if (score >= 80) {
        scoreClass = styles.scoreHigh;
    } else if (score >= 60) {
        scoreClass = styles.scoreMedium;
    }

    return (
        <div className={styles.container}>
            {/* 1. Score Hero */}
            <div className={`${styles.scoreHero} ${scoreClass}`}>
                <div className={styles.scoreCircle}>
                    <span className={styles.scoreValue}>{score}</span>
                    <span className={styles.scoreLabel}>점</span>
                </div>
                <div className={styles.keywordBadge}>
                    {compatibility.keyword}
                </div>
            </div>

            {/* 2. Summary text */}
            <div className={styles.summarySection}>
                <span className={styles.quoteIcon}>&ldquo;</span>
                {compatibility.summary}
                <span className={styles.quoteIcon}>&rdquo;</span>
            </div>

            {/* 3. A vs B comparison */}
            <div style={{ position: 'relative' }}>
                <div className={styles.comparisonSection}>
                    <div className={styles.characterCard}>
                        <span className={styles.characterLabel}>상대방</span>
                        <img
                            src="/icons/persona/dosa_classic.png"
                            alt="shared character"
                            className={styles.characterEmoji}
                            loading="eager"
                            style={{ width: 56, height: 56, objectFit: 'contain' }}
                        />
                        <h3 className={styles.characterName}>공유자</h3>
                        <p className={styles.characterElement}>사주 프로필</p>
                    </div>
                    
                    <div className={styles.characterCard}>
                        <span className={styles.characterLabel}>나</span>
                        <img
                            src={user_b_summary.character_icon_path || '/icons/emoji-replacements/misc/sparkle.png'}
                            alt="character"
                            className={styles.characterEmoji}
                            loading="eager"
                            style={{ width: 56, height: 56, objectFit: 'contain' }}
                        />
                        <h3 className={styles.characterName}>{user_b_summary.character_name || '나의 캐릭터'}</h3>
                        <p className={styles.characterElement}>{user_b_summary.element || '나의 기운'}</p>
                    </div>
                </div>
                <div className={styles.vsBadge}>VS</div>
            </div>

            {/* 4. Advice section */}
            <div className={styles.adviceSection}>
                <h3 className={styles.adviceTitle}>
                    <Lightbulb size={20} />
                    관계 조언
                </h3>
                <p className={styles.adviceText}>
                    {compatibility.advice}
                </p>
            </div>

            <ReferralCTA variant="inline" surface="share_compatibility" />

            {/* 5 & 6. CTAs */}
            <div className={styles.ctaContainer}>
                <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => router.push('/')}
                >
                    <Sparkles size={20} />
                    내 사주도 자세히 보기
                </button>
                
                <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => router.push(`/share/${shareCode}`)}
                >
                    <ArrowLeft size={18} />
                    다시 보기
                </button>
            </div>
        </div>
    );
}
