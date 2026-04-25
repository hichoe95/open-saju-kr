/**
 * @deprecated Use MultiTurnChat instead. This component is kept for reference.
 */

'use client';

import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import styles from './AiChatView.module.css';
import { BirthInput, DecisionResponse, ReadingResponse } from '@/types';
import { createDecision } from '@/lib/api';
import GlossaryHighlight from './GlossaryHighlight';
import {
    Loader2, Sparkles,
    ThumbsUp, ThumbsDown, Zap, ChevronLeft, RefreshCw,
    Coins, AlertCircle
} from 'lucide-react';
import Image from 'next/image';
import { usePayment } from '@/contexts/PaymentContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

interface AiChatViewProps {
    isOpen: boolean;
    onClose: () => void;
    birthInput: BirthInput;
    sajuData?: ReadingResponse;
}

function buildSajuContext(sajuData: ReadingResponse | undefined) {
    if (!sajuData) return undefined;

    const stats = sajuData.card?.stats;
    const statsText = stats
        ? `오행(목/화/토/금/수): ${stats.wood}/${stats.fire}/${stats.earth}/${stats.metal}/${stats.water}`
        : '';

    const adv = sajuData.advanced_analysis;
    const core = [
        sajuData.one_liner ? `한줄 요약: ${sajuData.one_liner}` : null,
        statsText || null,
        adv?.strength ? `신강/신약: ${adv.strength}` : null,
        adv?.day_master ? `일간 오행: ${adv.day_master}` : null,
        adv?.geokguk_yongsin?.yongsin ? `용신: ${adv.geokguk_yongsin.yongsin}` : null,
        sajuData.card?.character?.summary ? `캐릭터: ${sajuData.card.character.summary}` : null,
    ]
        .filter(Boolean)
        .join('\n');

    return core.trim();
}

// 탭과 동일한 아이콘 사용 - 이미지로 변경
const DOMAIN_OPTIONS = [
    { key: 'general', label: '종합', image: '/icons/crystal.png' },
    { key: 'love', label: '연애', image: '/icons/love.png' },
    { key: 'money', label: '금전', image: '/icons/money.png' },
    { key: 'career', label: '직장', image: '/icons/career.png' },
    { key: 'study', label: '학업', image: '/icons/study.png' },
    { key: 'health', label: '건강', image: '/icons/health.png' },
    { key: 'compatibility', label: '관계', image: '/icons/compatibility.png' },
];

// 질문 확장 (분야별 다양한 질문)
const ALL_SUGGESTION_QUESTIONS = [
    // 연애
    { domain: 'love', text: '지금 썸타는 사람한테 먼저 연락해도 될까?' },
    { domain: 'love', text: '요즘 만나는 사람이랑 잘 맞는 걸까?' },
    { domain: 'love', text: '전 애인한테 다시 연락해도 괜찮을까?' },
    { domain: 'love', text: '고백 타이밍이 언제가 좋을까?' },
    { domain: 'love', text: '소개팅 나가면 좋은 사람 만날 수 있을까?' },
    // 금전
    { domain: 'money', text: '이번 달에 큰 지출을 해도 괜찮을까?' },
    { domain: 'money', text: '투자를 시작해도 좋은 시기일까?' },
    { domain: 'money', text: '부업을 시작하면 잘 될까?' },
    { domain: 'money', text: '빌려준 돈을 돌려받을 수 있을까?' },
    { domain: 'money', text: '이사 비용, 지금 써도 될까?' },
    // 직장
    { domain: 'career', text: '이직을 고민 중인데 지금이 좋은 타이밍일까?' },
    { domain: 'career', text: '승진 가능성이 있을까?' },
    { domain: 'career', text: '새로운 프로젝트를 맡아도 될까?' },
    { domain: 'career', text: '상사와의 갈등, 어떻게 해결할까?' },
    { domain: 'career', text: '프리랜서로 전환해도 괜찮을까?' },
    // 학업
    { domain: 'study', text: '이번 시험 잘 볼 수 있을까?' },
    { domain: 'study', text: '유학 준비하기 좋은 시기일까?' },
    { domain: 'study', text: '자격증 공부 시작해도 될까?' },
    { domain: 'study', text: '진로를 바꿔도 괜찮을까?' },
    // 건강
    { domain: 'health', text: '운동 루틴을 바꿔야 할까?' },
    { domain: 'health', text: '요즘 피곤한 이유가 뭘까?' },
    { domain: 'health', text: '다이어트 시작하기 좋은 시기일까?' },
    { domain: 'health', text: '수술 타이밍이 괜찮을까?' },
    // 관계
    { domain: 'compatibility', text: '친구 관계가 왜 자꾸 어려워질까?' },
    { domain: 'compatibility', text: '가족과의 갈등, 풀릴 수 있을까?' },
    { domain: 'compatibility', text: '새로운 모임에 나가면 좋을까?' },
    // 종합
    { domain: 'general', text: '요즘 왜 이렇게 기운이 없는 걸까?' },
    { domain: 'general', text: '새로운 시작을 해도 괜찮은 시기일까?' },
    { domain: 'general', text: '이사를 해도 좋을까?' },
    { domain: 'general', text: '요즘 운이 안 좋은 이유가 뭘까?' },
];

// 랜덤 질문 선택 함수
function getRandomQuestions(count: number = 4) {
    const shuffled = [...ALL_SUGGESTION_QUESTIONS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

export default function AiChatView({ isOpen, onClose, birthInput, sajuData }: AiChatViewProps) {
    const router = useRouter();
    const { token } = useAuth();
    const [inputText, setInputText] = useState('');
    const [domain, setDomain] = useState('general');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<DecisionResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [submittedQuestion, setSubmittedQuestion] = useState('');
    const [randomQuestions] = useState(() => getRandomQuestions(4));
    const [paymentError, setPaymentError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);

    const { canUseFeature, refreshWallet } = usePayment();
    const { canUse, price } = canUseFeature('ai_chat');
    const { price: followupPrice } = canUseFeature('ai_chat_followup');

    const sajuContext = useMemo(() => buildSajuContext(sajuData), [sajuData]);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!isOpen || !mounted) return null;

    const handleSubmit = async () => {
        const trimmed = inputText.trim();
        if (!trimmed || loading) return;

        setPaymentError(null);
        setError(null);

        if (!canUse) {
            setPaymentError(`엽전이 부족합니다. (필요: ${price}엽전)`);
            return;
        }

        setSubmittedQuestion(trimmed);
        setLoading(true);
        setResult(null);

        try {
            const response = await createDecision({
                birth_input: birthInput,
                question: trimmed,
                domain,
                saju_context: sajuContext,
            }, token || undefined);
            setResult(response);
            await refreshWallet();
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : '답변 생성에 실패했습니다. 다시 시도해주세요.';
            if (errorMessage.includes('부족') || errorMessage.includes('402')) {
                setPaymentError(errorMessage);
            } else {
                setError(errorMessage);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleReset = () => {
        setInputText('');
        setResult(null);
        setError(null);
        setSubmittedQuestion('');
    };

    const handleSuggestionClick = (suggestion: { domain: string; text: string }) => {
        setDomain(suggestion.domain);
        setInputText(suggestion.text);
    };

    const getRecommendationStyle = (rec: string) => {
        switch (rec) {
            case 'go': return { bg: '#ECFDF5', border: '#10B981', label: 'GO!', color: '#047857' };
            case 'wait': return { bg: '#FFFBEB', border: '#F59E0B', label: 'WAIT', color: '#B45309' };
            case 'no': return { bg: '#FEF2F2', border: '#EF4444', label: 'NO', color: '#B91C1C' };
            default: return { bg: '#F3F4F6', border: '#6B7280', label: '?', color: '#374151' };
        }
    };

    return createPortal(
        <div className={styles.container}>
            {/* 헤더 */}
            <div className={styles.header}>
                <button type="button" className={styles.backButton} onClick={onClose}>
                    <ChevronLeft size={24} />
                </button>
                <div className={styles.headerTitle}>
                    <Image
                        src="/icons/ai_dosa_v2.png"
                        alt="AI 도사"
                        width={32}
                        height={32}
                        className={styles.dosaAvatar}
                    />
                    <span>도사에게 물어보기</span>
                </div>
                <div style={{ width: 40 }} />
            </div>

            <div className={styles.scrollArea}>
                {/* 결과가 없을 때: 질문 폼 */}
                {!result && !loading && (
                    <div className={styles.questionForm}>
                        {/* 도사 인트로 */}
                        <div className={styles.intro}>
                            <Image
                                src="/icons/ai_dosa_v2.png"
                                alt="AI 도사"
                                width={80}
                                height={80}
                                className={styles.introDosa}
                            />
                            <h2>무엇이 고민이신가요?</h2>
                            <p>당신의 사주를 바탕으로 조언을 드릴게요</p>
                        </div>

                        {/* 분야 선택 */}
                        <div className={styles.section}>
                            <div className={styles.sectionLabel}>고민 분야</div>
                            <div className={styles.domainGrid}>
                                {DOMAIN_OPTIONS.map(opt => (
                                    <button
                                        type="button"
                                        key={opt.key}
                                        className={`${styles.domainChip} ${domain === opt.key ? styles.domainActive : ''}`}
                                        onClick={() => setDomain(opt.key)}
                                    >
                                        <Image
                                            src={opt.image}
                                            alt={opt.label}
                                            width={24}
                                            height={24}
                                            className={styles.domainIcon}
                                        />
                                        <span>{opt.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 질문 입력 */}
                        <div className={styles.section}>
                            <label className={styles.sectionLabel} htmlFor="ai-chat-question">질문</label>
                            <textarea
                                id="ai-chat-question"
                                className={styles.questionInput}
                                placeholder="예: 지금 이직을 해도 괜찮을까요?"
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                rows={3}
                            />
                        </div>

                        {/* 추천 질문 */}
                        {!inputText && (
                            <div className={styles.section}>
                                <div className={styles.sectionLabel}>이런 질문은 어때요?</div>
                                <div className={styles.suggestions}>
                                    {randomQuestions.map((s: { domain: string; text: string }) => (
                                        <button
                                            type="button"
                                            key={s.text}
                                            className={styles.suggestionBtn}
                                            onClick={() => handleSuggestionClick(s)}
                                        >
                                            {s.text}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 결제 오류 메시지 */}
                        {paymentError && (
                            <div className={styles.paymentError}>
                                <AlertCircle size={16} />
                                <span>{paymentError}</span>
                                <button
                                    type="button"
                                    className={styles.chargeLink}
                                    onClick={() => router.push('/charge')}
                                >
                                    충전하기
                                </button>
                            </div>
                        )}

                        {/* 제출 버튼 */}
                        <button
                            type="button"
                            className={styles.submitButton}
                            onClick={handleSubmit}
                            disabled={!inputText.trim()}
                        >
                            <Sparkles size={18} />
                            <span>
                                {`${price}엽전으로 물어보기`}
                            </span>
                        </button>

                        {/* 가격 안내 */}
                        <p className={styles.priceHint}>
                            <Coins size={14} />
                            새 상담의 첫 질문은 {price}엽전, 추가 대화는 한 번당 {followupPrice}엽전으로 이어갈 수 있어요.
                        </p>
                    </div>
                )}

                {/* 로딩 */}
                {loading && (
                    <div className={styles.loadingState}>
                        <Image
                            src="/icons/ai_dosa_v2.png"
                            alt="AI 도사"
                            width={100}
                            height={100}
                            className={styles.loadingDosa}
                        />
                        <div className={styles.loadingText}>
                            <Loader2 size={20} className={styles.spin} />
                            <span>도사가 점괘를 살펴보는 중...</span>
                        </div>
                        <p className={styles.loadingHint}>최대 1분 소요</p>
                    </div>
                )}

                {/* 에러 */}
                {error && (
                    <div className={styles.errorState}>
                        <p>{error}</p>
                        <button type="button" className={styles.retryButton} onClick={handleReset}>
                            <RefreshCw size={16} />
                            <span>다시 시도</span>
                        </button>
                    </div>
                )}

                {/* 결과 표시 */}
                {result && (
                    <div className={styles.resultContainer}>
                        {/* 질문 카드 */}
                        <div className={styles.questionCard}>
                            <div className={styles.questionCardLabel}>내 질문</div>
                            <p>{submittedQuestion}</p>
                        </div>

                        {/* 답변 카드 */}
                        <div className={styles.answerCard}>
                            <div className={styles.answerHeader}>
                                <Image
                                    src="/icons/ai_dosa_v2.png"
                                    alt="AI 도사"
                                    width={40}
                                    height={40}
                                    className={styles.answerDosa}
                                />
                                <span>도사의 답변</span>
                            </div>

                            {/* 추천 배지 */}
                            <div
                                className={styles.recommendBadge}
                                style={{
                                    background: getRecommendationStyle(result.recommendation).bg,
                                    borderColor: getRecommendationStyle(result.recommendation).border,
                                    color: getRecommendationStyle(result.recommendation).color,
                                }}
                            >
                                {getRecommendationStyle(result.recommendation).label}
                            </div>

                            {/* 요약 */}
                            <div className={styles.summaryText}>
                                <GlossaryHighlight text={result.summary} />
                            </div>

                            {/* 장단점 그리드 */}
                            <div className={styles.prosConsGrid}>
                                <div className={styles.prosBox}>
                                    <div className={styles.boxHeader}>
                                        <ThumbsUp size={16} />
                                        <span>장점/기회</span>
                                    </div>
                                    <ul>
                                        {result.pros.map((p) => (
                                            <li key={p}><GlossaryHighlight text={p} /></li>
                                        ))}
                                    </ul>
                                </div>
                                <div className={styles.consBox}>
                                    <div className={styles.boxHeader}>
                                        <ThumbsDown size={16} />
                                        <span>단점/리스크</span>
                                    </div>
                                    <ul>
                                        {result.cons.map((c) => (
                                            <li key={c}><GlossaryHighlight text={c} /></li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            {/* 액션 리스트 */}
                            {result.next_actions.length > 0 && (
                                <div className={styles.actionsBox}>
                                    <div className={styles.boxHeader}>
                                        <Zap size={16} />
                                        <span>당장 해볼 것</span>
                                    </div>
                                    <ul>
                                        {result.next_actions.map((a) => (
                                            <li key={a}><GlossaryHighlight text={a} /></li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* 도사의 조언 */}
                            {result.advice && (
                                <div className={styles.adviceBox}>
                                    <div className={styles.adviceHeader}>
                                        <Image src="/icons/ai_dosa_v2.png" alt="AI 도사" width={24} height={24} />
                                        <span>도사의 조언</span>
                                    </div>
                                    <p className={styles.adviceContent}>
                                        <GlossaryHighlight text={result.advice} />
                                    </p>
                                </div>
                            )}

                            {/* 면책 */}
                            <p className={styles.disclaimer}>* {result.disclaimer}</p>
                        </div>

                        {/* 새 질문 버튼 */}
                        <button type="button" className={styles.newQuestionButton} onClick={handleReset}>
                            <RefreshCw size={18} />
                            <span>새 질문하기</span>
                        </button>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}
