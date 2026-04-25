'use client';

import { useState, useEffect } from 'react';
import { Calendar, Check } from 'lucide-react';
import styles from './DateRangePicker.module.css';

interface DateRangePickerProps {
    selectedPeriod: number;
    onPeriodChange: (days: number) => void;
    onCustomRange?: (startDate: string, endDate: string) => void;
}

const PERIOD_OPTIONS = [
    { value: 7, label: '7일' },
    { value: 14, label: '14일' },
    { value: 30, label: '30일' },
    { value: 60, label: '60일' },
    { value: 90, label: '90일' },
    { value: 0, label: '전체' },
    { value: -1, label: '커스텀' },
];

export default function DateRangePicker({ selectedPeriod, onPeriodChange, onCustomRange }: DateRangePickerProps) {
    const [isCustom, setIsCustom] = useState(selectedPeriod === -1);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    useEffect(() => {
        setIsCustom(selectedPeriod === -1);
    }, [selectedPeriod]);

    const handlePeriodClick = (value: number) => {
        if (value === -1) {
            setIsCustom(true);
            onPeriodChange(-1);
        } else {
            setIsCustom(false);
            onPeriodChange(value);
        }
    };

    const handleCustomApply = () => {
        if (!startDate || !endDate) return;
        
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        if (start > end) {
            alert('시작일은 종료일보다 앞서야 합니다.');
            return;
        }

        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        
        if (diffDays > 365) {
            alert('최대 1년(365일)까지만 조회 가능합니다.');
            return;
        }

        if (onCustomRange) {
            onCustomRange(startDate, endDate);
        } else {
            // If no custom range handler, fallback to days approximation or just pass -1
            // But usually we expect onCustomRange to be handled if -1 is selected
            onPeriodChange(-1); 
        }
    };

    return (
        <div className={styles.container}>
            {PERIOD_OPTIONS.map((option) => (
                <button
                    type="button"
                    key={option.value}
                    className={`${styles.periodButton} ${selectedPeriod === option.value ? styles.periodActive : ''}`}
                    onClick={() => handlePeriodClick(option.value)}
                >
                    {option.label}
                </button>
            ))}

            {isCustom && (
                <div className={styles.customRange}>
                    <Calendar size={14} />
                    <input
                        type="date"
                        className={styles.dateInput}
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        max={endDate || undefined}
                    />
                    <span>~</span>
                    <input
                        type="date"
                        className={styles.dateInput}
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        min={startDate || undefined}
                    />
                    <button 
                        type="button" 
                        className={styles.applyButton}
                        onClick={handleCustomApply}
                    >
                        <Check size={14} />
                        적용
                    </button>
                </div>
            )}
        </div>
    );
}
