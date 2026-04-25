'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import styles from './MultiTurnChat.module.css';
import { BirthInput, ReadingResponse, ChatSessionResponse, ChatMessageResponse, DecisionResponse } from '@/types';
import { createChatSession, closeChatSession, deleteChatSession, getChatSessions, getChatSession, sendChatMessageStream } from '@/lib/api';
import GlossaryHighlight from './GlossaryHighlight';
import {
    Loader2, Sparkles,
    ThumbsUp, ThumbsDown, Zap, ChevronLeft, RefreshCw,
    Coins, AlertCircle, Send, XCircle, Info, MessageSquarePlus, Trash2
} from 'lucide-react';
import Image from 'next/image';
import { usePayment } from '@/contexts/PaymentContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

interface MultiTurnChatProps {
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

const DOMAIN_OPTIONS = [
    { key: 'general', label: '종합', image: '/icons/crystal.png' },
    { key: 'love', label: '연애', image: '/icons/love.png' },
    { key: 'money', label: '금전', image: '/icons/money.png' },
    { key: 'career', label: '직장', image: '/icons/career.png' },
    { key: 'study', label: '학업', image: '/icons/study.png' },
    { key: 'health', label: '건강', image: '/icons/health.png' },
    { key: 'compatibility', label: '관계', image: '/icons/compatibility.png' },
];

const ALL_SUGGESTION_QUESTIONS = [
    { domain: 'love', text: '지금 썸타는 사람한테 먼저 연락해도 될까?' },
    { domain: 'love', text: '요즘 만나는 사람이랑 잘 맞는 걸까?' },
    { domain: 'money', text: '이번 달에 큰 지출을 해도 괜찮을까?' },
    { domain: 'money', text: '투자를 시작해도 좋은 시기일까?' },
    { domain: 'career', text: '이직을 고민 중인데 지금이 좋은 타이밍일까?' },
    { domain: 'career', text: '승진 가능성이 있을까?' },
    { domain: 'study', text: '이번 시험 잘 볼 수 있을까?' },
    { domain: 'health', text: '운동 루틴을 바꿔야 할까?' },
    { domain: 'compatibility', text: '친구 관계가 왜 자꾸 어려워질까?' },
    { domain: 'general', text: '요즘 왜 이렇게 기운이 없는 걸까?' },
];

function getRandomQuestions(count: number = 4) {
    const shuffled = [...ALL_SUGGESTION_QUESTIONS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

const RECENT_CHAT_SESSIONS_LIMIT = 5;
const LAST_CHAT_SESSION_STORAGE_KEY = 'last_chat_session_id';

type SessionLoadResult = 'ok' | 'not_found' | 'error';

function buildChatSessionScopeKey(birthInput: BirthInput | undefined): string {
    if (!birthInput) return 'chat_scope_unknown';

    const birthSolar = (birthInput.birth_solar || '').trim();
    const birthHour = (birthInput.birth_time || '').split(':')[0]?.trim() || '';
    const calendarType = (birthInput.calendar_type || 'solar').trim().toLowerCase();
    const gender = (birthInput.gender || 'male').trim().toLowerCase();
    const persona = (birthInput.persona || 'classic').toString().trim().toLowerCase();

    return `${LAST_CHAT_SESSION_STORAGE_KEY}:${birthSolar}:${birthHour}:${calendarType}:${gender}:${persona}`;
}

export default function MultiTurnChat({ isOpen, onClose, birthInput, sajuData }: MultiTurnChatProps) {
    const router = useRouter();
    const { token, isAuthenticated } = useAuth();
    const [inputText, setInputText] = useState('');
    const [domain, setDomain] = useState('general');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [paymentError, setPaymentError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);
    const [randomQuestions] = useState(() => getRandomQuestions(4));

    // Chat Session State
    const [session, setSession] = useState<ChatSessionResponse | null>(null);
    const [messages, setMessages] = useState<ChatMessageResponse[]>([]);
    const [recentSessions, setRecentSessions] = useState<ChatSessionResponse[]>([]);
    const [loadingSessions, setLoadingSessions] = useState(false);
    const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
    const [sessionListError, setSessionListError] = useState<string | null>(null);
    const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
    const [streamingText, setStreamingText] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);

    const { canUseFeature, refreshWallet } = usePayment();
    const { canUse, price } = canUseFeature('ai_chat');
    const { price: followupPrice } = canUseFeature('ai_chat_followup');

    const sajuContext = useMemo(() => buildSajuContext(sajuData), [sajuData]);
    const sessionScopeKey = useMemo(() => buildChatSessionScopeKey(birthInput), [birthInput]);
    const scrollRef = useRef<HTMLDivElement>(null);
    const isCompletedSession = session?.status === 'completed';
    const isSwitchingSession = Boolean(loadingSessionId);
    const scrollVersion = `${messages.length}:${streamingText.length}:${loading ? '1' : '0'}`;

    const persistLastSessionId = useCallback((sessionData: ChatSessionResponse | null) => {
        if (typeof window === 'undefined') return;

        if (sessionData && sessionData.status === 'active') {
            sessionStorage.setItem(sessionScopeKey, sessionData.id);
            return;
        }

        sessionStorage.removeItem(sessionScopeKey);
    }, [sessionScopeKey]);

    const loadRecentSessions = useCallback(async (): Promise<ChatSessionResponse[]> => {
        if (!isAuthenticated) {
            setRecentSessions([]);
            return [];
        }

        setLoadingSessions(true);
        setSessionListError(null);

        try {
            const sessions = await getChatSessions(
                token || undefined,
                birthInput
                    ? {
                        birth_solar: birthInput.birth_solar,
                        birth_time: birthInput.birth_time,
                        gender: birthInput.gender,
                        calendar_type: birthInput.calendar_type,
                        persona: birthInput.persona,
                    }
                    : undefined
            );
            const normalized = sessions
                .filter(item => item.status === 'active' || item.status === 'completed')
                .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
                .slice(0, RECENT_CHAT_SESSIONS_LIMIT);

            setRecentSessions(normalized);
            return normalized;
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : '세션 목록을 불러오지 못했습니다.';
            setSessionListError(errorMessage);
            setRecentSessions([]);
            return [];
        } finally {
            setLoadingSessions(false);
        }
    }, [isAuthenticated, token, birthInput]);

    const loadSessionHistory = useCallback(async (sessionId: string, options?: { refreshList?: boolean }): Promise<SessionLoadResult> => {
        if (!isAuthenticated) {
            setError('로그인 세션을 확인하는 중입니다. 잠시 후 다시 시도해주세요.');
            return 'error';
        }

        setLoadingSessionId(sessionId);
        setError(null);
        setPaymentError(null);

        try {
            const historyRes = await getChatSession(sessionId, token || undefined);
            if (!historyRes?.session || !Array.isArray(historyRes.messages)) {
                throw new Error('세션 응답 형식이 올바르지 않습니다.');
            }
            setSession(historyRes.session);
            setMessages(historyRes.messages);
            setInputText('');
            persistLastSessionId(historyRes.session);

            if (options?.refreshList !== false) {
                await loadRecentSessions();
            }
            return 'ok';
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : '세션을 불러오지 못했습니다.';
            const status = typeof e === 'object' && e && 'status' in e ? Number((e as { status?: number }).status) : undefined;
            if (status === 404) {
                persistLastSessionId(null);
            }
            setError(errorMessage);
            return status === 404 ? 'not_found' : 'error';
        } finally {
            setLoadingSessionId(null);
        }
    }, [isAuthenticated, loadRecentSessions, persistLastSessionId, token]);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        void scrollVersion;
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [scrollVersion]);

    useEffect(() => {
        if (!isOpen) return;
        setSession(null);
        setMessages([]);
        setInputText('');
        setError(null);
        setPaymentError(null);
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen || !isAuthenticated) return;

        let isCancelled = false;

        const initializeSessions = async () => {
            const sessions = await loadRecentSessions();

            if (isCancelled || typeof window === 'undefined') {
                return;
            }

            const lastSessionId = sessionStorage.getItem(sessionScopeKey);
            if (!lastSessionId) {
                return;
            }

            const restorableSession = sessions.find(item => item.id === lastSessionId);
            if (restorableSession) {
                await loadSessionHistory(lastSessionId, { refreshList: false });
                return;
            }

            const restored = await loadSessionHistory(lastSessionId, { refreshList: false });
            if (restored === 'not_found') {
                sessionStorage.removeItem(sessionScopeKey);
            }
        };

        void initializeSessions();

        return () => {
            isCancelled = true;
        };
    }, [isAuthenticated, isOpen, loadRecentSessions, loadSessionHistory, sessionScopeKey]);

    if (!isOpen || !mounted) return null;

    const handleStartSession = async () => {
        const trimmed = inputText.trim();
        if (!trimmed || loading || isSwitchingSession) return;

        setPaymentError(null);
        setError(null);

        if (!canUse) {
            setPaymentError(`엽전이 부족합니다. (필요: ${price}엽전)`);
            return;
        }

        setLoading(true);
        setStreamingText('');
        setIsStreaming(true);

        try {
            const sessionRes = await createChatSession({
                birth_input: birthInput,
                domain,
                persona: birthInput.persona || 'classic',
                saju_context: sajuContext ? { summary: sajuContext } : undefined,
                max_turns: 20,
            }, token || undefined);

            const provisionalSession: ChatSessionResponse = {
                id: sessionRes.session_id,
                user_id: '',
                birth_key: '',
                domain,
                persona: birthInput.persona || 'classic',
                status: 'active',
                max_turns: 20,
                current_turn: 0,
                remaining_turns: sessionRes.remaining_turns,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            setSession(provisionalSession);

            const userMsg: ChatMessageResponse = {
                id: `local-user-${Date.now()}`,
                session_id: sessionRes.session_id,
                turn: 1,
                role: 'user',
                content: trimmed,
                response_format: 'freeform',
                tokens_used: 0,
                cost_coins: 0,
                created_at: new Date().toISOString(),
            };

            setMessages([userMsg]);
            setInputText('');

            await sendChatMessageStream(
                sessionRes.session_id,
                trimmed,
                token || undefined,
                {
                    onDelta: (delta) => {
                        setStreamingText((prev) => prev + delta);
                    },
                    onDone: (data) => {
                        setSession(data.session);
                        persistLastSessionId(data.session);
                        setMessages([userMsg, data.message]);
                        setStreamingText('');
                        setIsStreaming(false);
                        void Promise.all([refreshWallet(), loadRecentSessions()]);
                    },
                    onError: (err) => {
                        if (err.message?.includes('부족') || err.message?.includes('402')) {
                            setPaymentError('엽전이 부족합니다. 충전 후 대화를 이어가세요.');
                        } else {
                            setError(err.message || '답변 생성에 실패했습니다.');
                        }
                        setSession(null);
                        setMessages([]);
                        persistLastSessionId(null);
                        setStreamingText('');
                        setIsStreaming(false);
                    },
                }
            );
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : '답변 생성에 실패했습니다.';
            if (errorMessage.includes('부족') || errorMessage.includes('402')) {
                setPaymentError(errorMessage);
            } else {
                setError(errorMessage);
            }
            setSession(null);
            setMessages([]);
            persistLastSessionId(null);
            setStreamingText('');
            setIsStreaming(false);
        } finally {
            setIsStreaming(false);
            setLoading(false);
        }
    };

    const handleSendMessage = async () => {
        const trimmed = inputText.trim();
        if (!trimmed || loading || isStreaming || isSwitchingSession || !session || session.status !== 'active') return;

        setPaymentError(null);
        setError(null);

        const tempMsgId = `temp-user-${Date.now()}`;
        const userMsg: ChatMessageResponse = {
            id: tempMsgId,
            session_id: session.id,
            turn: session.current_turn + 1,
            role: 'user',
            content: trimmed,
            response_format: 'freeform',
            tokens_used: 0,
            cost_coins: 0,
            created_at: new Date().toISOString(),
        };

        setLoading(true);
        setStreamingText('');
        setIsStreaming(true);
        setMessages(prev => [...prev, userMsg]);
        setInputText('');

        try {
            let accumulated = '';
            await sendChatMessageStream(
                session.id,
                trimmed,
                token || undefined,
                {
                    onDelta: (delta) => {
                        accumulated += delta;
                        setStreamingText(accumulated);
                    },
                    onDone: (data) => {
                        setSession(data.session);
                        persistLastSessionId(data.session);
                        setMessages(prev => [...prev.filter(m => m.id !== tempMsgId), userMsg, data.message]);
                        setStreamingText('');
                        setIsStreaming(false);
                        void Promise.all([refreshWallet(), loadRecentSessions()]);
                    },
                    onError: (err) => {
                        if (err.message?.includes('부족') || err.message?.includes('402')) {
                            setPaymentError('엽전이 부족합니다. 충전 후 대화를 이어가세요.');
                            const sysMsg: ChatMessageResponse = {
                                id: `sys-${Date.now()}`,
                                session_id: session.id,
                                turn: session.current_turn,
                                role: 'system',
                                content: '엽전이 부족합니다. 충전 후 대화를 이어가세요.',
                                response_format: 'system',
                                tokens_used: 0,
                                cost_coins: 0,
                                created_at: new Date().toISOString(),
                            };
                            setMessages(prev => [...prev, sysMsg]);
                        } else {
                            setError(err.message || '메시지 전송에 실패했습니다.');
                        }
                        setMessages(prev => prev.filter(m => m.id !== tempMsgId));
                        setInputText(trimmed);
                        setIsStreaming(false);
                    },
                }
            );
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : '메시지 전송에 실패했습니다.';
            if (errorMessage.includes('부족') || errorMessage.includes('402')) {
                setPaymentError('엽전이 부족합니다. 충전 후 대화를 이어가세요.');
            } else {
                setError(errorMessage);
            }
            setMessages(prev => prev.filter(m => m.id !== tempMsgId));
            setInputText(trimmed);
            setIsStreaming(false);
        } finally {
            setIsStreaming(false);
            setLoading(false);
        }
    };

    const handleCloseSession = async () => {
        if (!session) return;
        const confirmed = window.confirm('이 상담을 종료하면 이어서 대화할 수 없고 읽기 전용으로 바뀝니다. 정말 종료할까요?');
        if (!confirmed) return;
        try {
            await closeChatSession(session.id, token || undefined);
            setSession(null);
            persistLastSessionId(null);
            setMessages([]);
            setInputText('');
            setError(null);
            setPaymentError(null);
            await loadRecentSessions();
        } catch (e) {
            console.error('Failed to close session', e);
            // Force close locally anyway
            setSession(null);
            persistLastSessionId(null);
            setMessages([]);
        }
    };

    const handleNewConversation = () => {
        setSession(null);
        setMessages([]);
        setInputText('');
        setError(null);
        setPaymentError(null);
        setStreamingText('');
        setIsStreaming(false);
        persistLastSessionId(null);
    };

    const handleSelectSession = async (sessionId: string) => {
        if (loading || isSwitchingSession) return;
        await loadSessionHistory(sessionId);
    };

    const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation();
        if (deletingSessionId) return;
        if (!confirm('이 상담 세션을 삭제하시겠습니까?\n삭제된 대화는 복구할 수 없습니다.')) return;

        setDeletingSessionId(sessionId);
        try {
            await deleteChatSession(sessionId, token ?? undefined);
            if (session?.id === sessionId) {
                handleNewConversation();
            }
            await loadRecentSessions();
        } catch (err) {
            const msg = err instanceof Error ? err.message : '세션 삭제에 실패했습니다.';
            setSessionListError(msg);
        } finally {
            setDeletingSessionId(null);
        }
    };

    const domainLabelByKey = (domainKey: string) => {
        return DOMAIN_OPTIONS.find(option => option.key === domainKey)?.label || domainKey;
    };

    const handleSuggestionClick = (suggestion: { domain: string; text: string }) => {
        setDomain(suggestion.domain);
        setInputText(suggestion.text);
    };

    const renderDecisionCard = (decision: DecisionResponse) => {
        return (
            <div className={styles.decisionCard}>
                <div className={styles.decisionHeader}>
                    <Image src="/icons/ai_dosa_v2.png" alt="AI 도사" width={24} height={24} />
                    <span>도사의 첫 번째 조언</span>
                </div>
                <div className={styles.decisionSummary}>
                    <GlossaryHighlight text={decision.summary} />
                </div>
                <div className={styles.decisionGrid}>
                    <div className={`${styles.decisionBox} ${styles.pros}`}>
                        <div className={styles.decisionBoxTitle}><ThumbsUp size={14} /> 장점/기회</div>
                        <ul>{decision.pros.map((p) => <li key={p}><GlossaryHighlight text={p} /></li>)}</ul>
                    </div>
                    <div className={`${styles.decisionBox} ${styles.cons}`}>
                        <div className={styles.decisionBoxTitle}><ThumbsDown size={14} /> 단점/리스크</div>
                        <ul>{decision.cons.map((c) => <li key={c}><GlossaryHighlight text={c} /></li>)}</ul>
                    </div>
                    {decision.next_actions.length > 0 && (
                        <div className={`${styles.decisionBox} ${styles.actions}`}>
                            <div className={styles.decisionBoxTitle}><Zap size={14} /> 당장 해볼 것</div>
                            <ul>{decision.next_actions.map((a) => <li key={a}><GlossaryHighlight text={a} /></li>)}</ul>
                        </div>
                    )}
                </div>
                {decision.advice && (
                    <div className={styles.decisionAdvice}>
                        <GlossaryHighlight text={decision.advice} />
                    </div>
                )}
                <div className={styles.decisionDisclaimer}>* {decision.disclaimer}</div>
            </div>
        );
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
                <div className={styles.headerRight}>
                    {session && (
                        <>
                            <span className={styles.turnsBadge}>
                                {isCompletedSession ? '완료된 상담' : `남은 턴: ${session.remaining_turns}`}
                            </span>
                            <button type="button" className={styles.closeSessionBtn} onClick={handleNewConversation} title="새로운 대화" disabled={loading || isStreaming}>
                                <MessageSquarePlus size={20} />
                            </button>
                            {!isCompletedSession && (
                                <button type="button" className={styles.closeSessionBtn} onClick={handleCloseSession} title="대화 종료">
                                    <XCircle size={20} />
                                </button>
                            )}
                        </>
                    )}
                    {!session && <div style={{ width: 40 }} />}
                </div>
            </div>

            <div className={styles.sessionHistorySection}>
                <div className={styles.sessionHistoryHeader}>
                    <span>최근 상담 세션</span>
                    <button
                        type="button"
                        className={styles.sessionRefreshButton}
                        onClick={() => void loadRecentSessions()}
                        disabled={loadingSessions || isSwitchingSession || loading}
                    >
                        <RefreshCw size={14} className={loadingSessions ? styles.spin : ''} />
                        새로고침
                    </button>
                </div>

                {loadingSessions ? (
                    <p className={styles.sessionHistoryHint}>최근 세션을 불러오는 중...</p>
                ) : recentSessions.length === 0 ? (
                    <p className={styles.sessionHistoryHint}>최근 상담 세션이 없습니다.</p>
                ) : (
                    <div className={styles.sessionHistoryList}>
                        {recentSessions.map(item => {
                            const isSelected = session?.id === item.id;
                            const isCompleted = item.status === 'completed';

                            return (
                                <div
                                    key={item.id}
                                    className={`${styles.sessionHistoryItem} ${isSelected ? styles.sessionHistoryItemActive : ''}`}
                                >
                                    <button
                                        type="button"
                                        className={styles.sessionHistorySelectBtn}
                                        onClick={() => void handleSelectSession(item.id)}
                                        disabled={loadingSessionId === item.id || loading}
                                    >
                                        <div className={styles.sessionHistoryRow}>
                                            <span className={styles.sessionDomain}>{domainLabelByKey(item.domain)}</span>
                                            <div className={styles.sessionHistoryActions}>
                                                <span className={`${styles.sessionStatusBadge} ${isCompleted ? styles.completedBadge : styles.activeBadge}`}>
                                                    {isCompleted ? '완료' : '진행중'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className={styles.sessionHistoryRowMuted}>
                                            <span>
                                                {new Date(item.updated_at).toLocaleString('ko-KR', {
                                                    month: '2-digit',
                                                    day: '2-digit',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                })}
                                            </span>
                                            <span>{isCompleted ? '읽기 전용' : `남은 턴 ${item.remaining_turns}`}</span>
                                        </div>
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.sessionDeleteBtn}
                                        onClick={(e) => void handleDeleteSession(e, item.id)}
                                        disabled={deletingSessionId === item.id}
                                        title="세션 삭제"
                                    >
                                        {deletingSessionId === item.id ? (
                                            <Loader2 size={13} className={styles.spin} />
                                        ) : (
                                            <Trash2 size={13} />
                                        )}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}

                {sessionListError && <p className={styles.sessionHistoryError}>{sessionListError}</p>}
            </div>

            <div className={styles.scrollArea} ref={scrollRef}>
                {/* 세션이 없을 때: 질문 폼 (Turn 1) */}
                {!session && !loading && (
                    <div className={styles.questionForm}>
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

                        <div className={styles.section}>
                            <label className={styles.sectionLabel} htmlFor="multi-turn-chat-question">질문</label>
                            <textarea
                                id="multi-turn-chat-question"
                                className={styles.questionInput}
                                placeholder="예: 지금 이직을 해도 괜찮을까요?"
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                rows={3}
                            />
                        </div>

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

                        {error && (
                            <div className={styles.errorState}>
                                <p>{error}</p>
                            </div>
                        )}

                        <button
                            type="button"
                            className={styles.submitButton}
                            onClick={handleStartSession}
                            disabled={!inputText.trim()}
                        >
                            <Sparkles size={18} />
                            <span>
                                {`${price}엽전으로 물어보기`}
                            </span>
                        </button>

                        <p className={styles.priceHint}>
                            <Coins size={14} />
                            새 상담의 첫 질문은 {price}엽전, 추가 대화는 한 번당 {followupPrice}엽전으로 이어갈 수 있어요.
                        </p>
                    </div>
                )}

                {/* 세션이 있을 때: 채팅 메시지 리스트 (Turn 2+) */}
                {session && (
                    <div className={styles.messageList}>
                        {isCompletedSession ? (
                            <div className={`${styles.systemBanner} ${styles.readOnlyBanner}`}>
                                <Info size={14} />
                                <span>완료된 세션입니다. 메시지는 읽기 전용으로만 볼 수 있어요.</span>
                            </div>
                        ) : (
                            <div className={`${styles.systemBanner} ${styles.followupPriceBanner}`}>
                                <Info size={14} />
                                <span>이어서 묻는 질문부터는 한 번당 {followupPrice}엽전이 차감돼요.</span>
                            </div>
                        )}

                        {messages.map((msg) => (
                            <div key={msg.id} className={`${styles.messageRow} ${styles[msg.role]}`}>
                                {msg.response_format === 'decision' && typeof msg.content === 'object' ? (
                                    renderDecisionCard(msg.content as DecisionResponse)
                                ) : (
                                    <div className={styles.messageBubble}>
                                        {typeof msg.content === 'string' ? (
                                            <GlossaryHighlight text={msg.content} />
                                        ) : (
                                            JSON.stringify(msg.content)
                                        )}
                                    </div>
                                )}
                                {msg.role !== 'system' && (
                                    <div className={styles.messageTime}>
                                        {new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                )}
                            </div>
                        ))}

                        {isStreaming && streamingText && (
                            <div className={`${styles.messageRow} ${styles.assistant}`}>
                                <div className={styles.messageBubble}>
                                    <GlossaryHighlight text={streamingText} />
                                </div>
                            </div>
                        )}

                        {loading && !isStreaming && (
                            <div className={`${styles.messageRow} ${styles.assistant}`}>
                                <div className={styles.messageBubble}>
                                    <Loader2 size={16} className={styles.spin} style={{ display: 'inline-block', verticalAlign: 'middle' }} />
                                    <span style={{ marginLeft: '8px' }}>도사가 생각 중...</span>
                                </div>
                            </div>
                        )}

                        {error && (
                            <div className={`${styles.messageRow} ${styles.system}`}>
                                <div className={styles.messageBubble} style={{ color: 'var(--error)' }}>
                                    {error}
                                </div>
                            </div>
                        )}

                        {paymentError && (
                            <div className={`${styles.messageRow} ${styles.system}`}>
                                <div className={styles.messageBubble} style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                                    <span style={{ color: 'var(--error)' }}>{paymentError}</span>
                                    <button type="button" className={styles.chargeLink} onClick={() => router.push('/charge')}>
                                        충전하기
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* 로딩 (Turn 1) */}
                {!session && loading && !isStreaming && (
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
            </div>

            {/* 채팅 입력창 (Turn 2+) */}
            {session && isCompletedSession && (
                <div className={styles.readOnlyFooter}>
                    <span className={styles.readOnlyMessage}>완료된 상담이라 메시지를 보낼 수 없습니다.</span>
                    <button type="button" className={styles.submitButton} onClick={handleNewConversation}>
                        <MessageSquarePlus size={18} />
                        <span>새로운 대화 시작하기</span>
                    </button>
                </div>
            )}
            {session && !isCompletedSession && (
                <div className={styles.chatInputArea}>
                    <div className={styles.chatInputCostHint}>
                        <Coins size={12} />
                        <span>추가 질문 1회 {followupPrice}엽전</span>
                    </div>
                    <div className={styles.chatInputRow}>
                        <textarea
                            className={styles.chatInput}
                            placeholder="도사에게 추가로 물어보세요..."
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    void handleSendMessage();
                                }
                            }}
                            rows={1}
                            disabled={loading || isStreaming || isSwitchingSession || session.remaining_turns <= 0}
                        />
                        <button
                            type="button"
                            className={styles.sendButton}
                            aria-label="메시지 보내기"
                            onClick={handleSendMessage}
                            disabled={!inputText.trim() || loading || isStreaming || isSwitchingSession || session.remaining_turns <= 0}
                        >
                            <Send size={20} />
                        </button>
                    </div>
                </div>
            )}
        </div>,
        document.body
    );
}
