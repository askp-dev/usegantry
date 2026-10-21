# OK: compose runs it as 1000:1000, and the image drops root too
FROM python:3.12-slim
RUN useradd -m app
USER app
CMD ["python", "-m", "worker"]
