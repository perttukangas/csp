# Backend

## Requirements

- Python 3.11+
- [uv](https://docs.astral.sh/uv/getting-started/installation/) installed

## Installation

- `uv sync`
- Add `.env` file according to `.env.template`
 
## Start in dev mode

- `uv run uvicorn app.main:app --reload`

## 🧪 Testing

```bash
# Run integration tests in another terminal
uv run tests/test_gemini_agent.py
```