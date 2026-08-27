# Đặc tả logic: "Autonomous Resolution Pipeline" — Panel Subagent & Luồng xử lý
 
Tài liệu này mô tả lại logic hiển thị và luồng xử lý của cụm subagent trong panel "Autonomous Resolution Pipeline", viết dưới dạng đặc tả chức năng để một AI (coding agent) có thể đọc và triển khai lại đúng hành vi.
 
**Cập nhật quan trọng ở bản này:**
1. Danh sách subagent được **tách ra khỏi tab Overview**, chuyển sang **một tab riêng** (`Agents`) trên thanh tab của panel. Tab Overview giờ chỉ còn chứa khối giám sát sức khoẻ hệ thống (System KPI Monitoring Header).
2. Subview `Connect` (sơ đồ luồng dữ liệu) **không còn là sub-tab bên trong tab `Agents`** nữa, mà được **nâng cấp thành một tab cấp 1 riêng** trên thanh tab panel. Từ tab `Agents`, người dùng **click vào 1 agent card → điều hướng (link) sang tab `Connect`**, đồng thời tab `Connect` tự động focus/scroll tới đúng node của agent vừa click.
---
 
## 1. Tổng quan hệ thống
 
Đây là một **bảng điều khiển giám sát multi-agent** (multi-agent orchestration dashboard), hiển thị đè lên bản đồ (map view). Khi có một sự kiện/khu vực cần xử lý (ví dụ vùng khoanh đỏ trên bản đồ = "zone bị ảnh hưởng"), hệ thống tự động khởi chạy nhiều **subagent chuyên trách** chạy song song, sau đó gộp kết quả của chúng lại thông qua một **Optimization Agent** trung tâm để đưa ra phương án tối ưu, và cuối cùng cần **con người xác nhận (permission gate)** trước khi lệnh thực thi được gửi đi (dispatch).
 
Panel có nhiều **tab** ở thanh trên cùng, mỗi tab phụ trách một mối quan tâm riêng biệt (xem mục 2), thay vì dồn tất cả vào một tab Overview như bản đặc tả trước.
 
---
 
## 2. Cấu trúc giao diện & thanh tab
 
- **Bản đồ nền**: hiển thị vị trí, vùng ảnh hưởng (polygon tô màu đỏ bán trong suốt), các marker (phương tiện, điểm nóng, radar mini-map ở góc dưới).
- **Panel bên phải** ("Autonomous Resolution Pipeline"): panel nổi, có thể đóng (nút X góc trên phải), chứa thanh tab điều hướng chính:
| Tab | Nội dung | Mục tham chiếu |
|---|---|---|
| `Overview` | Chỉ số giám sát sức khoẻ **toàn hệ thống** (Total Supply, Active Demand, ETA trend...) | mục 3 |
| `Agents` | Danh sách subagent dạng lưới thẻ, xem nhanh trạng thái từng agent | mục 4 |
| `Connect` | Sơ đồ luồng dữ liệu (fan-in/fan-out) giữa các agent → Optimization Agent | mục 5 |
| `Executions` | Lịch sử/agent đang chạy theo từng lần pipeline được kích hoạt | mục 7 |
| `History` | Log lịch sử tổng thể | — |
| `Chats` | Hội thoại/tương tác với AI liên quan tới pipeline | — |
 
  Đây là **thanh tab cấp 1** của panel — mỗi tab là một context độc lập, chỉ render 1 tab tại một thời điểm (không cuộn xuyên tab như bản trước).
 
- **Thanh công cụ dọc bên rìa phải màn hình**: các icon phụ trợ (lịch sử, ghi chú, tài liệu, đính kèm, thư mục, mô hình 3D, layer, bảng, thêm...) — đóng vai trò công cụ chung của workspace, không phải một phần logic agent.
- **Thanh trạng thái dưới cùng**: zoom %, các icon cấu hình nhanh.
---
 
## 3. Tab `Overview` — System KPI Monitoring Header
 
Tab này **chỉ chứa duy nhất khối giám sát sức khoẻ hệ thống**, không còn kèm danh sách agent bên dưới nữa (đã tách sang tab `Agents`, mục 4). Đây là tab mặc định khi mở panel, cho người dùng cái nhìn tổng quan ngay lập tức về tình trạng vận hành chung, độc lập với việc có pipeline nào đang chạy hay không.
 
### 3.1 Khối trạng thái AI tổng (AI Status Badge)
- Avatar tròn "AI" có hiệu ứng glow xanh lá, pulsing khi hệ thống đang hoạt động (biểu thị "đang sống"/online).
- Cạnh avatar: tên/nhãn của mô hình hoặc phiên giám sát đang chạy + dòng phụ mô tả ngắn.
- Một chỉ số **%** nổi bật màu xanh ngọc (ví dụ: độ tin cậy hiện tại, hoặc % thay đổi hiệu suất so với kỳ trước) — **chỉ số sức khoẻ tổng (health score)** của toàn hệ thống, cập nhật realtime.
### 3.2 Dòng "AI MONITORING" (toggle mở/thu gọn)
- Chấm tròn xanh lá nhỏ = đang giám sát/online.
- Label "AI MONITORING" + icon mũi tên `>` cuối dòng để **mở rộng/thu gọn** toàn bộ khối chỉ số bên dưới (mục 3.3 → 3.8).
- Vì tab này không còn phải nhường chỗ cho danh sách agent, việc thu gọn chỉ đơn thuần để **tiết kiệm không gian xem nhanh** (vd. chỉ cần liếc health score), không còn ý nghĩa "nhường layout" như bản trước.
### 3.3 Cặp chỉ số chính (Primary KPI pair)
- Hai cột số liệu lớn, cạnh nhau:
  - `TOTAL SUPPLY`: tổng nguồn lực khả dụng trong hệ thống (vd. tổng phương tiện/tài nguyên).
  - `ACTIVE DEMAND`: nhu cầu đang hoạt động/chờ xử lý tại thời điểm hiện tại.
- 2 chỉ số nghiệp vụ cốt lõi để đánh giá **cân bằng cung–cầu**; nếu demand tiệm cận supply cần cảnh báo.
### 3.4 Thanh cân bằng cung–cầu (Supply/Demand balance bar)
- Thanh ngang với tay cầm dạng chấm tròn (dot handle), thể hiện **vị trí hiện tại của demand so với supply** (tỉ lệ % nguồn lực đang được sử dụng).
- Phần bên trái dot tô màu accent (teal), phần còn lại màu xám. Dot càng gần bên phải = hệ thống càng gần quá tải.
- **Chỉ số đọc (read-only)**, không kéo được.
### 3.5 Chỉ số ETA trung bình + biểu đồ xu hướng
- `AVERAGE ETA`: giá trị hiện tại (vd. "X mins"), đặt cùng dòng với label, căn phải.
- Bên dưới là **biểu đồ đường/area chart** xu hướng ETA trung bình theo thời gian:
  - Trục Y: thang giá trị có gridline ngang.
  - Trục X: các mốc thời gian gần đây (theo giờ trong ngày).
  - Vùng dưới đường có gradient fill mờ để nhấn xu hướng.
  - Điểm cuối cùng (thời điểm hiện tại) có chấm tròn nổi bật đánh dấu giá trị realtime mới nhất.
- Mục đích nghiệp vụ: đánh giá hiệu suất điều phối đang cải thiện hay xấu đi theo thời gian.
### 3.6 Chỉ số phụ có thể bật/tắt theo dõi (Toggleable secondary metric)
- Một hàng gồm: icon dạng cột (bar-icon) + label chỉ số phụ + **công tắc bật/tắt (toggle switch)** ở cuối hàng.
- Cho phép người dùng bật/tắt việc hiển thị chỉ số này ngay trên dashboard → danh sách chỉ số monitoring **có thể tuỳ biến (configurable metric list)**.
### 3.7 Chỉ số ngưỡng có thể điều chỉnh (Adjustable threshold metric)
- `AVERAGE DURATION`: hiển thị giá trị hiện tại + một giá trị phụ đặt cạnh (vd. so với mốc chuẩn/target).
- Bên dưới là thanh trượt với **tay cầm dạng chấm tròn** (cùng kiểu tay cầm dot với mục 3.4) — đây vẫn là 1 thanh trượt/thanh chỉ số dạng slider, không phải hình kim cương hay ngôi sao.
- Đầu thanh có nhãn số (vd. "86K") thể hiện mốc hiện tại.
- Điểm khác so với mục 3.4: mục 3.4 là chỉ số **đọc (read-only)**, còn thanh này là **ngưỡng do người dùng cấu hình (configurable threshold/target)** — cần phân biệt 2 loại bằng trạng thái tương tác (kéo được hay không) và/hoặc màu sắc, chứ không phải bằng hình dạng tay cầm.
- Nghiệp vụ: người vận hành kéo tay cầm để đặt ngưỡng cảnh báo/mục tiêu.
### 3.8 Bảng danh sách chi tiết dữ liệu (Scrollable breakdown table)
- Cuối tab là **bảng/danh sách cuộn được**, mỗi dòng gồm: tên mục cụ thể (khu vực/tài nguyên) + nhiều cột số liệu (giá trị tuyệt đối, %, số lượng...).
- **Breakdown chi tiết theo từng đối tượng** (per-item drilldown) của các chỉ số tổng hợp ở trên.
- Cần hỗ trợ sort/scroll; nên virtualize nếu số dòng lớn.
### 3.9 Ý nghĩa nghiệp vụ tổng thể của tab
Tab `Overview` là **lớp giám sát sức khoẻ hệ thống (system health layer)**, hoàn toàn tách biệt khỏi logic từng agent riêng lẻ (mục 4). Nó trả lời 3 nhóm câu hỏi nghiệp vụ:
1. Hệ thống có đang cân bằng cung–cầu không? (mục 3.3, 3.4)
2. Hiệu suất phục vụ (ETA/duration) đang xu hướng thế nào, có nằm trong ngưỡng chấp nhận được không? (mục 3.5, 3.7)
3. Chi tiết theo từng đối tượng cụ thể ra sao, có điểm bất thường nào cần đi sâu không? (mục 3.8)
### 3.10 Gợi ý schema dữ liệu cho tab này
 
```json
{
  "systemHealth": {
    "healthScorePercent": 0.90,
    "modelLabel": "tên model / phiên giám sát",
    "monitoringEnabled": true,
    "totalSupply": 40946,
    "activeDemand": 1022,
    "supplyDemandRatio": 0.68,
    "averageEtaMins": 3.298,
    "etaTrend": [
      { "t": "01:00", "value": 120 },
      { "t": "18:00", "value": 90 },
      { "t": "00:20", "value": 180 },
      { "t": "12:00", "value": 95 },
      { "t": "20:00", "value": 150 }
    ],
    "secondaryMetrics": [
      { "id": "avg_demand_by_zone", "label": "Average Demand", "enabled": true }
    ],
    "thresholds": [
      {
        "id": "avg_duration",
        "label": "Average Duration",
        "currentValue": 86000,
        "min": 0,
        "max": 150000
      }
    ],
    "breakdown": [
      { "name": "Zone A", "value": 8.316, "percent": 0.033, "count": 480 }
    ]
  }
}
```
 
---
 
## 4. Tab `Agents` — Danh sách Subagent
 
Tab riêng, tách khỏi Overview. Chứa **lưới thẻ subagent** của lần chạy pipeline hiện tại — đây là điểm xem nhanh trạng thái, không đi sâu vào quan hệ dữ liệu giữa các agent (phần đó thuộc tab `Connect`, mục 5).
 
**Cơ chế điều hướng (link) sang tab `Connect`:** mỗi agent card có 1 icon/nút "xem trong sơ đồ" (hoặc bấm trực tiếp vào card) → panel **tự chuyển sang tab `Connect`** (mục 5) và **focus/highlight đúng node của agent đó** trong sơ đồ luồng (scroll tới, phóng to nhẹ, hoặc mở khung viền sáng quanh node). Đây là single source of truth: tab `Agents` không tự vẽ sơ đồ quan hệ, mà điều hướng sang tab chuyên trách.
 
### 4.1 Lưới thẻ Subagent
 
Hiển thị dạng **lưới thẻ 2 cột**, mỗi thẻ là một agent gồm:
- Icon minh hoạ vai trò agent (dự báo, thời tiết, giao thông, chi phí, nguồn lực, điều phối, tối ưu hoá...)
- Tên agent (ví dụ: `Forecast Agent`, `Traffic Agent`, `Fee Agent`, `Weather Agent`, `Supply Agent`, `Dispatch Agent`, `Optimize Agent`, `Optimization Agent`)
- Một icon nhỏ dạng vòng tròn/expand ở góc trên phải thẻ — bấm vào để mở chi tiết agent đó
- Đoạn mô tả ngắn / kết quả tóm tắt của agent (1–2 dòng), ví dụ dạng: "tác động mưa: +15% thời gian di chuyển"
**Trạng thái trực quan của mỗi thẻ:**
- **Đang active**: viền nhấn sáng (accent border trái, teal/xanh ngọc) — vd `Forecast Agent` đang sáng viền vì đang là agent đầu tiên trong pipeline / đang được xem chi tiết.
- **Bình thường/chờ**: nền tối đồng nhất, không viền nhấn.
- Thẻ sắp xếp theo **thứ tự phụ thuộc dữ liệu** (agent input trước → agent xử lý sau).
**Trạng thái (status) của một agent** — mỗi agent cần expose tối thiểu:
 
| Trạng thái | Ý nghĩa | Biểu hiện UI gợi ý |
|---|---|---|
| `idle` / `queued` | Chưa chạy, đang chờ input | icon xám, không có dấu tick |
| `running` | Đang xử lý | icon có hiệu ứng loading / pulse, viền sáng nhẹ |
| `done` | Đã hoàn tất, có output | dấu ✓ (checkmark) góc trên phải thẻ |
| `error` / `blocked` | Lỗi hoặc thiếu input | icon cảnh báo (⚠) |
 
### 4.2 Gợi ý schema dữ liệu cho tab `Agents`
 
```json
{
  "agentId": "traffic_agent",
  "displayName": "Traffic Agent",
  "icon": "traffic",
  "status": "done",           // idle | running | done | error
  "startedAt": "2026-08-23T10:00:00Z",
  "finishedAt": "2026-08-23T10:00:04Z",
  "summaryMetrics": [
    { "label": "Rain Impact", "value": "+15%" },
    { "label": "Travel Time", "value": "forecasted" }
  ],
  "dependsOn": ["forecast_agent"],
  "linkToConnectNodeId": "traffic_agent"
}
```
 
`linkToConnectNodeId` là ID dùng để tab `Connect` biết cần focus/highlight node nào khi được điều hướng tới từ tab `Agents`.
 
---
 
## 5. Tab `Connect` — Sơ đồ luồng dữ liệu (Flow Graph)
 
Tab cấp 1 riêng trên thanh tab panel (không còn là subview lồng trong tab `Agents`). Có thể được mở theo 2 cách:
1. Người dùng bấm trực tiếp vào tab `Connect` trên thanh tab.
2. Được **link tới từ tab `Agents`** khi click vào 1 agent card (mục 4) — trường hợp này tab mở ra kèm state `focusedAgentId` để tự động scroll/highlight đúng node tương ứng.
Chế độ trực quan quan trọng nhất, thể hiện **kiến trúc pipeline dạng fan-in / fan-out**:
 
1. **Cột trái**: danh sách các agent "nguồn" (input agents) xếp dọc: `Forecast Agent`, `Traffic Agent`, `Supply Agent`, `Dispatch Agent`. Mỗi thẻ hiển thị 2–3 chỉ số kết quả (key: value), ví dụ: "Rain Impact: +15%", "Travel Time forecast", "Downgrade: -40%", "Vehicle: 55"... Agent đã `done` có dấu ✓; agent gặp vấn đề hiển thị trạng thái cảnh báo/pending.
2. **Agent `Dispatch Agent`** có thể **mở rộng (expand/collapse)** thành **checklist các hành động cụ thể** đang chờ hoặc đã sinh ra, ví dụ:
   - `Re-route 50 Vehicles to Zone B`
   - `Re-route 54 Vehicles to Zone B`
   - `Re-route 50 Vehicles to Zone A`
   - `Re-route 50 Vehicles to Zone B`
   Mỗi dòng checklist có: checkbox (chọn/bỏ chọn hành động), icon info (xem chi tiết), icon action khác (sửa/loại bỏ). Đây là **danh sách hành động đề xuất do agent tạo ra**, người dùng có thể tick chọn để đưa vào batch thực thi.
3. **Đường nối (edges)**: mỗi agent nguồn có 1 đường cong (bezier), có chấm sáng (node dot) chạy dọc theo đường, nối từ card agent vào một **node trung tâm nhỏ**: `Optimization Agent`.
   - Node trung tâm hiển thị dạng thu gọn: mini bar chart + bảng chỉ số ngắn (ETA, Coverage...).
4. Từ node trung tâm này, các đường nối **toả tiếp ra bên phải** tới **panel chi tiết Optimization Agent** (full detail, mục 5).
→ Về logic dữ liệu: node trung tâm `Optimization Agent` là điểm **aggregate/reduce** — nhận output (object/JSON) của tất cả agent nguồn đã `done`, chạy thuật toán tối ưu (routing/resource allocation), rồi produce ra **kết quả tổng hợp** hiển thị chi tiết ở panel bên phải.
 
### 5.1 Gợi ý schema dữ liệu cho tab `Connect`
 
```json
{
  "agentId": "traffic_agent",
  "displayName": "Traffic Agent",
  "status": "done",
  "summaryMetrics": [
    { "label": "Rain Impact", "value": "+15%" },
    { "label": "Travel Time", "value": "forecasted" }
  ],
  "proposedActions": [
    {
      "id": "action_1",
      "label": "Re-route 50 Vehicles to Zone B",
      "selected": false,
      "detailUrl": "..."
    }
  ],
  "output": { "...": "dữ liệu thô để Optimization Agent tiêu thụ" },
  "dependsOn": ["forecast_agent"]
}
```
 
---
 
## 6. Panel chi tiết `Optimization Agent` (bên phải, full detail)
 
Được mở từ node `Optimization Agent` trong tab `Connect` (mục 5). Gồm:
 
- **Mô tả**: đoạn text ngắn giải thích agent này làm gì (tổng hợp dữ liệu, tính toán route/coverage tối ưu).
- **3 chỉ số nổi bật (stat tiles)**:
  - `Avg Impact`: ví dụ +15%
  - `Coverage`: ví dụ 112 (số điểm/khu vực được phủ)
  - `Data qty` (số lượng bản ghi/điểm dữ liệu dùng để tính): ví dụ 948
- **Biểu đồ cột (bar chart)**: so sánh nhiều chỉ số/kịch bản (ví dụ: Rate, ETA, Resource plan, Surge, Coverage level...), mỗi cột có nhãn % ở trên đầu cột.
- **Khối "Permission Agent — Dispatch"**: **cổng phê duyệt (human-in-the-loop gate)**:
  - Trạng thái: `Strategy Confirmed - Dispatching` (icon ✓ xanh) khi đã được duyệt và đang gửi lệnh thực thi.
  - 2 nút hành động: `Recall` (thu hồi/hoàn tác lệnh vừa gửi) và `Cancel` (huỷ bỏ chiến lược, không thực thi).
Panel này nên có thể **đóng độc lập** (nút X riêng) mà không đóng toàn bộ panel pipeline hay chuyển tab hiện tại.
 
### Gợi ý schema
 
```json
{
  "agentId": "optimization_agent",
  "status": "done",
  "stats": { "avgImpact": "+15%", "coverage": 112, "dataQty": 948 },
  "breakdown": [
    { "label": "Rate first", "value": 32.3 },
    { "label": "ETA", "value": 66.8 },
    { "label": "Resource plan", "value": 2.3 },
    { "label": "ETA", "value": 3.5 },
    { "label": "Surge", "value": 10.5 },
    { "label": "Coverage level", "value": 10 }
  ],
  "permission": {
    "grantedBy": "dispatch_agent | user",
    "state": "confirmed",       // pending | confirmed | recalled | cancelled
    "statusLabel": "Strategy Confirmed - Dispatching"
  }
}
```
 
---
 
## 7. Luồng xử lý tổng thể (end-to-end logic) — mô tả cho AI triển khai
 
```
1. Trigger: một sự kiện/khu vực cần xử lý được phát hiện (vd. tắc nghẽn, vùng khoanh đỏ trên bản đồ).
2. Hệ thống khởi tạo pipeline "Autonomous Resolution Pipeline" và spawn song song các subagent nguồn:
   Forecast Agent, Traffic Agent, Weather Agent, Fee Agent, Supply Agent (mỗi agent có domain input/output riêng).
   → Tab "Agents" và tab "Connect" tự động được đánh dấu có hoạt động mới (badge/chấm đỏ trên tab, ví dụ).
3. Mỗi agent:
   - status: idle -> running -> done (hoặc error)
   - trong lúc running, UI cập nhật realtime icon + số liệu tóm tắt trên card (tab Agents, mục 4.1) và trên
     node tương ứng ở tab Connect (mục 5) — 2 tab hiển thị cùng 1 nguồn dữ liệu agent, chỉ khác cách nhìn.
   - khi done, trả về object kết quả (key metric + optional list hành động đề xuất).
   - click vào agent card ở tab Agents sẽ điều hướng người dùng sang tab Connect, focus đúng node đó (mục 4).
4. Dispatch Agent lắng nghe output của các agent nguồn đã done, sinh ra danh sách "hành động đề xuất"
   (action candidates), hiển thị dạng checklist có thể chọn/bỏ chọn từng dòng (tab Connect, mục 5).
5. Khi đủ điều kiện (tất cả agent nguồn cần thiết đã done), Optimization Agent được kích hoạt:
   - nhận toàn bộ output của các agent nguồn + checklist đã chọn từ Dispatch Agent làm input
   - chạy thuật toán tối ưu hoá (routing / phân bổ nguồn lực / cân bằng tải)
   - trả về: bộ chỉ số tổng hợp (avg impact, coverage, data qty...) + breakdown dạng bar chart (mục 6)
6. Kết quả của Optimization Agent được đưa tới Permission Agent (cổng duyệt):
   - hiển thị "Strategy Confirmed" khi có xác nhận (tự động hoặc từ người dùng)
   - người dùng có 2 lựa chọn: Recall (thu hồi) hoặc Cancel (huỷ), hoặc mặc định Confirm để dispatch
7. Sau khi duyệt, lệnh được "dispatch" — gửi xuống các hệ thống thực thi (vd. điều phối phương tiện thực tế),
   đồng thời trạng thái toàn pipeline chuyển sang "Dispatching" / "Executing".
   → các chỉ số ở tab "Overview" (mục 3: Total Supply/Active Demand/ETA...) cập nhật lại theo tác động
     thực tế của lệnh dispatch vừa gửi — đây là điểm nối duy nhất giữa tab Overview và tab Agents:
     Overview phản ánh HẬU QUẢ tổng hợp của các lần dispatch, còn Agents là NƠI TẠO RA các lệnh đó.
8. Toàn bộ lịch sử các lần chạy pipeline được lưu lại trong tab `Executions` / `History` để tra cứu sau.
```
 
---
 
## 8. Ghi chú UI/UX bổ sung
 
- Chuyển tab (`Overview` ↔ `Agents` ↔ `Connect` ↔ `Executions` ↔ `History` ↔ `Chats`) nên **giữ nguyên state của từng tab** khi chuyển qua lại (không unmount/mất dữ liệu đang xem), vì Overview vẫn cần tiếp tục cập nhật realtime dù người dùng đang xem tab khác.
- Tab `Agents` và tab `Connect` nên hiển thị **badge nhỏ** (số lượng agent đang `running`, hoặc chấm đỏ) trên chính label tab khi có pipeline đang chạy, để người dùng biết cần chuyển sang xem dù đang ở tab khác.
- Link từ tab `Agents` sang tab `Connect` nên mang theo **state điều hướng** (vd. `focusedAgentId`), để tab `Connect` biết cần scroll/zoom/viền sáng vào đúng node nào ngay khi vừa chuyển sang — tránh việc người dùng phải tự tìm lại node đó trong sơ đồ.
- Đường nối giữa các agent (tab Connect) nên có **hoạt ảnh chấm sáng chạy dọc theo path** để thể hiện dữ liệu đang "chảy" theo thời gian thực.
- Card agent đang active nên có **viền glow màu accent** (teal/cyan) để phân biệt với card idle (nền xám tối phẳng).
- Việc mở rộng một agent (như Dispatch Agent) thành checklist con nên dùng **accordion/expand-collapse**, không mở popup riêng.
- Nút `Cancel` nên có màu nhấn nổi bật (primary/teal) vì có khả năng là hành động được đề xuất mặc định để dừng an toàn; `Recall` là nút phụ (secondary/outline).
---
 
*Tài liệu này được xây dựng làm nguồn tham khảo nên dữ liệu, con số chưa chính xác cần đối chiếu lại với thiết kế gốc nếu cần độ chính xác tuyệt đối về số liệu.*