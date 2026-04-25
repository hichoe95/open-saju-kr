# Backend container image for optional deployment.
FROM python:3.11-slim

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

ENV PORT=8003
CMD sh -c "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"
