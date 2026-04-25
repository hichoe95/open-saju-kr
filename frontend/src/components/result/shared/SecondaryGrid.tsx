'use client';

import { ReactNode } from 'react';
import styles from './SecondaryGrid.module.css';

interface SecondaryGridProps {
    children: ReactNode;
    columns?: 1 | 2 | 3;
    className?: string;
}

export default function SecondaryGrid({ children, columns = 2, className = '' }: SecondaryGridProps) {
    return (
        <div className={`${styles.grid} ${styles[`cols${columns}`]} ${className}`}>
            {children}
        </div>
    );
}
