.PHONY: check ai-check backend-check frontend-check compose-config

ai-check:
	python -m pip install -r apps/ai/requirements.txt
	python -m ruff check apps/ai/src apps/ai/tests
	python -m mypy --config-file apps/ai/pyproject.toml apps/ai/src
	python -m pytest -q apps/ai/tests

backend-check:
	npm --prefix apps/backend ci
	npm --prefix apps/backend run check

frontend-check:
	npm --prefix apps/frontend ci
	npm --prefix apps/frontend run check

compose-config:
	docker compose config --quiet

check: ai-check backend-check frontend-check compose-config
