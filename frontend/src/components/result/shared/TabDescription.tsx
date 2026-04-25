'use client';

import { Info } from 'lucide-react';
import styles from './TabDescription.module.css';
import { TabKey, TAB_DESCRIPTIONS } from '../types';

interface TabDescriptionProps {
  tabKey: TabKey;
}

export default function TabDescription({ tabKey }: TabDescriptionProps) {
  const description = TAB_DESCRIPTIONS[tabKey];

  if (!description) return null;

  return (
    <div className={styles.container}>
      <details className={styles.details}>
        <summary className={styles.summary}>
          <Info size={14} className={styles.icon} />
          <span>이 분석은?</span>
        </summary>
        <div className={styles.content}>
          {description}
        </div>
      </details>
    </div>
  );
}
