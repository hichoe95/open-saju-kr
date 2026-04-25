import sajupy
import datetime

def test_saju():
    try:
        # 1990년 5월 5일 14시 30분
        date = datetime.datetime(1990, 5, 5, 14, 30)
        
        # calculate_saju 함수 사용해보기
        # 인자 추측: year, month, day, hour, minute 등?
        # 또는 datetime 객체?
        # help()를 볼 수 없으니 시도.
        
        print("Function: calculate_saju")
        # 예상: calculate_saju(year, month, day, hour=0, minute=0, lat=37.5, lon=127.0)
        result = sajupy.calculate_saju(1990, 5, 5, 14, 30)
        print(f"Result type: {type(result)}")
        print(f"Result: {result}")
        
    except Exception as e:
        print(f"Error testing calculate_saju: {e}")

if __name__ == "__main__":
    test_saju()
