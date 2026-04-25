'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
// TODO FRONT-11: html2canvas는 사용하지 않고 html-to-image(toPng) 기반 캡처만 사용 중이므로, 렌더링 입력의 스크립트 인젝션 경로 점검 필요
import styles from './ShareModal.module.css';
import { ReadingResponse, BirthInput } from '@/types';
import { generateShareCode, ShareCodeResponse, getConsentStatus, grantConsent } from '@/lib/api';
import { trackShareCreated } from '@/lib/analytics';
import { shareWithFallback, initKakao, isKakaoAvailable } from '@/lib/kakaoShare';
import { buildShareUrl } from '@/lib/shareMetadata';
import { useAuth } from '@/contexts/AuthContext';
import { publicSiteUrl } from '@/lib/publicConfig';
import ModalHeader from './ModalHeader';
import { useModalClose } from '@/hooks/useModalBack';
import FortuneShareCard, { CardTheme } from './FortuneShareCard';
import {
    Copy, CheckCircle, Clock, AlertCircle,
    Download, Image as ImageIcon, Share2, ChevronLeft, ChevronRight, Hash,
    Users, RefreshCw, Bookmark
} from 'lucide-react';

interface ShareModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: ReadingResponse;
    birthInput?: BirthInput | null;
    profileId?: string;
    initialTab?: ShareTab;
}

type ShareTab = 'card' | 'code';

const THEMES: { value: CardTheme; label: string; iconPath: string }[] = [
    { value: 'gradient', label: '그라데이션', iconPath: '/icons/emoji-replacements/themes/gradient.png' },
    { value: 'minimal', label: '미니멀', iconPath: '/icons/emoji-replacements/themes/minimal.png' },
    { value: 'dark', label: '다크', iconPath: '/icons/emoji-replacements/themes/dark.png' },
    { value: 'traditional', label: '전통', iconPath: '/icons/emoji-replacements/themes/traditional.png' },
    { value: 'cute', label: '큐트', iconPath: '/icons/emoji-replacements/themes/cute.png' },
];

const SHARE_CONSENT_TYPE = 'SAJU_PROFILE_SHARE';
const KAKAO_SHARE_ATTRIBUTION = {
    utm_source: 'kakao',
    utm_medium: 'share',
} as const;
const DEFAULT_SHARE_ORIGIN = publicSiteUrl;

export default function ShareModal({ isOpen, onClose, data, birthInput, profileId, initialTab = 'card' }: ShareModalProps) {
    const { isAuthenticated, isLoading: authLoading, token } = useAuth();
    const [activeTab, setActiveTab] = useState<ShareTab>(initialTab);
    const [codeData, setCodeData] = useState<ShareCodeResponse | null>(null);
    const [isGeneratingCode, setIsGeneratingCode] = useState(false);
    const [codeCopied, setCodeCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [shareConsentChecked, setShareConsentChecked] = useState(false);
    const [consentLoading, setConsentLoading] = useState(false);
    const [isKakaoReady, setIsKakaoReady] = useState(false);

    // 카드 관련 상태
    const [selectedTheme, setSelectedTheme] = useState<CardTheme>('gradient');
    const [isSavingCard, setIsSavingCard] = useState(false);
    const [hidePillars, setHidePillars] = useState(false);
    const cardRef = useRef<HTMLDivElement>(null);
    const lastProfileIdRef = useRef<string | undefined>(profileId);

    const resetCodeState = useCallback(() => {
        setCodeData(null);
        setCodeCopied(false);
        setError(null);
    }, []);

    const handleClose = useCallback(() => {
        resetCodeState();
        onClose();
    }, [onClose, resetCodeState]);

    // 뒤로가기 + Esc 키 지원
    useModalClose(isOpen, handleClose);

    useEffect(() => {
        if (isOpen) {
            setActiveTab(initialTab);
        }
    }, [initialTab, isOpen]);

    useEffect(() => {
        if (!isOpen) return;

        const profileChanged = lastProfileIdRef.current !== profileId;
        lastProfileIdRef.current = profileId;

        if (profileChanged || activeTab === 'code') {
            resetCodeState();
        }
    }, [activeTab, isOpen, profileId, resetCodeState]);

    useEffect(() => {
        if (!isOpen || !isAuthenticated) return;

        let mounted = true;
        const loadConsent = async () => {
            try {
                const status = await getConsentStatus(token || undefined, SHARE_CONSENT_TYPE);
                if (mounted) {
                    setShareConsentChecked(Boolean(status.granted));
                }
            } catch {
                if (mounted) {
                    setShareConsentChecked(false);
                }
            }
        };

        void loadConsent();
        return () => {
            mounted = false;
        };
    }, [isAuthenticated, isOpen, token]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        setIsKakaoReady(initKakao() || isKakaoAvailable());

        if (typeof window === 'undefined') {
            return;
        }

        const timer = window.setTimeout(() => {
            setIsKakaoReady(initKakao() || isKakaoAvailable());
        }, 300);

        return () => {
            window.clearTimeout(timer);
        };
    }, [isOpen]);

    const canCreateShareLink = Boolean(profileId && isAuthenticated);

    const buildSharePayload = useCallback((shareId: string) => {
        const origin = typeof window !== 'undefined' && window.location.origin && window.location.origin !== 'null'
            ? window.location.origin
            : DEFAULT_SHARE_ORIGIN;
        const title = birthInput?.name
            ? `${birthInput.name}님의 사주 결과`
            : 'AI 사주 분석 결과';
        const description = data.one_liner || '친구가 보낸 사주 분석 결과를 확인해 보세요.';

        return {
            title,
            description,
            imageUrl: new URL('/apple-icon.png', origin).toString(),
            shareUrl: buildShareUrl(shareId, 'saju', KAKAO_SHARE_ATTRIBUTION),
        };
    }, [birthInput?.name, data.one_liner]);

    const requestShareCode = useCallback(async (): Promise<ShareCodeResponse | null> => {
        if (codeData) {
            return codeData;
        }

        if (!profileId || !isAuthenticated) {
            setError('프로필을 저장한 뒤 링크 공유를 사용할 수 있어요.');
            return null;
        }

        if (!shareConsentChecked) {
            setError('공유 링크 생성 및 전달 동의 후 다시 시도해 주세요.');
            return null;
        }

        setIsGeneratingCode(true);
        setConsentLoading(true);
        setError(null);

        try {
            await grantConsent(token || undefined, SHARE_CONSENT_TYPE, 'v1');
            const result = await generateShareCode(token || undefined, profileId);
            setCodeData(result);
            setCodeCopied(false);
            return result;
        } catch (err) {
            const status =
                typeof err === 'object' && err !== null && 'status' in err
                    ? (err as { status?: unknown }).status
                    : undefined;
            if (status === 404) {
                setError('사주 데이터가 저장되는 중입니다. 잠시 후 다시 시도해 주세요.');
            } else {
                setError(err instanceof Error ? err.message : '코드 생성에 실패했습니다');
            }
            return null;
        } finally {
            setConsentLoading(false);
            setIsGeneratingCode(false);
        }
    }, [codeData, isAuthenticated, profileId, shareConsentChecked, token]);



    const handleGenerateCode = async () => {
        await requestShareCode();
    };

    const handleCopyCode = async () => {
        if (!codeData) return;
        try {
            await navigator.clipboard.writeText(codeData.code);
            setCodeCopied(true);
            setTimeout(() => setCodeCopied(false), 2000);
        } catch {
            setError('클립보드 복사에 실패했습니다');
        }
    };

    const handleKakaoShare = async () => {
        const shareCode = await requestShareCode();
        if (!shareCode) {
            return;
        }

        const payload = buildSharePayload(shareCode.code);
        const method = await shareWithFallback(payload);

        setIsKakaoReady(isKakaoAvailable());

        if (method === 'failed') {
            setError('공유를 시작할 수 없습니다. 브라우저 공유나 링크 복사를 시도해 주세요.');
            return;
        }

        setError(null);
        void trackShareCreated(shareCode.code, 'saju', selectedTheme, 'kakao');
    };

    const handleCopyShareLink = async () => {
        const shareCode = await requestShareCode();
        if (!shareCode) {
            return;
        }

        try {
            await navigator.clipboard.writeText(buildSharePayload(shareCode.code).shareUrl);
            setError(null);
        } catch {
            setError('링크 복사에 실패했습니다');
        }
    };

    const handleBrowserShare = async () => {
        const shareCode = await requestShareCode();
        if (!shareCode) {
            return;
        }

        const payload = buildSharePayload(shareCode.code);

        if (!navigator.share) {
            await handleCopyShareLink();
            return;
        }

        try {
            await navigator.share({
                title: payload.title,
                text: payload.description,
                url: payload.shareUrl,
            });
            setError(null);
        } catch (err) {
            if ((err as Error).name !== 'AbortError') {
                setError('브라우저 공유에 실패했습니다');
            }
        }
    };


    // 카드 이미지 저장
    const handleSaveCard = async () => {
        if (!cardRef.current || isSavingCard) return;

        setIsSavingCard(true);
        try {
            // 렌더링 완료 대기
            await new Promise(resolve => setTimeout(resolve, 100));

            const dataUrl = await toPng(cardRef.current, {
                cacheBust: true,
                pixelRatio: 2,
                backgroundColor: '#ffffff',
            });

            const link = document.createElement('a');
            link.download = `fortune_card_${Date.now()}.png`;
            link.href = dataUrl;
            link.click();
        } catch (err) {
            console.error('카드 저장 오류:', err);
            setError('이미지 저장에 실패했습니다');
        } finally {
            setIsSavingCard(false);
        }
    };

    // SNS 공유 (Web Share API)
    const handleShareToSNS = async () => {
        if (!cardRef.current) return;

        try {
            const dataUrl = await toPng(cardRef.current, {
                cacheBust: true,
                pixelRatio: 2,
                backgroundColor: '#ffffff',
            });

            // dataURL을 Blob으로 변환
            const response = await fetch(dataUrl);
            const blob = await response.blob();
            const file = new File([blob], 'fortune_card.png', { type: 'image/png' });

            if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: '나의 오늘 운세',
                    text: `${birthInput?.name || ''}님의 사주 운세카드입니다`,
                });
            } else {
                // Web Share API 미지원시 다운로드
                handleSaveCard();
            }
        } catch (err) {
            if ((err as Error).name !== 'AbortError') {
                console.error('공유 오류:', err);
                handleSaveCard(); // fallback
            }
        }
    };

    // 테마 선택 핸들러
    const handleThemePrev = () => {
        const idx = THEMES.findIndex(t => t.value === selectedTheme);
        const newIdx = idx > 0 ? idx - 1 : THEMES.length - 1;
        setSelectedTheme(THEMES[newIdx].value);
    };

    const handleThemeNext = () => {
        const idx = THEMES.findIndex(t => t.value === selectedTheme);
        const newIdx = idx < THEMES.length - 1 ? idx + 1 : 0;
        setSelectedTheme(THEMES[newIdx].value);
    };

    if (!isOpen) return null;

    const currentTheme = THEMES.find(t => t.value === selectedTheme)!;

    return (
        <div className={styles.overlay} data-testid="share-modal">
            <button
                type="button"
                className={styles.overlayCloseButton}
                onClick={handleClose}
                aria-label="공유 모달 닫기"
            />
            <div className={styles.modal}>
                <ModalHeader title="공유하기" onClose={handleClose} />

                {/* 탭 선택 */}
                <div className={styles.tabBar}>
                    <button
                        className={`${styles.tab} ${activeTab === 'card' ? styles.tabActive : ''}`}
                        type="button"
                        onClick={() => setActiveTab('card')}
                        data-testid="share-tab-card"
                    >
                        <ImageIcon size={16} />
                        카드 저장
                    </button>
                    <button
                        className={`${styles.tab} ${activeTab === 'code' ? styles.tabActive : ''}`}
                        type="button"
                        onClick={() => {
                            resetCodeState();
                            setActiveTab('code');
                        }}
                        data-testid="share-tab-code"
                    >
                        <Hash size={16} />
                        코드 공유
                    </button>
                </div>

                <div className={styles.content}>
                    {/* ===== 카드 저장 탭 ===== */}
                    {activeTab === 'card' && (
                        <div className={styles.cardSection}>
                            {/* 테마 선택 */}
                            <div className={styles.themeSelector}>
                                    <button type="button" className={styles.themeNavBtn} onClick={handleThemePrev}>
                                    <ChevronLeft size={20} />
                                </button>
                                <div className={styles.themeLabel}>
                                    <img
                                        className={styles.themeEmoji}
                                        src={currentTheme.iconPath}
                                        width={20}
                                        height={20}
                                        alt=""
                                        loading="eager"
                                    />
                                    <span>{currentTheme.label}</span>
                                </div>
                                    <button type="button" className={styles.themeNavBtn} onClick={handleThemeNext}>
                                    <ChevronRight size={20} />
                                </button>
                            </div>

                            {/* 테마 점 인디케이터 */}
                            <div className={styles.themeDots}>
                                {THEMES.map((theme) => (
                                    <button
                                        key={theme.value}
                                        className={`${styles.themeDot} ${selectedTheme === theme.value ? styles.themeDotActive : ''}`}
                                        type="button"
                                        onClick={() => setSelectedTheme(theme.value)}
                                        title={theme.label}
                                    />
                                ))}
                            </div>

                            {/* 사주 표시 옵션 */}
                            <label className={styles.privacyToggle}>
                                <input
                                    type="checkbox"
                                    checked={hidePillars}
                                    onChange={(e) => setHidePillars(e.target.checked)}
                                />
                                <span className={styles.toggleSlider} />
                                <span className={styles.toggleLabel}>사주 정보 숨기기</span>
                            </label>

                            {/* 카드 미리보기 */}
                            <div className={styles.cardPreview}>
                                <div className={styles.cardScaler}>
                                    <FortuneShareCard
                                        ref={cardRef}
                                        data={data}
                                        birthInput={birthInput}
                                        theme={selectedTheme}
                                        hidePillars={hidePillars}
                                    />
                                </div>
                            </div>

                            {canCreateShareLink && (
                                <label className={styles.privacyToggle}>
                                    <input
                                        type="checkbox"
                                        checked={shareConsentChecked}
                                        onChange={(e) => setShareConsentChecked(e.target.checked)}
                                    />
                                    <span className={styles.toggleSlider} />
                                    <span className={styles.toggleLabel}>공유 링크 생성 및 전달 동의</span>
                                </label>
                            )}

                            {/* 액션 버튼 */}
                            <div className={styles.cardActionGroup}>
                                <div className={styles.shareActionsRow}>
                                    <button
                                        type="button"
                                        className={styles.downloadButton}
                                        onClick={handleSaveCard}
                                        disabled={isSavingCard}
                                    >
                                        <Download size={18} />
                                        {isSavingCard ? '저장 중...' : '이미지 저장'}
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.shareButton}
                                        onClick={handleShareToSNS}
                                    >
                                        <Share2 size={18} />
                                        SNS 공유
                                    </button>
                                </div>

                                <button
                                    type="button"
                                    className={styles.kakaoButton}
                                    onClick={handleKakaoShare}
                                    disabled={!canCreateShareLink || isGeneratingCode || consentLoading}
                                    data-testid="share-kakao-button"
                                >
                                    <img
                                        className={styles.kakaoIcon}
                                        src="/icons/social/kakao.svg"
                                        width={18}
                                        height={18}
                                        alt=""
                                        loading="eager"
                                    />
                                    {isGeneratingCode ? '링크 준비 중...' : '카카오톡으로 공유'}
                                </button>

                                {!isKakaoReady && (
                                    <div className={styles.secondaryShareActions}>
                                        <button
                                            type="button"
                                            className={styles.secondaryActionButton}
                                            onClick={handleBrowserShare}
                                            disabled={!canCreateShareLink || isGeneratingCode || consentLoading}
                                        >
                                            <Share2 size={18} />
                                            브라우저 공유
                                        </button>
                                        <button
                                            type="button"
                                            className={styles.secondaryActionButton}
                                            onClick={handleCopyShareLink}
                                            disabled={!canCreateShareLink || isGeneratingCode || consentLoading}
                                        >
                                            <Copy size={18} />
                                            링크 복사
                                        </button>
                                        <p className={styles.shareHint}>
                                            {canCreateShareLink
                                                ? '카카오 SDK를 사용할 수 없어 브라우저 공유와 링크 복사를 함께 보여드려요.'
                                                : '프로필을 저장하면 OG가 적용된 공유 링크를 만들 수 있어요.'}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {error && (
                                <div className={styles.error}>
                                    <AlertCircle size={14} />
                                    {error}
                                </div>
                            )}
                        </div>
                    )}


                    {/* ===== 코드 공유 탭 ===== */}
                    {activeTab === 'code' && (
                        <div className={styles.codeSection}>
                            {!profileId && (
                                <div className={styles.profileRequired}>
                                    <div className={styles.profileRequiredIcon}>
                                        <Bookmark size={28} />
                                    </div>
                                    <h3>프로필을 저장하면 공유 코드를 생성할 수 있어요</h3>
                                    <p>사주 분석 결과가 자동으로 저장되면 공유 코드를 생성할 수 있어요</p>
                                </div>
                            )}

                            {profileId && !codeData && (
                                <div className={styles.createSection}>
                                    <div className={styles.iconCircle}>
                                        <Hash size={32} />
                                    </div>
                                    <h3>공유 코드 만들기</h3>
                                    <p className={styles.description}>
                                        6자리 코드를 받은 친구가 나의 사주 공유 페이지를 바로 열 수 있어요
                                        <br />
                                        <small>코드를 건네면 벗이 사주를 받고, 바로 궁합까지 이어볼 수 있소</small>
                                    </p>
                                    <div className={styles.expireNote}>
                                        <Clock size={14} />
                                        코드는 30분간 유효해요
                                    </div>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '13px', color: '#4B5563' }}>
                                        <input
                                            type="checkbox"
                                            checked={shareConsentChecked}
                                            onChange={(e) => setShareConsentChecked(e.target.checked)}
                                        />
                                        공유 링크 생성 및 전달에 동의합니다
                                    </label>
                                    <button
                                        className={styles.createButton}
                                        type="button"
                                        onClick={handleGenerateCode}
                                        disabled={isGeneratingCode || authLoading || consentLoading}
                                    >
                                        {isGeneratingCode ? (
                                            <>
                                                <RefreshCw size={16} className={styles.spin} />
                                                생성 중...
                                            </>
                                        ) : (
                                            '코드 생성하기'
                                        )}
                                    </button>
                                    {error && (
                                        <div className={styles.error}>
                                            <AlertCircle size={14} />
                                            {error}
                                        </div>
                                    )}
                                </div>
                            )}

                            {profileId && codeData && (
                                <div className={styles.successSection}>
                                    <div className={styles.successIcon}>
                                        <CheckCircle size={32} />
                                    </div>
                                    <h3>코드가 생성되었어요!</h3>

                                    <div className={styles.codeDisplay}>
                                        <div className={styles.codeText}>{codeData.code}</div>
                                        <p className={styles.codeHint}>
                                            친구가 공유 코드 입력창에 넣으면 같은 사주 공유 페이지가 열려요
                                        </p>
                                    </div>

                                    <button
                                        className={`${styles.codeCopyButton} ${codeCopied ? styles.codeCopied : ''}`}
                                        type="button"
                                        onClick={handleCopyCode}
                                    >
                                        {codeCopied ? <CheckCircle size={18} /> : <Copy size={18} />}
                                        {codeCopied ? '복사되었어요!' : '코드 복사'}
                                    </button>

                                    <div className={styles.codeInfoList}>
                                        <div className={styles.codeInfoItem}>
                                            <Clock size={14} />
                                            <span>30분 후 만료</span>
                                        </div>
                                        <div className={styles.codeInfoItem}>
                                            <Users size={14} />
                                            <span>코드 입력으로 바로 열람 가능</span>
                                        </div>
                                    </div>

                                    <button
                                        className={styles.newLinkButton}
                                        type="button"
                                        onClick={resetCodeState}
                                    >
                                        새 코드 만들기
                                    </button>

                                    {error && (
                                        <div className={styles.error}>
                                            <AlertCircle size={14} />
                                            {error}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
