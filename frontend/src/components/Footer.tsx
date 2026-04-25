'use client';

import Link from 'next/link';
import styles from './Footer.module.css';
import {
  publicBusinessAddress,
  publicBusinessNumber,
  publicCompanyName,
  publicContactEmail,
  publicMailOrderNumber,
  publicRepresentativeName,
} from '@/lib/publicConfig';

interface FooterProps {
  variant?: 'default' | 'minimal' | 'full';
  className?: string;
}

export default function Footer({ variant = 'default', className = '' }: FooterProps) {
  const currentYear = new Date().getFullYear();

  if (variant === 'minimal') {
    return (
      <footer className={`${styles.footer} ${styles.minimal} ${className}`}>
        <div className={styles.copyright}>
          © {currentYear} {publicCompanyName}
        </div>
      </footer>
    );
  }

  return (
    <footer className={`${styles.footer} ${className}`}>
      <div className={styles.container}>
        <nav className={styles.links}>
          <Link href="/terms">이용약관</Link>
          <span className={styles.divider}>|</span>
          <Link href="/privacy">개인정보처리방침</Link>
          <span className={styles.divider}>|</span>
          <Link href="/refund">환불정책</Link>
          <span className={styles.divider}>|</span>
          <Link href="/about">서비스 소개</Link>
        </nav>

        <div className={styles.businessInfo}>
          <p className={styles.companyName}>{publicCompanyName}</p>
          <p className={styles.infoLine}>
            대표: {publicRepresentativeName} | 사업자등록번호: {publicBusinessNumber}
          </p>
          <p className={styles.infoLine}>
            통신판매업신고: {publicMailOrderNumber} | 이메일: {publicContactEmail}
          </p>
          {variant === 'full' && (
            <p className={styles.infoLine}>
              주소: {publicBusinessAddress}
            </p>
          )}
        </div>

        <div className={styles.paymentInfo}>
          <span className={styles.pgBadge}>
            결제서비스: 토스페이먼츠
          </span>
        </div>

        <div className={styles.copyright}>
          © {currentYear} {publicCompanyName}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
