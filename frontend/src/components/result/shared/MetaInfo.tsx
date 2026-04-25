'use client';

import styles from '../ResultTabs.module.css';
import { Bot, Clock, FileText } from 'lucide-react';

interface MetaInfoProps {
    meta: {
        latency_ms: number;
        prompt_version: string;
    };
}

export default function MetaInfo({ meta }: MetaInfoProps) {
    return (
        <div className={styles.meta}>
            <span className={styles.metaItem}><Bot size={14} /> saju-deep</span>
            <span className={styles.metaItem}><Clock size={14} /> {meta.latency_ms}ms</span>
            <span className={styles.metaItem}><FileText size={14} /> {meta.prompt_version}</span>
        </div>
    );
}
