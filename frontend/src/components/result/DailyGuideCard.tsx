'use client';

import { useState } from 'react';
import styles from './DailyGuideCard.module.css';
import { AlertTriangle, Sparkles, Clock, ChevronDown, ChevronUp, Shield } from 'lucide-react';
import { LuckyTab } from '@/types';
import GlossaryHighlight from '@/components/GlossaryHighlight';

interface TodayScores {
    general: number;
    love: number;
    money: number;
    career: number;
}

interface DailyGuideCardProps {
    luckyData: LuckyTab;
    todayScores?: TodayScores;
}

/**
 * 오늘의 한 줄 가이드 카드
 * 경고와 긍정 메시지를 항상 함께 보여주어 불안만 조장하지 않도록 설계
 */
export default function DailyGuideCard({ luckyData, todayScores }: DailyGuideCardProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    // 데이터 추출 로직
    const { warningMessage, positiveMessage, positiveCategory } = extractGuideMessages(luckyData, todayScores);
    const avoidTime = luckyData.dead_time;
    const luckyTime = luckyData.golden_time;

    // 시간 정보가 하나도 없으면 시간 섹션 숨김
    const hasTimeInfo = Boolean(avoidTime || luckyTime);

    return (
        <div className={styles.card}>
            {/* 헤더 */}
            <div className={styles.header}>
                <Shield className={styles.headerIcon} size={20} />
                <h3 className={styles.headerTitle}>오늘의 핵심 가이드</h3>
            </div>

            {/* 경고 섹션 */}
            <div className={styles.warningSection}>
                <div className={styles.sectionHeader}>
                    <AlertTriangle className={styles.warningIcon} size={18} />
                    <span className={styles.sectionLabel}>주의</span>
                </div>
                <p className={styles.warningText}>
                    <GlossaryHighlight text={warningMessage} />
                </p>
            </div>

            {/* 긍정 섹션 */}
            <div className={styles.positiveSection}>
                <div className={styles.sectionHeader}>
                    <Sparkles className={styles.positiveIcon} size={18} />
                    <span className={styles.sectionLabel}>하지만!</span>
                </div>
                <p className={styles.positiveText}>
                    <span className={styles.positiveCategory}>{positiveCategory}</span>
                    <GlossaryHighlight text={positiveMessage} />
                </p>
            </div>

            {/* 시간 정보 */}
            {hasTimeInfo && (
                <div className={styles.timeSection}>
                    {avoidTime && (
                        <div className={styles.timeRow}>
                            <div className={styles.timeLabel}>
                                <Clock size={14} />
                                <span>피할 시간</span>
                            </div>
                            <span className={styles.avoidTimeValue}>{avoidTime}</span>
                        </div>
                    )}
                    {luckyTime && (
                        <div className={styles.timeRow}>
                            <div className={styles.timeLabel}>
                                <Clock size={14} />
                                <span>행운 시간</span>
                            </div>
                            <span className={styles.luckyTimeValue}>{luckyTime}</span>
                        </div>
                    )}
                </div>
            )}

            {/* 상세 해석 보기 버튼 */}
            <button
                className={styles.expandButton}
                onClick={() => setIsExpanded(!isExpanded)}
                aria-expanded={isExpanded}
            >
                <span>상세 해석 보기</span>
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {/* 확장된 상세 내용 */}
            {isExpanded && (
                <div className={styles.expandedContent}>
                    <div className={styles.detailSection}>
                        <h4 className={styles.detailTitle}>오늘의 조언</h4>
                        <p className={styles.detailText}>
                            <GlossaryHighlight text={luckyData.today_advice} />
                        </p>
                    </div>
                    {(luckyData.today_love || luckyData.today_money || luckyData.today_work || luckyData.today_health) && (
                        <div className={styles.detailSection}>
                            <h4 className={styles.detailTitle}>분야별 기운</h4>
                            {luckyData.today_love && (
                                <div className={styles.detailItem}>
                                    <span className={styles.detailItemLabel}>연애</span>
                                    <GlossaryHighlight text={luckyData.today_love} />
                                </div>
                            )}
                            {luckyData.today_money && (
                                <div className={styles.detailItem}>
                                    <span className={styles.detailItemLabel}>금전</span>
                                    <GlossaryHighlight text={luckyData.today_money} />
                                </div>
                            )}
                            {luckyData.today_work && (
                                <div className={styles.detailItem}>
                                    <span className={styles.detailItemLabel}>업무</span>
                                    <GlossaryHighlight text={luckyData.today_work} />
                                </div>
                            )}
                            {luckyData.today_health && (
                                <div className={styles.detailItem}>
                                    <span className={styles.detailItemLabel}>건강</span>
                                    <GlossaryHighlight text={luckyData.today_health} />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/**
 * 가이드 메시지 추출 함수
 * 경고와 긍정 메시지를 항상 함께 반환
 */
function extractGuideMessages(
    luckyData: LuckyTab,
    todayScores?: TodayScores
): { warningMessage: string; positiveMessage: string; positiveCategory: string } {
    // 기본값 설정
    let warningMessage = luckyData.today_advice || '오늘은 평온한 하루가 될 것입니다.';
    let positiveMessage = '좋은 기운이 함께합니다.';
    let positiveCategory = '전반';

    // todayScores가 있으면 가장 낮은/높은 점수 기준으로 메시지 생성
    if (todayScores) {
        const scores = [
            { category: '연애', score: todayScores.love, message: luckyData.today_love },
            { category: '금전', score: todayScores.money, message: luckyData.today_money },
            { category: '직장', score: todayScores.career, message: '' },
            { category: '전반', score: todayScores.general, message: luckyData.today_overview },
        ];

        // 가장 낮은 점수 찾기 (경고)
        const lowest = scores.reduce((min, curr) => curr.score < min.score ? curr : min);
        // 가장 높은 점수 찾기 (긍정)
        const highest = scores.reduce((max, curr) => curr.score > max.score ? curr : max);

        // 경고 메시지 생성
        if (lowest.score < 50) {
            const warnings: Record<string, string> = {
                '연애': '오늘은 감정 기복이 있을 수 있어요. 서두르지 말고 천천히',
                '금전': '충동 지출에 주의하세요. 큰 결정은 미루는 게 좋아요',
                '직장': '업무에서 실수가 생길 수 있어요. 꼼꼼히 체크하세요',
                '전반': '오늘은 무리하지 말고 자신을 보호하는 날로 삼으세요',
            };
            warningMessage = warnings[lowest.category] || warningMessage;
        } else if (lowest.score < 70) {
            const warnings: Record<string, string> = {
                '연애': '오늘은 조금 신중하게 다가가는 게 좋아요',
                '금전': '작은 지출이라도 신중하게 생각해보세요',
                '직장': '새로운 시도보다는 현상 유지에 집중하세요',
                '전반': '오늘은 무리한 계획보다는 여유를 가지세요',
            };
            warningMessage = warnings[lowest.category] || warningMessage;
        } else {
            warningMessage = '오늘은 특별히 주의할 점이 없어요. 자연스럽게 흘러가세요';
        }

        // 긍정 메시지 생성
        if (highest.score >= 80) {
            const positives: Record<string, string> = {
                '연애': '연애운이 최고! 적극적으로 어필하세요',
                '금전': '금전운 상승! 좋은 기회를 잡으세요',
                '직장': '커리어 행운기! 중요한 결정을 내려보세요',
                '전반': '전반적인 기운이 좋아요! 도전해보세요',
            };
            positiveMessage = positives[highest.category] || positiveMessage;
            positiveCategory = highest.category;
        } else if (highest.score >= 60) {
            const positives: Record<string, string> = {
                '연애': '연애운이 물오르고 있어요. 기회를 놓치지 마세요',
                '금전': '금전운이 괜찮아요. 작은 투자도 OK',
                '직장': '직장운이 안정적이에요. 꾸준함이 답입니다',
                '전반': '무난하게 흘러가는 하루예요',
            };
            positiveMessage = positives[highest.category] || positiveMessage;
            positiveCategory = highest.category;
        } else {
            positiveMessage = '내일은 더 나은 하루가 될 거예요';
        }
    } else {
        // todayScores가 없는 경우 today_advice에서 추출 시도
        // 또는 today_love/today_money에서 긍정적인 내용 찾기
        if (luckyData.today_love && luckyData.today_money) {
            // 간단한 키워드 기반 판단
            const lovePositive = isPositiveText(luckyData.today_love);
            const moneyPositive = isPositiveText(luckyData.today_money);

            if (lovePositive && !moneyPositive) {
                positiveCategory = '연애';
                positiveMessage = extractCoreMessage(luckyData.today_love);
                warningMessage = '금전 관리에 신경 쓰세요';
            } else if (!lovePositive && moneyPositive) {
                positiveCategory = '금전';
                positiveMessage = extractCoreMessage(luckyData.today_money);
                warningMessage = '감정 관계에 여유를 가지세요';
            } else if (lovePositive && moneyPositive) {
                // 둘 다 긍정적이면 연애를 우선
                positiveCategory = '연애';
                positiveMessage = extractCoreMessage(luckyData.today_love);
                warningMessage = '너무 많은 것을 한꺼번에 하려 하지 마세요';
            } else {
                positiveCategory = '전반';
                positiveMessage = extractCoreMessage(luckyData.today_advice || luckyData.today_overview);
                warningMessage = '오늘은 조금 쉬어가는 게 좋아요';
            }
        } else if (luckyData.today_love) {
            positiveCategory = '연애';
            positiveMessage = extractCoreMessage(luckyData.today_love);
            warningMessage = '다른 분야는 평소대로 유지하세요';
        } else if (luckyData.today_money) {
            positiveCategory = '금전';
            positiveMessage = extractCoreMessage(luckyData.today_money);
            warningMessage = '감정 소모가 클 수 있어요';
        }
    }

    return { warningMessage, positiveMessage, positiveCategory };
}

/**
 * 텍스트가 긍정적인지 간단히 판단
 */
function isPositiveText(text: string): boolean {
    const positiveKeywords = ['좋', '긍정', '행운', '성공', '기회', '상승', '최고', '완벽', '훌륭', '만족'];
    const negativeKeywords = ['주의', '조심', '위험', '어려움', '힘듦', '실패', '손해', '손실', '나쁨'];

    const hasPositive = positiveKeywords.some(kw => text.includes(kw));
    const hasNegative = negativeKeywords.some(kw => text.includes(kw));

    return hasPositive && !hasNegative;
}

/**
 * 핵심 메시지 추출 (문장 앞부분만)
 */
function extractCoreMessage(text: string): string {
    if (!text) return '';
    // 첫 문장만 추출하거나, 50자 이내로 자르기
    const firstSentence = text.split(/[.!?]/)[0];
    if (firstSentence && firstSentence.length <= 50) {
        return firstSentence + (text.includes('.') ? '' : '');
    }
    return text.length > 50 ? text.slice(0, 50) + '...' : text;
}
