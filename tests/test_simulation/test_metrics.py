"""Test lõi metric — Task T0.3, §5.5 công thức + §5.14.1 năm quy ước.

Acceptance Criteria (docs/design/IMPLEMENTATION_PLAN.md §3 T0.3):
    #2 số học tay trên 2 zone (10,4) và (0,5), sai số ≤ 1e-6
    #3 trung bình có trọng số ≠ logistic-của-trung-bình, và cách được cài là #3
AC #1 (test tĩnh không nhiễm tham số) ở tests/test_architecture.py.
"""

import math

import pytest

from src.simulation.metrics import (
    SystemMetrics,
    avg_wait_proxy,
    est_cancel_rate,
    ratio,
    system_metrics,
    unmet,
    zone_metrics,
)

TOL = 1e-6

# Giá trị tham chiếu tính tay từ §5.5 cho zone (demand=10, supply=4).
REF_RATIO = 2.5
REF_WAIT = 11.858541225631422  # 3.0 × 2.5^1.5
REF_CANCEL = 0.8239608336226073  # 1/(1+e^(−0.4×(11.8585…−8)))


# ------------------------------------------------------------- AC #2: số học tay


def test_bon_cong_thuc_tren_mot_zone() -> None:
    metrics = zone_metrics(demand=10, supply=4)
    assert metrics.unmet == pytest.approx(6.0, abs=TOL)
    assert metrics.ratio == pytest.approx(REF_RATIO, abs=TOL)
    assert metrics.avg_wait_proxy == pytest.approx(REF_WAIT, abs=TOL)
    assert metrics.est_cancel_rate == pytest.approx(REF_CANCEL, abs=TOL)


def test_he_thong_hai_zone_theo_dung_vi_du_acceptance() -> None:
    """Zone (0,5) có demand = 0 nên tự loại khỏi trung bình (quy ước 4)."""
    system = system_metrics([(10, 4), (0, 5)])
    assert system.unmet_demand == pytest.approx(6.0, abs=TOL)
    assert system.avg_wait_proxy == pytest.approx(REF_WAIT, abs=TOL)
    assert system.est_cancel_rate == pytest.approx(REF_CANCEL, abs=TOL)
    assert system.total_demand == pytest.approx(10.0, abs=TOL)


def test_zone_demand_0_khong_can_loc_rieng() -> None:
    """Thêm bao nhiêu zone demand = 0 cũng không làm đổi wait/cancel toàn hệ thống."""
    one = system_metrics([(10, 4)])
    many = system_metrics([(10, 4), (0, 5), (0, 0), (0, 99)])
    assert many.avg_wait_proxy == pytest.approx(one.avg_wait_proxy, abs=TOL)
    assert many.est_cancel_rate == pytest.approx(one.est_cancel_rate, abs=TOL)


# ------------------------------- AC #3: trọng số ≠ logistic-của-trung-bình


def test_cancel_la_trung_binh_co_trong_so_khong_phai_logistic_cua_trung_binh() -> None:
    """Dựng cố ý 2 zone để hai cách tính cho hai số KHÁC nhau, rồi chốt cách đúng.

    Nếu ai đó cài nhầm thành logistic(mean(wait)), test này đỏ. Đây là sai lầm khó thấy
    vì cả hai đều "hợp lý" và đều ra số trong [0,1] — nhưng logistic lồi ở nửa dưới nên
    cách sai luôn cho tỷ lệ hủy thấp hơn, tức bức tranh đẹp hơn thực tế.
    """
    zones = [(20.0, 2.0), (20.0, 40.0)]  # một zone quá tải nặng, một zone thừa cung

    system = system_metrics(zones)

    per_zone = [zone_metrics(d, s) for d, s in zones]
    total_demand = sum(d for d, _ in zones)
    weighted_cancel = sum(m.est_cancel_rate * d for m, (d, _) in zip(per_zone, zones, strict=True)) / total_demand
    weighted_wait = sum(m.avg_wait_proxy * d for m, (d, _) in zip(per_zone, zones, strict=True)) / total_demand
    logistic_of_mean = est_cancel_rate(weighted_wait)

    # Hai cách thật sự khác nhau trên bộ số này — nếu không thì test vô nghĩa.
    assert abs(weighted_cancel - logistic_of_mean) > 1e-3
    # Và cách được cài là cách #3.
    assert system.est_cancel_rate == pytest.approx(weighted_cancel, abs=TOL)
    assert system.est_cancel_rate != pytest.approx(logistic_of_mean, abs=1e-3)


def test_wait_la_trung_binh_co_trong_so_theo_demand() -> None:
    """Quy ước 2 — không phải trung bình cộng đơn giản giữa các zone."""
    zones = [(90.0, 3.0), (10.0, 50.0)]
    system = system_metrics(zones)

    per_zone = [zone_metrics(d, s) for d, s in zones]
    plain_mean = sum(m.avg_wait_proxy for m in per_zone) / len(per_zone)
    weighted = sum(m.avg_wait_proxy * d for m, (d, _) in zip(per_zone, zones, strict=True)) / 100.0

    assert system.avg_wait_proxy == pytest.approx(weighted, abs=TOL)
    assert abs(plain_mean - weighted) > 1e-3


# ------------------------------------------------------------- Biên & quy ước


def test_unmet_cong_don_va_du_cung_khong_bu_cho_zone_thieu() -> None:
    """Quy ước 5 — 3 xe thừa ở zone B KHÔNG xoá được 6 khách hụt ở zone A."""
    assert unmet(10, 4) == pytest.approx(6.0, abs=TOL)
    assert unmet(4, 10) == pytest.approx(0.0, abs=TOL)
    assert system_metrics([(10, 4), (4, 10)]).unmet_demand == pytest.approx(6.0, abs=TOL)


def test_supply_0_khong_cho_ra_vo_cuc() -> None:
    """Mẫu số kẹp ở 1: zone cạn sạch xe vẫn phải ra một con số hữu hạn."""
    assert ratio(10, 0) == pytest.approx(10.0, abs=TOL)
    assert math.isfinite(zone_metrics(10, 0).avg_wait_proxy)


def test_cung_du_thi_ty_le_huy_thap() -> None:
    """Kiểm hướng của công thức: cung dư ⇒ chờ ngắn ⇒ hủy ít."""
    doi = zone_metrics(demand=10, supply=100)
    assert doi.avg_wait_proxy < 1.0
    assert doi.est_cancel_rate < 0.05


def test_khong_co_khach_thi_khong_ai_cho_hay_huy() -> None:
    """Tổng demand = 0: trả 0.0 chứ không phải logistic(0) = 0.039."""
    system = system_metrics([(0, 5), (0, 8)])
    assert system == SystemMetrics(unmet_demand=0.0, avg_wait_proxy=0.0, est_cancel_rate=0.0, total_demand=0.0)


def test_he_thong_rong_khong_crash() -> None:
    assert system_metrics([]).total_demand == 0.0


def test_wait_va_cancel_don_dieu_tang_theo_ratio() -> None:
    """Tính chất bắt buộc: càng thiếu xe thì chờ càng lâu và hủy càng nhiều."""
    waits = [avg_wait_proxy(r) for r in (0.5, 1.0, 2.0, 4.0)]
    assert waits == sorted(waits)
    cancels = [est_cancel_rate(w) for w in waits]
    assert cancels == sorted(cancels)
    assert all(0.0 <= c <= 1.0 for c in cancels)
