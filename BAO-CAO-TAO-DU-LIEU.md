# BÁO CÁO GIAI ĐOẠN TẠO DỮ LIỆU
*(Nhánh `thai` — Thái LQK24411E — Đồ án PrintiFy: Angular + Node/Express + MongoDB)*

## 1. Mục tiêu
Xây bộ dữ liệu seed hoàn chỉnh cho 2 ứng dụng Angular (customer + admin) dùng chung backend Node/Express + MongoDB: sản phẩm + khách hàng + ảnh sản phẩm thật. Toàn bộ thực hiện trên nhánh riêng `thai`, không tác động `main`.

## 2. Quy mô bàn giao
- 42 sản phẩm = 6 danh mục × 7 sản phẩm: áo thun (`ao-thun`), túi vải (`tui-vai`), bình nước/ly (`binh-nuoc`), văn phòng phẩm (`van-phong-pham`), trang trí (`trang-tri`), phụ kiện (`phu-kien`).
- 5 khách hàng (`usr_c4` → `usr_c8`).
- 248 ảnh sản phẩm thật (123 customer + 125 admin), 100% khớp tên file trong JSON.
- Admin có thêm `prd605` (móc khóa mica vuông) ở trạng thái `isActive: false` — chỉ admin thấy; customer chỉ thấy 41 sản phẩm (test case cho chức năng ẩn/hiện sản phẩm).

## 3. Giai đoạn 1 — Thiết kế & seed dữ liệu (commit `6d9b915`)
- Quy ước ID nhất quán: `prd101`–`prd107`, `prd201`–`prd207`, … (số hàng trăm = danh mục); biến thể `prd101-white-m` = sản phẩm-màu-cỡ.
- Mỗi sản phẩm đầy đủ: tên, giá, mô tả, `img_display`, `img_detail`, biến thể (màu × cỡ × tồn kho), ngưỡng hết hàng, `allowCustomization` / `allowMarketplace` / `printArea` / `isActive`.
- Giữ nguyên các stock override đã chốt của nhóm: `prd101-white-m=37`, `prd101-black-l=24`, `prd301-white=38`, `prd604-clear=5`.
- Remap ID cũ → ID mới trong 13 file dataset khác (orders, carts, users…) để không vỡ tham chiếu: `prd_tee→prd101`, `prd_mug→prd301`, `prd_key→prd604`.
- Sinh dữ liệu bằng script (`gen-printify-data.js`) + validator tự viết (`validate-printify-data.js`) → ALL CHECKS PASSED trước khi commit.

## 4. Giai đoạn 2 — Ảnh vẽ tay (commit `bcbccd2`, sau đó bị thay thế)
Sinh 248 ảnh mockup vẽ tay khớp 100% cấu trúc JSON để app chạy được ngay khi chưa có ảnh thật. Sau đó bị thay toàn bộ bằng ảnh thật — chi phí thấp vì quy ước tên file giữ nguyên, chỉ thay nội dung file.

Quy ước tên ảnh: `prd{ID}_{màu}_{slug}.png` cho từng màu biến thể, `prd{ID}_detail1.png` cho ảnh chi tiết.

## 5. Giai đoạn 3 — Ảnh mẫu thật từ Printful & Printify (commit `45d0932`)
Yêu cầu: ảnh phải là ảnh mẫu thật từ printful.com/create và printify.com, không dùng mockup vẽ tay.

Thách thức: 2 site không có API công khai; fetch HTML tĩnh không có ảnh (trang render bằng JS); Cloudflare chặn gọi hàng loạt (HTTP 429).

Cách giải quyết:
1. Dùng trình duyệt thật render trang catalog → bóc URL ảnh từ CDN sau khi JS chạy xong.
2. Đảo ngược GraphQL nội bộ của Printful: đọc request `getSingleProductData` trong tab Network, tái tạo query từ context trang → thu ảnh mockup thật theo từng màu (`variants[].color/colorCode/urlImage`) cho ~35 sản phẩm, khớp màu trong JSON.
3. Printify: ảnh catalog tại `images.printify.com/api/catalog/{id}?s=1000`, thu theo từng trang danh mục (mugs, phone cases, calendars, notebooks, tote bags, pillows, coasters, keychains…).
4. Tải ảnh bằng PowerShell (kèm UserAgent trình duyệt), convert toàn bộ sang PNG khớp đuôi JSON, đặt đúng tên quy ước rồi thay nội dung file cũ.

Quy tắc chọn ảnh khi site không có mẫu đúng màu: lấy mẫu thật cùng loại sản phẩm, màu gần nhất. Các chỗ áp dụng: pouch/pencil case/lunch bag (2 site không bán → sling bag, Kindle case, gift bag Kraft của Printful), tumbler đen → bình giữ nhiệt đen, drawstring đen → balo đen, sweater đen → góc quay khác của sweater. Không có ảnh giả, không có ảnh trống.

## 6. Kiểm định cuối
- `validate-printify-data.js` → ALL CHECKS PASSED (cấu trúc JSON, tham chiếu chéo 13 file dataset).
- `verify-images.js` → 648 path ảnh tham chiếu: 0 missing, 0 orphan.
- 248/248 PNG hợp lệ (≥200px); tên file khớp 100% giữa customer ↔ admin; variants đồng bộ 2 app.
- `origin/thai` đồng bộ tuyệt đối với local (`45d0932`). Lịch sử nhánh: `6d9b915` (data seed) → `bcbccd2` (mockup tạm) → `45d0932` (ảnh thật).

## 7. Điểm cần biết khi tiếp nhận
- Dữ liệu nằm tại `printify-{customer,admin}/public/dataset/` — `products.json` là nguồn chân lý cho tên file ảnh; ảnh detail là góc quay khác của cùng sản phẩm.
- `prd605` chỉ tồn tại ở admin với `isActive: false` — test case ẩn/hiện sản phẩm.
- Đổi ảnh: chỉ cần thay file cùng tên trong `dataset/images/products/`, không phải sửa JSON.
- Một số ảnh Printify mang placeholder "YOUR DESIGN" — là ảnh mẫu chính thức của Printify; đã ưu tiên phương án trống/màu sạch khi có.
