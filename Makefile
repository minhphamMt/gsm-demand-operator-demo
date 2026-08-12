<<<<<<< HEAD
# Ghi chú: máy Windows của đội không có `make`. File này giữ để tra tên lệnh
# và để CI/Linux dùng; lệnh tương đương cho PowerShell nằm ở README.md.

.PHONY: run test lint format format-check typecheck check clean
=======
.PHONY: check ai-check backend-check frontend-check compose-config
>>>>>>> refactor/reorganize-project-structure

ai-check:
	python -m pip install -r apps/ai/requirements.txt
	python -m ruff check apps/ai/src apps/ai/tests
	python -m pytest -q apps/ai/tests

backend-check:
	npm --prefix apps/backend ci
	npm --prefix apps/backend run check

frontend-check:
	npm --prefix apps/frontend ci
	npm --prefix apps/frontend run check

compose-config:
	docker compose config --quiet

<<<<<<< HEAD
format-check:
	ruff format --check src/ tests/

typecheck:
	mypy

check: lint format-check typecheck test

clean:
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type d -name .pytest_cache -exec rm -rf {} +
	find . -type d -name .ruff_cache -exec rm -rf {} +
	find . -type d -name .mypy_cache -exec rm -rf {} +
=======
check: ai-check backend-check frontend-check
>>>>>>> refactor/reorganize-project-structure
