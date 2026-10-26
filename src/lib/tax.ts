/**
 * ANJU SALOON ERP — CANONICAL TAX & FINANCIAL CALCULATION ENGINE
 * 
 * Centralized, authoritative calculation utility for all GST, discount,
 * taxable amount, and line item financial operations across:
 * - POS Checkout (Billing.tsx)
 * - Bill Preview & Estimation
 * - Thermal Receipts
 * - A4 Invoices (WholesaleBillLayout.tsx)
 * - Bill Reprints (PrintedBills.tsx)
 * - Reports & Analytics (Reports.tsx)
 * 
 * Default model: GST-INCLUSIVE for retail salon services and cosmetic products.
 */

export interface ItemTaxCalculation {
  subtotal: number;
  discountAmount: number;
  netAmount: number;
  taxableAmount: number;
  gstAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  finalAmount: number;
}

export interface BillTaxTotals {
  subtotal: number;
  totalDiscountAmount: number;
  totalTaxableAmount: number;
  totalGstAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  finalAmount: number;
  items: Array<any & ItemTaxCalculation>;
}

export type TaxType = 'INTRA_STATE' | 'INTER_STATE';

/**
 * Rounds a number to exactly 2 decimal places to avoid IEEE-754 floating point issues.
 */
export const round2 = (num: number): number => {
  return Math.round((Number(num) || 0) * 100) / 100;
};

/**
 * Calculates tax breakdown for an individual line item.
 * 
 * @param unitPrice Price per unit (e.g. ₹500 for a haircut)
 * @param quantity Number of units (e.g. 1)
 * @param discountRate Percentage discount on item (0 - 100)
 * @param gstRate Percentage GST (e.g. 18 for 18% GST)
 * @param isInclusive Whether unitPrice is inclusive of GST (true for salon retail)
 * @param taxType 'INTRA_STATE' (CGST+SGST) or 'INTER_STATE' (IGST)
 */
export const calculateItemTax = (
  unitPrice: number,
  quantity: number,
  discountRate: number = 0,
  gstRate: number = 0,
  isInclusive: boolean = true,
  taxType: TaxType = 'INTRA_STATE'
): ItemTaxCalculation => {
  const price = Math.max(0, Number(unitPrice) || 0);
  const qty = Math.max(0, Number(quantity) || 0);
  const discPct = Math.max(0, Math.min(100, Number(discountRate) || 0));
  const rate = Math.max(0, Number(gstRate) || 0);

  const subtotal = round2(price * qty);
  const discountAmount = round2(subtotal * (discPct / 100));
  const netAmount = round2(Math.max(0, subtotal - discountAmount));

  let taxableAmount = 0;
  let gstAmount = 0;
  let finalAmount = 0;

  if (isInclusive) {
    // GST-INCLUSIVE: Menu price includes GST
    // Taxable = Net / (1 + (GST / 100))
    // GST = Net - Taxable
    // Final = Net
    if (rate > 0) {
      taxableAmount = round2(netAmount / (1 + (rate / 100)));
      gstAmount = round2(netAmount - taxableAmount);
    } else {
      taxableAmount = netAmount;
      gstAmount = 0;
    }
    finalAmount = netAmount;
  } else {
    // GST-EXCLUSIVE: Tax is added on top of base price
    taxableAmount = netAmount;
    gstAmount = round2(taxableAmount * (rate / 100));
    finalAmount = round2(taxableAmount + gstAmount);
  }

  const cgstAmount = taxType === 'INTRA_STATE' ? round2(gstAmount / 2) : 0;
  const sgstAmount = taxType === 'INTRA_STATE' ? round2(gstAmount / 2) : 0;
  const igstAmount = taxType === 'INTER_STATE' ? gstAmount : 0;

  return {
    subtotal,
    discountAmount,
    netAmount,
    taxableAmount,
    gstAmount,
    cgstAmount,
    sgstAmount,
    igstAmount,
    finalAmount
  };
};

/**
 * Calculates standardized tax totals for an entire bill from its line items.
 */
export const calculateBillTotals = (
  items: Array<{
    unitPrice?: number;
    price?: number;
    quantity?: number;
    qty?: number;
    discountRate?: number;
    Discount?: number;
    gstRate?: number;
    GST?: number;
    isInclusive?: boolean;
  }>,
  overallBillDiscountPercent: number = 0,
  defaultIsInclusive: boolean = true,
  taxType: TaxType = 'INTRA_STATE'
): BillTaxTotals => {
  let subtotal = 0;
  let totalItemDiscount = 0;
  let totalTaxableAmount = 0;
  let totalGstAmount = 0;
  let cgstTotal = 0;
  let sgstTotal = 0;
  let igstTotal = 0;

  const calculatedItems = (items || []).map((item) => {
    const price = Number(item.unitPrice ?? item.price ?? 0);
    const qty = Number(item.quantity ?? item.qty ?? 1);
    const discPct = Number(item.discountRate ?? item.Discount ?? 0);
    const gstPct = Number(item.gstRate ?? item.GST ?? 0);
    const inclusive = item.isInclusive !== undefined ? item.isInclusive : defaultIsInclusive;

    const calc = calculateItemTax(price, qty, discPct, gstPct, inclusive, taxType);

    subtotal = round2(subtotal + calc.subtotal);
    totalItemDiscount = round2(totalItemDiscount + calc.discountAmount);
    totalTaxableAmount = round2(totalTaxableAmount + calc.taxableAmount);
    totalGstAmount = round2(totalGstAmount + calc.gstAmount);
    cgstTotal = round2(cgstTotal + calc.cgstAmount);
    sgstTotal = round2(sgstTotal + calc.sgstAmount);
    igstTotal = round2(igstTotal + calc.igstAmount);

    return {
      ...item,
      ...calc
    };
  });

  // If there is an overall bill-level discount:
  let finalAmount = round2(calculatedItems.reduce((acc, it) => acc + it.finalAmount, 0));
  let overallDiscountAmount = 0;

  if (overallBillDiscountPercent > 0) {
    const pct = Math.max(0, Math.min(100, Number(overallBillDiscountPercent)));
    overallDiscountAmount = round2(finalAmount * (pct / 100));
    finalAmount = round2(Math.max(0, finalAmount - overallDiscountAmount));
  }

  const totalDiscountAmount = round2(totalItemDiscount + overallDiscountAmount);

  return {
    subtotal,
    totalDiscountAmount,
    totalTaxableAmount,
    totalGstAmount,
    cgstAmount: cgstTotal,
    sgstAmount: sgstTotal,
    igstAmount: igstTotal,
    finalAmount,
    items: calculatedItems
  };
};
