
import * as React from 'react';
import './BillLayout.css';
import { APP_CONFIG } from '@/config';

/**
 * BillLayout.tsx - Forced Thermal UI (72mm)
 * Universal Invoice Renderer for Billing, PrintedBills, and BillView.
 */

interface PrintableBillItem {
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
  netAmount?: number;
  total?: number;
  totalLine?: number;
  type?: 'PRODUCT' | 'SERVICE' | string;
  staffName?: string;
}

interface PrintableBillData {
  id?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  customerName?: string;
  partyName?: string;
  customerPhone?: string | number;
  customerAddress?: string;
  customerGst?: string;
  status?: string;
  items?: PrintableBillItem[];
  subtotal?: number;
  totalDiscountAmount?: number;
  totalGstAmount?: number;
  finalAmount?: number;
  amountPaid?: number;
  paymentMethod?: string;
  createdAt?: string;
  billType?: string;
  settings?: {
    customBillMessage?: string;
  };
}

const numberToWords = (num: number): string => {
  const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const inWords = (n: number): string => {
    if (n === 0) return "";
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + a[n % 10] : "");
    if (n < 1000) return a[Math.floor(n / 100)] + " Hundred" + (n % 100 !== 0 ? " " + inWords(n % 100) : "");
    if (n < 100000) return inWords(Math.floor(n / 1000)) + " Thousand" + (n % 1000 !== 0 ? " " + inWords(n % 1000) : "");
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + " Lakh" + (n % 100000 !== 0 ? " " + inWords(n % 100000) : "");
    return inWords(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 !== 0 ? " " + inWords(n % 10000000) : "");
  };

  const amountWhole = Math.round(num);
  const words = inWords(amountWhole);
  return words ? `Rupees ${words} Only` : "Rupees Zero Only";
};

export const BillLayout: React.FC<{ data: PrintableBillData }> = ({ data }) => {
  // 1. Data Mapping & Normalization
  const billNo = data.id || data.invoiceId || data.invoiceNumber || "";
  const customerName = data.customerName || data.partyName || "WALK-IN";
  const customerPhone = data.customerPhone || "";
  const createdAt = data.createdAt ? new Date(data.createdAt) : new Date();
  const formattedDate = createdAt.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '');
  const withGst = (data as any).invoiceMode !== 'ESTIMATE' && data.billType !== 'ESTIMATE';
  const paymentMethod = data.paymentMethod || "Cash";
  const taxType = (data as any).taxType || ((data as any).igstAmount > 0 ? "INTER_STATE" : "INTRA_STATE");

  const rawItems = data.items || [];

  let totalGstAmount = 0;
  let totalDiscountAmount = 0;
  let grossAmountTotal = 0;
  let totalItemsCount = 0;
  let totalQty = 0;

  const items = rawItems.map(item => {
    const q = Number(item.quantity ?? item.qty ?? 0);
    const p = Number(item.unitPrice ?? item.price ?? item.rate ?? 0);
    const d = Number(item.discountRate ?? item.discount ?? item.Discount ?? 0);
    const g = Number(item.gstPercent ?? item.gstRate ?? item.GST ?? 0);

    // Use mapped baseAmount or fallback to manual calculation
    const base = Number(item.baseAmount || (p * q * (1 - d / 100))) || 0;

    // If gstAmount is provided, use it, otherwise derive from base
    const ga = Number(item.gstAmount || (base * g / 100)) || 0;

    const lineTotal = Number(item.total ?? item.finalAmount ?? (base + ga)) || 0;

    grossAmountTotal += (p * q);
    totalDiscountAmount += (p * q * (d / 100));
    totalGstAmount += ga;
    totalQty += q;
    totalItemsCount++;

    return {
      id: item.productId || item.barcode || "-",
      name: item.productName || item.name || item.particulars || "-",
      type: item.type || "PRODUCT",
      staffName: item.staffName || "",
      qty: q,
      discount: d,
      price: p,
      gstPercent: g,
      baseAmount: base,
      gstAmount: ga,
      total: lineTotal
    };
  });

  const amountBeforeGst = items.reduce((sum, i) => sum + (i.baseAmount || 0), 0);
  const totalGstForBill = Number(data.totalGstAmount || totalGstAmount) || 0;
  const cgstAmount = totalGstForBill / 2;
  const sgstAmount = totalGstForBill / 2;

  const finalAmount = Number(data.finalAmount || (amountBeforeGst + totalGstForBill)) || 0;
  const grandTotal = Math.round(finalAmount);
  const roundOffAmount = grandTotal - finalAmount;
  const amountPaid = Number(data.amountPaid ?? grandTotal) || 0;
  const billTitle = data.status === "RETURNED" ? "RETURN / EXCHANGE" : (withGst ? "TAX INVOICE (GST INCLUSIVE)" : "ESTIMATE / BILL");


  return (
    <div className="bill-wrapper">
      <div className="bill-container" id="printable-bill">
        <div className="header">

          <h1>Anjus Beauty Saloon</h1>
          <p style={{ margin: 0 }}>{APP_CONFIG.ADDRESS_LINE_1}</p>
          <p style={{ margin: 0 }}>{APP_CONFIG.ADDRESS_LINE_2}</p>
          <p style={{ margin: 0 }}>Ph: {APP_CONFIG.CONTACT_NO}</p>
          <p style={{ margin: 0 }}>GSTIN: {APP_CONFIG.GSTIN}</p>
          <p style={{ margin: '2px 0 0 0', fontSize: '7.5pt', fontWeight: 'bold' }}>[ ALL PRICES ARE INCLUSIVE OF GST ]</p>
        </div>

        <div className="sep-single"></div>
        <h2>{billTitle}</h2>

        <table className="meta-info">
          <tbody>
            <tr>
              <td className="text-left" style={{ width: '40%' }}>Invoice No:</td>
              <td className="text-right">{billNo}</td>
            </tr>
            <tr>
              <td className="text-left">Date & Time:</td>
              <td className="text-right">{formattedDate}</td>
            </tr>
            {data.billType && (data.billType === 'RETAIL' || data.billType === 'WHOLESALE') && (
              <tr>
                <td className="text-left">Bill Type:</td>
                <td className="text-right" style={{ fontWeight: 'bold' }}>{data.billType}</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="sep-single"></div>

        <table className="meta-info">
          <tbody>
            <tr>
              <td className="text-left" style={{ width: '40%' }}>Customer:</td>
              <td className="text-right">{customerName}</td>
            </tr>
            {customerPhone && (
              <tr>
                <td className="text-left">Contact:</td>
                <td className="text-right">{customerPhone}</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="sep-double"></div>

        <table className="items-table">
          <thead>
            <tr>
              <th className="text-left" style={{ width: '40%' }}>PARTICULARS</th>
              <th className="text-center" style={{ width: '10%' }}>QTY</th>
              <th className="text-center" style={{ width: '10%' }}>DIS</th>
              <th className="text-right" style={{ width: '20%' }}>RATE</th>
              <th className="text-right" style={{ width: '20%' }}>AMT</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i, idx) => (
              <tr key={idx}>
                <td className="text-left">
                  <div style={{ fontWeight: 'bold' }}>{i.name}</div>
                  <div style={{ fontSize: '7pt', color: '#555' }}>ID: {i.id}</div>
                  {i.type === 'SERVICE' && (
                    <div style={{ fontSize: '7pt', color: '#555' }}>Staff: {i.staffName || 'Any'}</div>
                  )}
                </td>
                <td className="text-center">{i.qty}</td>
                <td className="text-center">{i.discount > 0 ? i.discount : '0'}</td>
                <td className="text-right">{(i.price || 0).toFixed(2)}</td>
                <td className="text-right">{(i.total || 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid black' }}>
              <td colSpan={4} className="text-right" style={{ fontWeight: 'bold' }}>Gross Total:</td>
              <td className="text-right" style={{ fontWeight: 'bold' }}>₹{(grossAmountTotal || 0).toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="sep-single"></div>

        <table className="totals-table">
          <tbody>
            <tr>
              <td className="text-left">Items Count: {totalItemsCount}</td>
              <td className="text-right">Total Qty: {totalQty}</td>
            </tr>
            <tr>
              <td className="text-left">Gross Amount</td>
              <td className="text-right">₹{(grossAmountTotal || 0).toFixed(2)}</td>
            </tr>
            <tr>
              <td className="text-left">Total Discount</td>
              <td className="text-right">₹{(totalDiscountAmount || 0).toFixed(2)}</td>
            </tr>
            <tr>
              <td className="text-left">Subtotal</td>
              <td className="text-right">₹{(amountBeforeGst || 0).toFixed(2)}</td>
            </tr>
            <tr>
              <td className="text-left">Round Off</td>
              <td className="text-right">{roundOffAmount >= 0 ? '+' : ''}{(roundOffAmount || 0).toFixed(2)}</td>
            </tr>
            <tr className="grand-total-row">
              <td className="text-left" style={{ fontWeight: 'bold' }}>GRAND TOTAL</td>
              <td className="text-right" style={{ fontWeight: 'bold' }}>₹{(grandTotal || 0).toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        <div className="amount-in-words" style={{ borderTop: '1px dotted #ccc', marginTop: '4px' }}>
          {numberToWords(grandTotal)}
        </div>

        <div className="sep-single"></div>

        <table className="payment-info totals-table" style={{ borderTop: '1px dashed black', paddingTop: '5px' }}>
          <tbody>
            <tr>
              <td className="text-left">Payment Mode: {paymentMethod}</td>
              <td className="text-right"></td>
            </tr>
            <tr>
              <td className="text-left">Amount Paid</td>
              <td className="text-right">₹{(Number(amountPaid) || 0).toFixed(2)}</td>
            </tr>
            {withGst && (
              <>
                {taxType === "INTER_STATE" ? (
                  <tr>
                    <td className="text-left" style={{ fontWeight: 'bold' }}>IGST {amountBeforeGst > 0 ? ((totalGstForBill || 0) / amountBeforeGst * 100).toFixed(1) : '0'}%</td>
                    <td className="text-right" style={{ fontWeight: 'bold' }}>₹{(totalGstForBill || 0).toFixed(2)}</td>
                  </tr>
                ) : (
                  <>
                    <tr>
                      <td className="text-left">CGST {amountBeforeGst > 0 ? ((totalGstForBill || 0) / amountBeforeGst * 50).toFixed(1) : '0'}%</td>
                      <td className="text-right">₹{(cgstAmount || 0).toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td className="text-left">SGST {amountBeforeGst > 0 ? ((totalGstForBill || 0) / amountBeforeGst * 50).toFixed(1) : '0'}%</td>
                      <td className="text-right">₹{(sgstAmount || 0).toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td className="text-left" style={{ fontWeight: 'bold' }}>TOTAL GST (INCLUDED) {amountBeforeGst > 0 ? ((totalGstForBill || 0) / amountBeforeGst * 100).toFixed(1) : '0'}%</td>
                      <td className="text-right" style={{ fontWeight: 'bold' }}>₹{(totalGstForBill || 0).toFixed(2)}</td>
                    </tr>
                  </>
                )}
              </>
            )}
          </tbody>
        </table>

        <div className="sep-single"></div>

        <div className="footer text-center" style={{ marginTop: '10px', fontWeight: 'normal' }}>
          <p style={{ margin: '1px 0' }}>FIXED PRICE</p>
          <p style={{ margin: '1px 0' }}>No Return No Exchange</p>
          <p style={{ margin: '1px 0' }}>{data.settings?.customBillMessage || "THANK YOU VISIT AGAIN"}</p>
        </div>

      </div>
    </div>
  );
};
