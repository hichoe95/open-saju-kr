import { useState, useCallback } from 'react';
import { DailyFortune, DailyFortuneData } from '@/lib/api';

export function useDailyFortune() {
    const [dailyFortune, setDailyFortune] = useState<DailyFortuneData | null>(null);
    const [dailyFortuneDate, setDailyFortuneDate] = useState<string | null>(null);

    const handleDailyFortuneUpdate = useCallback((fortune: DailyFortune) => {
        setDailyFortune(fortune.fortune_data);
        setDailyFortuneDate(fortune.formatted_date);
    }, []);

    return {
        dailyFortune,
        dailyFortuneDate,
        handleDailyFortuneUpdate
    };
}
