'use client';

import styles from './Skeleton.module.css';

interface StatCardSkeletonProps {
    count?: number;
}

export function StatCardSkeleton({ count = 1 }: StatCardSkeletonProps) {
    return (
        <>
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className={styles.statCard}>
                    <div className={`${styles.skeleton} ${styles.statIcon}`} />
                    <div className={styles.statContent}>
                        <div className={`${styles.skeleton} ${styles.statTitle}`} />
                        <div className={`${styles.skeleton} ${styles.statValue}`} />
                    </div>
                </div>
            ))}
        </>
    );
}

interface TableRowSkeletonProps {
    rows?: number;
    columns?: number;
}

export function TableRowSkeleton({ rows = 5, columns = 5 }: TableRowSkeletonProps) {
    return (
        <>
            {Array.from({ length: rows }).map((_, rowIndex) => (
                <tr key={rowIndex} className={styles.tableRow}>
                    {Array.from({ length: columns }).map((_, colIndex) => (
                        <td key={colIndex}>
                            <div className={`${styles.skeleton} ${styles.tableCell}`} />
                        </td>
                    ))}
                </tr>
            ))}
        </>
    );
}

interface ChartSkeletonProps {
    height?: number;
}

export function ChartSkeleton({ height = 300 }: ChartSkeletonProps) {
    return (
        <div className={styles.chartContainer}>
            <div className={styles.chartHeader}>
                <div className={`${styles.skeleton} ${styles.chartTitle}`} />
                <div className={`${styles.skeleton} ${styles.chartSubtitle}`} />
            </div>
            <div 
                className={`${styles.skeleton} ${styles.chartArea}`}
                style={{ height }}
            />
        </div>
    );
}

export function CardSkeleton() {
    return (
        <div className={styles.card}>
            <div className={`${styles.skeleton} ${styles.cardTitle}`} />
            <div className={`${styles.skeleton} ${styles.cardContent}`} />
            <div className={`${styles.skeleton} ${styles.cardContent}`} style={{ width: '70%' }} />
        </div>
    );
}
