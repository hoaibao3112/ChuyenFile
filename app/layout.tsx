import type { Metadata } from 'next';
import { Be_Vietnam_Pro } from 'next/font/google';
import './globals.css';

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-be-vietnam',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'PDF to Excel Converter – Chuyển PDF sang Excel chuẩn CJK',
  description:
    'Công cụ chuyển đổi PDF sang Excel miễn phí. Hỗ trợ chữ Trung, Nhật, Hàn (CJK) không bị lỗi. Upload PDF và tải về file Excel ngay lập tức.',
  keywords: ['pdf to excel', 'chuyển pdf sang excel', 'pdf converter', 'CJK pdf', 'tiếng trung'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className={beVietnamPro.variable}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
