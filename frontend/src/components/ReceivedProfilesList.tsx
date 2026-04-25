'use client';

import { useState } from 'react';
import { User, Calendar, Trash2, GitCompare, ChevronRight } from 'lucide-react';
import { ReceivedProfile } from '@/lib/api';
import { formatGender } from '@/utils/formatProfile';
import styles from './ReceivedProfilesList.module.css';

interface ReceivedProfilesListProps {
  profiles: ReceivedProfile[];
  onDelete: (id: string) => void;
  onOpen?: (profile: ReceivedProfile) => void;
  isComparisonMode?: boolean;
  selectedIds?: string[];
  disabledIds?: string[];
  onToggleSelect?: (id: string) => void;
}

export default function ReceivedProfilesList({
  profiles,
  onDelete,
  onOpen,
  isComparisonMode = false,
  selectedIds = [],
  disabledIds = [],
  onToggleSelect,
}: ReceivedProfilesListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const getPersonaLabel = (persona?: string) => {
    switch (persona) {
      case 'mz':
        return 'MZ도사';
      case 'classic':
        return '정통도사';
      case 'warm':
        return '따뜻한도사';
      case 'witty':
        return '위트도사';
      default:
        return '';
    }
  };

  const maskBirthDate = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[0]}-${parts[1]}-**`;
    }
    return dateStr;
  };

  const handleDelete = async (profileId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('이 공유받은 사주를 삭제하시겠습니까?')) return;

    setDeletingId(profileId);
    try {
      await onDelete(profileId);
    } finally {
      setDeletingId(null);
    }
  };

  if (profiles.length === 0) {
    return (
      <div className={styles.empty}>
        <User size={32} className={styles.emptyIcon} />
        <p>공유받은 사주가 없습니다</p>
        <span>공유받은 사주를 내 사주와 나란히 두고 살펴보시게</span>
      </div>
    );
  }

  return (
    <div className={styles.list} data-testid="received-profiles-list">
      {profiles.map((profile) => {
        const personaLabel = getPersonaLabel(profile.persona);
        const selectionId = `received:${profile.id}`;
        const isSelected = selectedIds.includes(selectionId);
        const isDisabled = disabledIds.includes(selectionId);

        return (
          <div
            key={profile.id}
            className={`${styles.item} ${isComparisonMode && isDisabled ? styles.itemDisabled : ''}`.trim()}
            data-testid={`received-profile-item-${profile.id}`}
            onClick={() => {
              if (!isComparisonMode) {
                onOpen?.(profile);
              }
            }}
          >
            <div className={styles.info}>
              <div className={styles.labelRow}>
                <div className={styles.label}>{profile.sharer_name || '알 수 없음'}</div>
                {personaLabel && <span className={styles.personaBadge}>{personaLabel}</span>}
                {isComparisonMode && isDisabled && <span className={styles.disabledBadge}>분석 필요</span>}
              </div>
              <div className={styles.details}>
                <span className={styles.detail}>
                  <Calendar size={12} />
                  {maskBirthDate(profile.birth_date)}
                </span>
                <span className={styles.detail}>{formatGender(profile.gender)}</span>
              </div>
            </div>
            <div className={styles.actions}>
              {isComparisonMode && onToggleSelect && (
                <button
                  type="button"
                  className={isSelected ? styles.selectedBtn : styles.selectBtn}
                  onClick={(e) => { e.stopPropagation(); onToggleSelect(selectionId); }}
                  title={isDisabled ? '분석 데이터가 있는 사주만 비교할 수 있어요.' : '비교 선택'}
                  disabled={isDisabled}
                >
                  <GitCompare size={14} />
                  {isSelected ? '선택됨' : '비교'}
                </button>
              )}
              {!isComparisonMode && (
                <button
                  type="button"
                  className={styles.selectBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen?.(profile);
                  }}
                  title="불러오기"
                >
                  <ChevronRight size={14} />
                  열기
                </button>
              )}
              {!isComparisonMode && (
                <button
                  type="button"
                  className={styles.deleteButton}
                  onClick={(e) => handleDelete(profile.id, e)}
                  disabled={deletingId === profile.id}
                  title="삭제"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
