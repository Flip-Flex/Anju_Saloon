
import * as React from 'react';
import './WholesaleBillLayout.css';
import { APP_CONFIG } from '@/config';
import { numberToWords } from '@/utils/numberToWords';
import { useGlobalData } from '@/context/GlobalDataContext';

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
    discountAmt?: number | string;
    discountAmount?: number | string;
    netAmount?: number;
    total?: number;
    hsn?: string;
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
    invoiceMode?: string;
}

export const WholesaleBillLayout: React.FC<{ data: PrintableBillData }> = ({ data }) => {
    const { settings: globalSettings } = useGlobalData();
    const activeSettings = globalSettings || (data as any).settings || {};

    const shopName = activeSettings.shopName || APP_CONFIG.COMPANY_NAME;
    const addressLine1 = activeSettings.addressLine1 || APP_CONFIG.ADDRESS_LINE_1;
    const addressLine2 = activeSettings.addressLine2 || APP_CONFIG.ADDRESS_LINE_2;
    const contactNo = activeSettings.contactNo || APP_CONFIG.CONTACT_NO;
    const gstin = activeSettings.gstNumber || APP_CONFIG.GSTIN;
    const bankName = activeSettings.bankName || APP_CONFIG.BANK_NAME;
    const accountNo = activeSettings.accountNo || APP_CONFIG.ACCOUNT_NO;
    const ifscCode = activeSettings.ifscCode || APP_CONFIG.IFSC_CODE;
    const billMessage = activeSettings.billMessage || `Thank you for visiting ${shopName}! All taxes inclusive.`;

    // Dynamic slots to ensure bill strictly fits on a single page
    const SAFE_LIMIT = 12; // Max items on last page with footer
    const HARD_LIMIT = 20; // Max items on intermediate pages without footer

    const billNo = data.id || data.invoiceId || data.invoiceNumber || "";
    const customerName = data.customerName || data.partyName || "CASH";
    const customerPhone = data.customerPhone || "";
    const customerAddress = data.customerAddress || "";
    const customerGst = data.customerGst || "";
    const createdAt = data.createdAt ? new Date(data.createdAt) : new Date();
    const formattedDate = createdAt.toLocaleDateString('en-GB');
    const isEstimate = data.invoiceMode === 'ESTIMATE' || data.billType === 'ESTIMATE';
    const taxType = (data as any).taxType || ((data as any).igstAmount > 0 ? "INTER_STATE" : "INTRA_STATE");

    const rawItems = data.items || [];
    const items = rawItems.map(item => {
        const q = Number(item.quantity ?? item.qty ?? 0);
        const p = Number(item.unitPrice ?? item.price ?? item.rate ?? 0);
        const g = Number(item.gstPercent ?? item.gstRate ?? item.GST ?? 0);
        const d = Number(item.discount ?? item.discountAmt ?? item.discountAmount ?? 0);

        const base = Number(item.baseAmount || (p * q)) || 0;
        const ga = Number(item.gstAmount || (base * g / 100)) || 0;
        const total = Number(item.finalAmount ?? item.total ?? (base + ga)) || 0;

        return {
            id: item.productId || item.barcode || "-",
            name: item.productName || item.name || item.particulars || "-",
            productName: item.productName || item.name || item.particulars || "-",
            qty: q,
            rate: p,
            discount: d,
            baseAmount: base,
            gstPercent: g,
            gstAmount: ga,
            total: total,
            hsn: item.hsn || "9997",
            type: (item as any).type,
            staffName: (item as any).staffName
        };
    });

    const totalQty = items.reduce((sum, i) => sum + i.qty, 0);
    const totalBaseAmount = items.reduce((sum, i) => sum + i.baseAmount, 0);
    const totalGst = items.reduce((sum, i) => sum + i.gstAmount, 0);
    const finalAmount = Math.round(data.finalAmount || (totalBaseAmount + totalGst));

    const gstGroups = items.reduce((acc, item) => {
        const key = item.gstPercent;
        if (!acc[key]) {
            acc[key] = { hsn: item.hsn, taxable: 0, gstRate: key, amount: 0 };
        }
        acc[key].taxable += item.baseAmount;
        acc[key].amount += item.gstAmount;
        return acc;
    }, {} as Record<number, any>);

    const gstRows = Object.values(gstGroups);
    // Pad to minimum 1 row so table header/footer aligns cleanly, but avoid unnecessary vertical expansion
    const HSN_SLOTS = Math.max(gstRows.length, 1);
    const paddedGstRows = [...gstRows];
    while (paddedGstRows.length < HSN_SLOTS) {
        paddedGstRows.push(null as any);
    }

    const pages = [];
    let currentIndex = 0;

    while (true) {
        const remainingCount = items.length - currentIndex;
        const isFinalPageFit = remainingCount <= SAFE_LIMIT;

        if (isFinalPageFit) {
            // Final page with footer
            const pageItems = items.slice(currentIndex);
            const paddedItems = [...pageItems];
            // Only add minimal padding (min 3 rows) so single items aren't microscopic,
            // but NEVER pad up to 15 rows to prevent spilling into a 2nd page
            const minRows = Math.min(Math.max(pageItems.length, 3), 5);
            while (paddedItems.length < minRows) {
                paddedItems.push(null as any);
            }

            pages.push({
                items: paddedItems,
                showFooter: true,
                startIndex: currentIndex
            });
            break;
        } else {
            // Intermediate page without footer
            const takeCount = Math.min(remainingCount, HARD_LIMIT);
            const pageItems = items.slice(currentIndex, currentIndex + takeCount);
            const paddedItems = [...pageItems];
            const minRows = Math.min(Math.max(pageItems.length, 6), HARD_LIMIT);
            while (paddedItems.length < minRows) {
                paddedItems.push(null as any);
            }

            pages.push({
                items: paddedItems,
                showFooter: false,
                startIndex: currentIndex
            });
            currentIndex += takeCount;
        }
    }

    const totalPages = pages.length;

    return (
        <div className="wholesale-bill-wrapper">
            {pages.map((page, pageIdx) => (
                <div key={pageIdx} className="wholesale-page">
                    {/* TOP YELLOW BAND */}
                    <div className="header-yellow-band"></div>

                    {/* COMPANY BOX */}
                    <div className="company-details-box">
                        <div className="company-top-labels">
                            <span className="label-left">{isEstimate ? "ESTIMATION" : "TAX INVOICE (GST INCLUSIVE)"}</span>
                            <span className="label-center" style={{ fontSize: '8pt', fontWeight: 'bold', color: '#166534', background: '#dcfce7', padding: '1.5px 8px', borderRadius: '4px', letterSpacing: '0.5px' }}>
                                ALL PRICES ARE INCLUSIVE OF GST
                            </span>
                            <span className="label-right">CUSTOMER COPY</span>
                        </div>
                        <div className="company-middle-row">
                            <div className="spacer"></div>
                            <div className="company-name-section">
                                <h1 className="shop-name">{shopName}</h1>
                                <p className="shop-address">{addressLine1}</p>
                                <p className="shop-address">{addressLine2}</p>
                            </div>
                            <div className="company-info-right">
                                <p>GSTIN: {gstin}</p>
                                <p>PH: {contactNo}</p>
                            </div>
                        </div>
                        <div className="company-bottom-row">
                            STATE CODE: 33 &bull; INCLUSIVE OF ALL TAXES
                        </div>
                    </div>

                    {/* CUSTOMER SECTION */}
                    <table className="customer-invoice-table">
                        <tbody>
                            <tr>
                                <td className="billed-to-section">
                                    <div style={{ fontWeight: 'bold', borderBottom: '1px solid black', marginBottom: '1mm', fontSize: '8.5pt' }}>BILLED TO / SHIPPED TO</div>
                                    <div style={{ fontWeight: '900', fontSize: '11.5pt', textTransform: 'uppercase' }}>{customerName}</div>
                                    {customerAddress && <div style={{ fontSize: '9pt', whiteSpace: 'pre-wrap', marginTop: '1mm' }}>{customerAddress}</div>}
                                    <div style={{ fontSize: '9pt', marginTop: '1mm' }}>PH: {customerPhone || "N/A"}</div>
                                    {customerGst && <div style={{ fontSize: '9pt', fontWeight: 'bold', marginTop: '1mm' }}>GSTIN: {customerGst}</div>}
                                </td>
                                <td className="invoice-info-section">
                                    <div className="invoice-info-split">
                                        <div className="info-box-top">
                                            <div style={{ fontSize: '9.5pt' }}>Invoice No: <b style={{ fontSize: '11pt' }}>{billNo}</b></div>
                                            <div style={{ fontSize: '9.5pt', marginTop: '1.5mm' }}>Date: <b style={{ fontSize: '11pt' }}>{formattedDate}</b></div>
                                        </div>
                                        <div className="info-box-bottom" style={{ fontSize: '9pt' }}>
                                            <div>Mode: {data.invoiceMode === "ESTIMATE" ? "Estimation" : "Tax Invoice (GST Inclusive)"}</div>
                                            <div>Terminal: POS 1</div>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    {/* PRODUCT TABLE SECTION */}
                    <div className="product-section-wrapper">
                        <table className="product-table">
                            <thead>
                                <tr>
                                    <th className="sno-col">S.No</th>
                                    <th className="desc-col">Service / Product Description</th>
                                    <th className="qty-col">Qty</th>
                                    <th className="rate-col">Rate (Incl. GST)</th>
                                    <th className="disc-col">Disc</th>
                                    <th className="amt-col">Amount (Incl. GST)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {page.items.map((item, idx) => (
                                    <tr key={idx} className="product-row">
                                        <td className="text-center">{item ? (page.startIndex + idx + 1) : ""}</td>
                                        <td className="text-left">
                                            {item ? (
                                                <>
                                                    <div style={{ fontWeight: 'bold' }}>{item.productName || item.name}</div>
                                                    <div style={{ fontSize: '7.5pt', color: '#555', marginTop: '1px' }}>
                                                        <span>Taxable: ₹{item.baseAmount.toFixed(2)} | GST ({item.gstPercent}%): ₹{item.gstAmount.toFixed(2)}</span>
                                                        {item.type === 'SERVICE' && item.staffName && (
                                                            <span style={{ marginLeft: '6px', color: '#1d4ed8' }}>&bull; Staff: {item.staffName}</span>
                                                        )}
                                                    </div>
                                                </>
                                            ) : ""}
                                        </td>
                                        <td className="text-center">{item ? item.qty : ""}</td>
                                        <td className="text-right">{item ? item.rate.toFixed(2) : ""}</td>
                                        <td className="text-right">{item ? (item.discount || 0).toFixed(2) : ""}</td>
                                        <td className="text-right" style={{ fontWeight: 'bold' }}>{item ? item.total.toFixed(2) : ""}</td>
                                    </tr>
                                ))}
                                {page.showFooter && (
                                    <tr className="total-row">
                                        <td colSpan={2} className="text-right" style={{ paddingRight: '5mm', fontWeight: 'bold' }}>TOTAL (INCL. GST)</td>
                                        <td className="text-center">{totalQty}</td>
                                        <td></td>
                                        <td className="text-right">{items.reduce((sum, i) => sum + (i.discount || 0), 0).toFixed(2)}</td>
                                        <td className="text-right" style={{ fontWeight: 'bold' }}>{items.reduce((sum, i) => sum + i.total, 0).toFixed(2)}</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* TAX & FOOTER SECTION - ONLY ON LAST PAGE */}
                    {page.showFooter && (
                        <div className="footer-reserved-area">
                            <div style={{ fontSize: '8pt', fontWeight: 'bold', color: '#475569', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                GST Tax Breakdown (Included in Net Bill Amount)
                            </div>
                            <div className="hsn-summary-box">
                                <div className="hsn-left">
                                    <table className="hsn-table">
                                        <thead>
                                            <tr>
                                                <th>Taxable Value</th>
                                                <th>CGST %</th>
                                                <th>CGST Amt</th>
                                                <th>SGST %</th>
                                                <th>SGST Amt</th>
                                                <th>IGST %</th>
                                                <th>IGST Amt</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {paddedGstRows.map((row, i) => (
                                                <tr key={i}>
                                                    <td>{row ? row.taxable.toFixed(2) : ""}</td>
                                                    {taxType === "INTRA_STATE" ? (
                                                        <>
                                                            <td>{row ? (row.gstRate / 2).toFixed(1) : ""}</td>
                                                            <td>{row ? (row.amount / 2).toFixed(2) : ""}</td>
                                                            <td>{row ? (row.gstRate / 2).toFixed(1) : ""}</td>
                                                            <td>{row ? (row.amount / 2).toFixed(2) : ""}</td>
                                                            <td>{row ? "0" : ""}</td>
                                                            <td>{row ? "0.00" : ""}</td>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <td>{row ? "0" : ""}</td>
                                                            <td>{row ? "0.00" : ""}</td>
                                                            <td>{row ? "0" : ""}</td>
                                                            <td>{row ? "0.00" : ""}</td>
                                                            <td>{row ? row.gstRate.toFixed(1) : ""}</td>
                                                            <td>{row ? row.amount.toFixed(2) : ""}</td>
                                                        </>
                                                    )}
                                                </tr>
                                            ))}
                                            <tr className="hsn-total-row">
                                                <td>{totalBaseAmount.toFixed(2)}</td>
                                                {taxType === "INTRA_STATE" ? (
                                                    <>
                                                        <td></td>
                                                        <td>{(totalGst / 2).toFixed(2)}</td>
                                                        <td></td>
                                                        <td>{(totalGst / 2).toFixed(2)}</td>
                                                        <td></td>
                                                        <td>0.00</td>
                                                    </>
                                                ) : (
                                                    <>
                                                        <td></td>
                                                        <td>0.00</td>
                                                        <td></td>
                                                        <td>0.00</td>
                                                        <td></td>
                                                        <td>{totalGst.toFixed(2)}</td>
                                                    </>
                                                )}
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                                <div className="tax-summary-right">
                                    <table className="summary-table">
                                        <tbody>
                                            <tr>
                                                <td style={{ fontWeight: '600' }}>Bill Total (Incl. GST):</td>
                                                <td className="text-right" style={{ fontWeight: 'bold' }}>₹{items.reduce((sum, i) => sum + i.total, 0).toFixed(2)}</td>
                                            </tr>
                                            <tr style={{ color: '#555', fontSize: '9pt' }}>
                                                <td>Taxable Value:</td>
                                                <td className="text-right">₹{totalBaseAmount.toFixed(2)}</td>
                                            </tr>
                                            {taxType === "INTER_STATE" ? (
                                                <tr style={{ color: '#555', fontSize: '9pt' }}>
                                                    <td>IGST (Included):</td>
                                                    <td className="text-right">₹{totalGst.toFixed(2)}</td>
                                                </tr>
                                            ) : (
                                                <>
                                                    <tr style={{ color: '#555', fontSize: '9pt' }}>
                                                        <td>CGST (Included):</td>
                                                        <td className="text-right">₹{(totalGst / 2).toFixed(2)}</td>
                                                    </tr>
                                                    <tr style={{ color: '#555', fontSize: '9pt' }}>
                                                        <td>SGST (Included):</td>
                                                        <td className="text-right">₹{(totalGst / 2).toFixed(2)}</td>
                                                    </tr>
                                                </>
                                            )}
                                            <tr style={{ color: '#166534', fontWeight: 'bold', fontSize: '9pt', borderTop: '1px dashed #cbd5e1' }}>
                                                <td>Total Tax Included:</td>
                                                <td className="text-right">₹{totalGst.toFixed(2)}</td>
                                            </tr>
                                            {((data as any).loyaltyDiscount || 0) > 0 && (
                                                <tr>
                                                    <td>Loyalty Discount:</td>
                                                    <td className="text-right text-red-600">-₹{((data as any).loyaltyDiscount || 0).toFixed(2)}</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="amount-words-row">
                                <div className="amount-in-words"><b>Rupees in Words:</b> {numberToWords(finalAmount)}</div>
                                <div className="net-amount-label">NET AMOUNT: ₹{finalAmount.toFixed(2)}</div>
                            </div>

                            <div className="signature-section">
                                <div className="bank-info">
                                    <div style={{ fontWeight: 'bold', textDecoration: 'underline', marginBottom: '2.5mm' }}>Bank Details:</div>
                                    <div>Bank: <b>{bankName}</b></div>
                                    <div>A/C No: <b>{accountNo}</b></div>
                                    <div>IFSC: <b>{ifscCode}</b></div>
                                    <div style={{ fontSize: '8pt', color: '#64748b', marginTop: '2mm' }}>* All rates are inclusive of GST</div>
                                </div>
                                <div className="sign-box">
                                    <div className="sign-top">For {shopName}</div>
                                    <div className="sign-bottom">
                                        <div className="eo-text">E & O.E</div>
                                        <div className="auth-text">Authorised Signatory</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* FOOTER YELLOW BAND */}
                    <div className="footer-yellow-band">
                        <div className="jurisdiction-text">{billMessage}</div>
                        <div className="page-indicator">Page {pageIdx + 1} of {totalPages}</div>
                    </div>
                </div>
            ))}
        </div>
    );
};
