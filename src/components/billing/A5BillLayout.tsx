import * as React from 'react';
import './A5BillLayout.css';
import { APP_CONFIG } from '@/config';
import { numberToWords } from '@/utils/numberToWords';
import { useGlobalData } from '@/context/GlobalDataContext';

export interface PrintableA5BillItem {
  barcode?: string;
  productId?: string;
  name?: string;
  productName?: string;
  particulars?: string;
  quantity?: number | string;
  qty?: number | string;
  unitPrice?: number;
  rate?: number;
  price?: number;
  gstRate?: number;
  GST?: number;
  gstPercent?: number;
  baseAmount?: number;
  gstAmount?: number;
  finalAmount?: number;
  discountRate?: number;
  Discount?: number | string;
  discount?: number | string;
  discountAmt?: number | string;
  discountAmount?: number | string;
  netAmount?: number;
  total?: number;
  type?: 'PRODUCT' | 'SERVICE' | 'PACKAGE' | string;
  staffName?: string;
}

export interface PrintableA5BillData {
  id?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  customerName?: string;
  partyName?: string;
  customerPhone?: string | number;
  customerAddress?: string;
  customerGst?: string;
  status?: string;
  items?: PrintableA5BillItem[];
  subtotal?: number;
  totalDiscountAmount?: number;
  totalGstAmount?: number;
  finalAmount?: number;
  amountPaid?: number;
  paymentMethod?: string;
  receivedAmount?: number | string;
  cashAmount?: number | string;
  onlineAmount?: number | string;
  createdAt?: string;
  date?: string;
  billType?: string;
  invoiceMode?: string;
  settings?: {
    shopName?: string;
    addressLine1?: string;
    addressLine2?: string;
    contactNo?: string;
    gstNumber?: string;
    customBillMessage?: string;
  };
}

export const A5BillLayout: React.FC<{ data: PrintableA5BillData }> = ({ data }) => {
  const { settings: globalSettings } = useGlobalData();
  const activeSettings = globalSettings || (data as any).settings || {};

  // Salon Profile
  const shopName = activeSettings.shopName || APP_CONFIG.COMPANY_NAME;
  const addressLine1 = activeSettings.addressLine1 || APP_CONFIG.ADDRESS_LINE_1;
  const addressLine2 = activeSettings.addressLine2 || APP_CONFIG.ADDRESS_LINE_2;
  const contactNo = activeSettings.contactNo || APP_CONFIG.CONTACT_NO;
  const gstin = activeSettings.gstNumber || APP_CONFIG.GSTIN;
  const billMessage = activeSettings.billMessage || data.settings?.customBillMessage || "Thank you for visiting! We look forward to seeing you again.";

  // Invoice Meta
  const billNo = data.id || data.invoiceId || data.invoiceNumber || "INV-NEW";
  const customerName = data.customerName || data.partyName || "Walk-in Customer";
  const customerPhone = data.customerPhone ? String(data.customerPhone) : "";
  const paymentMethod = data.paymentMethod || "Cash";
  const status = (data.status || "").toUpperCase();

  const isEstimate = data.invoiceMode === 'ESTIMATE' || data.billType === 'ESTIMATE';
  const isReturned = status === 'RETURNED' || status === 'RETURN';
  const isCancelled = status === 'CANCELLED';

  const billBadgeTitle = isCancelled
    ? "CANCELLED INVOICE"
    : isReturned
    ? "RETURN / EXCHANGE BILL"
    : isEstimate
    ? "ESTIMATE"
    : "TAX INVOICE";

  const rawDate = data.createdAt || data.date;
  const createdAt = rawDate ? new Date(rawDate) : new Date();
  const formattedDate = !isNaN(createdAt.getTime())
    ? createdAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const formattedTime = !isNaN(createdAt.getTime())
    ? createdAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
    : "";

  // Items Normalization
  const rawItems = data.items || [];
  let totalQty = 0;
  let grossAmountTotal = 0;
  let totalDiscountAmount = 0;
  let calculatedGst = 0;

  const items = rawItems.map((item) => {
    const q = Number(item.quantity ?? item.qty ?? 0) || 1;
    const p = Number(item.unitPrice ?? item.price ?? item.rate ?? 0) || 0;
    const discAmt = Number(item.discount ?? item.discountAmt ?? item.discountAmount ?? 0);
    const discPct = Number(item.discountRate ?? item.Discount ?? 0);
    const lineDiscount = discAmt > 0 ? discAmt : (p * q * (discPct / 100));
    const gPct = Number(item.gstPercent ?? item.gstRate ?? item.GST ?? 0);

    const base = Number(item.baseAmount || (p * q - lineDiscount)) || 0;
    const ga = Number(item.gstAmount || (base * (gPct / 100))) || 0;
    const lineTotal = Number(item.finalAmount ?? item.total ?? (p * q - lineDiscount)) || (p * q);

    grossAmountTotal += (p * q);
    totalDiscountAmount += lineDiscount;
    calculatedGst += ga;
    totalQty += q;

    return {
      name: item.productName || item.name || item.particulars || "Item",
      type: item.type,
      staffName: item.staffName,
      qty: q,
      rate: p,
      discount: lineDiscount,
      total: lineTotal,
    };
  });

  const finalAmount = Number(
    data.finalAmount ??
    data.subtotal ??
    (grossAmountTotal - totalDiscountAmount)
  ) || (grossAmountTotal - totalDiscountAmount);

  const roundedGrandTotal = Math.round(finalAmount);
  const explicitGstTotal = Number(data.totalGstAmount ?? calculatedGst);

  // Split payment details
  const cashAmt = Number(data.cashAmount) || 0;
  const onlineAmt = Number(data.onlineAmount) || 0;
  const isSplit = paymentMethod.toLowerCase() === 'split' || (cashAmt > 0 && onlineAmt > 0);

  return (
    <div className="a5-bill-wrapper">
      <div className="a5-bill-container" id="printable-a5-bill">
        {/* 1. Header (Salon Brand & Contact) */}
        <div className="a5-header">
          <h1 className="a5-shop-name">{shopName}</h1>
          <p className="a5-shop-details">
            {addressLine1}{addressLine2 ? `, ${addressLine2}` : ''}
          </p>
          <p className="a5-shop-contact">
            Ph: {contactNo}
            {!isEstimate && gstin ? ` | GSTIN: ${gstin}` : ''}
          </p>

          <div className="a5-badge-wrapper">
            <span className="a5-bill-badge">{billBadgeTitle}</span>
            <span className="a5-tax-inclusive-tag">PRICES INCLUSIVE OF TAX</span>
          </div>
        </div>

        {/* 2. Metadata Grid (Bill No, Date, Customer, Payment) */}
        <div className="a5-meta-grid">
          <div className="a5-meta-item">
            <span className="a5-meta-label">Bill No:</span>
            <span className="a5-meta-value">{billNo}</span>
          </div>
          <div className="a5-meta-item">
            <span className="a5-meta-label">Customer:</span>
            <span className="a5-meta-value" style={{ textTransform: 'uppercase' }}>{customerName}</span>
          </div>
          <div className="a5-meta-item">
            <span className="a5-meta-label">Date & Time:</span>
            <span className="a5-meta-value">{formattedDate} {formattedTime}</span>
          </div>
          <div className="a5-meta-item">
            <span className="a5-meta-label">Contact:</span>
            <span className="a5-meta-value">{customerPhone || "-"}</span>
          </div>
        </div>

        {/* 3. Items Table (Services & Products) */}
        <div className="a5-table-wrapper">
          <table className="a5-items-table">
            <thead>
              <tr>
                <th className="a5-col-num">#</th>
                <th className="a5-col-desc">Service / Product</th>
                <th className="a5-col-qty">Qty</th>
                <th className="a5-col-rate">Rate</th>
                <th className="a5-col-amount">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '12px', color: '#6b7280' }}>
                    No items in this bill
                  </td>
                </tr>
              ) : (
                items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="a5-col-num">{idx + 1}</td>
                    <td className="a5-col-desc">
                      <div className="a5-item-title">{item.name}</div>
                      {(item.staffName || item.discount > 0) && (
                        <div className="a5-item-sub">
                          {item.staffName && (
                            <span className="a5-item-staff">Stylist: {item.staffName}</span>
                          )}
                          {item.discount > 0 && (
                            <span className="a5-item-discount-tag">(Disc: -₹{item.discount.toFixed(2)})</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="a5-col-qty">{item.qty}</td>
                    <td className="a5-col-rate">₹{item.rate.toFixed(2)}</td>
                    <td className="a5-col-amount">₹{item.total.toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 4. Summary & Grand Total */}
        <div className="a5-summary-section">
          <div className="a5-summary-left">
            <div>
              Total Items: <b>{items.length}</b> &bull; Total Qty: <b>{totalQty}</b>
            </div>
            <div>
              Payment: <b className="a5-payment-badge">
                {isSplit ? `Split (Cash: ₹${cashAmt.toFixed(0)} | Online: ₹${onlineAmt.toFixed(0)})` : paymentMethod}
              </b>
            </div>
            {Number(data.amountPaid ?? 0) > 0 && Number(data.amountPaid) !== roundedGrandTotal && (
              <div style={{ fontSize: '7.5pt', color: '#4b5563', marginTop: '2px' }}>
                Paid: ₹{Number(data.amountPaid).toFixed(2)}
              </div>
            )}
          </div>

          <div className="a5-summary-right">
            {totalDiscountAmount > 0 && (
              <>
                <div className="a5-summary-row">
                  <span>Gross Total:</span>
                  <span>₹{grossAmountTotal.toFixed(2)}</span>
                </div>
                <div className="a5-summary-row discount-row">
                  <span>Discount:</span>
                  <span>-₹{totalDiscountAmount.toFixed(2)}</span>
                </div>
              </>
            )}

            {!isEstimate && explicitGstTotal > 0 && (
              <div className="a5-summary-row tax-info-row">
                <span>Includes GST:</span>
                <span>₹{explicitGstTotal.toFixed(2)}</span>
              </div>
            )}

            <div className="a5-grand-total-row">
              <span>NET PAYABLE</span>
              <span className="total-amount">₹{roundedGrandTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* 5. Amount in Words */}
        <div className="a5-words-section">
          <span>Amount in words: </span>
          <b>{numberToWords(roundedGrandTotal)}</b>
        </div>

        {/* 6. Footer (Message & Signatory) */}
        <div className="a5-footer">
          <div className="a5-footer-message">
            <div className="a5-thankyou">{billMessage}</div>
            <div style={{ fontSize: '6.8pt', color: '#6b7280' }}>
              For queries or appointment booking, call {contactNo}
            </div>
          </div>
          <div className="a5-sign-box">
            <div className="a5-sign-line"></div>
            <div>For {shopName}</div>
            <div style={{ fontSize: '6.5pt', color: '#9ca3af' }}>Authorised Signatory</div>
          </div>
        </div>
      </div>
    </div>
  );
};

