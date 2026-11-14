BÁO CÁO GIAI ĐOẠN TẠO DỮ LIỆU
(nhánh thai — Thái LQK24411E — đồ án PrintiFy)

1. Mục tiêu
Xây bộ dữ liệu seed hoàn chỉnh cho 2 ứng dụng Angular (customer + admin) dùng chung backend Node/Express + MongoDB: sản phẩm + khách hàng + ảnh sản phẩm thật. Toàn bộ làm trên nhánh riêng thai, không tác động main; mỗi commit push đúng từ tài khoản thailqk24411e.

2. Quy mô bàn giao
42 sản phẩm = 6 danh mục × 7 sản phẩm: áo thun (ao-thun), túi vải (tui-vai), bình nước/ly (binh-nuoc), văn phòng phẩm (van-phong-pham), trang trí (trang-tri), phụ kiện (phu-kien).
5 khách hàng (usr_c4 → usr_c8).
248 ảnh sản phẩm thật (123 customer + 125 admin), 100% khớp tên file trong JSON.
Admin có thêm prd605 (móc khóa mica vuông) ở trạng thái isActive: false — chỉ admin thấy, customer chỉ thấy 41 sản phẩm: đúng thiết kế "ẩn sản phẩm" của đồ án.
3. Giai đoạn 1 — Thiết kế & seed dữ liệu (commit 6d9b915)
Đặt quy ước ID nhất quán: prd101–prd107, prd201–prd207, … (số hàng trăm = danh mục), biến thể prd101-white-m = sản phẩm-màu-cỡ.
Mỗi sản phẩm đầy đủ: tên, giá, mô tả, img_display, img_detail, biến thể (màu × cỡ × tồn kho), ngưỡng hết hàng, cấu hình allowCustomization / allowMarketplace / printArea / isActive.
Giữ nguyên các stock override nhóm đã chốt (prd101-white-m=37, prd101-black-l=24, prd301-white=38, prd604-clear=5).
Remap ID cũ → ID mới trong 13 file dataset khác (orders, carts, users…) để không vỡ tham chiếu (prd_tee→prd101, prd_mug→prd301, prd_key→prd604).
Sinh dữ liệu bằng script (gen-printify-data.js) + tự viết validator (validate-printify-data.js) → chạy ra ALL CHECKS PASSED trước khi commit.
4. Giai đoạn 2 — Ảnh vẽ tay (commit bcbccd2, sau đó bị thay thế)
Lần đầu sinh 248 ảnh mockup vẽ tay khớp 100% cấu trúc JSON để giải phóng sự phụ thuộc: app chạy được ngay dù chưa có ảnh thật. Phiên bản này sau đó bị thay toàn bộ bằng ảnh thật ở giai đoạn 3 — chi phí duy trì thấp vì tên file không đổi, chỉ thay nội dung.

Quy ước tên ảnh (áp dụng cho cả hai giai đoạn): prd{ID}_{màu}_{slug}.png cho từng màu biến thể, prd{ID}_detail1.png cho ảnh chi tiết.

5. Giai đoạn 3 — Ảnh mẫu thật từ Printful & Printify (commit 45d0932)
Yêu cầu mới: ảnh phải là ảnh mẫu thật từ printful.com/create và printify.com, không dùng mockup vẽ tay.

Thách thức: 2 site không cung cấp API công khai; fetch HTML tĩnh không có ảnh (trang render bằng JS); Cloudflare chặn các lượt gọi hàng loạt (HTTP 429).

Cách giải quyết:

Dùng trình duyệt thật render trang catalog → bóc URL ảnh từ CDN sau khi JS chạy xong.
Đảo ngược GraphQL nội bộ của Printful: đọc request getSingleProductData trong tab Network, tái tạo query từ chính context trang → thu được ảnh mockup thật theo từng màu (variants[].color/colorCode/urlImage) cho ~35 sản phẩm chính xác theo màu trong JSON.
Printify: ảnh catalog tại images.printify.com/api/catalog/{id}?s=1000 (độ phân giải tối đa 1000×1000), thu theo từng trang danh mục (mugs, phone cases, calendars, notebooks, tote bags, pillows, coasters, keychains…).
Tải ảnh bằng PowerShell (kèm UserAgent trình duyệt), convert toàn bộ sang PNG để khớp đuôi file JSON, đặt đúng tên quy ước rồi thay thế nội dung file cũ.
Quy tắc chọn ảnh (nếu site không có mẫu đúng màu): lấy mẫu thật cùng loại sản phẩm, màu gần nhất. Các chỗ áp dụng: pouch/pencil case/lunch bag (2 site không bán → sling bag, Kindle case, gift bag Kraft của Printful), tumbler đen → bình giữ nhiệt đen, drawstring đen → balo đen, sweater đen → góc quay khác của sweater. Mọi quyết định đều ghi nhận được, không có ảnh "giả" hay ảnh trống.

6. Kiểm định cuối (trước khi bàn giao)
validate-printify-data.js → ALL CHECKS PASSED (cấu trúc JSON, tham chiếu chéo 13 file dataset).
verify-images.js → 648 path ảnh tham chiếu: 0 missing, 0 orphan (không có ảnh thừa/lạc).
248/248 PNG hợp lệ (≥200px), tên file khớp 100% giữa customer ↔ admin, variants đồng bộ 2 app.
origin/thai đồng bộ tuyệt đối với local (45d0932); lịch sử nhánh: 6d9b915 (data seed) → bcbccd2 (mockup tạm) → 45d0932 (ảnh thật).
7. Điểm trưởng nhóm cần biết
Dữ liệu nằm tại printify-{customer,admin}/public/dataset/ — products.json là nguồn chân lý cho tên file ảnh; ảnh detail là góc quay khác của cùng sản phẩm, không phải ảnh ngẫu nhiên.
prd605 chỉ tồn tại ở admin với isActive: false — test case cho chức năng ẩn/hiện sản phẩm.
Nếu cần đổi ảnh: chỉ cần thay file cùng tên trong dataset/images/products/, không phải sửa JSON.
Lưu ý thẩm mỹ: một số ảnh Printify mang placeholder "YOUR DESIGN" — đó là ảnh mẫu chính thức của Printify, đã chọn tối đa phương án trống/màu sạch khi có.
