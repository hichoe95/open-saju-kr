
const COLORS: Record<string, { main: string; sub: string; accent: string }> = {
    wood: { main: '#059669', sub: '#34D399', accent: '#A7F3D0' },
    fire: { main: '#DC2626', sub: '#F87171', accent: '#FECACA' },
    earth: { main: '#D97706', sub: '#FBBF24', accent: '#FDE68A' },
    metal: { main: '#4B5563', sub: '#9CA3AF', accent: '#E5E7EB' },
    water: { main: '#2563EB', sub: '#60A5FA', accent: '#BFDBFE' },
};

// Simple pseudo-random generator
function seededRandom(seed: number) {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
}

function stringToSeed(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return Math.abs(hash);
}

export function drawSigil(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    seedStr: string,
    element: string,
    name: string
) {
    let seed = stringToSeed(seedStr);
    const rand = () => {
        const r = seededRandom(seed);
        seed += 1;
        return r;
    };

    const theme = COLORS[element] || COLORS.earth;
    const cx = width / 2;
    const cy = height / 2;

    // 1. Background
    ctx.fillStyle = '#111827'; // Dark background
    ctx.fillRect(0, 0, width, height);

    // Gradient overlay
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, width * 0.7);
    gradient.addColorStop(0, '#1F2937');
    gradient.addColorStop(1, '#000000');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(cx, cy);

    // 2. Outer Circle Ring
    ctx.beginPath();
    ctx.arc(0, 0, width * 0.4, 0, Math.PI * 2);
    ctx.strokeStyle = theme.main;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, width * 0.38, 0, Math.PI * 2);
    ctx.strokeStyle = theme.sub;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    // 3. Geometric Pattern (Rotating Squares/Triangles)
    const shapes = Math.floor(rand() * 3) + 3; // 3 to 5 shapes
    const rotationOffset = rand() * Math.PI;

    for (let i = 0; i < shapes; i++) {
        ctx.save();
        ctx.rotate(rotationOffset + (Math.PI * 2 * i) / shapes);

        ctx.beginPath();
        const size = width * 0.25;
        if (rand() > 0.5) {
            // Triangle
            ctx.moveTo(0, -size);
            ctx.lineTo(size * 0.866, size * 0.5);
            ctx.lineTo(-size * 0.866, size * 0.5);
        } else {
            // Square
            ctx.rect(-size / 2, -size / 2, size, size);
        }
        ctx.closePath();
        ctx.strokeStyle = theme.accent;
        ctx.globalAlpha = 0.6;
        ctx.stroke();
        ctx.restore();
    }

    // 4. Inner Rune-like marks
    const marks = 8;
    for (let i = 0; i < marks; i++) {
        ctx.save();
        const angle = (Math.PI * 2 * i) / marks;
        ctx.rotate(angle);
        ctx.translate(0, -width * 0.33);

        ctx.beginPath();
        ctx.moveTo(-5, 0);
        ctx.lineTo(5, 0);
        ctx.moveTo(0, -5);
        ctx.lineTo(0, 5);
        if (rand() > 0.5) ctx.arc(0, 0, 3, 0, Math.PI * 2);

        ctx.strokeStyle = theme.sub;
        ctx.globalAlpha = 0.8;
        ctx.stroke();
        ctx.restore();
    }

    // 5. Center Symbol (Name or Element)
    ctx.restore(); // Undo translate

    // Draw Name
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = theme.accent;
    ctx.shadowColor = theme.main;
    ctx.shadowBlur = 10;
    ctx.font = 'bold 32px serif';
    ctx.fillText(name.slice(0, 1) || element.toUpperCase(), cx, cy);

    // Element Kanji Background (faint)
    ctx.globalAlpha = 0.1;
    ctx.font = '120px serif';
    // Mapping needed for element to kanji, fallback to initials
    const elKanji: Record<string, string> = {
        wood: '木', fire: '火', earth: '土', metal: '金', water: '水'
    };
    ctx.fillText(elKanji[element] || '氣', cx, cy);

    ctx.restore();
}
