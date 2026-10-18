FROM python:3.12-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DATA_DIR=/data PORT=8114

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY scripts ./scripts
COPY VERSION .
COPY app ./app
RUN python scripts/fetch_icons.py
COPY tests ./tests

EXPOSE 8114
CMD ["python", "-m", "app"]
