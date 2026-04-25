import asyncio
import json
import logging
import os
from typing import Dict, Any

logger = logging.getLogger(__name__)


async def get_bazi_analysis_async(year: int, month: int, day: int, hour: int, minute: int, gender: str) -> Dict[str, Any]:
    current_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.dirname(os.path.dirname(current_dir))
    runner_path = os.path.join(backend_dir, 'bazi_runner.js')
    
    input_data = json.dumps({
        "year": year, "month": month, "day": day,
        "hour": hour, "minute": minute,
        "gender": gender, "timezone": "Asia/Seoul"
    })
    
    try:
        proc = await asyncio.create_subprocess_exec(
            'node', runner_path, input_data,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=backend_dir
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)
        
        if proc.returncode != 0:
            logger.error(f"Bazi Runner Error (code {proc.returncode}): {stderr.decode()}")
        
        lines = stdout.decode().strip().split('\n')
        for line in reversed(lines):
            line = line.strip()
            if line.startswith('{') and line.endswith('}'):
                try:
                    return json.loads(line)
                except json.JSONDecodeError:
                    logger.warning("Failed to parse JSON line from bazi output: %s", line)
                    continue
        
        logger.error("No valid JSON found in Bazi output")
        return {}

    except asyncio.TimeoutError:
        logger.error("Bazi Service Timeout: exceeded 30 seconds")
        return {}
    except Exception as e:
        logger.exception(f"Bazi Service Exception: {e}")
        return {}

def get_bazi_analysis(year: int, month: int, day: int, hour: int, minute: int, gender: str) -> Dict[str, Any]:
    try:
        loop = asyncio.get_running_loop()
        return asyncio.run_coroutine_threadsafe(
            get_bazi_analysis_async(year, month, day, hour, minute, gender), loop
        ).result(timeout=35)
    except RuntimeError as e:
        logger.exception("Could not fetch sync running loop for bazi analysis: %s", e)
        return asyncio.run(get_bazi_analysis_async(year, month, day, hour, minute, gender))
    except Exception as e:
        logger.exception("Failed to run bazi analysis sync wrapper: %s", e)
        return {}
