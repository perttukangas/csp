
# AI Web Scraper Backend

FastAPI-based backend service that uses Google Gemini AI to generate intelligent web scraping selectors.

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- Google Gemini API Key

### Manual Setup
```bash
# Navigate to backend directory
cd backend

# Create virtual environment
python -m venv .venv

# Activate virtual environment  
# Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# Git Bash on Windows:
source .venv/Scripts/activate

# Install dependencies
pip install -r requirements.txt

# Edit .env and add your GEMINI_API_KEY

# Start server (make sure you're in backend directory)
python -m uvicorn app.main:app --reload
```

## 🧪 Testing

```bash
# Run integration tests in another terminal
python backend/test_gemini_agent.py

```

## 🛠️ Development

### Dev Container 🐳

#### Option 1: VSCode Dev Container (recommended)

1. Install the **Dev Containers** extension in VS Code.  
2. Open the project root (`csp/`) in VS Code.  
3. Press **Ctrl+P**, type **“Reopen in Container”**, and choose either **Reopen in Container** or **Rebuild and Reopen in Container**:  
   * Use *Reopen in Container* if you just want to start the container.  
   * Use *Rebuild and Reopen in Container* if you changed the Dockerfile or dependencies.  
4. VS Code will open the dev container where all commands (`pytest`, `ruff`, `uv`) run.  

#### Option 2: Develop without VSCode

```
docker compose -f .devcontainer/backend/docker-compose.dev.yml build && docker compose -f .devcontainer/backend/docker-compose.dev.yml up -d && docker exec -it $(docker compose -f .devcontainer/backend/docker-compose.dev.yml ps -q backend) bash
```


To exit the container shell, type:

```
exit
```

This closes the shell but keeps the container running in the background.

To stop and remove the container, run:

```
docker compose -f .devcontainer/backend/docker-compose.dev.yml down
```

---

### Lint & Format

```
uv run ruff check
```

Fix automatically:

```
uv run ruff check --fix
```

> VSCode is configured so Ruff automatically formats and fixes on save.

### Running tests

```
uv run pytest
```

This command runs all automated tests in the `tests/` directory by executing every file named `test_*.py` or `*_test.py` and reporting the results.

---

### Run the server

```
uv run uvicorn app.main:app --reload
```

* Starts FastAPI server in dev mode.
* `--reload` = auto-restart on code changes.

### Test the API

* [http://localhost:8000](http://localhost:8000) – root
* [http://localhost:8000/docs](http://localhost:8000/docs) – Swagger UI
* [http://localhost:8000/redoc](http://localhost:8000/redoc) – ReDoc
