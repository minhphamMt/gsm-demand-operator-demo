Đây là design brief cho dự án **GSM-14 · NovaFour — Phân bổ xe giờ cao điểm**. Hãy chủ động đề xuất một hướng thiết kế mới dựa trên bối cảnh nghiệp vụ bên dưới. Nếu có điểm chưa rõ và ảnh hưởng lớn đến giải pháp, hãy hỏi lại trước khi chốt thiết kế.

Bạn là senior product designer kiêm frontend engineer. Hãy thiết kế một ứng dụng web mô phỏng phục vụ **người vận hành điều phối xe điện** trong giờ cao điểm. Đây là công cụ ra quyết định và thực thi nghiệp vụ, không phải landing page, báo cáo quản trị thuần túy hay giao diện chat.

Không sao chép một sản phẩm có sẵn và không phụ thuộc vào tên của bất kỳ thiết kế tham chiếu nào. Hãy tự xây dựng ngôn ngữ thiết kế, cấu trúc thông tin và cách trực quan hóa phù hợp với một trung tâm vận hành thời gian gần thực: rõ tình huống, dễ phát hiện bất thường, hỗ trợ quyết định nhanh và giảm sai sót khi thực hiện.

### Bối cảnh sản phẩm

NovaFour mô phỏng hoạt động điều phối xe điện tại Hà Nội. Hệ thống sử dụng dữ liệu synthetic và pipeline deterministic để:

1. Tiếp nhận và phát lại snapshot vận hành theo bước thời gian 5 phút.
2. Tính toán dự báo cung và cầu trong 15–30 phút tiếp theo, có thể thể hiện khoảng bất định khi hữu ích.
3. Xác định khu vực có nguy cơ thiếu xe và khu vực còn nguồn xe dư.
4. Tính toán các phương án điều chuyển, ràng buộc vận hành, chi phí và tác động dự kiến.
5. Trình bày đề xuất để người vận hành kiểm tra, điều chỉnh, phê duyệt hoặc từ chối.
6. Chỉ sau khi được phê duyệt, đưa kế hoạch sang bước thực hiện và theo dõi trạng thái.
7. Nếu sau điều chuyển vẫn còn thiếu xe, tính toán một phương án activation/khuyến khích tài xế riêng để người có thẩm quyền xác nhận trước khi phát hành.
8. Cập nhật kết quả thực hiện và cho phép so sánh với trường hợp không hành động.

Kịch bản demo chính: **mưa đột ngột vào giờ cao điểm lúc 19:00**, nhu cầu tăng nhanh tại một số khu vực Hà Nội trong khi xe khả dụng phân bố lệch ở khu vực khác.

Phạm vi không gian của demo gồm **đúng 30 zone cố định**, tương ứng với 30 khu vực Hà Nội đã được định nghĩa trong `config/zone_registry.json`. Đây là nguồn chân lý duy nhất cho `zone_id`, tên, tọa độ và tier của zone; không tự đổi tên, gộp, tách hoặc tạo thêm zone trong thiết kế và mock data.

Đây là hệ thống mô phỏng hỗ trợ quyết định. Không dùng LLM trong luồng nghiệp vụ chính, không giả vờ dữ liệu là thời gian thực và không để AI tự động thực hiện hành động quan trọng thay người vận hành.

### Mục tiêu trải nghiệm

Thiết kế phải giúp người vận hành trả lời nhanh các câu hỏi sau:

- Hiện tại đang xảy ra điều gì và dữ liệu có còn mới không?
- Trong 15–30 phút tới, khu vực nào có nguy cơ thiếu hoặc dư xe?
- Hệ thống đã tính toán dựa trên dữ liệu, giả định và ràng buộc nào?
- Có những phương án điều phối nào, vì sao phương án được đề xuất là phù hợp?
- Nếu thực hiện, tác động dự kiến, chi phí, rủi ro và phần thiếu hụt còn lại là gì?
- Hành động nào đang chờ con người xác nhận, hành động nào đang được thực hiện và kết quả đến đâu?
- So với không hành động, phương án điều phối tạo ra khác biệt gì?

Luồng trải nghiệm phải phân biệt rõ bốn lớp:

1. **Quan sát:** trạng thái hiện tại, diễn biến theo thời gian và chất lượng dữ liệu.
2. **Tính toán:** tiến trình dự báo/điều phối, đầu vào, giả định, ràng buộc, độ bất định và trạng thái lỗi hoặc không tìm được phương án.
3. **Quyết định:** phương án đề xuất, khả năng so sánh hoặc chỉnh sửa và bước phê duyệt của người vận hành.
4. **Thực hiện:** phát lệnh có chủ đích, theo dõi tiến độ, phản hồi, ngoại lệ và tác động sau thực hiện.

Không gộp “tính toán phương án”, “phê duyệt” và “thực hiện” thành một nút duy nhất. Mỗi hành động có tác động vận hành hoặc chi phí phải cho người dùng xem lại phạm vi và hậu quả trước khi xác nhận.

### Chỉ số và dữ liệu hiển thị

Hãy tự lựa chọn, đặt tên, phân cấp và trực quan hóa các chỉ số cần thiết cho từng thời điểm trong công việc của người vận hành. Có thể khai thác các nhóm thông tin như:

- trạng thái cung–cầu hiện tại và dự báo;
- mức độ nghiêm trọng, phạm vi và xu hướng của điểm nóng;
- nguồn lực khả dụng và khả năng điều chuyển;
- mức bao phủ, hiệu quả dự kiến và phần thiếu hụt còn lại;
- thời gian, quãng đường, chi phí, ràng buộc và cảnh báo;
- tiến độ thực hiện, tỷ lệ phản hồi và kết quả sau hành động;
- độ mới của dữ liệu, độ bất định dự báo và nguồn của số liệu mô phỏng.

Danh sách trên chỉ mô tả nhu cầu thông tin, **không phải danh sách KPI hoặc layout bắt buộc**. Hãy chủ động quyết định chỉ số nào cần nổi bật, chỉ số nào nên xem khi drill-down, cách so sánh trước/sau và hình thức biểu diễn phù hợp. Không nhồi tất cả số liệu lên một màn hình và không tạo số liệu chỉ để làm giao diện trông phong phú.

Mọi số liệu liên quan giữa các màn hình phải nhất quán. Phần giải thích bằng ngôn ngữ tự nhiên phải khớp với dữ liệu, phương án và kết quả tính toán đang hiển thị.

### Các khu vực chức năng cần có

Hãy tự đề xuất information architecture và số lượng màn hình hợp lý. Giải pháp phải bao phủ các khu vực chức năng sau, nhưng không bắt buộc dùng đúng tên, route hay bố cục được liệt kê:

#### Tổng quan vận hành

- Cho thấy bối cảnh toàn hệ thống, thời gian mô phỏng, horizon dự báo và độ mới của dữ liệu.
- Trực quan hóa phân bố cung–cầu của **đủ 30 zone** theo không gian; bản đồ nên là một công cụ phân tích và chọn đối tượng, không chỉ là hình nền trang trí.
- Mọi zone phải có thể nhận biết, tìm kiếm/chọn và mở chi tiết. Thiết kế có thể ưu tiên trực quan cho các hotspot và nguồn dư nhưng không được làm biến mất các zone còn lại khỏi phạm vi hệ thống.
- Cho phép xem lại diễn biến, chuyển lớp thông tin và đi từ cảnh báo đến chi tiết khu vực.
- Có điểm bắt đầu rõ ràng để chạy tính toán dự báo hoặc tạo phương án điều phối.

#### Không gian tính toán và lập phương án

- Thể hiện rõ hệ thống đang chuẩn bị dữ liệu, dự báo, phát hiện mất cân bằng hay tối ưu phương án.
- Cho người vận hành biết đầu vào, thời điểm dữ liệu, horizon, ràng buộc chính và kết quả tính toán.
- Hỗ trợ trạng thái đang tính, tính xong, dữ liệu cũ, thiếu dữ liệu, vi phạm chính sách và không tìm được phương án khả thi.
- Cho phép xem các lượt điều chuyển được đề xuất và tác động dự kiến trước khi quyết định.

#### Xem xét và phê duyệt phương án

- Hỗ trợ kiểm tra phương án, so sánh trước/sau, xem cảnh báo và truy vết lý do đề xuất.
- Có thể điều chỉnh các tham số hoặc lượt điều chuyển trong phạm vi demo rồi tính toán lại tác động.
- Tách rõ các hành động sửa, từ chối và phê duyệt; dùng confirmation phù hợp với mức độ rủi ro.
- Phê duyệt phương án không được tự động phát hành activation hoặc bỏ qua bước thực hiện.

#### Thực hiện và theo dõi

- Sau phê duyệt, người vận hành chủ động đưa phương án vào thực hiện.
- Thể hiện trạng thái theo vòng đời như chờ thực hiện, đang thực hiện, hoàn tất một phần, hoàn tất, thất bại hoặc bị hủy.
- Cho phép nhận biết sai lệch giữa kế hoạch và thực tế, các ngoại lệ cần xử lý và tác động cập nhật sau thực hiện.
- Nếu có thao tác hủy hoặc dừng, phải làm rõ phạm vi ảnh hưởng và trạng thái có thể khôi phục hay không.

#### Activation sau điều phối

- Chỉ xuất hiện khi tính toán cho thấy vẫn còn thiếu hụt sau phương án điều chuyển.
- Trình bày phạm vi thiếu hụt, nhóm tài xế phù hợp, cơ chế khuyến khích, chi phí cam kết tối đa và tác động dự kiến theo cách dễ kiểm tra.
- “Phát hành offer” là một quyết định riêng, có bước review/confirm và không được kích hoạt tự động khi duyệt phương án điều chuyển.
- Sau khi phát hành, theo dõi các trạng thái phản hồi và cho phép hủy chiến dịch khi phù hợp.
- Copy phải thể hiện đây là tài khoản và dữ liệu mô phỏng; tài xế có quyền từ chối, không dùng ngôn ngữ ép buộc, chấm điểm hay đe dọa.

#### So sánh kịch bản

Cho phép so sánh rõ ba trạng thái nghiệp vụ:

- `no_action`: không điều chuyển;
- `plan_only`: thực hiện điều chuyển, tổng cung không đổi;
- `plan_activation`: điều chuyển kết hợp activation được chấp nhận.

AI tự chọn các chỉ số và biểu đồ so sánh có ý nghĩa, đồng thời gắn nhãn rõ đây là simulation proxy trên dữ liệu synthetic.

#### Lịch sử và kiểm toán

- Có audit trail append-only cho các mốc tính toán, đề xuất, chỉnh sửa, phê duyệt/từ chối, thực hiện, activation và phản hồi.
- Cho phép lọc và truy vết theo kế hoạch, thời gian hoặc loại sự kiện.
- Không có thao tác sửa hoặc xóa lịch sử từ UI demo.

### Luồng demo end-to-end bắt buộc

Prototype không chỉ là tập hợp các màn hình tĩnh. Người trình bày phải có thể hoàn thành một luồng liền mạch bằng dữ liệu mock deterministic, trong đó dữ liệu và trạng thái của bước trước trở thành đầu vào của bước sau:

1. Nạp kịch bản mưa giờ cao điểm và hiển thị snapshot của đủ 30 zone tại một mốc thời gian.
2. Chạy replay theo bước 5 phút và thực hiện tính toán dự báo cung–cầu ở horizon 15 hoặc 30 phút.
3. Từ kết quả dự báo, phát hiện hotspot thiếu xe và zone có nguồn dư.
4. Tính phương án điều chuyển, hiển thị tiến trình tính toán, ràng buộc, cảnh báo và tác động dự kiến.
5. Cho người vận hành xem xét, sửa một lựa chọn/tham số nếu cần, tính lại tác động rồi phê duyệt hoặc từ chối.
6. Với phương án đã duyệt, yêu cầu một thao tác riêng để đưa kế hoạch vào thực hiện; cập nhật trạng thái các lượt điều chuyển theo vòng đời.
7. Tính lại cung–cầu sau điều chuyển và xác định residual gap còn lại.
8. Nếu còn residual gap, tạo đề xuất activation, cho người vận hành review/confirm rồi phát hành offer mô phỏng.
9. Mô phỏng phản hồi tài xế theo dữ liệu deterministic (accepted/declined/expired/cancelled), cập nhật nguồn cung và trạng thái chiến dịch. Không bắt buộc tạo một Driver App riêng.
10. Re-simulate kết quả sau phản hồi, cập nhật các chỉ số và so sánh `no_action`, `plan_only`, `plan_activation`.
11. Ghi toàn bộ các mốc quan trọng vào audit trail để có thể truy vết từ đầu đến cuối.

Luồng phải chạy được liên tục trong prototype, không dùng các màn hình rời rạc với số liệu không liên quan. Các nút chính phải tạo thay đổi trạng thái quan sát được; refresh hoặc reset cùng seed phải tái tạo cùng một kết quả. Cần có ít nhất một happy path hoàn chỉnh và thể hiện hợp lý các nhánh `no solution`, từ chối phê duyệt hoặc activation không đạt kỳ vọng.

### Định hướng thị giác

Hãy sáng tạo một visual system riêng cho NovaFour dựa trên các tính chất: **vận hành thời gian gần thực, di chuyển điện, xanh, hiện đại, đáng tin, sạch và nhanh**.

- Ưu tiên desktop cho phòng điều hành; vẫn bảo đảm giao diện co giãn hợp lý ở kích thước nhỏ hơn.
- Tạo cảm giác công cụ vận hành chuyên nghiệp với hệ thống phân cấp rõ, mật độ thông tin có kiểm soát và khả năng quét nhanh.
- Ưu tiên nền sáng và nhóm màu xanh lá/cyan phù hợp với di chuyển điện; dùng màu cảnh báo có chủ đích và bảo đảm tương phản truy cập.
- AI tự đề xuất palette, typography, spacing, grid, radius, elevation, iconography và trạng thái tương tác; giải thích ngắn gọn lý do lựa chọn.
- Tránh hero marketing, card lồng card, hiệu ứng trang trí không mang thông tin, gradient tối nặng nề và lạm dụng màu sắc.
- Không dùng logo hoặc sao chép nguyên nhận diện của thương hiệu có thật nếu không được cung cấp tài sản hợp lệ.
- Tất cả nội dung hiển thị cho người dùng là tiếng Việt; các contract key kỹ thuật có thể giữ nguyên khi cần.

### Tính chân thực và an toàn của demo

- Dữ liệu mock phải deterministic để cùng một đầu vào cho ra cùng một kết quả.
- Hiển thị rõ simulated time, dữ liệu synthetic và simulation proxy tại vị trí phù hợp, không lặp nhãn gây nhiễu.
- Các trạng thái loading phải phản ánh các bước tính toán thật của demo, không dùng progress giả gây hiểu nhầm.
- Không tự động chuyển từ đề xuất sang phê duyệt hoặc từ phê duyệt sang thực hiện.
- Hành động quan trọng phải có feedback, khả năng nhận biết trạng thái và cơ chế ngăn thao tác lặp.
- Thiết kế cần bao phủ accessibility cơ bản: điều hướng bàn phím, focus state, contrast và không truyền đạt trạng thái chỉ bằng màu.

### Nội dung mẫu

- Tên ứng dụng: **NovaFour Ops**
- Kịch bản: **Mưa giờ cao điểm 19:00**
- Danh mục 30 zone bắt buộc, theo đúng `zone_id` trong `config/zone_registry.json`:
  1. Ba Đình
  2. Hoàn Kiếm
  3. Hai Bà Trưng
  4. Đống Đa
  5. Tây Hồ
  6. Cầu Giấy
  7. Thanh Xuân
  8. Hoàng Mai
  9. Long Biên
  10. Bắc Từ Liêm
  11. Nam Từ Liêm
  12. Hà Đông
  13. Thanh Trì
  14. Gia Lâm
  15. Đông Anh
  16. Sóc Sơn
  17. Ba Vì
  18. Phúc Thọ
  19. Thạch Thất
  20. Quốc Oai
  21. Chương Mỹ
  22. Đan Phượng
  23. Hoài Đức
  24. Thanh Oai
  25. Mỹ Đức
  26. Ứng Hòa
  27. Thường Tín
  28. Phú Xuyên
  29. Mê Linh
  30. Sơn Tây

AI được quyền viết lại microcopy để tự nhiên, ngắn và phù hợp với ngữ cảnh vận hành, miễn không thay đổi ý nghĩa nghiệp vụ hoặc làm dữ liệu mô phỏng trông như dữ liệu thật.

### Deliverable mong muốn

Hãy bắt đầu bằng một concept thiết kế có lập luận ngắn gọn, sau đó triển khai thành demo có thể chạy local bằng Vite + React + TypeScript trong `frontend/` hoặc HTML/CSS/JavaScript nếu cần dựng nhanh.

Kết quả cần gồm:

- user flow từ quan sát đến tính toán, quyết định, thực hiện và theo dõi;
- information architecture và layout desktop;
- design system tokens do AI đề xuất;
- component list và các trạng thái chính;
- mock data shape và quy tắc đảm bảo số liệu nhất quán;
- dữ liệu và tương tác bao phủ đủ 30 zone theo `config/zone_registry.json`;
- các màn hình/khu vực chức năng cần thiết cho luồng vận hành;
- trạng thái loading, stale/thiếu dữ liệu, no solution, policy warning, chờ duyệt, đang thực hiện, thực hiện một phần, campaign running, offer expired và kết quả phản hồi;
- prototype polished, có tương tác và chạy được toàn bộ luồng end-to-end bằng dữ liệu mock deterministic;
- demo script 2–3 phút thể hiện rõ khác biệt giữa không hành động, chỉ điều phối và điều phối kết hợp activation.

Bạn được tự do sáng tạo giải pháp UI/UX. Hãy ưu tiên chất lượng quyết định và sự an toàn của người vận hành hơn việc cố hiển thị thật nhiều thành phần trên màn hình.
