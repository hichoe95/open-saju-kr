'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Heart, Calendar, Trash2, ChevronRight } from 'lucide-react';
import { getCompatibilityHistory, getCompatibilityDetail, deleteCompatibilityResult, CompatibilityHistoryItem } from '@/lib/api';
import styles from './CompatibilityHistoryList.module.css';

interface CompatibilityHistoryListProps {
  token?: string;
}

export default function CompatibilityHistoryList({ token }: CompatibilityHistoryListProps) {
  const router = useRouter();
  const [history, setHistory] = useState<CompatibilityHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const data = await getCompatibilityHistory(token);
      setHistory(data);
    } catch {
      console.error('Failed to load compatibility history');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('이 궁합 결과를 삭제하시겠습니까?')) return;

    setDeletingId(id);
    try {
      await deleteCompatibilityResult(token, id);
      setHistory(prev => prev.filter(item => item.id !== id));
    } catch {
      alert('삭제 실패');
    } finally {
      setDeletingId(null);
    }
  };

  const handleSelect = async (id: string) => {
    if (loadingId) return;
    setLoadingId(id);
    try {
      const detail = await getCompatibilityDetail(token, id);

      sessionStorage.setItem('compatibility_result', JSON.stringify(detail));
      router.push('/compatibility-result');
      
    } catch {
      alert('결과를 불러오는데 실패했습니다.');
    } finally {
      setLoadingId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    // dateStr format: YYYY-MM-DDTHH:mm:ss.SSSSSS or similar
    try {
        const date = new Date(dateStr);
        return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
    } catch {
        return dateStr;
    }
  };

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className={styles.empty}>
        <Heart size={32} className={styles.emptyIcon} />
        <p>저장된 궁합이 없습니다</p>
        <span>두 사람의 궁합을 보고 결과를 저장해보세요</span>
      </div>
    );
  }

  return (
    <div className={styles.list}>
      {history.map((item) => (
        <div
          key={item.id}
          className={styles.item}
        >
          <div className={styles.info}>
            <div className={styles.labelRow}>
              <div className={styles.label}>{item.label}</div>
              {/* <span className={styles.personaBadge}>{item.scenario === 'lover' ? '연인' : '친구'}</span> */}
            </div>
            <div className={styles.details}>
              <span className={styles.detail}>
                <Calendar size={12} />
                {formatDate(item.created_at)}
              </span>
            </div>
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.deleteButton}
              onClick={() => handleSelect(item.id)}
              disabled={loadingId === item.id}
              title="결과 보기"
            >
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              className={styles.deleteButton}
              onClick={(e) => handleDelete(item.id, e)}
              disabled={deletingId === item.id}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
