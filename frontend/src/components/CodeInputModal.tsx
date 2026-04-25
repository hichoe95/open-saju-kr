'use client';

import { useState } from 'react';
import { X, ArrowRight, Loader2, AlertCircle } from 'lucide-react';

interface CodeInputModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (code: string) => Promise<void>;
}

export default function CodeInputModal({ isOpen, onClose, onSubmit }: CodeInputModalProps) {
    const [code, setCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!code.trim()) return;

        setIsLoading(true);
        setError(null);
        try {
            await onSubmit(code.trim().toUpperCase());
            setCode('');
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : '코드 확인 실패');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', zIndex: 3000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px',
        }} onClick={onClose}>
            <div style={{
                background: 'white', borderRadius: '20px', padding: '24px',
                maxWidth: '320px', width: '100%',
                boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
                animation: 'scaleIn 0.2s ease-out'
            }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>공유 코드 입력</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                        <X size={20} />
                    </button>
                </div>

                <p style={{ fontSize: '14px', color: '#4B5563', marginBottom: '20px' }}>
                    친구가 공유해준 6자리 코드를 입력하면 사주 공유 페이지가 열립니다.
                </p>

                <form onSubmit={handleSubmit}>
                    <input
                        type="text"
                        value={code}
                        onChange={e => setCode(e.target.value.toUpperCase())}
                        placeholder="A1B2C3"
                        maxLength={6}
                        style={{
                            width: '100%', padding: '14px', borderRadius: '12px',
                            border: '1px solid #E5E7EB', fontSize: '18px', textAlign: 'center',
                            letterSpacing: '2px', fontWeight: '600', marginBottom: '16px',
                            background: '#F9FAFB', outline: 'none'
                        }}
                        autoFocus
                    />

                    {error && (
                        <div style={{ 
                            marginBottom: '16px', padding: '10px', borderRadius: '8px', 
                            background: '#FEF2F2', color: '#DC2626', fontSize: '13px',
                            display: 'flex', alignItems: 'center', gap: '6px'
                        }}>
                            <AlertCircle size={14} />
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isLoading || !code.trim()}
                        style={{
                            width: '100%', padding: '14px', borderRadius: '12px',
                            background: '#6366F1', color: 'white', border: 'none',
                            fontSize: '15px', fontWeight: '600', cursor: isLoading ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                            opacity: (isLoading || !code.trim()) ? 0.7 : 1
                        }}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 size={18} className="spin" /> 확인 중...
                            </>
                        ) : (
                            <>
                                열어보기 <ArrowRight size={18} />
                            </>
                        )}
                    </button>
                </form>
            </div>
            <style jsx>{`
                @keyframes scaleIn {
                    from { transform: scale(0.95); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
