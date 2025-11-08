# Backend

## Requirements

- Python 3.11+
- [uv](https://docs.astral.sh/uv/getting-started/installation/) installed

## Installation

- `uv sync`
- `uv run playwright install chromium`
- `uv run playwright install-deps` <- This might be needed if you run WSL
- Do `.env` file according to `.env.template`

## Start in dev mode

- `uv run python -m app.main --reload`

## Run tests

- `uv run pytest <specific test path>`
