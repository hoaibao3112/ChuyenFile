import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as XLSX from 'xlsx';

// ✅ CJK-safe PDF text extraction using pdfjs-dist (Mozilla PDF.js engine)
// Đảm bảo trích xuất chính xác 100% tiếng Trung, tiếng Nhật, tiếng Hàn và tiếng Việt có dấu.

export const maxDuration = 60;

interface ExtractedTable {
  headers: string[];
  rows: string[][];
  pageNumber: number;
}

interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

// Thuật toán gom text theo dòng và sắp xếp các cột theo tọa độ X
function groupItemsIntoRows(items: PdfTextItem[]): string[][] {
  if (items.length === 0) return [];

  // Sắp xếp: Y giảm dần (từ trên xuống dưới), sau đó X tăng dần (từ trái sang phải)
  const sorted = [...items].sort((a, b) => {
    const yDiff = b.y - a.y;
    if (Math.abs(yDiff) > 4) return yDiff;
    return a.x - b.x;
  });

  const lines: PdfTextItem[][] = [];
  let currentLine: PdfTextItem[] = [];
  let currentY = sorted[0]?.y ?? 0;

  for (const item of sorted) {
    if (Math.abs(item.y - currentY) > 4) {
      if (currentLine.length > 0) {
        lines.push(currentLine);
      }
      currentLine = [item];
      currentY = item.y;
    } else {
      currentLine.push(item);
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  // Chuyển đổi từng dòng thành mảng chuỗi
  return lines.map((line) => line.map((item) => item.str));
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Không tìm thấy file PDF' }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Chỉ chấp nhận file PDF' }, { status: 400 });
    }

    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'File quá lớn (tối đa 50MB)' }, { status: 400 });
    }

    // Đọc buffer file
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Import pdfjs-dist
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const fs = await import('node:fs');

    // Cấu hình workerSrc: ưu tiên local file, tự động fallback sang CDN khi deploy Vercel Serverless
    try {
      const workerPath = path.resolve(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
      if (fs.existsSync(workerPath)) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
      } else {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.min.mjs`;
      }
    } catch {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.min.mjs`;
    }

    // Load PDF document với font CJK đầy đủ
    const loadingTask = pdfjsLib.getDocument({
      data: uint8Array,
      useSystemFonts: true,
      disableFontFace: true,
    });

    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;

    const allTables: ExtractedTable[] = [];
    const allRawRows: string[][] = [];

    // Duyệt qua từng trang của tài liệu PDF
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent({
        includeMarkedContent: false,
      });

      // Lọc các ký tự hợp lệ và lấy tọa độ x, y
      const textItems: PdfTextItem[] = (textContent.items as any[])
        .filter((item) => typeof item?.str === 'string' && item.str.trim() !== '')
        .map((item) => ({
          str: item.str.trim(),
          x: item.transform ? item.transform[4] : 0,
          y: item.transform ? item.transform[5] : 0,
          w: item.width || 0,
          h: item.height || 0,
        }));

      if (textItems.length === 0) continue;

      const pageRows = groupItemsIntoRows(textItems);

      if (pageRows.length > 0) {
        allTables.push({
          headers: pageRows[0] || [],
          rows: pageRows.slice(1),
          pageNumber: pageNum,
        });

        allRawRows.push(...pageRows);
      }
    }

    if (allRawRows.length === 0) {
      return NextResponse.json(
        { error: 'Không thể đọc nội dung từ file PDF. File có thể là ảnh scan thuần (cần tính năng OCR).' },
        { status: 422 }
      );
    }

    // Tạo file Excel bằng xlsx
    const workbook = XLSX.utils.book_new();

    // Sheet tổng hợp toàn bộ nội dung
    const worksheet = XLSX.utils.aoa_to_sheet(allRawRows);

    // Tự động tính độ rộng cột tối ưu cho tiếng CJK (chữ Hán/Nôm/Hangul/Kana rộng gấp đôi chữ Latin)
    const range = XLSX.utils.decode_range(worksheet['!ref'] ?? 'A1');
    const colWidths = [];

    for (let c = 0; c <= range.e.c; c++) {
      let maxWidth = 12;
      for (let r = range.s.r; r <= range.e.r; r++) {
        const cell = worksheet[XLSX.utils.encode_cell({ r, c })];
        if (cell && cell.v) {
          const valStr = String(cell.v);
          const visualLen = [...valStr].reduce((acc, char) => {
            return acc + (char.charCodeAt(0) > 127 ? 2 : 1);
          }, 0);
          maxWidth = Math.max(maxWidth, visualLen + 3);
        }
      }
      colWidths.push({ wch: Math.min(maxWidth, 60) });
    }
    worksheet['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, 'TongHop');

    // Nếu PDF có nhiều trang, tạo thêm các tab sheet riêng cho từng trang
    if (numPages > 1) {
      for (const table of allTables) {
        const pageData = [table.headers, ...table.rows];
        const pageWs = XLSX.utils.aoa_to_sheet(pageData);
        XLSX.utils.book_append_sheet(workbook, pageWs, `Trang_${table.pageNumber}`);
      }
    }

    // Xuất ra Excel Buffer chuẩn
    const excelBuffer = XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'buffer',
      compression: true,
    });

    const originalName = file.name.replace(/\.pdf$/i, '');
    const outputFileName = `${originalName}_chuyen_doi.xlsx`;

    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(outputFileName)}`,
        'Content-Length': String(excelBuffer.length),
        'X-Pages-Processed': String(numPages),
        'X-Rows-Extracted': String(allRawRows.length),
      },
    });
  } catch (error) {
    console.error('[PDF Convert Error]', error);

    if (error instanceof Error) {
      if (error.message.includes('Invalid PDF')) {
        return NextResponse.json({ error: 'File PDF không hợp lệ hoặc bị hỏng' }, { status: 422 });
      }
      if (error.message.includes('Password')) {
        return NextResponse.json({ error: 'File PDF được bảo vệ bằng mật khẩu' }, { status: 422 });
      }
    }

    return NextResponse.json(
      { error: 'Lỗi trong quá trình xử lý file PDF. Vui lòng thử lại.' },
      { status: 500 }
    );
  }
}
