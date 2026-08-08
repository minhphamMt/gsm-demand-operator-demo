"""Model 1 — dự báo demand/supply theo quantile p10/p50/p90 (§5.2, task T1).

Sẽ chứa (docs/design/ARCHITECTURE.md §7):
    features.py           A1 → A2, 26 feature
    baseline_hist_avg.py  §5.14.2 · trung bình lịch sử theo zone × giờ × thứ.
                          Vừa là mốc so của Model 1, vừa là mock của nó (C-06)
    lgbm_quantile.py      §5.2 · LightGBM quantile, 6 model = 2 target × 3 quantile
    mock.py               C-06 · trả đúng contract §4.2 khi model thật chưa xong

baseline_hist_avg chỉ được đọc split train — chạm vào test là rò rỉ nhãn.
"""
