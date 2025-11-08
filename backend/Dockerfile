FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy
ENV UV_NO_SYNC=1
ENV DEBUG="False"

COPY pyproject.toml uv.lock ./

RUN uv sync --frozen --no-dev
RUN uv run playwright install chromium

COPY . .

RUN uv run python -m compileall -b /app

CMD ["uv", "run", "python", "-m", "app.main"]