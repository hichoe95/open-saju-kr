'use client';

import styles from '../ResultTabs.module.css';
import { TabKey, SECONDARY_TAB_CONFIG } from '../types';

interface TabNavigationProps {
    activeTab: TabKey;
    onTabChange: (tab: TabKey) => void;
    visibleTabs: typeof SECONDARY_TAB_CONFIG;
}

export default function TabNavigation({ activeTab, onTabChange, visibleTabs }: TabNavigationProps) {
    return (
        <div className={styles.secondaryTabBar} role="tablist" aria-label="세부 분석 탭">
            {visibleTabs.map(tab => {
                const isActive = activeTab === tab.key;
                return (
                    <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        aria-label={`${tab.label} 탭`}
                        className={`${styles.secondaryTab} ${isActive ? styles.secondaryTabActive : ''}`}
                        onClick={() => onTabChange(tab.key)}
                        data-testid={`result-tab-${tab.key}`}
                    >
                        <span className={styles.secondaryTabIcon} aria-hidden="true">{tab.icon}</span>
                        <span>{tab.label}</span>
                    </button>
                );
            })}
        </div>
    );
}
