'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Smartphone } from 'lucide-react';
import DosaCharacter from '../DosaCharacter';
import { staggerContainerVariants, loginButtonVariants } from '../../animations/variants';
import styles from '../../page.module.css';
import { publicBusinessSummary, publicContactSummary, publicMailOrderNumber } from '@/lib/publicConfig';

interface SlideCTAProps {
    authUrls: Record<string, string>;
    isUrlsLoading: boolean;
    onLogin: (provider: string) => void;
    urlsError?: string | null;
    onRetry?: () => void;
}

export default function SlideCTA({ authUrls, isUrlsLoading, onLogin, urlsError, onRetry }: SlideCTAProps) {
    const hasAuthUrls = Object.keys(authUrls).length > 0;

    return (
        <motion.div 
            className={styles.slideEnter}
            variants={staggerContainerVariants}
            initial="hidden"
            animate="visible"
            style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}
        >
            <div className={styles.imageWrapper}>
                <DosaCharacter 
                    src="/icons/onboarding/dosa_thumbsup.png"
                    alt="엄지척 도사"
                    size={180}
                    floating={true}
                />
                <div className={styles.interactiveLogin}>
                    <div className={styles.pwaHint}>
                        <Smartphone className={styles.pwaIcon} />
                        <span className={styles.pwaText}>앱처럼 사용하기</span>
                    </div>
                </div>
            </div>

            <div className={styles.content}>
                <h1 className={styles.title}>자, 시작해볼까나</h1>
                <p className={styles.description}>
                    복잡한 것은 싫어하느니라<br />
                    아래 버튼 하나면 끝이다
                </p>
            </div>

            {urlsError && (
                <div className={styles.errorBox}>
                    <p className={styles.errorMessage}>{urlsError}</p>
                    {onRetry && (
                        <motion.button
                            className={styles.retryButton}
                            onClick={onRetry}
                            disabled={isUrlsLoading}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                        >
                            {isUrlsLoading ? '다시 시도 중...' : '다시 시도'}
                        </motion.button>
                    )}
                </div>
            )}

            <div className={styles.loginButtons}>
                <motion.button
                    className={`${styles.socialButton} ${styles.kakao}`}
                    onClick={() => onLogin('kakao')}
                    disabled={isUrlsLoading || !hasAuthUrls}
                    variants={loginButtonVariants}
                    custom={0}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                >
                    <svg className={styles.socialIcon} viewBox="0 0 20 20" fill="currentColor">
                        <path d="M10 3C5.58 3 2 5.82 2 9.25c0 2.16 1.42 4.06 3.58 5.16-.16.54-.58 1.96-.66 2.27-.11.38.14.37.29.27.12-.08 1.9-1.29 2.67-1.81.69.1 1.4.16 2.12.16 4.42 0 8-2.82 8-6.3S14.42 3 10 3z"/>
                    </svg>
                    카카오로 시작하기
                </motion.button>

                <motion.button
                    className={`${styles.socialButton} ${styles.naver}`}
                    onClick={() => onLogin('naver')}
                    disabled={isUrlsLoading || !hasAuthUrls}
                    variants={loginButtonVariants}
                    custom={1}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                >
                    <span className={`${styles.socialIcon} ${styles.naverLogo}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>N</span>
                    네이버로 시작하기
                </motion.button>
            </div>

            <footer className={styles.footer}>
                <div className={styles.footerLinks}>
                    <Link href="/privacy">개인정보처리방침</Link>
                    <Link href="/terms">이용약관</Link>
                </div>
                <p className={styles.footerCopyright}>
                    당신만의 사주 이야기가 시작됩니다.
                </p>
                <p className={styles.businessInfo}>
                    {publicBusinessSummary}<br />
                    통신판매업신고: {publicMailOrderNumber}<br />
                    {publicContactSummary}
                </p>
            </footer>
        </motion.div>
    );
}
