// TẤT CẢ selector, chữ trên nút, từ khoá trạng thái và URL của YouTube Studio nằm ở file này.
// YouTube đổi giao diện → chỉ sửa file này (xem README, mục "Sửa selector").
//
// Mỗi mục là một "entry", thử lần lượt theo thứ tự ưu tiên:
//   css   : danh sách CSS selector (id ổn định trước). Dùng " >>> " để xuyên shadow root.
//   aria  : danh sách aria-label.
//   text  : danh sách chữ hiển thị (khai cả tiếng Việt và tiếng Anh).
//   near  : { label: [...chữ nhãn], target: 'css' } — tìm phần tử `target` gần một nhãn chữ.
//   match : cách so aria/text: 'exact' (mặc định) | 'contains' | 'startsWith'.
//   within: 'dialog' | 'menu' — chỉ tìm trong dialog / menu đang mở trên cùng.
//   targets: CSS các phần tử được xét khi so theo text (mặc định: phần tử bấm được).
//
// ⚠️  Các giá trị dưới đây là bản ĐẦU TIÊN, phần lớn chưa đối chiếu với DOM Studio thật.
//     Dùng tab "Selector" trong side panel để chụp DOM và kiểm tra rồi sửa lại.
//
// Đã xác nhận trên Studio thật (12/10/2026, giao diện tiếng Việt):
//   - URL trang Quản lý: /channel/{id}/livestreaming/manage (menu trái: "Phát trực tiếp", "Webcam", "Quản lý").
//   - Thành phần livestream dùng tiền tố ytls- (ytls-core-app, ytls-live-dashboard-page-renderer, ytls-header…).
//   - Không có shadow root thật (Polymer shady DOM) → CSS thường tìm được, " >>> " chỉ để dự phòng.
//   - Mục menu trái "Phát trực tiếp" là tp-yt-paper-icon-item, nên goLiveButton giới hạn `targets` để không bấm nhầm.
(function (root) {
  'use strict';
  const ALH = (root.ALH = root.ALH || {});

  ALH.URLS = {
    root: 'https://studio.youtube.com/',
    manage: 'https://studio.youtube.com/channel/{channelId}/livestreaming/manage',
    controlRoom: 'https://studio.youtube.com/video/{videoId}/livestreaming',
    watch: 'https://www.youtube.com/watch?v={videoId}',
  };

  // Từ khoá phân loại trạng thái (so kiểu "chứa", không phân biệt hoa thường).
  // Thứ tự xét: ended → scheduled → waiting → live.
  ALH.KEYWORDS = {
    ended: [
      'Đã kết thúc', 'Đã phát trực tiếp', 'Buổi phát trực tiếp đã kết thúc', 'Sự kiện phát trực tiếp đã kết thúc',
      'Stream finished', 'Stream ended', 'Streamed', 'Ended', 'Live stream ended',
    ],
    scheduled: ['Đã lên lịch', 'Sắp tới', 'Sắp diễn ra', 'Scheduled', 'Upcoming'],
    waiting: [
      'Đang chờ kết nối', 'Đang chờ', 'Đã sẵn sàng', 'Bắt đầu gửi', 'Không có dữ liệu',
      'Waiting for connection', 'Ready', 'Start sending', 'No data', 'Preview',
    ],
    live: ['Đang phát trực tiếp', 'Trực tiếp', 'Đang phát', 'Live now', 'Live', 'On air', 'Streaming'],
    emptyList: [
      'Không có sự kiện phát trực tiếp', 'Chưa có buổi phát trực tiếp', 'Không có nội dung',
      'No upcoming', 'No live streams', 'No content',
    ],
  };

  // Phần tử "bấm được" dùng khi so theo chữ.
  ALH.CLICKABLE_CSS = [
    'button', '[role="button"]', 'a[href]', 'ytcp-button', 'ytcp-button-shape', 'ytcp-icon-button',
    'tp-yt-paper-button', 'tp-yt-paper-icon-button', 'tp-yt-paper-item', 'tp-yt-paper-tab',
    '[role="menuitem"]', '[role="menuitemradio"]', '[role="option"]', '[role="tab"]',
    'tp-yt-paper-radio-button', '[role="radio"]', 'ytcp-checkbox-lit', '[role="checkbox"]',
    '[role="switch"]', 'tp-yt-paper-toggle-button', 'ytcp-dropdown-trigger', '[aria-haspopup]',
  ].join(',');

  ALH.DIALOG_CSS = [
    'ytcp-uploads-dialog', 'tp-yt-paper-dialog', 'ytcp-dialog', 'ytcp-confirmation-dialog',
    '[role="dialog"]', '[role="alertdialog"]',
  ].join(',');

  ALH.MENU_CSS = [
    'tp-yt-paper-listbox', '[role="listbox"]', '[role="menu"]', 'ytcp-text-menu',
    'tp-yt-iron-dropdown:not([aria-hidden="true"])', 'ytcp-playlist-dialog',
  ].join(',');

  ALH.MENU_ITEM_CSS = [
    'tp-yt-paper-item', '[role="option"]', '[role="menuitem"]', '[role="menuitemradio"]',
    'ytcp-text-menu tp-yt-paper-item', 'ytcp-ve[role="option"]', 'li',
  ].join(',');

  ALH.TOGGLE_CSS = [
    'ytcp-checkbox-lit', 'tp-yt-paper-toggle-button', 'tp-yt-paper-checkbox', '[role="checkbox"]',
    '[role="switch"]', 'input[type="checkbox"]',
  ].join(',');

  ALH.SELECTORS = {
    // ── Trang Quản lý (Phát trực tiếp → Quản lý) ───────────────────────────────
    manage: {
      createButton: {
        desc: 'Nút "Lên lịch phát trực tiếp" ở trang Quản lý',
        css: ['#schedule-stream-button', 'ytls-schedule-stream-button button'],
        aria: ['Lên lịch phát trực tiếp', 'Lên lịch sự kiện phát trực tiếp', 'Schedule stream', 'Schedule a stream'],
        text: ['Lên lịch phát trực tiếp', 'Lên lịch sự kiện phát trực tiếp', 'Lên lịch', 'Schedule stream', 'Schedule'],
      },
      row: {
        desc: 'Một dòng trong danh sách luồng',
        css: ['ytls-broadcast-list-item', 'ytls-broadcast-row', 'ytcp-video-row', '[role="row"]'],
      },
      rowTitle: {
        desc: 'Tiêu đề trong một dòng danh sách (tìm bên trong dòng)',
        css: ['#video-title', 'a#video-title', '#title', '.video-title', 'a[href*="/video/"]'],
      },
      rowStatus: {
        desc: 'Ô trạng thái trong một dòng danh sách (tìm bên trong dòng)',
        css: ['#status', '.status', 'ytls-broadcast-status', '[class*="status"]', '[class*="badge"]'],
      },
    },

    // ── Hộp "Dùng lại chế độ cài đặt" ──────────────────────────────────────────
    reuse: {
      createNewButton: {
        desc: 'Nút "Tạo mới" trong hộp dùng lại cài đặt',
        within: 'dialog',
        css: ['#create-new-button', '#new-stream-button'],
        text: ['Tạo mới', 'Tạo luồng mới', 'Create new', 'New stream'],
      },
    },

    // ── Dialog tạo / chỉnh sửa thông tin luồng ─────────────────────────────────
    details: {
      titleBox: {
        desc: 'Ô tiêu đề (contenteditable)',
        within: 'dialog',
        css: [
          '#title-textarea #textbox',
          'ytcp-social-suggestions-textbox#title-textarea >>> #textbox',
          '#title-textarea [contenteditable="true"]',
        ],
        aria: ['tiêu đề', 'Add a title', 'title that describes'],
        match: 'contains',
        targets: '[contenteditable="true"], textarea, input',
      },
      descriptionBox: {
        desc: 'Ô mô tả (contenteditable)',
        within: 'dialog',
        css: [
          '#description-textarea #textbox',
          'ytcp-social-suggestions-textbox#description-textarea >>> #textbox',
          '#description-textarea [contenteditable="true"]',
        ],
        aria: ['Giới thiệu về', 'cho người xem biết', 'Tell viewers about'],
        match: 'contains',
        targets: '[contenteditable="true"], textarea',
      },
      kidsNo: {
        desc: 'Lựa chọn "Không, nội dung này không dành cho trẻ em"',
        within: 'dialog',
        css: ['tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]', '[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]'],
        text: ['Không, nội dung này không dành cho trẻ em', "No, it's not made for kids", 'No, it is not made for kids'],
        match: 'startsWith',
      },
      playlistTrigger: {
        desc: 'Ô chọn danh sách phát',
        within: 'dialog',
        css: ['ytcp-video-metadata-playlists ytcp-dropdown-trigger', 'ytcp-video-metadata-playlists [role="button"]'],
        near: { label: ['Danh sách phát', 'Playlists'], target: 'ytcp-dropdown-trigger, [aria-haspopup], [role="button"]' },
      },
      playlistDoneButton: {
        desc: 'Nút "Xong" trong hộp chọn danh sách phát',
        within: 'menu',
        css: ['.done-button', '#done-button'],
        text: ['Xong', 'Done'],
      },
      showMoreButton: {
        desc: 'Nút "Hiện thêm" trong dialog chi tiết',
        within: 'dialog',
        css: ['#toggle-button'],
        text: ['Hiện thêm', 'Show more', 'Xem thêm'],
      },
      categoryTrigger: {
        desc: 'Ô chọn danh mục',
        within: 'dialog',
        css: ['#category ytcp-dropdown-trigger', 'ytcp-form-select#category ytcp-dropdown-trigger'],
        near: { label: ['Danh mục', 'Category'], target: 'ytcp-dropdown-trigger, [aria-haspopup], [role="button"]' },
      },
      nextButton: {
        desc: 'Nút "Tiếp"',
        within: 'dialog',
        css: ['#next-button'],
        text: ['Tiếp', 'Tiếp theo', 'Next'],
      },
      backButton: {
        desc: 'Nút "Quay lại" (chỉ để kiểm tra đang ở bước nào)',
        within: 'dialog',
        css: ['#back-button'],
        text: ['Quay lại', 'Back'],
      },
      doneButton: {
        desc: 'Nút "Xong" để tạo luồng',
        within: 'dialog',
        css: ['#done-button'],
        text: ['Xong', 'Done', 'Lên lịch', 'Schedule'],
      },
      saveButton: {
        desc: 'Nút "Lưu" khi chỉnh sửa thông tin',
        within: 'dialog',
        css: ['#save-button', '#save'],
        text: ['Lưu', 'Save'],
      },
      visibilityPublic: {
        desc: 'Lựa chọn hiển thị "Công khai"',
        within: 'dialog',
        css: ['tp-yt-paper-radio-button[name="PUBLIC"]', '[name="PUBLIC"]'],
        text: ['Công khai', 'Public'],
        match: 'startsWith',
      },
      visibilityUnlisted: {
        desc: 'Lựa chọn hiển thị "Không công khai"',
        within: 'dialog',
        css: ['tp-yt-paper-radio-button[name="UNLISTED"]', '[name="UNLISTED"]'],
        text: ['Không công khai', 'Unlisted'],
        match: 'startsWith',
      },
      visibilityPrivate: {
        desc: 'Lựa chọn hiển thị "Riêng tư"',
        within: 'dialog',
        css: ['tp-yt-paper-radio-button[name="PRIVATE"]', '[name="PRIVATE"]'],
        text: ['Riêng tư', 'Private'],
        match: 'startsWith',
      },
    },

    // ── Phòng điều khiển của một luồng (/video/{id}/livestreaming) ─────────────
    controlRoom: {
      title: {
        desc: 'Tiêu đề luồng hiển thị trong phòng điều khiển',
        css: [
          'ytls-broadcast-metadata #title',
          'ytls-broadcast-metadata .title',
          '#broadcast-title',
          'ytls-metadata-section #title',
          'ytls-live-control-room-renderer #title',
        ],
      },
      status: {
        desc: 'Chữ trạng thái luồng (Đang chờ / Trực tiếp / Đã kết thúc)',
        css: [
          'ytls-broadcast-status-renderer',
          'ytls-live-status',
          '#stream-status',
          '#broadcast-status',
          'ytls-header-renderer #status',
        ],
      },
      editButton: {
        desc: 'Nút "Chỉnh sửa" thông tin luồng',
        css: ['#edit-button', 'ytls-broadcast-metadata #edit-button'],
        aria: ['Chỉnh sửa', 'Edit'],
        text: ['Chỉnh sửa', 'Edit'],
      },
      endButton: {
        desc: 'Nút "Kết thúc phát trực tiếp"',
        css: ['#end-stream-button', '#end-broadcast-button'],
        aria: ['Kết thúc phát trực tiếp', 'Kết thúc buổi phát trực tiếp', 'End stream', 'End live stream'],
        text: ['Kết thúc phát trực tiếp', 'Kết thúc buổi phát trực tiếp', 'Kết thúc sự kiện phát trực tiếp', 'End stream', 'End live stream'],
      },
      endConfirmButton: {
        desc: 'Nút xác nhận "Kết thúc" trong hộp thoại',
        within: 'dialog',
        css: ['#confirm-button', '#end-button'],
        text: ['Kết thúc', 'Kết thúc phát trực tiếp', 'End', 'End stream'],
      },
      goLiveButton: {
        desc: 'Nút "Phát trực tiếp" (bắt đầu tay)',
        css: ['#start-stream-button', '#go-live-button'],
        aria: ['Phát trực tiếp', 'Go live', 'Go Live'],
        text: ['Phát trực tiếp', 'Bắt đầu phát trực tiếp', 'Go live', 'Go Live'],
        targets: 'button, ytcp-button, [role="button"]',
      },
      streamSettingsTab: {
        desc: 'Tab "Cài đặt luồng" trong phòng điều khiển',
        css: ['#stream-settings-tab'],
        text: ['Cài đặt luồng', 'Cài đặt sự kiện phát trực tiếp', 'Cài đặt luồng phát', 'Stream settings'],
        targets: '[role="tab"], tp-yt-paper-tab, button, ytcp-button',
      },
      streamKeyDropdown: {
        desc: 'Ô chọn stream key (hiện tên key đang dùng)',
        css: [
          'ytls-ingestion-dropdown-trigger-renderer',
          'ytls-stream-key-picker ytcp-dropdown-trigger',
          '#stream-key-dropdown',
        ],
        near: {
          label: ['Chọn khóa sự kiện phát trực tiếp', 'Khóa sự kiện phát trực tiếp', 'Khóa luồng', 'Select stream key', 'Stream key'],
          target: 'ytcp-dropdown-trigger, [aria-haspopup], [role="button"], [role="combobox"]',
        },
      },
      autoStartToggle: {
        desc: 'Công tắc "Bật tính năng tự động bắt đầu"',
        css: ['#auto-start-toggle', '#enable-auto-start'],
        near: {
          label: ['Bật tính năng tự động bắt đầu', 'Tự động bắt đầu', 'Enable Auto-start', 'Auto-start'],
          target: 'ytcp-checkbox-lit, tp-yt-paper-toggle-button, tp-yt-paper-checkbox, [role="checkbox"], [role="switch"]',
        },
      },
      autoStopToggle: {
        desc: 'Công tắc "Bật tính năng tự động dừng"',
        css: ['#auto-stop-toggle', '#enable-auto-stop'],
        near: {
          label: ['Bật tính năng tự động dừng', 'Tự động dừng', 'Enable Auto-stop', 'Auto-stop'],
          target: 'ytcp-checkbox-lit, tp-yt-paper-toggle-button, tp-yt-paper-checkbox, [role="checkbox"], [role="switch"]',
        },
      },
    },
  };

  /** Lấy entry theo khoá "nhóm.tên", kèm key để log. */
  ALH.sel = function sel(key) {
    const [group, name] = String(key).split('.');
    const entry = ALH.SELECTORS[group] && ALH.SELECTORS[group][name];
    if (!entry) throw new Error(`Không có selector "${key}" trong selectors.js`);
    return { key, ...entry };
  };

  /** Duyệt mọi entry (dùng cho tab Selector). */
  ALH.allSelectorKeys = function allSelectorKeys() {
    return Object.entries(ALH.SELECTORS).flatMap(([group, items]) => Object.keys(items).map((n) => `${group}.${n}`));
  };
})(globalThis);
