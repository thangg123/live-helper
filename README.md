# Arena Live Helper

Chrome extension gom các bước chuyển trận livestream trên YouTube Studio thành vài nút bấm trong side panel. Mỗi bàn dùng một stream key cố định; extension giả lập thao tác người dùng trên giao diện Studio (bấm, gõ chữ, chọn menu). Không dùng YouTube Data API.

> **Trạng thái:** bản đầu tiên. Logic các luồng đã chạy trọn trên một trang Studio giả lập, nhưng **selector của Studio thật phần lớn chưa được đối chiếu** — cần làm bước "Đối chiếu selector" bên dưới trên kênh Arena trước khi dùng thật.

## Cài đặt

1. Mở `chrome://extensions`, bật **Developer mode**.
2. Bấm **Load unpacked**, chọn thư mục `arena-live-helper/` (thư mục có `manifest.json`, không phải thư mục gốc của repo).
3. Ghim extension lên thanh công cụ, bấm vào icon để mở side panel.
4. Mở YouTube Studio bằng tài khoản quản lý kênh **@arenabilliard.official** (extension tự mở tab Studio nếu chưa có).

Sau khi sửa code: bấm nút tải lại ở thẻ extension trong `chrome://extensions`, rồi **tải lại tab Studio** (F5).

## Cấu hình bàn

Tab **Cấu hình bàn** → **+ Thêm bàn**:

| Trường | Ghi chú |
|---|---|
| Tên bàn | Ví dụ `Bàn 3` — đổ vào biến `{ban}` |
| Tên stream key | Gõ **đúng như hiện trong Studio**, ví dụ `Ban 3 - Arena Q7`. Extension phân biệt `Ban 1` với `Ban 10` |
| Mẫu tiêu đề / mô tả | Biến: `{ban}` `{giai}` `{vong}` `{a}` `{b}` `{ghichu}` `{ngay}` (dd/mm/yyyy) `{gio}` (HH:mm). Biến trống thì dấu `–` thừa và chữ `vs` mồ côi được bỏ |
| Chế độ hiển thị | Công khai / Không công khai / Riêng tư |
| Playlist | Để trống nếu không dùng |
| Danh mục | Mặc định `Thể thao`; để trống thì bỏ qua bước chọn danh mục |
| Tự bắt đầu / Tự kết thúc | Nên bật cả hai |

"Dành cho trẻ em" luôn được chọn là **Không**.

**Cài đặt chung:** Channel ID (để trống = tự nhận từ URL Studio), thứ tự khi chuyển trận (tạo mới trước / kết thúc trước), thời gian chờ luồng mới lên live.

**Xuất / Nhập file JSON** để chép cấu hình sang máy khác. Nhập sẽ thay toàn bộ cấu hình hiện tại (có hỏi xác nhận).

## Dùng hằng ngày

Tab **Điều khiển**:

1. Chọn bàn, điền Giải / Vòng / VĐV A / VĐV B / Ghi chú.
2. Xem trước tiêu đề và mô tả (sửa tay được; bấm "↺ Lấy lại theo mẫu" để bỏ phần sửa tay).
3. **Chuyển trận**: tìm luồng đang live dùng stream key của bàn → hỏi xác nhận (ghi rõ tên luồng sẽ kết thúc) → tạo luồng mới → kết thúc luồng cũ → chờ luồng mới lên live (nếu Tự bắt đầu không chạy, tự bấm "Phát trực tiếp" khi đã nhận tín hiệu).
4. Các nút khác: **Tạo luồng mới**, **Kết thúc luồng đã chọn** (chọn một dòng sau khi bấm "Làm mới"), **Cập nhật tiêu đề / mô tả** cho luồng đã chọn.
5. **Dừng** (trong panel hoặc thanh đen dưới đáy): huỷ ngay thao tác đang chạy ở bước kế tiếp.
6. **Chạy thử**: chỉ tô viền đỏ phần tử sẽ bấm / sẽ gõ, không bấm thật. Vì không bấm thật nên các bước phía sau (dialog, menu) sẽ không hiện — chạy thử dừng ở đó và log ghi rõ. Mẹo: tự mở dialog bằng tay rồi chạy thử để kiểm tra các bước bên trong.

Mọi thao tác kết thúc luồng đều hỏi xác nhận trong panel. Trước khi kết thúc hoặc sửa, extension đọc tiêu đề trên trang và **dừng nếu không khớp** luồng đã chọn.

Khung **Nhật ký** ghi từng bước; khi lỗi có tên bước, khoá selector đang tìm và URL. Bấm **Copy** để gửi log khi cần sửa.

## Đối chiếu selector (làm trước khi dùng thật)

Theo spec, đi tay từng luồng trên Studio thật một lượt và chụp DOM ở từng màn hình:

| Màn hình | Cách mở |
|---|---|
| Trang Quản lý | Studio → Phát trực tiếp → Quản lý (có ít nhất 1 luồng sắp tới) |
| Hộp "Dùng lại chế độ cài đặt" | Bấm "Lên lịch phát trực tiếp" |
| Dialog chi tiết — bước 1 | Tiêu đề, mô tả, trẻ em; bấm "Hiện thêm" để thấy Danh mục |
| Popup playlist, menu danh mục | Mở rồi chụp khi đang mở |
| Dialog — bước Chế độ hiển thị | Bấm Tiếp tới bước cuối (**đừng bấm Xong** nếu không muốn tạo luồng) |
| Phòng điều khiển | `/video/{id}/livestreaming`, mở tab cài đặt luồng, mở menu stream key |
| Hộp xác nhận kết thúc | Chỉ chụp trên một luồng thử để Riêng tư |
| Hộp chỉnh sửa | Bấm "Chỉnh sửa" trong phòng điều khiển |

Ở mỗi màn hình: tab **Selector** → **Chụp màn hình hiện tại** → file `studio-dom-….html` được tải về. Gửi các file này để viết lại `content/selectors.js`.

Thứ tự viết luồng khuyến nghị: 1 (danh sách) → 3 (kết thúc) → 2 (tạo) → 5 (sửa) → 4 (chuyển trận). Mỗi luồng: chạy thử trước, rồi chạy thật trên một luồng thử để **Riêng tư**.

## Sửa selector khi YouTube đổi giao diện

Tất cả selector, chữ trên nút (tiếng Việt + tiếng Anh), từ khoá trạng thái và URL nằm trong **`content/selectors.js`**. Không có selector nào ở file khác.

1. Khi một luồng lỗi, log ghi `Selector: controlRoom.endButton` (ví dụ).
2. Mở đúng màn hình đó trên Studio → tab **Selector** → **Kiểm tra selector**: dòng ✗ là selector không tìm thấy; bấm dòng ✓ để tô viền xanh phần tử nó đang trỏ tới.
3. **Chụp màn hình hiện tại**, mở file `.html`: bảng đầu liệt kê mọi nút / ô nhập đang hiển thị (tag, id, aria-label, chữ, đường dẫn), bên dưới là cây DOM của dialog/menu/trang.
4. Sửa entry tương ứng trong `selectors.js`. Thứ tự ưu tiên khi tìm: `css` (id ổn định) → `aria` → `text` → `near` (phần tử gần một nhãn chữ). Tránh class sinh tự động và `nth-child`.
5. Tải lại extension + tab Studio, bấm **Kiểm tra selector** lại.
6. Nút **Đọc dữ liệu trang** cho xem extension đọc được gì (danh sách luồng, trạng thái phòng điều khiển, stream key, công tắc) mà không bấm gì.

Ví dụ một entry:

```js
endButton: {
  desc: 'Nút "Kết thúc phát trực tiếp"',
  css: ['#end-stream-button'],
  aria: ['Kết thúc phát trực tiếp', 'End stream'],
  text: ['Kết thúc phát trực tiếp', 'End stream'],
},
```

## Cấu trúc

```
arena-live-helper/          ← thư mục load unpacked
  manifest.json
  background.js             điều phối: mở/chuyển trang, hỏi xác nhận, dừng, chuyển log
  sidepanel/                giao diện (index.html, panel.css, panel.js + các module)
  content/
    selectors.js            TẤT CẢ selector / chữ nút / từ khoá / URL
    dom.js                  waitFor, deepQuery, click, typeText, pickMenuItem, setChecked, tô viền
    flows.js                listBroadcasts, createBroadcast, endBroadcast, editInfo, switchMatch
    inspector.js            chụp DOM, kiểm tra selector
    main.js                 nhận lệnh, chạy từng chặng, trả kết quả + log
  shared/                   logic thuần dùng chung (chuỗi, mẫu tiêu đề, cấu hình)
tests/                      test Node cho shared/, harness trình duyệt
scripts/make-icons.mjs      sinh icon
```

Mỗi luồng trong `flows.js` chia thành các **chặng**, mỗi chặng chạy trọn trong một trang. Khi cần sang trang khác, chặng trả `{ goto, next }` và `background.js` mở trang rồi chạy chặng tiếp theo — vì content script mất khi trang tải lại.

## Phát triển

```bash
npm test          # test logic thuần (node --test, không cần cài gì)
npm run coverage  # kèm độ phủ
npm run icons     # sinh lại icon
```

Harness trình duyệt (không cần load extension):

```bash
python3 -m http.server 8765
# Side panel với chrome.* giả:  mở http://127.0.0.1:8765/arena-live-helper/sidepanel/index.html
#   sau khi chèn tests/harness/fake-chrome.js trước mọi script (vd. Playwright page.addInitScript)
# Studio giả + chạy luồng thật: mở http://127.0.0.1:8765/tests/harness/mock-studio.html
#   rồi trong console: await harness.run('switchMatch', { table, title, description, order: 'createFirst' })
```

## Việc cần thử thực tế

- YouTube có cho hai luồng cùng gắn một stream key không (thứ tự "tạo mới trước"). Không cho thì đổi sang "Kết thúc luồng cũ trước" ở Cài đặt chung.
- Hộp "Dùng lại chế độ cài đặt": hiện extension luôn chọn "Tạo mới". Nếu dùng lại luồng trước của bàn giữ đúng stream key thì có thể bỏ bước chọn key.
- Ô mô tả của Studio nhận xuống dòng qua `insertLineBreak` hay không (log sẽ báo nếu Studio không nhận nội dung).
