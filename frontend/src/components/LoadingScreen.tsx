'use client';

import { useState, useEffect, useRef, startTransition } from 'react';
import styles from './LoadingScreen.module.css';
import { SAJU_TRIVIA } from '@/data/trivia';
import { Clock, Sparkles, XCircle } from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8003';
const DEFAULT_DURATION_MS = 180000;

interface LoadingScreenProps {
    isVisible: boolean;
    onCancel: () => void;
    progress?: number;
    completedTabs?: number;
    totalTabs?: number;
}

export default function LoadingScreen({ 
    isVisible, 
    onCancel, 
    progress, 
    completedTabs, 
    totalTabs 
}: LoadingScreenProps) {
    const [shuffledTrivia, setShuffledTrivia] = useState<typeof SAJU_TRIVIA>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [simulatedProgress, setSimulatedProgress] = useState(0);
    const [expectedDuration, setExpectedDuration] = useState(DEFAULT_DURATION_MS);
    const [showCancelButton, setShowCancelButton] = useState(false);
    const startTimeRef = useRef<number>(0);
    const fetchedRef = useRef(false);

    useEffect(() => {
        startTransition(() => {
            setShuffledTrivia([...SAJU_TRIVIA].sort(() => Math.random() - 0.5));
        });
    }, []);

    // Cancel button delay - show after 1.5 seconds to prevent accidental clicks
    useEffect(() => {
        if (isVisible) {
            const timer = setTimeout(() => startTransition(() => setShowCancelButton(true)), 1500);
            return () => clearTimeout(timer);
        } else {
            startTransition(() => {
                setShowCancelButton(false);
            });
        }
    }, [isVisible]);

    useEffect(() => {
        if (fetchedRef.current) return;
        fetchedRef.current = true;
        
        fetch(`${API_BASE_URL}/api/stats/avg-processing-time`)
            .then(res => res.json())
            .then(data => {
                if (data.avg_processing_time_ms && data.avg_processing_time_ms > 0) {
                    startTransition(() => {
                        setExpectedDuration(data.avg_processing_time_ms);
                    });
                }
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (!isVisible || shuffledTrivia.length === 0) return;

        const interval = setInterval(() => {
            startTransition(() => {
                setCurrentIndex((prev) => (prev + 1) % shuffledTrivia.length);
            });
        }, 15000);

        return () => clearInterval(interval);
    }, [isVisible, shuffledTrivia]);

    useEffect(() => {
        if (!isVisible) {
            startTransition(() => {
                setSimulatedProgress(0);
            });
            startTimeRef.current = 0;
            return;
        }

        if (progress !== undefined) return;

        startTimeRef.current = Date.now();
        
        const interval = setInterval(() => {
            const elapsed = Date.now() - startTimeRef.current;
            const rawProgress = (elapsed / expectedDuration) * 95;
            startTransition(() => {
                setSimulatedProgress(Math.min(rawProgress, 95));
            });
        }, 500);

        return () => clearInterval(interval);
    }, [isVisible, progress, expectedDuration]);

    if (!isVisible || shuffledTrivia.length === 0) return null;

    const displayProgress = progress ?? simulatedProgress;
    const displayCompletedTabs = completedTabs ?? Math.floor((displayProgress / 100) * 11);
    const displayTotalTabs = totalTabs ?? 11;

    return (
        <div className={styles.overlay}>
            <div className={styles.title}>
                심층적으로 운세를 분석하고 있어요!
            </div>

            <div className={styles.timeBadge}>
                <Clock size={16} /> 최대 1분 소요
            </div>

            <div className={styles.cardContainer}>
                {shuffledTrivia.map((item, index) => (
                    <div
                        key={item.id}
                        className={`${styles.card} ${index === currentIndex ? styles.cardActive : ''}`}
                    >
                        <div className={styles.icon}>
                            {typeof item.icon === 'string' && item.icon.startsWith('/') ? (
                                <img src={item.icon} alt={item.title} width={128} height={128} loading="eager" />
                            ) : (
                                item.icon
                            )}
                        </div>
                        <h3 className={styles.cardTitle}>{item.title}</h3>
                        <p className={styles.cardDesc}>{item.description}</p>
                    </div>
                ))}
            </div>

            <div className={styles.progressSection}>
                <div className={styles.progressPercentage}>
                    {Math.round(displayProgress)}%
                </div>
                <div className={styles.progressTabInfo}>
                    {displayCompletedTabs}/{displayTotalTabs} 탭 분석 완료
                </div>
                <div className={styles.progressBar}>
                    <div 
                        className={styles.progressFill}
                        style={{ width: `${displayProgress}%` }}
                    />
                    <div className={styles.progressGlow} style={{ left: `${displayProgress}%` }} />
                </div>
            </div>

            <p className={styles.message}>
                AI 도사가 열심히 운세를 분석 중이에요!<br />
                잠시만 기다려 주세요 <Sparkles size={16} className={styles.inlineIcon} />
            </p>

            <button
                type="button"
                className={`${styles.cancelButton} ${showCancelButton ? styles.cancelButtonVisible : ''}`}
                onClick={onCancel}
            >
                <XCircle size={16} />
                <span>분석 취소</span>
            </button>
        </div>
    );
}
