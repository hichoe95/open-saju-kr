'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, Check, Clock, Users, RefreshCw } from 'lucide-react';
import { generateShareCode, ShareCodeResponse, getConsentStatus, grantConsent } from '@/lib/api';

interface ProfileShareCodeModalProps {
    profileId: string;
    profileName: string;
    token?: string;
    onClose: () => void;
}

const SHARE_CONSENT_TYPE = 'SAJU_PROFILE_SHARE';

export default function ProfileShareCodeModal({ profileId, profileName, token, onClose }: ProfileShareCodeModalProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [codeData, setCodeData] = useState<ShareCodeResponse | null>(null);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [shareConsentChecked, setShareConsentChecked] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    useEffect(() => {
        if (!mounted) return;

        let active = true;
        const loadConsent = async () => {
            try {
                const status = await getConsentStatus(token, SHARE_CONSENT_TYPE);
                if (active) {
                    setShareConsentChecked(Boolean(status.granted));
                }
            } catch {
                if (active) {
                    setShareConsentChecked(false);
                }
            }
        };

        void loadConsent();
        return () => {
            active = false;
        };
    }, [mounted, token]);

    const handleGenerate = async () => {
        if (!shareConsentChecked) {
            setError('공유 전 동의가 필요합니다. 체크 후 다시 시도해 주세요.');
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            await grantConsent(token, SHARE_CONSENT_TYPE, 'v1');
            const result = await generateShareCode(token, profileId);
            setCodeData(result);
        } catch (e) {
            const status =
                typeof e === 'object' && e !== null && 'status' in e
                    ? (e as { status?: unknown }).status
                    : undefined;
            if (status === 404) {
                setError('프로필 저장이 반영되는 중입니다. 잠시 후 다시 시도해 주세요.');
            } else {
                setError(e instanceof Error ? e.message : '코드 생성 실패');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleCopy = async () => {
        if (!codeData) return;
        await navigator.clipboard.writeText(codeData.code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // SSR 대응: 클라이언트에서만 Portal 렌더링
    if (!mounted) return null;

    return createPortal(
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px',
        }}>
            <div style={{
                background: 'white', borderRadius: '24px', padding: '24px',
                maxWidth: '360px', width: '100%',
                boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                animation: 'slideUp 0.3s ease-out'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#1F2937' }}>공유 코드 생성</h3>
                    <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#6B7280' }}>
                        <X size={20} />
                    </button>
                </div>

                <p style={{ fontSize: '14px', color: '#4B5563', marginBottom: '20px', lineHeight: '1.5' }}>
                    <strong>&quot;{profileName}&quot;</strong>님의 정보를<br/>
                    친구가 같은 사주 공유 페이지를 열 수 있도록 임시 코드를 생성합니다.
                </p>

                {!codeData ? (
                    <>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '13px', color: '#4B5563' }}>
                            <input
                                type="checkbox"
                                checked={shareConsentChecked}
                                onChange={(e) => setShareConsentChecked(e.target.checked)}
                            />
                            공유 링크 생성 및 전달에 동의합니다
                        </label>
                        <button
                            type="button"
                            onClick={handleGenerate}
                            disabled={isLoading}
                            style={{
                                width: '100%', padding: '14px', borderRadius: '12px',
                                background: '#6366F1', color: 'white', border: 'none',
                                fontSize: '15px', fontWeight: '600', cursor: isLoading ? 'not-allowed' : 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                transition: 'background 0.2s'
                            }}
                        >
                            {isLoading ? (
                                <>
                                    <RefreshCw size={18} className="spin" /> 생성 중...
                                </>
                            ) : (
                                '코드 생성하기'
                            )}
                        </button>
                    </>
                ) : (
                    <div style={{ animation: 'fadeIn 0.3s ease-in' }}>
                        <div style={{
                            background: '#F3F4F6', borderRadius: '12px', padding: '24px',
                            textAlign: 'center', marginBottom: '16px', position: 'relative'
                        }}>
                            <div style={{
                                fontSize: '36px', fontWeight: '800', letterSpacing: '6px',
                                fontFamily: 'monospace', color: '#1F2937',
                            }}>
                                {codeData.code}
                            </div>
                            <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '8px' }}>
                                친구가 공유 코드 입력창에 넣으면 같은 사주 공유 페이지가 열려요
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={handleCopy}
                            style={{
                                width: '100%', padding: '14px', borderRadius: '12px',
                                background: copied ? '#10B981' : '#4F46E5', color: 'white',
                                border: 'none', fontSize: '15px', fontWeight: '600',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                cursor: 'pointer', marginBottom: '16px',
                                transition: 'all 0.2s'
                            }}
                        >
                            {copied ? <Check size={18} /> : <Copy size={18} />}
                            {copied ? '복사되었습니다!' : '코드 복사'}
                        </button>
                        <div style={{ 
                            background: '#FFF7ED', padding: '12px', borderRadius: '10px',
                            fontSize: '12px', color: '#C2410C', display: 'flex', flexDirection: 'column', gap: '4px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Clock size={14} /> <span>30분 후 만료됩니다</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Users size={14} /> <span>코드 입력으로 바로 열람 가능합니다</span>
                            </div>
                        </div>
                    </div>
                )}

                {error && (
                    <div style={{ 
                        marginTop: '16px', padding: '12px', borderRadius: '8px', 
                        background: '#FEF2F2', color: '#DC2626', fontSize: '13px',
                        display: 'flex', alignItems: 'center', gap: '8px'
                    }}>
                        <div style={{ minWidth: '4px', height: '4px', borderRadius: '50%', background: '#DC2626' }} />
                        {error}
                    </div>
                )}
            </div>
            <style jsx>{`
                @keyframes slideUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .spin {
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>,
        document.body
    );
}
