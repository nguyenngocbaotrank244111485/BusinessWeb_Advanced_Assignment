✅ Push thành công lên branch `thai` (không đụng main). Tổng kết phần việc đã hoàn thành:

## 📦 Kết quả giai đoạn TẠO DỮ LIỆU

**1. Products — 42 sản phẩm (6 danh mục × 7 sp), 134 biến thể** — commit `6d9b915`
| Danh mục | ID | Số sp |
|---|---|---|
| Áo thun & Trang phục `ao-thun` | prd101–107 | 7 |
| Túi vải & Túi cá nhân `tui-vai` | prd201–207 | 7 |
| Ly cốc & Bình nước `binh-nuoc` | prd301–307 | 7 |
| Sổ tay & Ấn phẩm `van-phong-pham` | prd401–407 | 7 |
| Trang trí & Quà tặng `trang-tri` | prd501–507 | 7 |
| Phụ kiện cá nhân `phu-kien` | prd601–607 | 7 |

- **`printify-customer/public/dataset/products.json`** (41 sp): cấu trúc đơn giản theo mẫu trong docs — không có `/` đầu path (`images/products/prd101_white_ao-thun-cotton-basic.png`), chỉ sp `isActive=true`
- **`printify-admin/public/dataset/products.json`** (42 sp): đủ trường quản trị — `allowCustomization`, `allowMarketplace`, `isActive`, `lowStockThreshold`, `printArea{x,y,w,h}`, `createdAt/updatedAt`, path có `/` đầu
- Ảnh đặt tên theo format `prd10x_color_pname` + 1 ảnh `prd10x_detail1.png` — bạn chỉ cần tải ảnh thật từ Printful/Printify về đúng tên là JSON chạy ngay, không phải sửa gì thêm

**2. Users — thêm 5 customers** (`usr_c4` → `usr_c8`): Phạm Thu Hà (Hà Nội), Vũ Đức Anh, Đỗ Ngọc Linh (2 địa chỉ — demo giới hạn sổ địa chỉ), Hoàng Quốc Bảo (Cần Thơ), Ngô Thanh Trúc (Bình Dương) — đủ 8 customers bên customer app, 10 users bên admin app.

**3. Đồng bộ tham chiếu chéo** (quan trọng nhất): dữ liệu cũ đang tham chiếu `prd_tee/prd_mug/prd_key` — đã remap toàn bộ sang ID mới trong 13 file: `orders, carts, designs, views, templates, listings, inventoryMovements, recommendationEvents, auditLogs` (cả 2 app). Giá cũ được giữ khớp (áo 180k, cốc 120k, móc khóa 45k) nên **tổng tiền các đơn seed không bị lệch**.

**4. Cập nhật `datasets-manifest.json`** (counts: users 8/10, products 41/42) + đã validate: parse JSON toàn bộ 36 file, quét mọi `productId/variantId` — 0 lỗi mồ côi.

### 🎁 Extra cho demo admin
- **Tồn kho thấp**: `prd604-clear` (5), `prd604-white` (4), `prd404-white` (3) → có data cho filter "tồn kho thấp"
- **Sản phẩm đã ẩn**: `prd605` (Móc khóa Mica vuông) `isActive=false` ở admin, tự động ẩn khỏi customer → demo được rule BR22 "không xóa cứng"

### 🔗 Tạo Pull Request
GitHub gợi ý link: https://github.com/nguyenngocbaotrank244111485/BusinessWeb_Advanced_Assignment/pull/new/thai

Bạn mở link trên để tạo PR cho leader review nhé. Nếu muốn tôi chỉnh gì trong data (giá, mô tả, số lượng stock, thêm/bớt khách hàng) thì cứ nói!
