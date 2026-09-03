FROM python:3.12-slim AS base
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_COMPILE_BYTECODE=1
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY . .
RUN uv sync --frozen --no-dev
RUN addgroup --system app && adduser --system --ingroup app app && mkdir -p var && chown -R app:app var
USER app
EXPOSE 8000
# migrations, then the API
CMD ["sh", "-c", "if [ -n \"$DATABASE_URL\" ]; then uv run alembic upgrade head; fi && uv run uvicorn mcfrs_api.app:app --host 0.0.0.0 --port 8000"]
