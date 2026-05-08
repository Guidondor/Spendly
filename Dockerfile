FROM python:3.11-slim
ARG ANTHROPIC_API_KEY
ARG ALLOWED_ORIGIN
ENV ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY
ENV ALLOWED_ORIGIN=$ALLOWED_ORIGIN
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port $PORT"]
