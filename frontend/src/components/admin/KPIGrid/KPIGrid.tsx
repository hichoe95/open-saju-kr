'use client';

import styles from './KPIGrid.module.css';

interface KPIGridProps {
  children: React.ReactNode;
  columns?: 3 | 4 | 6;
}

export default function KPIGrid({ children, columns = 3 }: KPIGridProps) {
  return (
    <div className={`${styles.grid} ${styles[`cols${columns}`]}`}>
      {children}
    </div>
  );
}
