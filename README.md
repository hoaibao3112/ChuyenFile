# ChuyenFile – PDF to Excel Converter (CJK & Tiếng Việt)

Ứng dụng web chuyển đổi tài liệu PDF sang bảng tính Excel (.xlsx) với độ chính xác cao, đặc biệt tối ưu cho văn bản tiếng Trung, tiếng Nhật, tiếng Hàn (CJK) và tiếng Việt có dấu. Không lỗi font, không mất chữ, căn chỉnh cột chuẩn xác.

## Tính năng chính
- **Không lỗi chữ CJK**: Dùng engine Mozilla `pdfjs-dist` trích xuất chuẩn Unicode UTF-8.
- **Tự động căn chỉnh cột**: Gom dòng và phân tích tọa độ `(x, y)` theo chuẩn bảng tính.
- **Tự động giãn chiều rộng**: Nhận diện ký tự CJK độ rộng kép để hiển thị thoáng đẹp.
- **Giao diện hiện đại**: Tailwind CSS v4, Dark mode Glassmorphism, kéo thả file trực quan.
- **Tương thích 100% Vercel Serverless**: Thiết lập sẵn `vercel.json` và cấu hình worker runtime.

## Hướng dẫn chạy Local
```bash
npm install
npm run dev
```
Mở trình duyệt tại: `http://localhost:3000`

## Hướng dẫn Deploy lên Vercel
1. Đẩy mã nguồn lên GitHub.
2. Truy cập [vercel.com](https://vercel.com) và chọn **Add New Project**.
3. Chọn repository `ChuyenFile` và nhấn **Deploy**.
4. Dự án tự động nhận diện Next.js và hoàn tất deploy trong 1 phút!
