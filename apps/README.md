# Applications

The production runtime is split into three independently deployable services:

- `frontend/` — React/Vite browser application. It owns presentation, client state, and browser-safe configuration.
- `backend/` — NestJS API boundary. It owns authentication, authorization, business mutations, audit, persistence, and Supabase migrations.
- `ai/` — FastAPI inference service. It owns replay data, model artifacts, forecasting, hotspot detection, optimization, and explanations.

Service-specific dependencies, tests, Dockerfiles, environment templates, and runtime data stay inside their service directory. Cross-service communication uses the documented HTTP contracts; the frontend does not write business tables directly.
