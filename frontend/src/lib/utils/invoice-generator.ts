import { Order } from '@/lib/api/orders';
import { Tenant } from '@/lib/indexeddb/database';
import { Branch } from '@/lib/indexeddb/database';
import type { ThemeConfig } from '@/lib/theme/themeConfig';

export interface InvoiceSettings {
  headerText?: string;
  footerText?: string;
  termsAndConditions?: string;
  showLogo?: boolean;
  showVatNumber?: boolean;
  showQrCode?: boolean;
}

export interface InvoiceData {
  order: Partial<Order> & {
    id: string;
    orderNumber: string;
    orderDate: string;
    subtotal: number;
    discountAmount?: number;
    taxAmount?: number;
    deliveryCharge?: number;
    totalAmount: number;
    paymentStatus: string;
    items?: any[];
    paymentMethod?: string;
    specialInstructions?: string;
    tableId?: string;
  };
  tenant: Tenant & {
    footerText?: string;
    termsAndConditions?: string;
  };
  branch?: Branch;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  invoiceSettings?: InvoiceSettings;
}

export class InvoiceGenerator {
  /**
   * Generate thermal printer invoice (80mm)
   */
  static generateThermal(data: InvoiceData, language: 'en' | 'ar' = 'en', themeConfig?: ThemeConfig): string {
    const { order, tenant, branch, customerName, customerPhone, customerAddress, invoiceSettings } = data;
    const isRTL = language === 'ar';
    const dir = isRTL ? 'rtl' : 'ltr';
    
    // Use invoice settings with defaults
    const showLogo = invoiceSettings?.showLogo !== false; // Default true
    const showVatNumber = invoiceSettings?.showVatNumber !== false; // Default true
    const showQrCode = invoiceSettings?.showQrCode !== false; // Default true
    const headerText = invoiceSettings?.headerText || '';
    const footerText = invoiceSettings?.footerText || tenant.footerText || (isRTL ? 'شكراً لزيارتك!' : 'Thank you for your visit!');
    const termsAndConditions = invoiceSettings?.termsAndConditions || tenant.termsAndConditions || '';
    
    // Get fonts from theme config with fallbacks
    const monoFont = themeConfig?.typography.fontFamily.mono || 'var(--font-geist-mono), Monaco, Courier New, monospace';

    let html = `
<!DOCTYPE html>
<html dir="${dir}" lang="${language}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice</title>
  <style>
    @media print {
      @page {
        size: 80mm auto;
        margin: 0;
      }
      body {
        margin: 0;
        padding: 10px;
        font-family: ${monoFont};
        font-size: 12px;
        width: 80mm;
      }
    }
    body {
      margin: 0;
      padding: 10px;
      font-family: ${monoFont};
      font-size: 12px;
      width: 80mm;
      max-width: 80mm;
    }
    .header {
      text-align: center;
      border-bottom: 1px dashed #000;
      padding-bottom: 10px;
      margin-bottom: 10px;
    }
    .logo {
      max-width: 60mm;
      max-height: 30px;
      margin-bottom: 5px;
    }
    .title {
      font-weight: bold;
      font-size: 14px;
      margin: 5px 0;
    }
    .info {
      font-size: 10px;
      margin: 2px 0;
    }
    .section {
      margin: 10px 0;
      border-bottom: 1px dashed #ccc;
      padding-bottom: 5px;
    }
    .section-title {
      font-weight: bold;
      margin-bottom: 5px;
    }
    .items {
      margin: 5px 0;
    }
    .item {
      display: flex;
      justify-content: space-between;
      margin: 3px 0;
      font-size: 11px;
    }
    .item-name {
      flex: 1;
    }
    .item-price {
      text-align: right;
    }
    .totals {
      margin-top: 10px;
      border-top: 1px solid #000;
      padding-top: 5px;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      margin: 3px 0;
      font-size: 11px;
    }
    .total-row.final {
      font-weight: bold;
      font-size: 13px;
      border-top: 1px dashed #000;
      padding-top: 5px;
      margin-top: 5px;
    }
    .footer {
      text-align: center;
      margin-top: 15px;
      padding-top: 10px;
      border-top: 1px dashed #000;
      font-size: 9px;
    }
    .qr-code {
      text-align: center;
      margin: 10px 0;
    }
    .print-button {
      position: fixed;
      top: 10px;
      right: 10px;
      background: #4c6ef5;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 5px;
      cursor: pointer;
      font-size: 14px;
      font-weight: bold;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      z-index: 1000;
    }
    .print-button:hover {
      background: #364fc7;
    }
    @media print {
      .print-button {
        display: none;
      }
    }
  </style>
</head>
<body>
  <button class="print-button" onclick="window.print()">${isRTL ? 'طباعة' : 'Print'}</button>
  <div class="header">
    ${headerText ? `<div class="info" style="margin-bottom: 5px;">${headerText}</div>` : ''}
    ${showLogo && tenant.logoUrl ? `<img src="${tenant.logoUrl}" alt="Logo" class="logo" />` : ''}
    <div class="title">${tenant.name}</div>
    ${branch ? `<div class="info">${branch.name}</div>` : ''}
    ${branch?.address ? `<div class="info">${branch.address}</div>` : ''}
    ${branch?.phone ? `<div class="info">${branch.phone}</div>` : ''}
    ${showVatNumber && tenant.vatNumber ? `<div class="info">VAT: ${tenant.vatNumber}</div>` : ''}
  </div>

  <div class="section">
    <div class="section-title">${isRTL ? 'الفاتورة' : 'INVOICE'}</div>
    <div class="info">${isRTL ? 'رقم الطلب' : 'Order #'}: ${order.orderNumber}</div>
    <div class="info">${isRTL ? 'التاريخ' : 'Date'}: ${new Date(order.orderDate).toLocaleString(language === 'ar' ? 'ar-IQ' : 'en-US')}</div>
    ${(order as any).orderType ? `<div class="info">${isRTL ? 'نوع الطلب' : 'Order Type'}: ${(order as any).orderType === 'dine_in' ? (isRTL ? 'أكل في المطعم' : 'Dine In') : (order as any).orderType === 'takeaway' ? (isRTL ? 'طلب خارجي' : 'Takeaway') : (order as any).orderType === 'delivery' ? (isRTL ? 'توصيل' : 'Delivery') : (order as any).orderType}</div>` : ''}
    ${order.tableId ? `<div class="info">${isRTL ? 'الطاولة' : 'Table'}: ${order.tableId}</div>` : ''}
  </div>

  ${customerName ? `
  <div class="section">
    <div class="section-title">${isRTL ? 'العميل' : 'CUSTOMER'}</div>
    <div class="info"><strong>${isRTL ? 'الاسم' : 'Name'}:</strong> ${customerName}</div>
    ${customerPhone ? `<div class="info"><strong>${isRTL ? 'الهاتف' : 'Phone'}:</strong> ${customerPhone}</div>` : ''}
    ${customerAddress ? `<div class="info"><strong>${isRTL ? 'العنوان' : 'Address'}:</strong> ${customerAddress}</div>` : ''}
  </div>
  ` : ''}

  <div class="section">
    <div class="section-title">${isRTL ? 'العناصر' : 'ITEMS'}</div>
    <div class="items">
      ${((order as any).items || []).map((item: any) => {
        const itemName = (item.buffetId || item.buffet)
          ? (item.buffet?.name?.trim() || (item.buffetId ? `Buffet #${item.buffetId.substring(0, 8)}...` : 'Buffet'))
          : (item.comboMealId || item.comboMeal)
          ? (item.comboMeal?.name?.trim() || (item.comboMealId ? `Combo Meal #${item.comboMealId.substring(0, 8)}...` : 'Combo Meal'))
          : (item.foodItemName || item.foodItem?.name || 'Item');
        const variationName = item.variationName || item.variation?.variationName;
        const addOns = item.addOns || [];
        const addOnNames = addOns.map((a: any) => {
          const addOnName = a.addOnName || a.addOn?.name || '';
          return addOnName;
        }).filter(Boolean);
        
        return `
        <div class="item">
          <div class="item-name">
            ${item.quantity}x ${itemName}
            ${variationName ? ` (${variationName})` : ''}
            ${addOnNames.length > 0 ? ` + ${addOnNames.join(', ')}` : ''}
          </div>
          <div class="item-price">${(item.subtotal || 0).toFixed(2)}</div>
        </div>
      `;
      }).join('')}
    </div>
  </div>

  <div class="totals">
    <div class="total-row">
      <span>${isRTL ? 'المجموع الفرعي' : 'Subtotal'}</span>
      <span>${order.subtotal.toFixed(2)}</span>
    </div>
    ${order.discountAmount && order.discountAmount > 0 ? `
    <div class="total-row">
      <span>${isRTL ? 'الخصم' : 'Discount'}</span>
      <span>-${order.discountAmount.toFixed(2)}</span>
    </div>
    ` : ''}
    ${order.taxAmount && order.taxAmount > 0 ? `
    <div class="total-row">
      <span>${isRTL ? 'الضريبة' : 'Tax'}</span>
      <span>${order.taxAmount.toFixed(2)}</span>
    </div>
    ` : ''}
    ${order.deliveryCharge && order.deliveryCharge > 0 ? `
    <div class="total-row">
      <span>${isRTL ? 'رسوم التوصيل' : 'Delivery'}</span>
      <span>${order.deliveryCharge.toFixed(2)}</span>
    </div>
    ` : ''}
    <div class="total-row final">
      <span>${isRTL ? 'الإجمالي' : 'TOTAL'}</span>
      <span>${order.totalAmount.toFixed(2)}</span>
    </div>
  </div>

  <div class="section">
    <div class="section-title">${isRTL ? 'معلومات الدفع' : 'PAYMENT INFORMATION'}</div>
    ${(order as any).paymentMethod ? `<div class="info"><strong>${isRTL ? 'طريقة الدفع' : 'Payment Method'}:</strong> ${(order as any).paymentMethod === 'cash' ? (isRTL ? 'نقدي' : 'Cash') : (order as any).paymentMethod === 'card' ? (isRTL ? 'بطاقة' : 'Card') : (order as any).paymentMethod === 'zainCash' ? 'ZainCash' : (order as any).paymentMethod === 'asiaHawala' ? 'Asia Hawala' : (order as any).paymentMethod === 'bankTransfer' ? (isRTL ? 'تحويل بنكي' : 'Bank Transfer') : (order as any).paymentMethod.toUpperCase()}</div>` : ''}
    <div class="info"><strong>${isRTL ? 'حالة الدفع' : 'Payment Status'}:</strong> ${order.paymentStatus === 'paid' ? (isRTL ? 'تم الدفع' : 'PAID') : (isRTL ? 'غير مدفوع' : 'UNPAID')}</div>
  </div>

  ${showVatNumber && tenant.vatNumber && order.taxAmount ? `
  <div class="section">
    <div class="info">${isRTL ? 'شامل ضريبة القيمة المضافة' : 'VAT Included'}</div>
  </div>
  ` : ''}

  ${(order as any).specialInstructions ? `
  <div class="section">
    <div class="section-title">${isRTL ? 'ملاحظات' : 'NOTES'}</div>
    <div class="info">${(order as any).specialInstructions}</div>
  </div>
  ` : ''}

  <div class="footer">
    ${footerText}
    ${termsAndConditions ? `<div style="margin-top: 5px; font-size: 8px;">${termsAndConditions}</div>` : ''}
  </div>
</body>
</html>
    `;

    return html;
  }

  /**
   * Generate A4 format invoice
   */
  static generateA4(data: InvoiceData, language: 'en' | 'ar' = 'en', themeConfig?: ThemeConfig): string {
    const { order, tenant, branch, customerName, customerPhone, customerAddress, invoiceSettings } = data;
    const isRTL = language === 'ar';
    const dir = isRTL ? 'rtl' : 'ltr';
    
    // Use invoice settings with defaults
    const showLogo = invoiceSettings?.showLogo !== false; // Default true
    const showVatNumber = invoiceSettings?.showVatNumber !== false; // Default true
    const showQrCode = invoiceSettings?.showQrCode !== false; // Default true
    const headerText = invoiceSettings?.headerText || '';
    const footerText = invoiceSettings?.footerText || tenant.footerText || (isRTL ? 'شكراً لزيارتك!' : 'Thank you for your visit!');
    const termsAndConditions = invoiceSettings?.termsAndConditions || tenant.termsAndConditions || '';
    
    // Get fonts from theme config with fallbacks
    const primaryFont = themeConfig?.typography.fontFamily.primary || 'var(--font-geist-sans), Arial, Helvetica, sans-serif';

    let html = `
<!DOCTYPE html>
<html dir="${dir}" lang="${language}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice</title>
  <style>
    @media print {
      @page {
        size: A4;
        margin: 20mm;
      }
      body {
        margin: 0;
      }
    }
    body {
      font-family: ${primaryFont};
      font-size: 12px;
      line-height: 1.6;
      color: #333;
      max-width: 210mm;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #000;
      padding-bottom: 20px;
      margin-bottom: 20px;
    }
    .header-left {
      flex: 1;
    }
    .header-right {
      text-align: ${isRTL ? 'left' : 'right'};
    }
    .logo {
      max-width: 150px;
      max-height: 60px;
      margin-bottom: 10px;
    }
    .title {
      font-size: 24px;
      font-weight: bold;
      margin: 10px 0;
    }
    .info {
      font-size: 11px;
      margin: 3px 0;
      color: #666;
    }
    .invoice-info {
      background: #f5f5f5;
      padding: 15px;
      border-radius: 5px;
      margin-bottom: 20px;
    }
    .invoice-info-row {
      display: flex;
      justify-content: space-between;
      margin: 5px 0;
    }
    .section {
      margin: 20px 0;
    }
    .section-title {
      font-size: 16px;
      font-weight: bold;
      border-bottom: 1px solid #ccc;
      padding-bottom: 5px;
      margin-bottom: 10px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0;
    }
    th {
      background: #f5f5f5;
      padding: 10px;
      text-align: ${isRTL ? 'right' : 'left'};
      border: 1px solid #ddd;
      font-weight: bold;
    }
    td {
      padding: 10px;
      border: 1px solid #ddd;
    }
    .text-right {
      text-align: ${isRTL ? 'left' : 'right'};
    }
    .totals {
      margin-top: 20px;
      width: 100%;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #eee;
    }
    .total-row.final {
      font-weight: bold;
      font-size: 16px;
      border-top: 2px solid #000;
      border-bottom: 2px solid #000;
      padding: 10px 0;
      margin-top: 10px;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #000;
      text-align: center;
      font-size: 10px;
      color: #666;
    }
    .qr-code {
      text-align: center;
      margin: 20px 0;
    }
    .notes {
      background: #f9f9f9;
      padding: 15px;
      border-radius: 5px;
      margin-top: 20px;
    }
    .print-button {
      position: fixed;
      top: 10px;
      right: 10px;
      background: #4c6ef5;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 5px;
      cursor: pointer;
      font-size: 14px;
      font-weight: bold;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      z-index: 1000;
    }
    .print-button:hover {
      background: #364fc7;
    }
    @media print {
      .print-button {
        display: none;
      }
    }
  </style>
</head>
<body>
  <button class="print-button" onclick="window.print()">${isRTL ? 'طباعة' : 'Print'}</button>
  <div class="header">
    ${headerText ? `<div class="info" style="margin-bottom: 10px; text-align: center; font-weight: bold;">${headerText}</div>` : ''}
    <div class="header-left">
      ${showLogo && tenant.logoUrl ? `<img src="${tenant.logoUrl}" alt="Logo" class="logo" />` : ''}
      <div class="title">${tenant.name}</div>
      ${branch ? `<div class="info">${branch.name}</div>` : ''}
      ${branch?.address ? `<div class="info">${branch.address}</div>` : ''}
      ${branch?.phone ? `<div class="info">${branch.phone}</div>` : ''}
      ${branch?.email ? `<div class="info">${branch.email}</div>` : ''}
    </div>
    <div class="header-right">
      <div class="title">${isRTL ? 'فاتورة' : 'INVOICE'}</div>
      ${showVatNumber && tenant.vatNumber ? `<div class="info">VAT: ${tenant.vatNumber}</div>` : ''}
    </div>
  </div>

  <div class="invoice-info">
    <div class="invoice-info-row">
      <div><strong>${isRTL ? 'رقم الطلب' : 'Order Number'}:</strong> ${order.orderNumber}</div>
      <div><strong>${isRTL ? 'التاريخ' : 'Date'}:</strong> ${new Date(order.orderDate).toLocaleString(language === 'ar' ? 'ar-IQ' : 'en-US')}</div>
    </div>
    ${(order as any).orderType ? `
    <div class="invoice-info-row">
      <div><strong>${isRTL ? 'نوع الطلب' : 'Order Type'}:</strong> ${(order as any).orderType === 'dine_in' ? (isRTL ? 'أكل في المطعم' : 'Dine In') : (order as any).orderType === 'takeaway' ? (isRTL ? 'طلب خارجي' : 'Takeaway') : (order as any).orderType === 'delivery' ? (isRTL ? 'توصيل' : 'Delivery') : (order as any).orderType}</div>
    </div>
    ` : ''}
    ${order.tableId ? `
    <div class="invoice-info-row">
      <div><strong>${isRTL ? 'الطاولة' : 'Table'}:</strong> ${order.tableId}</div>
    </div>
    ` : ''}
    ${customerName ? `
    <div class="invoice-info-row">
      <div><strong>${isRTL ? 'العميل' : 'Customer'}:</strong> ${customerName}</div>
      ${customerPhone ? `<div><strong>${isRTL ? 'الهاتف' : 'Phone'}:</strong> ${customerPhone}</div>` : ''}
    </div>
    ${customerAddress ? `
    <div class="invoice-info-row">
      <div><strong>${isRTL ? 'العنوان' : 'Address'}:</strong> ${customerAddress}</div>
    </div>
    ` : ''}
    ` : ''}
  </div>

  <div class="section">
    <div class="section-title">${isRTL ? 'تفاصيل الطلب' : 'ORDER DETAILS'}</div>
    <table>
      <thead>
        <tr>
          <th>${isRTL ? 'الكمية' : 'Qty'}</th>
          <th>${isRTL ? 'العنصر' : 'Item'}</th>
          <th class="text-right">${isRTL ? 'السعر' : 'Price'}</th>
          <th class="text-right">${isRTL ? 'الإجمالي' : 'Total'}</th>
        </tr>
      </thead>
      <tbody>
        ${((order as any).items || []).map((item: any) => {
          const itemName = (item.buffetId || item.buffet)
            ? (item.buffet?.name?.trim() || (item.buffetId ? `Buffet #${item.buffetId.substring(0, 8)}...` : 'Buffet'))
            : (item.comboMealId || item.comboMeal)
            ? (item.comboMeal?.name?.trim() || (item.comboMealId ? `Combo Meal #${item.comboMealId.substring(0, 8)}...` : 'Combo Meal'))
            : (item.foodItemName || item.foodItem?.name || 'Item');
          const variationName = item.variationName || item.variation?.variationName;
          const addOns = item.addOns || [];
          const addOnNames = addOns.map((a: any) => {
            const addOnName = a.addOnName || a.addOn?.name || '';
            return addOnName;
          }).filter(Boolean);
          const unitPrice = item.quantity > 0 ? (item.subtotal || 0) / item.quantity : 0;
          
          return `
          <tr>
            <td>${item.quantity || 0}</td>
            <td>
              ${itemName}
              ${variationName ? `<br><small>${variationName}</small>` : ''}
              ${addOnNames.length > 0 ? `<br><small>+ ${addOnNames.join(', ')}</small>` : ''}
            </td>
            <td class="text-right">${unitPrice.toFixed(2)}</td>
            <td class="text-right">${(item.subtotal || 0).toFixed(2)}</td>
          </tr>
        `;
        }).join('')}
      </tbody>
    </table>
  </div>

  <div class="totals">
    <div class="total-row">
      <span>${isRTL ? 'المجموع الفرعي' : 'Subtotal'}</span>
      <span>${order.subtotal.toFixed(2)}</span>
    </div>
    ${order.discountAmount && order.discountAmount > 0 ? `
    <div class="total-row">
      <span>${isRTL ? 'الخصم' : 'Discount'}</span>
      <span>-${order.discountAmount.toFixed(2)}</span>
    </div>
    ` : ''}
    ${order.taxAmount && order.taxAmount > 0 ? `
    <div class="total-row">
      <span>${isRTL ? 'الضريبة' : 'Tax'}</span>
      <span>${order.taxAmount.toFixed(2)}</span>
    </div>
    ` : ''}
    ${order.deliveryCharge && order.deliveryCharge > 0 ? `
    <div class="total-row">
      <span>${isRTL ? 'رسوم التوصيل' : 'Delivery Charge'}</span>
      <span>${order.deliveryCharge.toFixed(2)}</span>
    </div>
    ` : ''}
    <div class="total-row final">
      <span>${isRTL ? 'الإجمالي' : 'TOTAL'}</span>
      <span>${order.totalAmount.toFixed(2)}</span>
    </div>
  </div>

  <div class="section">
    <div class="section-title">${isRTL ? 'معلومات الدفع' : 'PAYMENT INFORMATION'}</div>
    <div class="info">
      ${(order as any).paymentMethod ? `<strong>${isRTL ? 'طريقة الدفع' : 'Payment Method'}:</strong> ${(order as any).paymentMethod === 'cash' ? (isRTL ? 'نقدي' : 'Cash') : (order as any).paymentMethod === 'card' ? (isRTL ? 'بطاقة' : 'Card') : (order as any).paymentMethod === 'zainCash' ? 'ZainCash' : (order as any).paymentMethod === 'asiaHawala' ? 'Asia Hawala' : (order as any).paymentMethod === 'bankTransfer' ? (isRTL ? 'تحويل بنكي' : 'Bank Transfer') : (order as any).paymentMethod.toUpperCase()}<br>` : ''}
      <strong>${isRTL ? 'حالة الدفع' : 'Payment Status'}:</strong> ${order.paymentStatus === 'paid' ? (isRTL ? 'تم الدفع' : 'PAID') : (isRTL ? 'غير مدفوع' : 'UNPAID')}
    </div>
  </div>

  ${(order as any).specialInstructions ? `
  <div class="notes">
    <div class="section-title">${isRTL ? 'ملاحظات خاصة' : 'SPECIAL INSTRUCTIONS'}</div>
    <div>${(order as any).specialInstructions}</div>
  </div>
  ` : ''}

  <div class="footer">
    ${footerText}
    ${termsAndConditions ? `<div style="margin-top: 10px;">${termsAndConditions}</div>` : ''}
    <div style="margin-top: 10px; font-size: 9px;">
      ${isRTL ? 'هذه الفاتورة صالحة كإيصال' : 'This invoice is valid as a receipt'}
    </div>
  </div>
</body>
</html>
    `;

    return html;
  }

  /**
   * Print invoice
   */
  static printInvoice(html: string) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    
    // Don't automatically call print() as it blocks the main thread
    // User can click the print button in the invoice window when ready
  }

  /**
   * Download invoice as PDF (requires browser support)
   */
  static downloadInvoice(html: string, filename: string = 'invoice.pdf') {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    
    // Don't automatically call print() as it blocks the main thread
    // User can click the print button in the invoice window when ready
  }
}

