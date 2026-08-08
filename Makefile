# Ghi chú: máy Windows của đội không có `make`. File này giữ để tra tên lệnh
# và để CI/Linux dùng; lệnh tương đương cho PowerShell nằm ở README.md.

.PHONY: run test lint format format-check typecheck check clean

run:
	uvicorn src.main:app --reload --host 0.0.0.0 --port 8000

test:
	pytest tests/ -v

lint:
	ruff check src/ tests/

format:
	ruff format src/ tests/

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
