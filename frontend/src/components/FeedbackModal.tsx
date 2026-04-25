'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  X,
  Bug,
  Lightbulb,
  MessageCircle,
  Send,
  CreditCard,
  UserCog,
  HelpCircle,
  Clock,
  CheckCircle,
  AlertCircle,
  Inbox,
  MessageSquare,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import styles from './FeedbackModal.module.css';
import { FeedbackHistoryItem, getMyFeedbacks, markFeedbackRepliesRead } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

type FeedbackCategory = 'bug' | 'feature' | 'other' | 'payment' | 'account' | 'inquiry';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (category: FeedbackCategory, content: string) => Promise<void>;
  onRepliesRead?: (count: number) => void;
}

const CATEGORY_INFO: Record<FeedbackCategory, { icon: React.ReactNode; label: string; description: string }> = {
  bug: {
    icon: <Bug size={20} />,
    label: '버그 신고',
    description: '오류나 문제점을 알려주세요',
  },
  feature: {
    icon: <Lightbulb size={20} />,
    label: '개선 제안',
    description: '새로운 기능이나 개선 아이디어',
  },
  other: {
    icon: <MessageCircle size={20} />,
    label: '기타 의견',
    description: '자유롭게 의견을 남겨주세요',
  },
  payment: {
    icon: <CreditCard size={20} />,
    label: '결제 문제',
    description: '결제, 환불, 엽전 관련 문의',
  },
  account: {
    icon: <UserCog size={20} />,
    label: '계정 문제',
    description: '로그인, 회원정보, 연동 관련',
  },
  inquiry: {
    icon: <HelpCircle size={20} />,
    label: '일반 문의',
    description: '서비스 이용 관련 궁금한 점',
  },
};

const MIN_LENGTH = 10;
const MAX_LENGTH = 1000;

export default function FeedbackModal({ isOpen, onClose, onSubmit, onRepliesRead }: FeedbackModalProps) {
  const { isAuthenticated, token } = useAuth();
  const [category, setCategory] = useState<FeedbackCategory>('feature');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'form' | 'history'>('form');
  const [historyItems, setHistoryItems] = useState<FeedbackHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const unreadReplyCount = historyItems.filter((item) => item.has_unread_reply).length;

  const contentLength = content.trim().length;
  const isValid = contentLength >= MIN_LENGTH && contentLength <= MAX_LENGTH;

  const loadHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const items = await getMyFeedbacks(token || undefined);
      setHistoryItems(items);
      setExpandedItems(new Set(items.filter((item) => item.response).map((item) => item.id)));

      const unreadItems = items.filter((item) => item.has_unread_reply);
      if (unreadItems.length > 0) {
        await markFeedbackRepliesRead(token || undefined);
        setHistoryItems((prev) =>
          prev.map((item) => ({
            ...item,
            has_unread_reply: false,
          }))
        );
        onRepliesRead?.(unreadItems.length);
      }
    } catch {
      setHistoryItems([]);
      setExpandedItems(new Set());
    } finally {
      setIsLoadingHistory(false);
    }
  }, [onRepliesRead, token]);

  useEffect(() => {
    if (view === 'history' && isAuthenticated) {
      void loadHistory();
    }
  }, [view, isAuthenticated, loadHistory]);

  const handleSubmit = async () => {
    if (!isValid || isSubmitting) return;

    setError(null);
    setIsSubmitting(true);

    try {
      await onSubmit(category, content.trim());
      setContent('');
      setCategory('feature');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '피드백 전송에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (isSubmitting) return;
    setError(null);
    setView('form');
    setExpandedItems(new Set());
    onClose();
  };

  const toggleExpanded = (itemId: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const getStatusLabel = (status: string) => {
    if (status === 'pending') return '대기 중';
    if (status === 'reviewed') return '검토 중';
    if (status === 'resolved') return '답변 완료';
    return status;
  };

  const getStatusIcon = (status: string) => {
    if (status === 'resolved') return <CheckCircle size={12} />;
    if (status === 'reviewed') return <AlertCircle size={12} />;
    if (status === 'pending') return <Clock size={12} />;
    return <AlertCircle size={12} />;
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={handleBackdropClick}>
      <div className={styles.modal}>
        <header className={styles.header}>
          <h2 className={styles.title}>문의/의견 보내기</h2>
          <button
            className={styles.closeButton}
            onClick={handleClose}
            disabled={isSubmitting}
            type="button"
          >
            <X size={24} />
          </button>
        </header>

        <div className={styles.viewToggle}>
          <button
            className={`${styles.viewTab} ${view === 'form' ? styles.viewTabActive : ''}`}
            type="button"
            onClick={() => setView('form')}
          >
            <Send size={14} />
            새 문의
          </button>
          <button
            className={`${styles.viewTab} ${view === 'history' ? styles.viewTabActive : ''}`}
            type="button"
            onClick={() => setView('history')}
          >
            <Inbox size={14} />
            내 문의 내역
            {unreadReplyCount > 0 && <span className={styles.viewTabBadge}>{unreadReplyCount}</span>}
          </button>
        </div>

        {view === 'form' && (
          <div className={styles.content}>
            <div className={styles.categorySection}>
              <label className={styles.label}>종류 선택</label>
              <div className={styles.categoryGrid}>
                {(Object.keys(CATEGORY_INFO) as FeedbackCategory[]).map((cat) => {
                  const info = CATEGORY_INFO[cat];
                  const isSelected = category === cat;
                  return (
                    <button
                      key={cat}
                      className={`${styles.categoryButton} ${isSelected ? styles.selected : ''}`}
                      onClick={() => setCategory(cat)}
                      disabled={isSubmitting}
                      type="button"
                    >
                      <span className={styles.categoryIcon}>{info.icon}</span>
                      <span className={styles.categoryLabel}>{info.label}</span>
                    </button>
                  );
                })}
              </div>
              <p className={styles.categoryDescription}>
                {CATEGORY_INFO[category].description}
              </p>
            </div>

            <div className={styles.textareaSection}>
              <label className={styles.label}>내용</label>
              <textarea
                className={styles.textarea}
                placeholder="의견을 자세히 적어주세요... (최소 10자)"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                maxLength={MAX_LENGTH}
                disabled={isSubmitting}
              />
              <div className={styles.charCount}>
                <span className={contentLength < MIN_LENGTH ? styles.warning : ''}>
                  {contentLength}
                </span>
                <span> / {MAX_LENGTH}자</span>
                {contentLength < MIN_LENGTH && (
                  <span className={styles.minWarning}>
                    (최소 {MIN_LENGTH}자)
                  </span>
                )}
              </div>
            </div>

            {error && (
              <div className={styles.error}>
                {error}
              </div>
            )}
          </div>
        )}

        {view === 'history' && (
          <div className={styles.historyContent}>
            {isLoadingHistory ? (
              <div className={styles.historyLoading}>불러오는 중...</div>
            ) : historyItems.length === 0 ? (
              <div className={styles.emptyHistory}>
                <Inbox size={40} />
                <p>아직 문의 내역이 없습니다</p>
              </div>
            ) : (
              <div className={styles.historyList}>
                {historyItems.map((item) => {
                  const isExpanded = expandedItems.has(item.id);
                  const categoryLabel = CATEGORY_INFO[item.category as FeedbackCategory]?.label || item.category;

                  return (
                    <div key={item.id} className={styles.historyItem}>
                      <div className={styles.historyItemHeader}>
                        <div className={styles.historyHeaderMeta}>
                          <span className={`${styles.historyCategory} ${styles[`cat_${item.category}`] || ''}`}>
                            {categoryLabel}
                          </span>
                          {item.has_unread_reply && (
                            <span className={styles.unreadBadge}>새 답변</span>
                          )}
                        </div>
                        <span className={`${styles.historyStatus} ${styles[`status_${item.status}`] || ''}`}>
                          {getStatusIcon(item.status)}
                          {getStatusLabel(item.status)}
                        </span>
                      </div>

                      <p className={styles.historyPreview}>{item.content}</p>

                      <div className={styles.historyDate}>
                        <Clock size={12} />
                        {new Date(item.created_at).toLocaleDateString('ko-KR', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </div>

                      {item.response && (
                        <div className={styles.historyResponse}>
                          <button
                            className={styles.responseHeader}
                            type="button"
                            onClick={() => toggleExpanded(item.id)}
                          >
                            <span className={styles.responseTitle}>
                              <MessageSquare size={14} />
                              <span>관리자 답변</span>
                            </span>
                            <span className={styles.responseMeta}>
                              {item.responded_at && (
                                <span className={styles.responseDate}>
                                  {new Date(item.responded_at).toLocaleDateString('ko-KR', {
                                    month: 'short',
                                    day: 'numeric',
                                  })}
                                </span>
                              )}
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </span>
                          </button>
                          {isExpanded && <p className={styles.responseText}>{item.response}</p>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {view === 'form' && (
          <footer className={styles.footer}>
            <button
              className={styles.cancelButton}
              onClick={handleClose}
              disabled={isSubmitting}
              type="button"
            >
              취소
            </button>
            <button
              className={styles.submitButton}
              onClick={handleSubmit}
              disabled={!isValid || isSubmitting}
              type="button"
            >
              {isSubmitting ? (
                <span className={styles.loading}>전송 중...</span>
              ) : (
                <>
                  <Send size={16} />
                  보내기
                </>
              )}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
