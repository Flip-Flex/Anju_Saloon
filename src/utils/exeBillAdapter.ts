export const mapExeBillData = (source: any) => {
  return {
    invoiceNumber: source.billNo || source.invoiceNumber || source.id,
    customerName: source.customerName || source.customer?.name || source.partyName || "",
    customerPhone: source.customerPhone || source.phone || "",
    customerAddress: source.customerAddress || source.address || "",
    customerGst: source.customerGst || source.gstin || "",
    status: source.status,
    items: (source.items || []).map((item: any) => {
      const q = Number(item.qty || item.quantity || item.billQty || 0);
      const p = Number(item.price || item.unitPrice || item.rate || 0);
      const dp = Number(item.Discount || item.discountRate || 0);
      const discountAmt = Number(item.discountAmount || item.discountAmt || item.discount) || (p * q * (dp / 100));
      const gp = Number(item.gstPercent || item.gstRate || item.GST || 0);

      const subtotal = p * q;
      const amountAfterDiscount = subtotal - discountAmt;
      const calcTaxable = amountAfterDiscount / (1 + (gp / 100));
      const calcGst = amountAfterDiscount - calcTaxable;

      return {
        ...item,
        productName: item.name || item.productName || item.particulars,
        productId: item.productId || item.barcode || item.barcodeNo || item.id || "",
        type: item.type,
        staffName: item.staffName,
        quantity: q,
        unitPrice: p,
        discount: discountAmt,
        gstPercent: gp,
        baseAmount: item.baseAmount || item.taxable || calcTaxable,
        gstAmount: item.gstAmount || calcGst,
        finalAmount: item.finalAmount || item.netAmount || item.total || amountAfterDiscount,
        total: item.finalAmount || item.netAmount || item.total || amountAfterDiscount,
      };
    }),
    subtotal: source.subTotal || source.subtotal || source.totalTaxableAmount || 0,
    finalAmount: source.total || source.totalAmount || source.finalAmount || 0,
    amountPaid: source.amountPaid,
    receivedAmount: source.receivedAmount,
    cashAmount: source.cashAmount,
    onlineAmount: source.onlineAmount,
    cgstAmount: source.cgstAmount || 0,
    sgstAmount: source.sgstAmount || 0,
    igstAmount: source.igstAmount || 0,
    taxType: source.taxType || (source.igstAmount > 0 ? "INTER_STATE" : "INTRA_STATE"),
    totalDiscountAmount: source.totalDiscountAmount || source.discount || 0,
    totalGstAmount: source.totalGstAmount || 0,
    paymentMethod: source.paymentMethod || "Cash",
    billType: source.billType || "RETAIL",
    invoiceMode: source.invoiceMode || "GST_INVOICE",
    createdAt: source.createdAt || new Date().toISOString(),
    settings: {
      gstPercentage: source.settings?.gstPercentage || 0,
      customBillMessage: source.settings?.customBillMessage || ""
    }
  };
};
