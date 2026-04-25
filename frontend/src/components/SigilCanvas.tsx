import { useEffect, useRef } from 'react';
import { drawSigil } from '@/utils/sigilGenerator';

interface SigilCanvasProps {
    width: number;
    height: number;
    seed: string;
    element: string;
    name: string;
}

export default function SigilCanvas({ width, height, seed, element, name }: SigilCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Retina display support
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        ctx.scale(dpr, dpr);

        drawSigil(ctx, width, height, seed, element, name);

    }, [width, height, seed, element, name]);

    return <canvas ref={canvasRef} />;
}
