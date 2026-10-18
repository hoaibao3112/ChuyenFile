import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ExcelJS from 'exceljs';

// ✅ CJK-Safe PDF to Formatted Excel Table Converter
// Bảo tồn 100% font tiếng Trung / Nhật / Hàn / Việt và tạo bảng Excel chuẩn có viền kẻ (Borders)

export const maxDuration = 60;

interface PdfItem {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface TextLine {
  y: number;
  items: PdfItem[];
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

    // Cấu hình worker: local file hoặc CDN fallback trên Vercel Serverless
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

    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({
      data: uint8Array,
      useSystemFonts: true,
      disableFontFace: true,
    });

    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;

    // Khởi tạo ExcelJS Workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'PDF to Excel CJK Converter';
    workbook.created = new Date();

    let totalRowsProcessed = 0;

    // Duyệt qua từng trang
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent({ includeMarkedContent: false });

      // Lọc các item hợp lệ
      const items: PdfItem[] = (textContent.items as any[])
        .filter((it) => typeof it?.str === 'string' && it.str.trim() !== '')
        .map((it) => ({
          str: it.str.trim(),
          x: it.transform ? it.transform[4] : 0,
          y: it.transform ? it.transform[5] : 0,
          w: it.width || 0,
          h: it.height || 0,
        }));

      if (items.length === 0) continue;

      // Sắp xếp tọa độ: Y giảm dần (từ trên xuống dưới), X tăng dần (từ trái sang phải)
      items.sort((a, b) => {
        const yDiff = b.y - a.y;
        if (Math.abs(yDiff) > 4) return yDiff;
        return a.x - b.x;
      });

      // Nhóm các item theo từng dòng tọa độ Y
      const lines: TextLine[] = [];
      let curLineItems: PdfItem[] = [];
      let curY = items[0]?.y ?? 0;

      for (const it of items) {
        if (Math.abs(it.y - curY) > 4) {
          if (curLineItems.length > 0) {
            lines.push({ y: curY, items: curLineItems });
          }
          curLineItems = [it];
          curY = it.y;
        } else {
          curLineItems.push(it);
        }
      }
      if (curLineItems.length > 0) {
        lines.push({ y: curY, items: curLineItems });
      }

      totalRowsProcessed += lines.length;

      // ─── THUẬT TOÁN NHẬN DIỆN BẢNG (TABLE DETECTION) ───
      // Tìm dòng có nhiều cột nhất (Header tiềm năng của bảng)
      let bestHeaderIdx = -1;
      let maxCols = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].items.length > maxCols && lines[i].items.length >= 3) {
          maxCols = lines[i].items.length;
          bestHeaderIdx = i;
        }
      }

      // Xây dựng các mốc dải cột (Column Slots) dựa vào Header
      let columnSlots: { str: string; x: number }[] = [];
      if (bestHeaderIdx !== -1) {
        columnSlots = [...lines[bestHeaderIdx].items].sort((a, b) => a.x - b.x);
      }

      // Hàm xác định vị trí cột theo tọa độ X
      const getColumnIndex = (x: number): number => {
        if (columnSlots.length === 0) return 0;
        for (let i = 0; i < columnSlots.length; i++) {
          const nextX = i < columnSlots.length - 1 ? columnSlots[i + 1].x - 6 : 99999;
          const prevX = i === 0 ? 0 : columnSlots[i].x - 12;
          if (x >= prevX && x < nextX) {
            return i;
          }
        }
        return columnSlots.length - 1;
      };

      // Tạo Sheet trong Excel cho trang này
      const sheetName = numPages === 1 ? 'DuLieuChuyenDoi' : `Trang_${pageNum}`;
      const worksheet = workbook.addWorksheet(sheetName);

      // Bật hiển thị đường kẻ lưới (Grid lines)
      worksheet.views = [{ showGridLines: true }];

      // Tìm phạm vi các dòng thuộc bảng
      const isTableSection = (idx: number): boolean => {
        if (bestHeaderIdx === -1) return false;
        // Từ dòng header đến các dòng bên dưới có cấu trúc cột tương ứng
        return idx >= bestHeaderIdx && idx <= bestHeaderIdx + 25;
      };

      // Duyệt qua từng dòng và ghi vào worksheet với định dạng bảng
      lines.forEach((line, lineIdx) => {
        const rowCells: string[] = [];

        if (columnSlots.length > 0 && isTableSection(lineIdx)) {
          // Dòng trong khu vực bảng: Map chính xác vào từng cột
          line.items.forEach((item) => {
            const colIdx = getColumnIndex(item.x);
            if (rowCells[colIdx]) {
              rowCells[colIdx] += ' ' + item.str;
            } else {
              rowCells[colIdx] = item.str;
            }
          });
        } else {
          // Dòng thông tin ngoài bảng (Tiêu đề, khách hàng, ngày tháng, ...)
          line.items.forEach((item, idx) => {
            rowCells[idx] = item.str;
          });
        }

        // Thêm dòng vào Excel (lấp đầy các ô trống bằng chuỗi rỗng)
        const filledCells = Array.from({ length: Math.max(rowCells.length, columnSlots.length) }, (_, i) => rowCells[i] ?? '');
        const addedRow = worksheet.addRow(filledCells);

        // ─── STYLING BẢNG BIỂU CHUYÊN NGHIỆP ───
        if (lineIdx === bestHeaderIdx && columnSlots.length > 0) {
          // 👉 DÒNG TIÊU ĐỀ BẢNG (HEADER ROW):
          addedRow.height = 24;
          addedRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            if (colNumber <= columnSlots.length) {
              cell.font = { name: 'Microsoft YaHei', bold: true, color: { argb: 'FF0F172A' }, size: 10 };
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF1F5F9' }, // Màu nền xám xanh nhạt sang trọng
              };
              cell.border = {
                top: { style: 'medium', color: { argb: 'FF475569' } },
                left: { style: 'thin', color: { argb: 'FF94A3B8' } },
                bottom: { style: 'medium', color: { argb: 'FF475569' } },
                right: { style: 'thin', color: { argb: 'FF94A3B8' } },
              };
              cell.alignment = { vertical: 'middle', horizontal: 'center' };
            }
          });
        } else if (bestHeaderIdx !== -1 && lineIdx > bestHeaderIdx && isTableSection(lineIdx)) {
          // 👉 CÁC DÒNG DỮ LIỆU CỦA BẢNG (DATA ROWS): ĐÓNG KHUNG VIỀN ĐẦY ĐỦ
          addedRow.height = 20;
          addedRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            if (colNumber <= columnSlots.length) {
              cell.font = { name: 'Microsoft YaHei', size: 10, color: { argb: 'FF334155' } };
              cell.border = {
                top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
              };

              // Căn lề thông minh theo kiểu dữ liệu
              const val = String(cell.value || '').trim();
              if (val !== '' && !isNaN(Number(val)) && val.length < 12) {
                // Số hoặc số tiền -> Căn lề phải
                cell.alignment = { vertical: 'middle', horizontal: 'right' };
              } else if (colNumber === 1 && val.length <= 4) {
                // Cột STT -> Căn giữa
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
              } else {
                // Văn bản -> Căn lề trái
                cell.alignment = { vertical: 'middle', horizontal: 'left' };
              }
            }
          });
        } else {
          // Các dòng thông tin bên ngoài bảng
          addedRow.eachCell({ includeEmpty: false }, (cell) => {
            cell.font = { name: 'Microsoft YaHei', size: 10 };
            cell.alignment = { vertical: 'middle', horizontal: 'left' };
          });
        }
      });

      // ─── TỰ ĐỘNG ĐIỀU CHỈNH ĐỘ RỘNG CỘT TỐI ƯU CJK ───
      worksheet.columns.forEach((col) => {
        let maxLen = 10;
        col.eachCell?.({ includeEmpty: false }, (cell) => {
          const str = String(cell.value || '');
          // Ký tự CJK rộng gấp đôi ký tự Latin
          const visualLen = [...str].reduce((acc, c) => acc + (c.charCodeAt(0) > 127 ? 2 : 1), 0);
          if (visualLen > maxLen) maxLen = visualLen;
        });
        col.width = Math.min(Math.max(maxLen + 3, 10), 45);
      });
    }

    if (totalRowsProcessed === 0) {
      return NextResponse.json(
        { error: 'Không thể đọc nội dung từ file PDF. File có thể là ảnh scan thuần (cần tính năng OCR).' },
        { status: 422 }
      );
    }

    // Xuất ra Excel Buffer chuẩn bằng ExcelJS
    const buffer = await workbook.xlsx.writeBuffer();
    const excelBuffer = Buffer.from(buffer);

    const originalName = file.name.replace(/\.pdf$/i, '');
    const outputFileName = `${originalName}_chuyen_doi.xlsx`;

    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(outputFileName)}`,
        'Content-Length': String(excelBuffer.length),
        'X-Pages-Processed': String(numPages),
        'X-Rows-Extracted': String(totalRowsProcessed),
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
