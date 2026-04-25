'use client';

import styles from '../ResultTabs.module.css';
import GlossaryHighlight from '@/components/GlossaryHighlight';

interface OneLinerProps {
    text: string;
}

export default function OneLiner({ text }: OneLinerProps) {
    return (
        <div className={styles.oneLiner}>
            <span className={styles.quoteIcon}>&quot;</span>
            <p><GlossaryHighlight text={text || '사주 분석 결과를 확인하세요'} /></p>
            <span className={styles.quoteIcon}>&quot;</span>
        </div>
    );
}
