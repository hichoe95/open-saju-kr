'use client';

import { useState, useEffect, startTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import CompatibilityResult from '@/components/CompatibilityResult';
import { CompatibilityDetailResponse } from '@/lib/api';
import styles from './page.module.css';

export default function CompatibilityResultPage() {
    const router = useRouter();
    const [result, setResult] = useState<CompatibilityDetailResponse | null>(null);
    const [isRedirecting, setIsRedirecting] = useState(false);

    useEffect(() => {
        const data = sessionStorage.getItem('compatibility_result');
        if (data) {
            try {
                startTransition(() => {
                    setResult(JSON.parse(data));
                });
            } catch (e) {
                console.error('Failed to parse result', e);
                startTransition(() => {
                    setIsRedirecting(true);
                });
                router.replace('/mypage');
            }
        } else {
            startTransition(() => {
                setIsRedirecting(true);
            });
            router.replace('/mypage');
        }
    }, [router]);

    if (!result) {
        return (
            <div className={styles.placeholderContainer}>
                <h2 className={styles.placeholderTitle}>궁합 결과를 확인할 수 없습니다</h2>
                <p className={styles.placeholderDescription}>
                    {isRedirecting ? '마이페이지로 이동 중입니다...' : '데이터를 확인하는 중입니다...'}
                </p>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <button type="button" className={styles.backButton} onClick={() => router.back()}>
                    <ArrowLeft size={24} />
                </button>
                <h1 className={styles.pageTitle}>저장된 궁합 결과</h1>
            </header>

            <main className={styles.content}>
                <div className={styles.names}>
                    <div className={styles.name}>{result.user_a.name}</div>
                    <div className={styles.vs}>VS</div>
                    <div className={styles.name}>{result.user_b.name}</div>
                </div>

                <CompatibilityResult data={result.compatibility_data} />
            </main>
        </div>
    );
}
