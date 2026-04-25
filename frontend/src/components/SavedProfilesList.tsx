'use client';

import { useState, useEffect, useCallback } from 'react';
import { User, Calendar, Clock, Trash2, ChevronRight, Share2 } from 'lucide-react';
import { getProfiles, deleteProfile, SavedProfile } from '@/lib/api';
import { formatDate, formatGender } from '@/utils/formatProfile';
import { toJijiFullDisplay } from '@/utils/jijiTime';
import styles from './SavedProfilesList.module.css';
import ProfileShareCodeModal from './ProfileShareCodeModal';

interface SavedProfilesListProps {
  token?: string;
  onSelectProfile?: (profile: SavedProfile) => void;
  onReanalyze?: (profile: SavedProfile) => void;
  comparisonMode?: boolean;
  selectedProfileIds?: string[];
  onToggleComparisonSelect?: (profile: SavedProfile) => void;
  disabledProfileIds?: string[];
}

export default function SavedProfilesList({
  token,
  onSelectProfile,
  onReanalyze,
  comparisonMode = false,
  selectedProfileIds = [],
  onToggleComparisonSelect,
  disabledProfileIds = [],
}: SavedProfilesListProps) {
  const [profiles, setProfiles] = useState<SavedProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [shareModalProfile, setShareModalProfile] = useState<SavedProfile | null>(null);

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

  const formatSavedDate = (dateStr?: string) => {
    if (!dateStr) return null;
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return null;
      return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
    } catch {
      return null;
    }
  };

  const loadProfiles = useCallback(async () => {
    try {
      const data = await getProfiles(token);
      setProfiles(data);
    } catch {
      console.error('Failed to load profiles');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const handleDelete = async (profileId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('이 프로필을 삭제하시겠습니까?')) return;

    setDeletingId(profileId);
    try {
      await deleteProfile(token, profileId);
      setProfiles(prev => prev.filter(p => p.id !== profileId));
    } catch {
      alert('삭제 실패');
    } finally {
      setDeletingId(null);
    }
  };

  const handleShare = (profile: SavedProfile, e: React.MouseEvent) => {
    e.stopPropagation();
    setShareModalProfile(profile);
  };

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
      </div>
    );
  }

  if (profiles.length === 0) {
    return (
      <div className={styles.empty}>
        <User size={32} className={styles.emptyIcon} />
        <p>저장된 사주가 없습니다</p>
        <span>사주 분석을 완료하면 자동으로 저장됩니다</span>
      </div>
    );
  }

  return (
    <>
      <div className={styles.list} data-testid="saved-profiles-list">
        {profiles.map((profile) => {
          const personaLabel = getPersonaLabel(profile.persona);
          const isSelected = comparisonMode && selectedProfileIds.includes(profile.id);
          const isDisabled = comparisonMode && disabledProfileIds.includes(profile.id);

          const handleClick = () => {
            if (comparisonMode) {
              if (!isDisabled) onToggleComparisonSelect?.(profile);
            } else {
              onSelectProfile?.(profile);
            }
          };

          const infoContent = (
            <>
              <div className={styles.labelRow}>
                <div className={styles.label}>{profile.label}</div>
                {personaLabel && <span className={styles.personaBadge}>{personaLabel}</span>}
                {isDisabled && (
                  <button
                    type="button"
                    className={styles.disabledBadge}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onReanalyze?.(profile);
                    }}
                  >
                    재분석
                  </button>
                )}
              </div>
              <div className={styles.details}>
                <span className={styles.detail}>
                  <Calendar size={12} />
                  {formatDate(profile.birth_date)}
                </span>
                <span className={styles.detail}>
                  <Clock size={12} />
                  {toJijiFullDisplay(profile.hour_branch)}
                </span>
                <span className={styles.detail}>{formatGender(profile.gender)}</span>
              </div>
              {formatSavedDate(profile.created_at) && (
                <div className={styles.savedDate}>
                  <time dateTime={profile.created_at}>
                    {formatSavedDate(profile.created_at)} 저장
                  </time>
                </div>
              )}
            </>
          );

          return (
            <div
              key={profile.id}
              className={`${styles.item} ${isSelected ? styles.itemSelected : ''} ${isDisabled ? styles.itemDisabled : ''}`}
              data-testid={`saved-profile-item-${profile.id}`}
            >
              {comparisonMode ? (
                <div className={styles.info}>{infoContent}</div>
              ) : (
                <button
                  type="button"
                  className={styles.infoButton}
                  onClick={handleClick}
                  disabled={!onSelectProfile}
                  data-testid={`saved-profile-open-${profile.id}`}
                >
                  {infoContent}
                </button>
              )}
              <div className={styles.actions}>
                {comparisonMode ? (
                  <button
                    type="button"
                    className={`${styles.compareToggle} ${isSelected ? styles.compareToggleActive : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClick();
                    }}
                    disabled={isDisabled}
                  >
                    {isSelected ? '선택됨' : '비교'}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className={styles.actionButton}
                      onClick={(e) => handleShare(profile, e)}
                      title="코드 공유"
                    >
                      <Share2 size={16} />
                    </button>
                    <button
                      type="button"
                      className={styles.deleteButton}
                      onClick={(e) => handleDelete(profile.id, e)}
                      disabled={deletingId === profile.id}
                      title="삭제"
                    >
                      <Trash2 size={16} />
                    </button>
                    {onSelectProfile && (
                      <button
                        type="button"
                        className={styles.actionButton}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleClick();
                        }}
                        title="불러오기"
                      >
                        <ChevronRight size={16} />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {shareModalProfile && (
        <ProfileShareCodeModal
          profileId={shareModalProfile.id}
          profileName={shareModalProfile.label}
          token={token}
          onClose={() => setShareModalProfile(null)}
        />
      )}
    </>
  );
}
