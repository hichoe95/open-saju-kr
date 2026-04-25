const BaziEngine = require('./node_modules/yijing-bazi-mcp/src/engines/bazi-engine.js');

async function run() {
    try {
        // 입력: JSON 문자열로 받음
        const inputData = JSON.parse(process.argv[2]);

        // 필수 파라미터 추출
        const { year, month, day, hour, minute, gender, timezone } = inputData;
        const birth_datetime = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;

        const engine = new BaziEngine();

        // 1. 차트 생성
        const chart = await engine.generateChart({
            birth_datetime,
            timezone: timezone || 'Asia/Seoul',
            gender: gender || 'male',
            location: inputData.location, // { longitude, latitude } optional
            is_lunar: false // bazi.py와 달리 양력 기준 입력 가정 (프론트에서 변환해서 줌)
        });

        // 2. 종합 분석
        const analysis = await engine.analyzeChart({
            chart,
            analysis_type: 'comprehensive',
            detail_level: 'detailed'
        });

        // 3. 대운 예측 (100년치? 혹은 현재 시점 기준 향후 50년?)
        // 일단 기본 forecast 메서드는 특정 기간이 필요함.
        // 대운(Decade) 전체를 가져오려면 start_date, end_date를 넉넉하게 잡거나 chart.major_luck을 보면 됨.
        // chart.major_luck에 이미 대운 정보가 있음.

        // 여기서는 '올해'의 운세와 '현재 대운'의 운세를 상세 조회
        const today = new Date();
        const start_date = `${today.getFullYear()}-01-01`;
        const end_date = `${today.getFullYear() + 10}-12-31`; // 향후 10년 (대운 1개 커버)

        // 대운/세운 예측 (선택적)
        // const forecast = await engine.forecastLuck({
        //     chart,
        //     period_type: 'yearly',
        //     start_date,
        //     end_date
        // });

        // 결과 합치기
        const result = {
            chart,
            analysis,
            // forecast
        };

        console.log(JSON.stringify(result));

    } catch (error) {
        console.error(JSON.stringify({ error: error.message, stack: error.stack }));
        process.exit(1);
    }
}

run();
