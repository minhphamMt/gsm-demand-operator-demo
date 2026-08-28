# Issue #14 — Bản sao chết của pipeline ở thư mục gốc; `legacy/` vỡ import làm sai lệch mọi bộ đếm test

Trạng thái: **Đã xử lý một phần** (vấn đề 1 + 2) · **Vấn đề 3 tách issue riêng, theo quyết định của user** · Repo: `AI20K-Build-Phase-Cohort-3/P-042`

## Nguyên nhân

- Dự án bắt đầu như một pipeline Python đơn khối ở thư mục gốc (`src/`, `config/`, `data/`, `tests/`, và 6 script `build_features.py`/`train_forecast.py`/`compute_baseline_no_action.py`/`generate_drivers.py`/`generate_snapshots.py`/`eval_hotspot.py`) — đúng như CLAUDE.md §1.2 còn mô tả.
- Dự án sau đó tái cấu trúc thành monorepo `apps/ai` + `apps/backend` + `apps/frontend` (xem `Makefile`, `docker-compose.yml`, `.github/workflows/ci.yml` — cả ba chỉ trỏ vào `apps/*`, không route nào chạm thư mục gốc). Toàn bộ code, script, `config/`, `data/` ở gốc được **copy** sang `apps/ai/` nhưng **bản gốc không bị xoá** — để lại một bản sao chết song song, tiếp tục lệch dần khỏi bản thật (đối chiếu `diff -rq src apps/ai/src` cho thấy `apps/ai/src` đã có thêm `api/auth.py`, `api/routes_inference.py`, `activation/recommendation.py` — sinh ra sau khi tách nhánh — mà bản gốc không có).
- Root `tests/` còn tệ hơn: phần `.py` thật đã bị xoá ở một commit trước đó nhưng thư mục và `__pycache__` bị bỏ sót, để lại vỏ rỗng gây nhiễu khi liệt kê cây thư mục.
- Root `frontend/` là bản demo tĩnh (`hotspot-map-demo.html`) có từ trước khi `apps/frontend` (Vite+React+TS thật) tồn tại — cùng một mẫu hình "bản cũ không bị dọn khi có bản mới".
- `legacy/ai20k-template/` là **starter scaffold cũ, được README.md ghi chú cố ý giữ lại để tham khảo** (không phải rác) — nhưng `tests/conftest.py` của nó `import src.main`, và khi bất kỳ ai chạy `pytest`/`pytest --collect-only` từ gốc repo mà không giới hạn path, pytest cố collect luôn 27 file test này và vỡ ngay ở bước import (`ModuleNotFoundError: No module named 'src.common'`) vì package `src` riêng của scaffold không nằm trên `sys.path` khi chạy ngoài context của nó.
- Root `pyproject.toml` (trước khi sửa) có `testpaths = ["tests"]` giới hạn phần nào, nhưng hoàn toàn không loại trừ `legacy/` — bất kỳ ai chạy `pytest` không đúng cách (từ gốc, không qua `Makefile`) đều lãnh đủ.

## Hậu quả

- Người mới clone repo nhìn thư mục gốc thấy `src/`, `config/`, `data/`, `frontend/` y hệt tên các thư mục trong `apps/ai` — không có cách nào phân biệt bản nào đang chạy thật ngoài việc tự đọc `Makefile`/CI.
- Sửa nhầm bản gốc (rất dễ xảy ra vì tên trùng) sẽ **không hề chạy** — không CI nào kiểm tra nó, lỗi chỉ lộ ra khi đã mất công.
- `python -m pytest --collect-only` chạy từ gốc gãy giữa chừng vì `legacy/`, khiến mọi công cụ đếm test tĩnh (đếm số file `test_*.py`/số case) cộng nhầm 27 file vỡ + phần còn lại của root `tests/` vào tổng — theo issue là 747 so với con số thật 396.
- Root `frontend/` — bản demo html tĩnh — có thể bị hiểu nhầm là frontend chính của sản phẩm.

## Cách chữa

1. **Xoá hẳn bản sao chết ở gốc** (không chuyển vào `archive/`, vì git history đã giữ đủ để tra cứu nếu cần): `src/`, `tests/` (chỉ còn `__pycache__` rỗng), `frontend/`, và 6 script `build_features.py`, `train_forecast.py`, `compute_baseline_no_action.py`, `generate_drivers.py`, `generate_snapshots.py`, `eval_hotspot.py`.
2. **Không xoá `legacy/`** — khác với đề xuất đầu của issue, vì README.md gốc đã ghi chú đây là "Starter scaffold cũ, không thuộc product runtime" (giữ có chủ đích, cùng kiểu với `docs/templates/README_boilerplate.md` mà CLAUDE.md §16 dặn giữ lại). Thay vào đó áp dụng đúng đề xuất thứ hai của issue: chặn nó khỏi lượt collect mặc định.
3. **Viết lại `pyproject.toml` ở gốc**: bỏ khối `[tool.mypy]` (chết theo `src/` vừa xoá — `apps/ai/pyproject.toml` đã có mypy config riêng, được `Makefile`'s `ai-check` gọi tường minh qua `--config-file`), đặt `testpaths = []` (gốc repo không còn code Python nào cần test), và khai `norecursedirs` chặn `legacy`, `apps`, `data`, `_bmad*`, `node_modules` — **kèm giữ lại các pattern mặc định của pytest** (`.*`, `build`, `dist`, `venv`, `*.egg`) vì `norecursedirs` ghi đè toàn bộ default chứ không cộng dồn; thiếu bước này thì `.agents/skills/**/scripts/tests/` (thư mục ẩn) lại lọt vào collect thay cho `legacy/` — đã bắt lỗi này khi verify và sửa lại trước khi chốt.
4. **Không đụng root `config/` và root `data/`** — phát hiện thêm trong lúc điều tra (xem mục dưới), người dùng đã quyết định giữ nguyên, chỉ ghi nhận.
5. **Vấn đề 3 của issue (`apps/backend` thiếu linter)** — tách thành việc riêng theo quyết định của user, vì cần thêm dependency mới (`eslint` hoặc `biome`) và CLAUDE.md §6 #1 bắt buộc hỏi trước khi thêm dependency; không giải quyết trong lần này.

## Đã kiểm chứng

| Lệnh | Kết quả |
|---|---|
| `python -m pytest --collect-only -q` (từ gốc repo) | Trước: crash giữa chừng ở `legacy/…/conftest.py` (`ModuleNotFoundError: No module named 'src.common'`). Sau: `no tests collected` — sạch, không lỗi, không quét nhầm `legacy/` hay `.agents/` |
| `git status --short` | 45 file bị xoá (`src/` 1 dây, `tests/` cache rỗng, `frontend/` 5 file, 6 script), `pyproject.toml` sửa (62 dòng cũ → còn 16 dòng pytest guard) |
| Đối chiếu `Makefile` / `.github/workflows/ci.yml` / `docker-compose.yml` | Không dòng nào trỏ vào thư mục gốc đã xoá — xác nhận trước khi xoá, không phải sau |

## Phát hiện ngoài phạm vi — ghi lại cho user, không tự xử lý

- **Root `config/` và `data/` cũng là bản sao cùng mẫu hình**, nhưng `data/baseline/` ở gốc có `no_action_metrics.parquet` + `no_action_summary.json` mà `apps/ai/data/baseline/` **không có** (chỉ có `BASELINE_FREEZE.md`). Có khả năng bản gốc mới là baseline đã khoá thật (CLAUDE.md §13.1 cấm tuyệt đối sửa/xoá hai file này), còn bản `apps/ai` bị thiếu khi restructure. User đã chọn **giữ nguyên, không xoá** trong lần xử lý issue 14 — cần chủ dự án/Data-BA xác nhận xem `apps/ai` có cần được bổ sung lại baseline khoá hay không trước khi có ai động vào hai thư mục này.
- **CLAUDE.md §1.2 đang mô tả sai cấu trúc repo hiện tại** (nói `src/` gốc là skeleton rỗng chỉ có `GET /health` — không đúng ngay cả trước khi xoá, và giờ `src/` gốc không còn tồn tại). Tài liệu governance chưa được cập nhật theo lần tái cấu trúc sang `apps/*`. Đây là quyết định của PM/BA (CLAUDE.md §13.2), không tự sửa.
- **Vấn đề 3 của issue** (thêm eslint/biome cho `apps/backend`) — theo quyết định của user, để lại thành issue riêng.

## Rút kinh nghiệm

- Khi một pipeline được restructure sang thư mục con (`apps/ai`), **xoá bản gốc trong cùng commit di dời**, đừng để "copy rồi tính xoá sau" — khoảng trống giữa hai bước là lúc bản chết bắt đầu lệch khỏi bản thật và gây nhầm lẫn cho người sau.
- Thư mục "giữ lại để tham khảo" (`legacy/`, `docs/templates/`) cần được **cách ly khỏi mọi vòng lặp tự động** (test discovery, lint, build) ngay từ lúc quyết định giữ — không phải đợi đến khi ai đó chạy nhầm lệnh và gặp lỗi mới đi chặn.
- `norecursedirs` của pytest **ghi đè** default chứ không cộng dồn — khai lại danh sách mà quên các pattern mặc định (đặc biệt `.*`) sẽ vô tình mở cửa cho thư mục ẩn (ở đây là `.agents/`) lọt vào lượt collect, tạo đúng loại lỗi mà cấu hình đó được viết ra để ngăn. Luôn `--collect-only` lại sau khi đổi `norecursedirs` để xác nhận, đừng tin cấu hình đúng chỉ vì nó "trông hợp lý".
- Một "bản sao chết" tưởng đơn giản (issue chỉ nói 3 dòng) có thể kéo theo phát hiện về dữ liệu khoá (baseline) — luôn `diff -rq` hai bản trước khi xoá bất kỳ thứ gì bị nghi là bản sao, đừng tin tên thư mục giống nhau nghĩa là nội dung giống nhau.
