'use client';

import { ReactNode } from 'react';
import styles from './SecondaryCard.module.css';

interface SecondaryCardProps {
    title: ReactNode;
    icon?: ReactNode;
    children: ReactNode;
    variant?: 'default' | 'info' | 'warning' | 'success' | 'metric';
    className?: string;
}

export default function SecondaryCard({ title, icon, children, variant = 'default', className = '' }: SecondaryCardProps) {
    return (
        <div className={`${styles.card} ${styles[variant]} ${className}`}>
            <div className={styles.header}>
                {icon && <span className={styles.icon}>{icon}</span>}
                <h4 className={styles.title}>{title}</h4>
            </div>
            <div className={styles.content}>
                {children}
            </div>
        </div>
    );
}
