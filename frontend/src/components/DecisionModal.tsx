import { useMemo, useState } from 'react';
import styles from './DecisionModal.module.css';
import { BirthInput, DecisionResponse, ReadingResponse } from '@/types';
import { createDecision } from '@/lib/api';
import GlossaryHighlight from './GlossaryHighlight';
import {
    CheckCircle, Clock, XCircle, Compass, Lightbulb, Loader2, Sparkles,
    ThumbsUp, ThumbsDown, Zap, X
} from 'lucide-react';

interface DecisionModalProps {
    isOpen: boolean;
    onClose: () => void;
    birthInput: BirthInput;
    sajuData?: ReadingResponse;
}

function buildSajuContext(sajuData: ReadingResponse | undefined, domain: string) {
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
        adv?.geokguk_yongsin?.heesin ? `희신: ${adv.geokguk_yongsin.heesin}` : null,
        adv?.geokguk_yongsin?.gisin ? `기신: ${adv.geokguk_yongsin.gisin}` : null,
        sajuData.card?.character?.summary ? `캐릭터: ${sajuData.card.character.summary}` : null,
        (sajuData.card?.tags?.length ?? 0) > 0 ? `태그: ${sajuData.card.tags.join(', ')}` : null,
    ]
        .filter(Boolean)
        .join('\n');

    const tab = sajuData.tabs as unknown as Record<string, { summary?: string } | undefined>;
    const domainText =
        domain === 'love'
            ? `연애 탭 요약: ${tab?.love?.summary || ''}`
            : domain === 'money'
                ? `금전 탭 요약: ${tab?.money?.summary || ''}`
                : domain === 'career'
                    ? `커리어 탭 요약: ${tab?.career?.summary || ''}`
                    : domain === 'study'
                        ? `학업 탭 요약: ${tab?.study?.summary || ''}`
                        : domain === 'health'
                            ? `건강 탭 요약: ${tab?.health?.summary || ''}`
                            : `종합 탭 한줄: ${sajuData.one_liner || ''}`;

    return [core, domainText].filter(Boolean).join('\n\n').trim();
}

export default function DecisionModal({ isOpen, onClose, birthInput, sajuData }: DecisionModalProps) {
    const [question, setQuestion] = useState('');
    const [domain, setDomain] = useState('general');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<DecisionResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    // useMemo must be called before any conditional returns
    const sajuContext = useMemo(() => buildSajuContext(sajuData, domain), [sajuData, domain]);

    // Conditional return AFTER all hooks
    if (!isOpen) return null;

    const handleSubmit = async () => {
        const trimmed = question.trim();
        if (!trimmed) return;

        setLoading(true);
        setError(null);

        try {
            const response = await createDecision({
                birth_input: birthInput,
                question: trimmed,
                domain,
                saju_context: sajuContext,
            });

            setResult(response);
        } catch (e) {
            setError(e instanceof Error ? e.message : '결정 분석에 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleReset = () => {
        setResult(null);
        setQuestion('');
        setError(null);
    };

    const getRecommendationIcon = (rec: string) => {
        switch (rec) {
            case 'go': return <CheckCircle size={24} color="#10B981" />;
            case 'wait': return <Clock size={24} color="#F59E0B" />;
            case 'no': return <XCircle size={24} color="#EF4444" />;
            default: return <Clock size={24} color="#6B7280" />;
        }
    };

    return (
        <div className={styles.overlay} onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
        }}>
            <div className={styles.modal}>
                <div className={styles.header}>
                    <h2><Compass size={20} style={{ display: 'inline', marginRight: '6px' }} /> 결정 내비게이션</h2>
                    <button className={styles.closeButton} onClick={onClose}><X size={20} /></button>
                </div>

                <div className={styles.content}>
                    {!result ? (
                        <>
                            <p style={{ fontSize: '14px', color: '#6B7280', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Lightbulb size={16} /> 분석된 사주 정보를 바탕으로 AI 분석가가 맞춤 조언을 드려요!
                            </p>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>고민 분야</label>
                                <select
                                    className={styles.select}
                                    value={domain}
                                    onChange={(e) => setDomain(e.target.value)}
                                >
                                    <option value="general">일반 고민</option>
                                    <option value="love">연애/썸</option>
                                    <option value="money">금전/투자</option>
                                    <option value="career">이직/취업</option>
                                    <option value="study">학업/진로</option>
                                    <option value="health">건강</option>
                                </select>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>구체적인 질문</label>
                                <textarea
                                    className={styles.textarea}
                                    placeholder="예: 지금 썸타는 사람한테 먼저 연락해도 될까?"
                                    value={question}
                                    onChange={(e) => setQuestion(e.target.value)}
                                />
                            </div>
                            <button
                                className={styles.submitButton}
                                onClick={handleSubmit}
                                disabled={loading || !question.trim()}
                            >
                                {loading ? (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Loader2 size={16} className={styles.spin} /> AI가 분석 중...
                                    </span>
                                ) : (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        결정 확인하기 <Sparkles size={16} />
                                    </span>
                                )}
                            </button>
                            {error && (
                                <p style={{ marginTop: '12px', fontSize: '13px', color: '#B91C1C' }}>
                                    {error}
                                </p>
                            )}
                        </>
                    ) : (
                        <div className={styles.resultContainer}>
                            <div className={`${styles.verdict} ${styles[result.recommendation]}`}>
                                <div className={styles.verdictTitle}>
                                    {getRecommendationIcon(result.recommendation)}
                                    <span style={{ marginLeft: '8px' }}>{result.recommendation.toUpperCase()}</span>
                                </div>
                                <div><GlossaryHighlight text={result.summary} /></div>
                            </div>

                            <div>
                                <h4 className={styles.sectionTitle}><ThumbsUp size={16} /> 장점/기회</h4>
                                <ul className={styles.list}>
                                    {result.pros.map((item, i) => <li key={i} className={styles.listItem}><GlossaryHighlight text={item} /></li>)}
                                </ul>
                            </div>

                            <div>
                                <h4 className={styles.sectionTitle}><ThumbsDown size={16} /> 단점/리스크</h4>
                                <ul className={styles.list}>
                                    {result.cons.map((item, i) => <li key={i} className={styles.listItem}><GlossaryHighlight text={item} /></li>)}
                                </ul>
                            </div>

                            <div>
                                <h4 className={styles.sectionTitle}><Zap size={16} /> 당장 해야 할 일</h4>
                                <ul className={styles.list}>
                                    {result.next_actions.map((item, i) => <li key={i} className={styles.listItem}><GlossaryHighlight text={item} /></li>)}
                                </ul>
                            </div>

                            <p style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '10px' }}>
                                * {result.disclaimer}
                            </p>

                            <button className={styles.resetButton} onClick={handleReset}>
                                다른 질문 하기
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
