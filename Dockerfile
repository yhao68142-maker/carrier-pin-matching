FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libxrender1 libxext6 && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN python build_local_engine.py
RUN useradd --create-home appuser && chown -R appuser:appuser /app
USER appuser
EXPOSE 8876
CMD ["python", "serve.py"]
