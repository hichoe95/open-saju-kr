'use client';

import styles from './BottomTabBar.module.css';
import Image from 'next/image';
import { Target, Calendar, Orbit, TrendingUp } from 'lucide-react';

type TabKey = 'summary' | 'lucky' | 'love' | 'money' | 'career' | 'study' | 'health' | 'compatibility' | 'life' | 'daeun';

interface BottomTabBarProps {
    activeTab: TabKey;
    onTabChange: (tab: TabKey) => void;
    onDosaClick: () => void;

}

// 하단 바에 표시할 핵심 탭 (4개 + 도사)
const BOTTOM_TABS: { key: TabKey; label: string; icon: React.ReactNode; ariaLabel: string }[] = [
    { key: 'summary', label: '홈', icon: <Target size={18} />, ariaLabel: '홈' },
    { key: 'lucky', label: '오늘', icon: <Calendar size={18} />, ariaLabel: '오늘의 운세' },
    // 도사 버튼은 여기 사이에
    { key: 'daeun', label: '대운', icon: <Orbit size={18} />, ariaLabel: '대운 보기' },
    { key: 'life', label: '흐름', icon: <TrendingUp size={18} />, ariaLabel: '흐름 보기' },
];

export default function BottomTabBar({ activeTab, onTabChange, onDosaClick }: BottomTabBarProps) {
    const leftTabs = BOTTOM_TABS.slice(0, 2);
    const rightTabs = BOTTOM_TABS.slice(2);

    return (
        <nav className={styles.container} aria-label="메인 내비게이션">
            <div className={styles.tabBar}>
                {/* 왼쪽 탭들 */}
                {leftTabs.map(tab => (
                    <button
                        key={tab.key}
                        type="button"
                        className={`${styles.tabItem} ${activeTab === tab.key ? styles.active : ''}`}
                        onClick={() => onTabChange(tab.key)}
                        aria-label={tab.ariaLabel}
                        aria-current={activeTab === tab.key ? 'page' : undefined}
                        data-testid={`primary-tab-${tab.key}`}
                    >
                        <span className={styles.tabIcon}>{tab.icon}</span>
                        <span className={styles.tabLabel}>{tab.label}</span>
                    </button>
                ))}

                {/* 중앙 도사 버튼 */}
                <button
                    type="button"
                    className={styles.dosaButton}
                    onClick={onDosaClick}
                    aria-label="AI 도사 상담"
                    data-testid="primary-tab-ai-chat"
                >
                    <div className={styles.dosaCircle}>
                        <Image
                            src="/icons/ai_dosa_v2.png"
                            alt="AI 도사"
                            width={40}
                            height={40}
                            className={styles.dosaImage}
                        />
                    </div>
                </button>

                {/* 오른쪽 탭들 */}
                {rightTabs.map(tab => (
                    <button
                        key={tab.key}
                        type="button"
                        className={`${styles.tabItem} ${activeTab === tab.key ? styles.active : ''}`}
                        onClick={() => onTabChange(tab.key)}
                        aria-label={tab.ariaLabel}
                        aria-current={activeTab === tab.key ? 'page' : undefined}
                        data-testid={`primary-tab-${tab.key}`}
                    >
                        <span className={styles.tabIcon}>{tab.icon}</span>
                        <span className={styles.tabLabel}>{tab.label}</span>
                    </button>
                ))}

            </div>
        </nav>
    );
}
