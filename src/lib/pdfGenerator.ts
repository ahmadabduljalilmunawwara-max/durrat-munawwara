import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import arabicReshaper from 'arabic-reshaper';
import Bidi from 'bidi-js';

const bidi = Bidi();

/**
 * دالة مطورة لمعالجة النصوص العربية وحل مشاكل التشوه والنقاط المشطوبة
 */
export function clean_and_reshape_text(text: string | number): string {
  if (text === undefined || text === null) return "";
  
  let sanitized = text.toString();
  sanitized = sanitized.replace(/86523/g, '');

  try {
    const reshaped = arabicReshaper.reshape(sanitized);
    return bidi.getDisplay(reshaped);
  } catch (e) {
    return sanitized;
  }
}

/**
 * دالة للتحقق من وجود القيمة وصحتها لضمان إخفاء الخط للمدخلات الفارغة
 */
function hasValue(val: any): boolean {
  if (val === undefined || val === null) return false;
  return String(val).trim() !== '';
}

/**
 * دالة لتصغير الخط تلقائياً بناءً على طول النص لضمان الاحتواء
 */
function getFontSizeForText(text: string, defaultSize: number, maxLength: number): number {
  if (!text) return defaultSize;
  const len = text.length;
  if (len <= maxLength) return defaultSize;
  const ratio = maxLength / len;
  return Math.max(defaultSize * ratio, defaultSize * 0.7); // تقليل الحجم بحد أقصى 30%
}

export async function generateVoucherPDF(data: any, options: { save?: boolean, print?: boolean } = { save: true }) {
  const isBase64OrRelative = (url: string) => !url || url.startsWith('data:') || url.startsWith('/') || url.startsWith('.');
  const logoUrl = data.logoUrl || '/logo.png';
  const sloganUrl = data.sloganUrl || '/input_file_0.png';

  const logoCrossOrigin = isBase64OrRelative(logoUrl) ? '' : 'crossOrigin="anonymous"';
  const sloganCrossOrigin = isBase64OrRelative(sloganUrl) ? '' : 'crossOrigin="anonymous"';

  const margins = data.pdfMargins || { top: 15, bottom: 15, left: 35, right: 35 };

  const allBuses = data.buses && Array.isArray(data.buses) && data.buses.length > 0
    ? data.buses
    : [{ busNumber: data.busNumber || '', driverName: data.driverName || '', busType: data.busType || '', driverPhone: data.driverPhone || '' }];

  const busesPerPage = 20;
  const totalPages = Math.ceil(allBuses.length / busesPerPage) || 1;

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'px',
    format: 'a4'
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const html2canvas = (await import('html2canvas')).default;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const startIdx = (pageNum - 1) * busesPerPage;
    const pageBuses = allBuses.slice(startIdx, startIdx + busesPerPage);

    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '850px'; 

    const html = `
      <div style="padding: ${margins.top}px ${margins.left}px ${margins.bottom}px ${margins.right}px; font-family: 'Calibri', 'Arial', sans-serif; background-color: white; position: relative; min-height: 1120px; direction: rtl; box-sizing: border-box; color: #000; display: flex; flex-direction: column;">
        
        <!-- Top Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <!-- Right: Slogan -->
          <div style="width: 33%; text-align: right;">
            <img src="${sloganUrl}" style="height: 95px; max-width: 100%; object-fit: contain; display: inline-block; vertical-align: middle;" ${sloganCrossOrigin} />
          </div>

          <!-- Center: Logo -->
          <div style="width: 34%; text-align: center;">
            <img src="${logoUrl}" style="height: 135px; object-fit: contain; display: inline-block;" ${logoCrossOrigin} />
          </div>

          <!-- Left: Company Name -->
          <div style="text-align: left; width: 33%; white-space: nowrap;">
            <div style="font-size: 24px; font-weight: 800; margin-bottom: 3px; white-space: nowrap;">${clean_and_reshape_text('شركة درة المنورة للنقليات')}</div>
            <div style="font-size: 16px; font-weight: 800; font-family: 'Times New Roman', serif; white-space: nowrap;">Durrat Al-Munawwara Transport Co.</div>
          </div>
        </div>

        <!-- Voucher Number Section -->
        <div style="display: flex; justify-content: flex-end; align-items: center; margin-bottom: 10px;">
          <div style="font-size: 18px; font-weight: 900; color: #000; border: 1px solid #000; padding: 3px 12px; border-radius: 4px;">
            ${clean_and_reshape_text('رقـم السـند :')} ${String(data.voucherNumber).padStart(5, '0')}
          </div>
        </div>

        <!-- Title and Dates Row -->
        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 15px;">
          <!-- Right Side: Dates -->
          <div style="width: 30%; font-size: 16px; font-weight: 900; line-height: 1.4; text-align: right;">
            <div style="display: flex; gap: 8px;">
              <span>${clean_and_reshape_text('التاريــخ : ')}</span>
              <span style="min-width: 90px; text-align: center; border-bottom: 1px dotted #000;">${data.hijriDate || '      -  -  '}</span>
            </div>
            <div style="display: flex; gap: 8px;">
              <span>${clean_and_reshape_text('الـمـوافق : ')}</span>
              <span style="min-width: 90px; text-align: center; border-bottom: 1px dotted #000;">${format(new Date(data.customDate || data.timestamp), 'yyyy/MM/dd')}</span>
            </div>
          </div>
          
          <!-- Center: Title -->
          <div style="text-align: center; flex: 1;">
            <span style="font-size: 24px; font-weight: 900; text-decoration: underline; text-underline-offset: 4px; border-bottom: 2px solid #000; padding-bottom: 4px;">
              ${clean_and_reshape_text('سند استلام حافلات')} ${totalPages > 1 ? `(${clean_and_reshape_text('صفحة')} ${pageNum} ${clean_and_reshape_text('من')} ${totalPages})` : ''}
            </span>
          </div>

          <div style="width: 20%;"></div> <!-- Spacer to keep title centered -->
        </div>

        <!-- Receiver Information -->
        <div style="font-size: 15px; line-height: 1.5; margin-bottom: 10px; font-weight: 900;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px; gap: 10px;">
            <div style="white-space: nowrap;">${clean_and_reshape_text('استلمت أنا : ')} <span style="font-weight: 500; padding: 0 5px; display: inline-block; min-width: 180px; text-align: center;">${clean_and_reshape_text(data.receiverName)}</span></div>
            <div style="white-space: nowrap;">${clean_and_reshape_text('مندوب رقم : ')} <span style="font-weight: 500; padding: 0 5px; display: inline-block; min-width: 80px; text-align: center;">${clean_and_reshape_text(data.delegateNumber)}</span></div>
            <div style="white-space: nowrap;">${clean_and_reshape_text('التابع لمؤسسة : ')} <span style="font-weight: 500; padding: 0 5px; display: inline-block; min-width: 160px; text-align: center;">${clean_and_reshape_text(data.organization)}</span></div>
          </div>

          <div style="display: flex; justify-content: space-between; margin-bottom: 6px; gap: 10px;">
            <div style="white-space: nowrap;">
              ${clean_and_reshape_text('عدد ( ')} <span style="padding: 0 10px; min-width: 30px; display: inline-block; text-align: center;">${hasValue(data.busesQuantity) ? data.busesQuantity : ''}</span> ${clean_and_reshape_text(' ) حافلات : ')}
            </div>
            <div style="white-space: nowrap;">
              ${clean_and_reshape_text('عدد التذاكر ( ')} <span style="padding: 0 10px; min-width: 30px; display: inline-block; text-align: center;">${hasValue(data.ticketsCount) ? data.ticketsCount : ''}</span> ${clean_and_reshape_text(' )')}
            </div>
            <div style="white-space: nowrap;">
              ${clean_and_reshape_text('عدد الحجاج ( ')} <span style="padding: 0 10px; min-width: 30px; display: inline-block; text-align: center;">${hasValue(data.pilgrimsCount) ? data.pilgrimsCount : ''}</span> ${clean_and_reshape_text(' )')}
            </div>
            <div style="white-space: nowrap;">
              ${clean_and_reshape_text('وذلك بموجب اعتماد رقم : ')} <span style="font-weight: 500; padding: 0 10px; min-width: 100px; display: inline-block; text-align: center;">${hasValue(data.approvalNumber) ? clean_and_reshape_text(data.approvalNumber) : ''}</span>
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; margin-bottom: 6px; gap: 10px;">
            <div style="white-space: nowrap; flex: 1;">
              ${clean_and_reshape_text('بتاريخ : ')} <span style="padding: 0 5px;">&nbsp; / &nbsp; / &nbsp; 14</span> ${clean_and_reshape_text('هـ')}
              &nbsp;&nbsp; ${clean_and_reshape_text('في تمام الساعة : ')} <span style="font-weight: 500; padding: 0 5px; min-width: 90px; display: inline-block; text-align: center;">${hasValue(data.eventTime) ? clean_and_reshape_text(data.eventTime) : ''}</span>
            </div>
            <div style="white-space: nowrap; flex: 1; text-align: left;">
              ${clean_and_reshape_text('الإتجاه من')} <span style="font-weight: 500; padding: 0 10px; display: inline-block; min-width: 120px; text-align: center;">${hasValue(data.directionFrom) ? clean_and_reshape_text(data.directionFrom) : ''}</span> 
              ${clean_and_reshape_text('إلى')} <span style="font-weight: 500; padding: 0 10px; display: inline-block; min-width: 120px; text-align: center;">${hasValue(data.directionTo) ? clean_and_reshape_text(data.directionTo) : ''}</span>
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; gap: 10px;">
            <div style="white-space: nowrap; flex: 1;">
              ${clean_and_reshape_text('مكان التحميل : ')} <span style="font-weight: 500; padding: 0 5px; min-width: 130px; display: inline-block; text-align: center;">${hasValue(data.loadingLocation) ? clean_and_reshape_text(data.loadingLocation) : ''}</span>
            </div>
            <div style="white-space: nowrap; flex: 1; text-align: left;">
              ${clean_and_reshape_text('اسم الفندق : ')} <span style="font-weight: 500; padding: 0 5px; min-width: 220px; display: inline-block; text-align: center;">${hasValue(data.hotelName) ? clean_and_reshape_text(data.hotelName) : ''}</span>
            </div>
          </div>
        </div>

        <!-- Main Table -->
        <table style="width: 100%; border-collapse: collapse; border: 1.5px solid #000; margin-top: 5px;">
          <thead>
            <tr style="background-color: #d1d5db; height: 38px;">
              <th style="border: 1px solid #000; width: 45px; font-size: 16px; font-weight: 700; text-align: center; vertical-align: middle;">${clean_and_reshape_text('م')}</th>
              <th style="border: 1px solid #000; width: 40%; font-size: 16px; font-weight: 700; text-align: center; vertical-align: middle;">${clean_and_reshape_text('اسم السائق')}</th>
              <th style="border: 1px solid #000; width: 15%; font-size: 16px; font-weight: 700; text-align: center; vertical-align: middle;">${clean_and_reshape_text('رقم اللوحة')}</th>
              <th style="border: 1px solid #000; width: 15%; font-size: 16px; font-weight: 700; text-align: center; vertical-align: middle;">${clean_and_reshape_text('نوعها')}</th>
              <th style="border: 1px solid #000; width: 25%; font-size: 16px; font-weight: 700; text-align: center; vertical-align: middle;">${clean_and_reshape_text('رقم الهاتف')}</th>
            </tr>
          </thead>
          <tbody>
            ${pageBuses.map((bus: any, i: number) => `
              <tr style="height: 33px;">
                <td style="border: 1px solid #000; text-align: center; vertical-align: middle; font-weight: 700; font-size: 15px;">${startIdx + i + 1}</td>
                <td style="border: 1px solid #000; text-align: center; vertical-align: middle; padding: 1px 5px;">
                  <div style="font-size: ${getFontSizeForText(bus.driverName, 15, 25)}px; font-weight: 700; line-height: 1.2; text-align: center; width: 100%; white-space: nowrap;">
                    ${clean_and_reshape_text(bus.driverName)}
                  </div>
                </td>
                <td style="border: 1px solid #000; text-align: center; vertical-align: middle; font-weight: 700; font-size: 15px;">${bus.busNumber}</td>
                <td style="border: 1px solid #000; text-align: center; vertical-align: middle; font-weight: 700; font-size: 15px;">${clean_and_reshape_text(bus.busType || 'حافلة')}</td>
                <td style="border: 1px solid #000; text-align: center; vertical-align: middle; font-weight: 700; font-size: 14px;">${bus.driverPhone || ''}</td>
              </tr>
            `).join('')}
            ${Array(Math.max(0, busesPerPage - pageBuses.length)).fill(0).map((_, i) => {
              const index = startIdx + pageBuses.length + i + 1;
              return `
                <tr style="height: 33px;">
                  <td style="border: 1px solid #000; text-align: center; vertical-align: middle; font-size: 14px; font-weight: 700;">${index}</td>
                  <td style="border: 1px solid #000;"></td>
                  <td style="border: 1px solid #000;"></td>
                  <td style="border: 1px solid #000;"></td>
                  <td style="border: 1px solid #000;"></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <!-- Signatures -->
        <div style="display: flex; justify-content: space-between; margin-top: 20px; font-weight: bold;">
          <div style="width: 45%; text-align: center;">
            <div style="font-size: 14px; margin-bottom: 12px;">${clean_and_reshape_text('مندوب شركة درة المنورة')}</div>
            <div style="text-align: right; font-size: 13px; margin-bottom: 8px;">${clean_and_reshape_text('الأسم : ')}</div>
            <div style="text-align: right; font-size: 13px;">${clean_and_reshape_text('التوقيع : ')}</div>
          </div>

          <div style="width: 45%; text-align: center;">
            <div style="font-size: 14px; margin-bottom: 12px;">${clean_and_reshape_text('المستلم ( مندوب مجموعة الخدمة الميدانية )')}</div>
            <div style="text-align: right; font-size: 13px; margin-bottom: 8px;">${clean_and_reshape_text('الأسم : ')}</div>
            <div style="text-align: right; font-size: 13px; margin-bottom: 8px;">${clean_and_reshape_text('رقم الموبايل : ')}</div>
            <div style="text-align: right; font-size: 13px;">${clean_and_reshape_text('التوقيع : ')}</div>
          </div>
        </div>

        <!-- Footer Info -->
        <div style="margin-top: auto; padding-bottom: 5px;">
          <div style="text-align: center; font-size: 11px; font-weight: bold; line-height: 1.5;">
            ${clean_and_reshape_text('المقر الرئيسي : العكيشية - ص . ب 20442 جدة 21455')}
            <br/>
            www.munawwara.com
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(container);
    container.innerHTML = html;

    try {
      const canvas = await html2canvas(container, {
        scale: 3, 
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        onclone: (doc) => {
          const style = doc.createElement('style');
          style.innerHTML = `
            body, div, span, p, td, th, table, tr, thead, tbody { 
              font-family: 'Calibri', 'Arial', sans-serif !important;
              -webkit-font-smoothing: antialiased; 
              -moz-osx-font-smoothing: grayscale; 
              text-rendering: optimizeLegibility; 
              letter-spacing: 0px !important; 
            }
          `;
          doc.head.appendChild(style);
        }
      });

      const imgData = canvas.toDataURL('image/png');

      let imgWidth = pageWidth;
      let imgHeight = (canvas.height * pageWidth) / canvas.width;
      let x = 0;
      let y = 0;

      if (imgHeight > pageHeight) {
        imgHeight = pageHeight;
        imgWidth = (canvas.width * pageHeight) / canvas.height;
        x = (pageWidth - imgWidth) / 2;
      }

      if (pageNum > 1) pdf.addPage();
      pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight);
    } finally {
      if (document.body.contains(container)) {
        document.body.removeChild(container);
      }
    }
  }

  let pdfBase64 = '';
  if (options.save || options.print) {
    pdfBase64 = pdf.output('datauristring');
  }

  if (options.save) {
    pdf.save(`سند_${data.voucherNumber}_${data.approvalNumber}.pdf`);
  }

  if (options.print) {
    const blob = pdf.output('blob');
    const url = URL.createObjectURL(blob);
    
    // Attempt to open in a new tab for printing
    // This is the most robust way in sandboxed environments
    const printWindow = window.open(url, '_blank');
    
    if (!printWindow) {
      // Fallback for popup blockers
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.click();
    }

    // Cleanup URL after some time
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60000);
  }

  return pdfBase64;
}

/**
 * دالة لطباعة كشف مجمع للمكتب (كل الحافلات)
 * تحافظ على نفس التنسيق والشكل وتدعم تعدد الصفحات
 */
export async function generateBulkOfficePDF(data: any, options: { save?: boolean, print?: boolean } = { save: true }) {
  const isBase64OrRelative = (url: string) => !url || url.startsWith('data:') || url.startsWith('/') || url.startsWith('.');
  const logoUrl = data.logoUrl || '/logo.png';
  const sloganUrl = data.sloganUrl || '/input_file_0.png';

  const logoCrossOrigin = isBase64OrRelative(logoUrl) ? '' : 'crossOrigin="anonymous"';
  const sloganCrossOrigin = isBase64OrRelative(sloganUrl) ? '' : 'crossOrigin="anonymous"';

  const margins = { top: 15, bottom: 15, left: 25, right: 25 }; 
  const allBuses = data.buses || [];
  const busesPerPage = 16; // Reduced to fit signatures, notes, and footer comfortably
  const totalPages = Math.ceil(allBuses.length / busesPerPage) || 1;

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'px',
    format: 'a4'
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const html2canvas = (await import('html2canvas')).default;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const startIdx = (pageNum - 1) * busesPerPage;
    const pageBuses = allBuses.slice(startIdx, startIdx + busesPerPage);
    
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '850px'; 
    
    const html = `
      <div style="padding: ${margins.top}px ${margins.left}px ${margins.bottom}px ${margins.right}px; font-family: 'Calibri', 'Arial', sans-serif; background-color: white; position: relative; min-height: 1120px; direction: rtl; box-sizing: border-box; color: #000; display: flex; flex-direction: column;">
        
        <!-- Header (Slightly Smaller to save space) -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <!-- Right: Slogan -->
          <div style="width: 33%; text-align: right;">
             <img src="${sloganUrl}" style="height: 100px; max-width: 100%; object-fit: contain; display: inline-block; vertical-align: middle;" ${sloganCrossOrigin} />
          </div>
          <!-- Center: Logo -->
          <div style="width: 34%; text-align: center;">
            <img src="${logoUrl}" style="height: 145px; object-fit: contain; display: inline-block;" ${logoCrossOrigin} />
          </div>
          <!-- Left: Company Name -->
          <div style="text-align: left; width: 33%; white-space: nowrap;">
            <div style="font-size: 26px; font-weight: 800; margin-bottom: 2px; white-space: nowrap;">${clean_and_reshape_text('شركة درة المنورة للنقليات')}</div>
            <div style="font-size: 16px; font-weight: 800; font-family: 'Times New Roman', serif; white-space: nowrap;">Durrat Al-Munawwara Transport Co.</div>
          </div>
        </div>

        <!-- Center Title -->
        <div style="text-align: center; margin-bottom: 15px;">
          <span style="font-size: 32px; font-weight: 900; color: #000; border-bottom: 3px solid #000; padding-bottom: 4px; display: inline-block;">
            ${clean_and_reshape_text('سند استلام حافلات')}
          </span>
        </div>

        <!-- Row after header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px;">
          <div style="width: 30%; font-size: 16px; font-weight: 900; line-height: 1.4; text-align: right;">
            <div style="display: flex; gap: 8px;">
              <span>${clean_and_reshape_text('التاريــخ : ')}</span>
              <span style="min-width: 80px; text-align: center; border-bottom: 1px dotted #000;">${data.hijriDate || '      -  -  '}</span>
            </div>
            <div style="display: flex; gap: 8px;">
              <span>${clean_and_reshape_text('الـمـوافق : ')}</span>
              <span style="min-width: 80px; text-align: center; border-bottom: 1px dotted #000;">${format(new Date(data.customDate || data.timestamp), 'yyyy/MM/dd')}</span>
            </div>
          </div>
          <div style="flex: 1;"></div>
          <div style="width: 20%;"></div>
        </div>

        <div style="font-size: 16px; line-height: 1.8; margin-bottom: 10px; font-weight: 900;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px; gap: 10px;">
             <div style="white-space: nowrap;">${clean_and_reshape_text('المكتب / المندوب : ')} <span style="font-weight: 600; padding: 0 10px; display: inline-block; min-width: 150px; text-align: center;">${hasValue(data.delegateNumber) ? clean_and_reshape_text(data.delegateNumber) : ''}</span></div>
             <div style="white-space: nowrap;">${clean_and_reshape_text('التابع لمؤسسة : ')} <span style="font-weight: 600; padding: 0 10px; display: inline-block; min-width: 250px; text-align: center;">${hasValue(data.organization) ? clean_and_reshape_text(data.organization) : ''}</span></div>
          </div>
          <div style="display: flex; justify-content: space-between; gap: 10px;">
            <div style="white-space: nowrap;">
              ${clean_and_reshape_text('إجمالي الحافلات : ')} <span style="padding: 0 10px; min-width: 30px; display: inline-block; text-align: center;">${allBuses.length}</span>
            </div>
             <div style="white-space: nowrap; flex: 1; text-align: left;">
              ${clean_and_reshape_text('الإتجاه من')} <span style="font-weight: 600; padding: 0 10px; display: inline-block; min-width: 120px; text-align: center;">${hasValue(data.directionFrom) ? clean_and_reshape_text(data.directionFrom) : ''}</span> 
              ${clean_and_reshape_text('إلى')} <span style="font-weight: 600; padding: 0 10px; display: inline-block; min-width: 120px; text-align: center;">${hasValue(data.directionTo) ? clean_and_reshape_text(data.directionTo) : ''}</span>
            </div>
          </div>
        </div>

        <table style="width: 100%; border-collapse: collapse; border: 1.5px solid #000; margin-top: 5px;">
          <thead>
            <tr style="background-color: #e2e8f0; height: 34px;">
              <th style="border: 1px solid #000; width: 35px; font-size: 14.5px; font-weight: 700; text-align: center; vertical-align: middle;">${clean_and_reshape_text('م')}</th>
              <th style="border: 1px solid #000; width: 30%; font-size: 14.5px; font-weight: 700; text-align: center; vertical-align: middle;">${clean_and_reshape_text('اسم السائق')}</th>
              <th style="border: 1px solid #000; width: 12%; font-size: 14.5px; font-weight: 700; text-align: center; vertical-align: middle;">${clean_and_reshape_text('رقم اللوحة')}</th>
              <th style="border: 1px solid #000; width: 13%; font-size: 14.5px; font-weight: 700; text-align: center; vertical-align: middle;">${clean_and_reshape_text('نوعها')}</th>
              <th style="border: 1px solid #000; width: 20%; font-size: 14.5px; font-weight: 700; text-align: center; vertical-align: middle;">${clean_and_reshape_text('رقم الاعتماد')}</th>
              <th style="border: 1px solid #000; width: 20%; font-size: 14.5px; font-weight: 700; text-align: center; vertical-align: middle;">${clean_and_reshape_text('رقم الهاتف')}</th>
            </tr>
          </thead>
          <tbody>
            ${pageBuses.map((bus: any, i: number) => `
              <tr style="height: 34px;">
                <td style="border: 1px solid #000; text-align: center; font-weight: 700; font-size: 13px; vertical-align: middle;">${startIdx + i + 1}</td>
                <td style="border: 1px solid #000; text-align: center; padding: 2px 5px; vertical-align: middle;">
                  <div style="font-size: ${getFontSizeForText(bus.driverName, 14.5, 25)}px; font-weight: 700; line-height: 1.3; text-align: center; width: 100%; white-space: nowrap;">
                    ${clean_and_reshape_text(bus.driverName)}
                  </div>
                </td>
                <td style="border: 1px solid #000; text-align: center; font-weight: 700; font-size: 14.5px; vertical-align: middle;">${bus.busNumber}</td>
                <td style="border: 1px solid #000; text-align: center; font-weight: 700; font-size: 13px; vertical-align: middle;">${clean_and_reshape_text(bus.busType || 'حافلة')}</td>
                <td style="border: 1px solid #000; text-align: center; font-weight: 700; font-size: 13px; vertical-align: middle;">${bus.approvalNumber || ''}</td>
                <td style="border: 1px solid #000; text-align: center; font-weight: 700; font-size: 13px; vertical-align: middle;">${bus.driverPhone || ''}</td>
              </tr>
            `).join('')}
            ${Array(Math.max(0, busesPerPage - pageBuses.length)).fill(0).map((_, i) => {
              const index = startIdx + pageBuses.length + i + 1;
              return `
                <tr style="height: 34px;">
                  <td style="border: 1px solid #000; text-align: center; font-size: 13px; font-weight: 700;">${index}</td>
                  <td style="border: 1px solid #000;"></td>
                  <td style="border: 1px solid #000;"></td>
                  <td style="border: 1px solid #000;"></td>
                  <td style="border: 1px solid #000;"></td>
                  <td style="border: 1px solid #000;"></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <!-- حقل الملاحظات أسفل الجدول -->
        ${pageNum === totalPages ? `
        <div style="margin-top: 10px; border: 1.5px solid #000; padding: 10px; border-radius: 4px; font-size: 14.5px; text-align: right; background-color: #f8fafc; min-height: 50px; box-sizing: border-box;">
          <strong style="font-weight: 900;">${clean_and_reshape_text('الملاحظات : ')}</strong>
          <span style="font-weight: 700; white-space: pre-wrap; margin-right: 5px;">${hasValue(data.notes) ? clean_and_reshape_text(data.notes) : ''}</span>
        </div>
        ` : ''}

        <!-- Signatures and footer area -->
        <div style="margin-top: auto; padding-top: 20px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 25px; font-weight: bold;">
            <div style="width: 45%; text-align: center;">
              <div style="font-size: 15px; margin-bottom: 15px; text-decoration: underline;">${clean_and_reshape_text('مندوب شركة درة المنورة')}</div>
              <div style="text-align: right; font-size: 13px; margin-bottom: 10px;">${clean_and_reshape_text('الأسم : .............................................')}</div>
              <div style="text-align: right; font-size: 13px;">${clean_and_reshape_text('التوقيع : ...........................................')}</div>
            </div>
            <div style="width: 50%; text-align: center;">
              <div style="font-size: 15px; margin-bottom: 15px; text-decoration: underline;">${clean_and_reshape_text('المستلم ( مندوب مجموعة الخدمة الميدانية )')}</div>
              <div style="text-align: right; font-size: 13px; margin-bottom: 10px;">${clean_and_reshape_text('الأسم : .............................................')}</div>
              <div style="text-align: right; font-size: 13px;">${clean_and_reshape_text('التوقيع : ...........................................')}</div>
            </div>
          </div>

          <div style="border-top: 2px solid #000; padding-top: 10px; text-align: center; font-size: 11px; font-weight: bold; line-height: 1.5; color: #333;">
            ${clean_and_reshape_text('المقر الرئيسي : العكيشية - ص . ب 20442 جدة 21455')}
            <br/>
            www.munawwara.com
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(container);
    container.innerHTML = html;

    try {
      const canvas = await html2canvas(container, {
        scale: 2.5,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        onclone: (doc) => {
          const style = doc.createElement('style');
          style.innerHTML = `
            body, div, span, p, td, th, table, tr, thead, tbody { 
              font-family: 'Calibri', 'Arial', sans-serif !important;
              -webkit-font-smoothing: antialiased; 
              -moz-osx-font-smoothing: grayscale; 
              text-rendering: optimizeLegibility; 
              letter-spacing: 0px !important; 
            }
          `;
          doc.head.appendChild(style);
        }
      });
      const imgData = canvas.toDataURL('image/png');
      
      let imgWidth = pageWidth;
      let imgHeight = (canvas.height * pageWidth) / canvas.width;
      let x = 0;
      let y = 0;

      if (imgHeight > pageHeight) {
        imgHeight = pageHeight;
        imgWidth = (canvas.width * pageHeight) / canvas.height;
        x = (pageWidth - imgWidth) / 2;
      }

      if (pageNum > 1) pdf.addPage();
      pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight);
    } finally {
      if (document.body.contains(container)) document.body.removeChild(container);
    }
  }

  if (options.save) {
    pdf.save(`كشف_مكتب_${data.delegateNumber}_${format(new Date(), 'yyyyMMdd')}.pdf`);
  }

  if (options.print) {
    const blob = pdf.output('blob');
    const url = URL.createObjectURL(blob);
    
    const printWindow = window.open(url, '_blank');
    if (!printWindow) {
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.click();
    }

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60000);
  }
}

export interface StatementReportConfig {
  reportTitle: string;
  periodLabel: string;
  reportType?: 'monthly' | 'seasonal' | 'custom' | 'filtered';
  vouchers: any[];
  logoUrl?: string;
  sloganUrl?: string;
  generatedBy?: string;
  season?: string;
  notes?: string;
  filterSummary?: string;
}

/**
 * دالة لتوليد كشوفات وتقارير PDF رسمية للسندات والعمليات
 * للمدراء والمشرفين (كشوفات شهرية، موسمية، أو نطاقات زمنية مخصصة)
 */
export async function generateStatementReportPDF(
  config: StatementReportConfig,
  options: { save?: boolean; print?: boolean } = { save: true, print: true }
) {
  const isBase64OrRelative = (url: string) => !url || url.startsWith('data:') || url.startsWith('/') || url.startsWith('.');
  const logoUrl = config.logoUrl || '/logo.png';
  const sloganUrl = config.sloganUrl || '/input_file_0.png';

  const logoCrossOrigin = isBase64OrRelative(logoUrl) ? '' : 'crossOrigin="anonymous"';
  const sloganCrossOrigin = isBase64OrRelative(sloganUrl) ? '' : 'crossOrigin="anonymous"';

  const vouchers = config.vouchers || [];
  
  // Calculate summary metrics
  let totalBusesCount = 0;
  let totalPilgrims = 0;
  let totalTickets = 0;
  const organizationsSet = new Set<string>();
  const delegatesSet = new Set<string>();

  vouchers.forEach((v) => {
    const bCount = Array.isArray(v.buses) && v.buses.length > 0
      ? v.buses.length
      : (Number(v.busesQuantity) || (v.busNumber ? 1 : 0));
    totalBusesCount += bCount;
    totalPilgrims += Number(v.pilgrimsCount) || 0;
    totalTickets += Number(v.ticketsCount) || 0;
    if (v.organization && String(v.organization).trim()) {
      organizationsSet.add(String(v.organization).trim());
    }
    if (v.delegateNumber && String(v.delegateNumber).trim()) {
      delegatesSet.add(String(v.delegateNumber).trim());
    }
  });

  const rowsPerPage = 12;
  const totalPages = Math.ceil(vouchers.length / rowsPerPage) || 1;

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'px',
    format: 'a4'
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const html2canvas = (await import('html2canvas')).default;

  // Format generation dates
  const todayDate = new Date();
  let hijriNow = '';
  try {
    hijriNow = new Intl.DateTimeFormat('ar-SA-u-nu-latn-ca-islamic-umalqura', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(todayDate);
    if (!hijriNow.includes('هـ')) hijriNow += ' هـ';
  } catch {
    hijriNow = '1448 هـ';
  }

  const gregorianNow = format(todayDate, 'yyyy/MM/dd | HH:mm');

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const startIdx = (pageNum - 1) * rowsPerPage;
    const pageVouchers = vouchers.slice(startIdx, startIdx + rowsPerPage);

    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '1120px';

    const html = `
      <div style="padding: 16px 24px; font-family: 'Calibri', 'Arial', sans-serif; background-color: #ffffff; position: relative; min-height: 790px; direction: rtl; box-sizing: border-box; color: #0f172a; display: flex; flex-direction: column; justify-content: space-between;">
        
        <!-- Header Section -->
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 10px;">
            <!-- Right: Slogan & Vision -->
            <div style="width: 28%; text-align: right;">
              <img src="${sloganUrl}" style="height: 75px; max-width: 100%; object-fit: contain; display: inline-block;" ${sloganCrossOrigin} />
            </div>

            <!-- Center: Report Title & Season/Period -->
            <div style="width: 44%; text-align: center;">
              <div style="display: inline-block; background-color: #0f172a; color: #ffffff; padding: 4px 18px; border-radius: 8px; font-size: 19px; font-weight: 900; margin-bottom: 4px; letter-spacing: 0.5px;">
                ${clean_and_reshape_text(config.reportTitle || 'كشف تقرير السندات والعمليات')}
              </div>
              <div style="font-size: 13px; font-weight: 800; color: #1e3a8a; display: flex; items-center; justify-content: center; gap: 8px;">
                <span>${clean_and_reshape_text('الفترة / التصنيف :')}</span>
                <span style="background-color: #f1f5f9; padding: 1px 8px; border-radius: 4px; border: 1px solid #cbd5e1;">${clean_and_reshape_text(config.periodLabel || 'كافة السجلات')}</span>
              </div>
            </div>

            <!-- Left: Logo & Company Name -->
            <div style="width: 28%; text-align: left; display: flex; align-items: center; justify-content: flex-end; gap: 10px;">
              <div>
                <div style="font-size: 17px; font-weight: 900; color: #0f172a; white-space: nowrap;">${clean_and_reshape_text('شركة درة المنورة للنقليات')}</div>
                <div style="font-size: 11px; font-weight: 800; font-family: 'Times New Roman', serif; color: #334155; white-space: nowrap;">Durrat Al-Munawwara Transport Co.</div>
                <div style="font-size: 10px; font-weight: 700; color: #059669; margin-top: 2px;">${clean_and_reshape_text('نظام إدارة وحركة السندات والحافلات')}</div>
              </div>
              <img src="${logoUrl}" style="height: 75px; object-fit: contain; display: inline-block;" ${logoCrossOrigin} />
            </div>
          </div>

          <!-- Summary KPI Strip (Only on first page or concise header) -->
          <div style="display: flex; justify-content: space-between; align-items: center; background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 6px 14px; margin-bottom: 10px; font-size: 12px; font-weight: 800;">
            <div style="display: flex; gap: 16px; align-items: center;">
              <div>
                <span style="color: #64748b;">${clean_and_reshape_text('إجمالي السندات : ')}</span>
                <span style="color: #1e40af; font-size: 14px; font-weight: 900;">${vouchers.length}</span>
              </div>
              <div style="color: #cbd5e1;">|</div>
              <div>
                <span style="color: #64748b;">${clean_and_reshape_text('إجمالي الحافلات : ')}</span>
                <span style="color: #047857; font-size: 14px; font-weight: 900;">${totalBusesCount}</span>
              </div>
              <div style="color: #cbd5e1;">|</div>
              <div>
                <span style="color: #64748b;">${clean_and_reshape_text('إجمالي الحجاج : ')}</span>
                <span style="color: #b45309; font-size: 14px; font-weight: 900;">${totalPilgrims}</span>
              </div>
              <div style="color: #cbd5e1;">|</div>
              <div>
                <span style="color: #64748b;">${clean_and_reshape_text('إجمالي التذاكر : ')}</span>
                <span style="color: #475569; font-size: 14px; font-weight: 900;">${totalTickets}</span>
              </div>
              <div style="color: #cbd5e1;">|</div>
              <div>
                <span style="color: #64748b;">${clean_and_reshape_text('عدد الجهات : ')}</span>
                <span style="color: #0f172a; font-size: 14px; font-weight: 900;">${organizationsSet.size}</span>
              </div>
            </div>

            <div style="display: flex; gap: 12px; font-size: 11px; color: #475569;">
              <div>
                <span>${clean_and_reshape_text('تاريخ التقرير: ')}</span>
                <strong style="color: #0f172a;">${hijriNow} (${gregorianNow})</strong>
              </div>
              ${config.generatedBy ? `
                <div style="color: #cbd5e1;">|</div>
                <div>
                  <span>${clean_and_reshape_text('المصدر: ')}</span>
                  <strong style="color: #0f172a;">${clean_and_reshape_text(config.generatedBy)}</strong>
                </div>
              ` : ''}
            </div>
          </div>

          <!-- Data Table -->
          <table style="width: 100%; border-collapse: collapse; border: 1.5px solid #0f172a; font-size: 11px;">
            <thead>
              <tr style="background-color: #1e293b; color: #ffffff; height: 30px;">
                <th style="border: 1px solid #334155; width: 30px; text-align: center; vertical-align: middle; font-weight: 900;">${clean_and_reshape_text('م')}</th>
                <th style="border: 1px solid #334155; width: 65px; text-align: center; vertical-align: middle; font-weight: 900;">${clean_and_reshape_text('رقم السند')}</th>
                <th style="border: 1px solid #334155; width: 85px; text-align: center; vertical-align: middle; font-weight: 900;">${clean_and_reshape_text('التاريخ')}</th>
                <th style="border: 1px solid #334155; width: 85px; text-align: center; vertical-align: middle; font-weight: 900;">${clean_and_reshape_text('رقم الاعتماد')}</th>
                <th style="border: 1px solid #334155; width: 140px; text-align: center; vertical-align: middle; font-weight: 900;">${clean_and_reshape_text('المؤسسة / العميل')}</th>
                <th style="border: 1px solid #334155; width: 130px; text-align: center; vertical-align: middle; font-weight: 900;">${clean_and_reshape_text('المندوب / المستلم')}</th>
                <th style="border: 1px solid #334155; width: 65px; text-align: center; vertical-align: middle; font-weight: 900;">${clean_and_reshape_text('الحافلات')}</th>
                <th style="border: 1px solid #334155; width: 170px; text-align: center; vertical-align: middle; font-weight: 900;">${clean_and_reshape_text('أرقام اللوحات والحافلات')}</th>
                <th style="border: 1px solid #334155; width: 150px; text-align: center; vertical-align: middle; font-weight: 900;">${clean_and_reshape_text('خط السير / الموقع')}</th>
                <th style="border: 1px solid #334155; width: 80px; text-align: center; vertical-align: middle; font-weight: 900;">${clean_and_reshape_text('حجاج / تذاكر')}</th>
              </tr>
            </thead>
            <tbody>
              ${pageVouchers.map((v: any, i: number) => {
                const bArray = Array.isArray(v.buses) && v.buses.length > 0
                  ? v.buses
                  : [{ busNumber: v.busNumber || '', driverName: v.driverName || '' }];
                const busNumbersList = bArray.map((b: any) => b.busNumber).filter(Boolean).join(' ، ');
                const dateStr = v.customDate || (v.timestamp ? format(new Date(v.timestamp), 'yyyy/MM/dd') : '-');
                const timeStr = v.eventTime || (v.timestamp ? format(new Date(v.timestamp), 'HH:mm') : '');
                const routeStr = (v.directionFrom || v.directionTo)
                  ? `${v.directionFrom || ''} ➔ ${v.directionTo || ''}`
                  : (v.hotelName || v.loadingLocation || '-');
                
                const isEven = i % 2 === 0;
                const bgColor = isEven ? '#ffffff' : '#f8fafc';

                return `
                  <tr style="background-color: ${bgColor}; height: 28px;">
                    <td style="border: 1px solid #cbd5e1; text-align: center; font-weight: 900; font-size: 11px; vertical-align: middle;">${startIdx + i + 1}</td>
                    <td style="border: 1px solid #cbd5e1; text-align: center; font-weight: 900; font-size: 12px; color: #1e3a8a; vertical-align: middle;">#${v.voucherNumber}</td>
                    <td style="border: 1px solid #cbd5e1; text-align: center; font-size: 10px; font-weight: 700; vertical-align: middle;">
                      ${dateStr}
                      ${timeStr ? `<div style="font-size: 9px; color: #64748b;">${timeStr}</div>` : ''}
                    </td>
                    <td style="border: 1px solid #cbd5e1; text-align: center; font-weight: 800; font-size: 11px; color: #0f172a; vertical-align: middle;">${clean_and_reshape_text(v.approvalNumber || '-')}</td>
                    <td style="border: 1px solid #cbd5e1; text-align: center; font-weight: 800; font-size: 10.5px; padding: 0 4px; vertical-align: middle;">${clean_and_reshape_text(v.organization || '-')}</td>
                    <td style="border: 1px solid #cbd5e1; text-align: center; font-size: 10.5px; padding: 0 4px; vertical-align: middle;">
                      <div style="font-weight: 800;">${clean_and_reshape_text(v.receiverName || v.userName || '-')}</div>
                      ${v.delegateNumber ? `<div style="font-size: 9.5px; color: #475569;">${clean_and_reshape_text('مندوب')} ${clean_and_reshape_text(v.delegateNumber)}</div>` : ''}
                    </td>
                    <td style="border: 1px solid #cbd5e1; text-align: center; font-weight: 900; font-size: 12px; color: #047857; vertical-align: middle;">${bArray.length}</td>
                    <td style="border: 1px solid #cbd5e1; text-align: center; font-size: 10px; font-weight: 700; padding: 0 4px; vertical-align: middle;">
                      <div style="white-space: normal; line-height: 1.2; word-break: break-word;">${busNumbersList || clean_and_reshape_text('غير محدد')}</div>
                    </td>
                    <td style="border: 1px solid #cbd5e1; text-align: center; font-size: 10px; font-weight: 700; padding: 0 4px; vertical-align: middle;">
                      <div>${clean_and_reshape_text(routeStr)}</div>
                    </td>
                    <td style="border: 1px solid #cbd5e1; text-align: center; font-size: 10px; font-weight: 800; vertical-align: middle;">
                      <div style="color: #b45309;">${v.pilgrimsCount || 0} ${clean_and_reshape_text('حاج')}</div>
                      <div style="font-size: 9px; color: #64748b;">${v.ticketsCount || 0} ${clean_and_reshape_text('تذكرة')}</div>
                    </td>
                  </tr>
                `;
              }).join('')}
              ${Array(Math.max(0, rowsPerPage - pageVouchers.length)).fill(0).map((_, i) => {
                const index = startIdx + pageVouchers.length + i + 1;
                return `
                  <tr style="height: 28px; background-color: #fafafa;">
                    <td style="border: 1px solid #e2e8f0; text-align: center; font-size: 10px; color: #cbd5e1;">${index}</td>
                    <td style="border: 1px solid #e2e8f0;"></td>
                    <td style="border: 1px solid #e2e8f0;"></td>
                    <td style="border: 1px solid #e2e8f0;"></td>
                    <td style="border: 1px solid #e2e8f0;"></td>
                    <td style="border: 1px solid #e2e8f0;"></td>
                    <td style="border: 1px solid #e2e8f0;"></td>
                    <td style="border: 1px solid #e2e8f0;"></td>
                    <td style="border: 1px solid #e2e8f0;"></td>
                    <td style="border: 1px solid #e2e8f0;"></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <!-- Footer, Signatures & Pagination -->
        <div style="margin-top: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-end; border-top: 1.5px solid #cbd5e1; padding-top: 8px; font-size: 11px;">
            <!-- Left: Operation Signatures -->
            <div style="display: flex; gap: 40px; text-align: center; font-weight: 800;">
              <div>
                <div style="margin-bottom: 16px; color: #1e293b;">${clean_and_reshape_text('مسؤول التشغيل والحركة')}</div>
                <div style="color: #94a3b8; font-size: 10px;">.........................................</div>
              </div>
              <div>
                <div style="margin-bottom: 16px; color: #1e293b;">${clean_and_reshape_text('مدير إدارة العمليات والنقل')}</div>
                <div style="color: #94a3b8; font-size: 10px;">.........................................</div>
              </div>
              <div>
                <div style="margin-bottom: 16px; color: #1e293b;">${clean_and_reshape_text('الختم والاعتماد الرسمي')}</div>
                <div style="color: #94a3b8; font-size: 10px;">.........................................</div>
              </div>
            </div>

            <!-- Center: Pagination -->
            <div style="text-align: center; font-weight: 900; color: #475569; font-size: 11px;">
              ${clean_and_reshape_text('صفحة')} ${pageNum} ${clean_and_reshape_text('من')} ${totalPages}
            </div>

            <!-- Right: Company System Stamp -->
            <div style="text-align: left; font-size: 9.5px; color: #64748b; font-weight: 700; line-height: 1.4;">
              <div>${clean_and_reshape_text('شركة درة المنورة للنقليات - المملكة العربية السعودية')}</div>
              <div>www.munawwara.com | info@munawwara.com</div>
            </div>
          </div>
        </div>

      </div>
    `;

    document.body.appendChild(container);
    container.innerHTML = html;

    try {
      const canvas = await html2canvas(container, {
        scale: 2.5,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        onclone: (doc) => {
          const style = doc.createElement('style');
          style.innerHTML = `
            body, div, span, p, td, th, table, tr, thead, tbody { 
              font-family: 'Calibri', 'Arial', sans-serif !important;
              -webkit-font-smoothing: antialiased; 
              -moz-osx-font-smoothing: grayscale; 
              text-rendering: optimizeLegibility; 
              letter-spacing: 0px !important; 
            }
          `;
          doc.head.appendChild(style);
        }
      });

      const imgData = canvas.toDataURL('image/png');

      let imgWidth = pageWidth;
      let imgHeight = (canvas.height * pageWidth) / canvas.width;
      let x = 0;
      let y = 0;

      if (imgHeight > pageHeight) {
        imgHeight = pageHeight;
        imgWidth = (canvas.width * pageHeight) / canvas.height;
        x = (pageWidth - imgWidth) / 2;
      }

      if (pageNum > 1) pdf.addPage();
      pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight);
    } finally {
      if (document.body.contains(container)) {
        document.body.removeChild(container);
      }
    }
  }

  const safeFileName = `كشف_${config.periodLabel || 'السندات'}_${format(todayDate, 'yyyyMMdd_HHmm')}.pdf`
    .replace(/\s+/g, '_')
    .replace(/[^\u0600-\u06FF\w.-]/g, '');

  if (options.save) {
    pdf.save(safeFileName);
  }

  if (options.print) {
    const blob = pdf.output('blob');
    const url = URL.createObjectURL(blob);

    const printWindow = window.open(url, '_blank');
    if (!printWindow) {
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.click();
    }

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60000);
  }
}

