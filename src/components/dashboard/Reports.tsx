import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { auth } from '@/lib/firebase';
import { billingApi, Bill, BillDetails, Product } from '@/lib/api';
import { Download, ShoppingCart, TrendingUp, Truck, Filter, Lock } from 'lucide-react';
import { utils, writeFile } from 'xlsx';
import { useGlobalData } from '@/context/GlobalDataContext';

type ReportTab = 'sales' | 'services' | 'products' | 'staff' | 'inventory' | 'profit' | 'appointments' | 'customers';
type PaymentMethod = 'all' | 'cash' | 'card' | 'upi' | 'cash + upi' | 'other';
type SystemType = 'All' | 'Retail';

const Reports = () => {
  const { products: globalProducts, bills: globalBills, cancelledBills: globalCancelled, loading: globalLoading, vendors, appointments: globalAppointments, customers: globalCustomers } = useGlobalData();
  const [activeTab, setActiveTab] = useState<ReportTab>('sales');
  const [data, setData] = useState<any[]>([]);
  const [totalBills, setTotalBills] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<PaymentMethod>('all');
  const [systemTypeFilter, setSystemTypeFilter] = useState<SystemType>('All');
  const [vendorFilter, setVendorFilter] = useState('');
  const [billNoFilter, setBillNoFilter] = useState('');

  // New State for Cancelled Bills
  const [cancelledBills, setCancelledBills] = useState<Bill[]>([]);
  const [showCancelledModal, setShowCancelledModal] = useState(false);

  // New State for Hidden Bills (Estimates)
  const [hiddenBills, setHiddenBills] = useState<Bill[]>([]);
  const [showHiddenBillsModal, setShowHiddenBillsModal] = useState(false);

  // New states for modal filter
  const [modalStartDate, setModalStartDate] = useState('');
  const [modalEndDate, setModalEndDate] = useState('');
  const [isCancelledLoading, setIsCancelledLoading] = useState(false);
  const [isHiddenLoading, setIsHiddenLoading] = useState(false);

  // Sync with main dates when modal opens
  useEffect(() => {
    if (showCancelledModal || showHiddenBillsModal) {
      setModalStartDate(startDate);
      setModalEndDate(endDate);
    }
  }, [showCancelledModal, showHiddenBillsModal]);

  const getDefaultDates = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30);
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
    };
  };

  const parseDateSafe = (val: any): Date | null => {
    if (!val) return null;
    if (val instanceof Date) return val;
    // Handle Firebase Timestamps {seconds, nanoseconds} or {_seconds, _nanoseconds}
    if (typeof val === 'object') {
      const s = val.seconds || val._seconds;
      if (s !== undefined) return new Date(s * 1000);
      if (typeof val.toDate === 'function') return val.toDate();
    }
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  };

  const parseFloatSafe = (val: any): number => {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return val;
    // Handle strings, remove currency symbols and commas
    const cleaned = String(val).replace(/[₹,]/g, '').trim();
    return parseFloat(cleaned) || 0;
  };

  // Check if an item is valid (not on HOLD)
  const isValidItem = (item: BillDetails, bill?: Bill): boolean => {
    const itemPm = ((item as any).paymentMethod || '').toLowerCase().trim();
    if (itemPm) return itemPm !== 'hold';

    // Fallback to bill level if item level is missing
    const billPm = (bill?.paymentMethod || '').toLowerCase().trim();
    return billPm !== 'hold';
  };

  /** Match billing barcode/id normalization (MSRE/MSWS prefixes, leading zeros). */
  const normalizeProductKey = (val?: string): string => {
    if (!val) return '';
    return val.toUpperCase().replace(/^ANJU|^MSRE|^MSWS|^0+/, '').trim();
  };

  const isBillExcludedFromStockDeduction = (bill: Bill): boolean => {
    const billPm = (bill.paymentMethod || '').toLowerCase().trim();
    const status = (bill.status || '').toUpperCase();
    if (status === 'CANCELLED' || billPm === 'cancelled') return true;
    if (status === 'HOLD' || billPm === 'hold') return true;
    if (bill.billType === 'ESTIMATE') return true;
    return false;
  };

  /**
   * Reconstruct original purchased qty for existing products:
   * current stock + all historical sales (sales reduce stock only, not purchase records).
   */
  const buildSoldQuantityByProductId = (bills: Bill[], products: Product[]): Map<string, number> => {
    const keyToProductId = new Map<string, string>();
    products.forEach(p => {
      const keys = [
        p.id,
        p.barcode,
        normalizeProductKey(p.id),
        normalizeProductKey(p.barcode),
        `name:${(p.name || '').toLowerCase().trim()}`,
      ].filter(Boolean) as string[];
      keys.forEach(key => keyToProductId.set(key, p.id));
    });

    const soldByProductId = new Map<string, number>();
    bills.forEach(bill => {
      if (isBillExcludedFromStockDeduction(bill)) return;
      const billItems = bill.items || (bill as any).billDetails || [];
      billItems.forEach(item => {
        if (!isValidItem(item, bill)) return;
        const qty = parseInt(String(item.quantity), 10) || 0;
        if (qty <= 0) return;

        const productId = String((item as any).productId || '').trim();
        const lookupKeys = [
          productId,
          normalizeProductKey(productId),
          `name:${(item.productName || '').toLowerCase().trim()}`,
        ].filter(Boolean);

        let resolvedId: string | undefined;
        for (const key of lookupKeys) {
          if (keyToProductId.has(key)) {
            resolvedId = keyToProductId.get(key);
            break;
          }
        }
        if (!resolvedId) return;

        soldByProductId.set(resolvedId, (soldByProductId.get(resolvedId) || 0) + qty);
      });
    });
    return soldByProductId;
  };

  const getPurchasedQuantity = (product: Product, soldByProductId: Map<string, number>): number => {
    const stock = Number(product.stockQuantity) || 0;
    const sold = soldByProductId.get(product.id) || 0;
    return stock + sold;
  };

  // Safely get payment method: item > bill > fallback
  const getPaymentMethod = (item: BillDetails, bill: Bill): string => {
    const itemPm = ((item as any).paymentMethod || '').toLowerCase().trim();
    if (itemPm && itemPm !== 'hold' && itemPm !== 'split payment') return itemPm;

    const billPm = (bill.paymentMethod || '').toLowerCase().trim();
    if (billPm && billPm !== 'hold' && billPm !== 'split payment') return billPm;

    // Backward compatibility for legacy "Split Payment" string
    if (billPm === 'split payment' || itemPm === 'split payment') return 'cash + upi';

    return 'other';
  };

  // Enhanced display: show split breakdown if CASH + UPI
  const getDisplayPaymentMethod = (item: BillDetails, bill: Bill): React.ReactNode => {
    const pm = getPaymentMethod(item, bill).toUpperCase();
    if (pm === 'CASH + UPI') {
      const cash = (bill as any).cashAmount ?? 0;
      const online = (bill as any).onlineAmount ?? 0;
      if (cash > 0 || online > 0) {
        return (
          <span>
            CASH (₹{(cash || 0).toFixed(0)}) +<br />
            UPI (₹{(online || 0).toFixed(0)})
          </span>
        );

      }
    }
    return pm;
  };

  const fetchCancelledReportsOnly = async () => {
    setIsCancelledLoading(true);
    try {
      const bills: Bill[] = globalCancelled;

      const start = modalStartDate ? new Date(modalStartDate) : null;
      const end = modalEndDate ? new Date(modalEndDate) : null;
      if (end) end.setHours(23, 59, 59, 999);

      const filtered = bills.filter(b => {
        const dateValue = b.createdAt || (b as any).date || (b as any).billDate;
        const d = parseDateSafe(dateValue);
        if (start && d && d < start) return false;
        if (end && d && d > end) return false;
        return true; 
      });
      setCancelledBills(filtered);
    } catch (e) {
      console.error(e);
      toast.error("Failed to filter cancelled bills");
    } finally {
      setIsCancelledLoading(false);
    }
  };

  const fetchHiddenReportsOnly = async () => {
    setIsHiddenLoading(true);
    try {
      const bills: Bill[] = globalBills;

      const start = modalStartDate ? new Date(modalStartDate) : null;
      const end = modalEndDate ? new Date(modalEndDate) : null;
      if (end) end.setHours(23, 59, 59, 999);

      // Filter for ESTIMATE bills (Hidden Bills)
      const estimates = bills.filter(bill => {
        const dateValue = bill.createdAt || (bill as any).date || (bill as any).billDate;
        const d = parseDateSafe(dateValue);
        if (start && d && d < start) return false;
        if (end && d && d > end) return false;

        const billPm = (bill.paymentMethod || '').toLowerCase().trim();
        const status = (bill.status || '').toUpperCase();
        const isCancelled = status === 'CANCELLED' || billPm === 'cancelled';
        const isHold = status === 'HOLD' || billPm === 'hold';
        return (
          bill.billType === 'ESTIMATE' &&
          (status === 'PAID' || !bill.status) &&
          !isCancelled &&
          !isHold
        );
      });
      setHiddenBills(estimates);
    } catch (e) {
      console.error(e);
      toast.error("Failed to filter hidden bills");
    } finally {
      setIsHiddenLoading(false);
    }
  };

  const downloadCancelledExcel = () => {
    if (!cancelledBills.length) return toast.error("No data to export");
    const rows: any[] = [];
    cancelledBills.forEach(bill => {
      if (!bill.items || bill.items.length === 0) {
        rows.push({
          'Bill ID': bill.id,
          'Date': new Date(bill.createdAt).toLocaleDateString('en-GB'),
          'Status': 'CANCELLED',
          'Product': '-',
          'Quantity': 0,
          'Price': 0,
          'Total': 0
        });
      } else {
        bill.items.forEach(item => {
          rows.push({
            'Bill ID': bill.id,
            'Date': new Date(bill.createdAt).toLocaleDateString('en-GB'),
            'Status': 'CANCELLED',
            'Product': item.productName,
            'Quantity': item.quantity,
            'Price': (parseFloatSafe(item.unitPrice) || 0).toFixed(2),
            'Total': (item.netAmount || 0).toFixed(2)
          });
        });
      }
    });

    const ws = utils.json_to_sheet(rows);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Cancelled Bills");
    writeFile(wb, `Cancelled_Bills_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const downloadHiddenExcel = () => {
    if (!hiddenBills.length) return toast.error("No hidden bills to export");
    const rows: any[] = [];
    hiddenBills.forEach(bill => {
      bill.items.forEach(item => {
        rows.push({
          'Bill ID': bill.id,
          'Date': new Date(bill.createdAt).toLocaleDateString('en-GB'),
          'Type': 'ESTIMATE',
          'Customer': bill.customerName || 'Walk-in',
          'Product': item.productName,
          'Quantity': item.quantity,
          'Price': (parseFloatSafe(item.unitPrice) || 0).toFixed(2),
          'Total': (item.netAmount || 0).toFixed(2)
        });
      });
    });

    const ws = utils.json_to_sheet(rows);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Hidden Bills");
    writeFile(wb, `Hidden_Bills_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const fetchReports = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;
      if (end) end.setHours(23, 59, 59, 999);

      const isWithinRange = (dateSource: any) => {
        const d = parseDateSafe(dateSource);
        if (!d) return true;
        if (start && d < start) return false;
        if (end && d > end) return false;
        return true;
      };

      const filterBySystemType = (bill: Bill | Product) => {
        if (systemTypeFilter === 'All') return true;
        return (bill as any).systemType === systemTypeFilter;
      };

      const filterByPayment = (item: BillDetails, bill: Bill) => {
        if (paymentFilter === 'all') return true;
        return getPaymentMethod(item, bill) === paymentFilter;
      };

      // --- Filter Cancelled ---
      const cancelled = globalCancelled.filter(b => {
        const dateValue = b.createdAt || (b as any).date || (b as any).billDate;
        return isWithinRange(dateValue) && filterBySystemType(b);
      });
      setCancelledBills(cancelled);

      const productsToUse = globalProducts;

      const productByName = new Map<string, Product>();
      productsToUse.forEach(p => {
        productByName.set(p.name, p);
      });

      const uniqueBillIds = new Set<string>();
      const estimates: Bill[] = [];
      const validForReport: Bill[] = [];

      globalBills.forEach(bill => {
        const billPm = (bill.paymentMethod || '').toLowerCase().trim();
        const status = (bill.status || '').toUpperCase();
        const isCancelled = status === 'CANCELLED' || billPm === 'cancelled';
        const isHold = status === 'HOLD' || (billPm === 'hold' && !status);
        const isEstimate = bill.billType === 'ESTIMATE';

        const dateValue = bill.createdAt || (bill as any).date || (bill as any).billDate;
        if (!isWithinRange(dateValue)) return;
        if (!filterBySystemType(bill)) return;
        if (isCancelled) return;
        if (isHold) return;

        if (isEstimate) {
          estimates.push(bill);
          return;
        }

        const billItems = bill.items || (bill as any).billDetails || [];
        if (billItems.some(it => isValidItem(it, bill))) {
          validForReport.push(bill);
          uniqueBillIds.add(bill.id || (bill as any)._id);
        }
      });

      setTotalBills(uniqueBillIds.size);
      setHiddenBills(estimates);
      const validBills = validForReport;

      if (['sales', 'services', 'products'].includes(activeTab)) {
        let serial = 1;
        const salesData = validBills
          .sort((a, b) => {
            const dA = parseDateSafe(a.createdAt || (a as any).date || (a as any).billDate);
            const dB = parseDateSafe(b.createdAt || (b as any).date || (b as any).billDate);
            return (dB?.getTime() || 0) - (dA?.getTime() || 0);
          })
          .flatMap(bill => {
            const billItems = bill.items || (bill as any).billDetails || [];
            const parsedDate = parseDateSafe(bill.createdAt || (bill as any).date || (bill as any).billDate);
            return billItems
              .filter(item => isValidItem(item, bill))
              .filter(item => filterByPayment(item, bill))
              .filter(item => {
                const isService = (item as any).type?.toUpperCase() === 'SERVICE';
                if (activeTab === 'services') return isService;
                if (activeTab === 'products') return !isService;
                return true;
              })
              .map(item => {
                const unitPrice = parseFloatSafe(item.unitPrice);
                const subtotal = unitPrice * item.quantity;
                const discountAmount = parseFloatSafe(item.discountAmount || 0);
                const discountPercent = subtotal > 0 ? ((discountAmount / subtotal) * 100).toFixed(2) : '0.00';
                const totalExGst = subtotal - discountAmount;
                return {
                  'S.No': serial++,
                  'Bill ID': bill.id || (bill as any)._id || '',
                  Date: parsedDate ? parsedDate.toLocaleDateString('en-GB') : '-',
                  Customer: bill.customerName || 'Walk-in',
                  Item: item.productName,
                  Type: (item as any).type?.toUpperCase() === 'SERVICE' ? 'Service' : 'Product',
                  Quantity: item.quantity,
                  Price: (unitPrice || 0).toFixed(2),
                  'Discount (₹)': (discountAmount || 0).toFixed(2),
                  'Discount (%)': discountPercent,
                  GST: (parseFloatSafe(item.gstAmount || 0) || 0).toFixed(2),
                  Total: (totalExGst || 0).toFixed(0),
                  'Payment Method': getDisplayPaymentMethod(item, bill),
                };
              });
          });
        setData(salesData);
      } else if (activeTab === 'staff') {
        let serial = 1;
        const staffData = validBills
          .sort((a, b) => {
            const dA = parseDateSafe(a.createdAt || (a as any).date || (a as any).billDate);
            const dB = parseDateSafe(b.createdAt || (b as any).date || (b as any).billDate);
            return (dB?.getTime() || 0) - (dA?.getTime() || 0);
          })
          .flatMap(bill => {
            const billItems = bill.items || (bill as any).billDetails || [];
            const parsedDate = parseDateSafe(bill.createdAt || (bill as any).date || (bill as any).billDate);
            return billItems
              .filter(item => isValidItem(item, bill))
              .filter(item => filterByPayment(item, bill))
              .filter(item => (item as any).staffId) // Only items with assigned staff
              .map(item => {
                const unitPrice = parseFloatSafe(item.unitPrice);
                const subtotal = unitPrice * item.quantity;
                const discountAmount = parseFloatSafe(item.discountAmount || 0);
                const totalExGst = subtotal - discountAmount;
                return {
                  'S.No': serial++,
                  'Staff': (item as any).staffName || '-',
                  'Bill ID': bill.id || '',
                  Date: parsedDate ? parsedDate.toLocaleDateString('en-GB') : '-',
                  Service: item.productName,
                  'Service Amount': (totalExGst || 0).toFixed(0),
                  'Commission Type': (item as any).commissionType || '-',
                  'Commission Value': (item as any).commissionValue || '0',
                  'Commission Earned': ((item as any).staffCommissionAmount || 0).toFixed(0),
                };
              });
          });
        setData(staffData);
      } else if (activeTab === 'inventory') {
        const soldByProductId = buildSoldQuantityByProductId(globalBills, productsToUse);
        let serial = 1;
        const inventoryData = productsToUse
          .filter(p => isWithinRange(p.createdAt) && filterBySystemType(p))
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .map(p => {
            const purchasedQty = getPurchasedQuantity(p, soldByProductId);
            const cost = p.purchaseRate * purchasedQty;
            const gst = cost * (p.purchaseGst / 100);
            return {
              'S.No': serial++,
              Date: new Date(p.createdAt).toLocaleDateString('en-GB'),
              Supplier: p.vendorName || '-',
              Product: p.name,
              Category: p.category,
              Price: (p.purchaseRate || 0).toFixed(2),
              GST: (gst || 0).toFixed(2),
              'Stock In': purchasedQty,
              'Sold': soldByProductId.get(p.id) || 0,
              'Current Stock': p.stockQuantity,
              Total: (cost || 0).toFixed(0),
            };
          });
        setData(inventoryData);
      } else if (activeTab === 'profit') {
        let serial = 1;
        const profitData = validBills
          .sort((a, b) => {
            const dA = parseDateSafe(a.createdAt || (a as any).date || (a as any).billDate);
            const dB = parseDateSafe(b.createdAt || (b as any).date || (b as any).billDate);
            return (dB?.getTime() || 0) - (dA?.getTime() || 0);
          })
          .flatMap(bill => {
            const billItems = bill.items || (bill as any).billDetails || [];
            const parsedDate = parseDateSafe(bill.createdAt || (bill as any).date || (bill as any).billDate);
            return billItems
              .filter(item => isValidItem(item, bill))
              .filter(item => filterByPayment(item, bill))
              .map(item => {
                const product = productByName.get(item.productName) || ({} as Product);
                const unitPrice = parseFloatSafe(item.unitPrice);
                const soldExGst = parseFloatSafe(item.netAmount || 0) - parseFloatSafe(item.gstAmount || 0);
                const purchaseRate = parseFloatSafe(item.purchaseRate || product.purchaseRate || 0);
                const purchaseCost = purchaseRate * item.quantity;
                const subtotal = unitPrice * item.quantity;
                const discountAmount = parseFloatSafe(item.discountAmount || 0);
                const discountPercent = subtotal > 0 ? ((discountAmount / subtotal) * 100).toFixed(2) : '0.00';
                const profitAmount = soldExGst - purchaseCost;
                const profitPercent = purchaseCost > 0 ? ((profitAmount / purchaseCost) * 100).toFixed(2) : '100.00';
                return {
                  'S.No': serial++,
                  'Bill ID': bill.id || (bill as any)._id || '',
                  Date: parsedDate ? parsedDate.toLocaleDateString('en-GB') : '-',
                  Category: product.category || '-',
                  Item: item.productName,
                  Type: (item as any).type?.toUpperCase() === 'SERVICE' ? 'Service' : 'Product',
                  Quantity: item.quantity,
                  Purchase: (purchaseCost || 0).toFixed(0),
                  Sold: (soldExGst || 0).toFixed(0),
                  'Discount (₹)': (discountAmount || 0).toFixed(0),
                  'Profit (₹)': (profitAmount || 0).toFixed(0),
                  'Profit (%)': (profitPercent || "0.00") + '%',
                  'Payment Method': getDisplayPaymentMethod(item, bill),
                };
              });
          });
        setData(profitData);
      } else if (activeTab === 'appointments') {
        let serial = 1;
        const apptData = globalAppointments
          .filter(a => isWithinRange(a.date))
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .map(a => ({
            'S.No': serial++,
            Date: a.date ? new Date(a.date).toLocaleDateString('en-GB') : '-',
            Time: (a.startTime ? `${a.startTime}${a.endTime ? ' - ' + a.endTime : ''}` : a.time) || '-',
            Customer: a.customerName || '-',
            Service: a.serviceName || (Array.isArray(a.serviceNames) && a.serviceNames.length > 0 ? a.serviceNames.join(', ') : (a.serviceIds?.length ? `${a.serviceIds.length} service(s)` : '-')),
            Staff: a.staffName || '-',
            Status: a.status || 'SCHEDULED'
          }));
        setData(apptData);
      } else if (activeTab === 'customers') {
        let serial = 1;
        const customerData = globalCustomers
          .sort((a, b) => (b.loyaltyPoints || 0) - (a.loyaltyPoints || 0))
          .map(c => ({
            'S.No': serial++,
            Name: c.name,
            Phone: c.phone || '-',
            Visits: c.visitCount || 0,
            'Total Spent': (c.totalSpent || 0).toFixed(0),
            'Loyalty Points': c.loyaltyPoints || 0,
            'Last Visit': c.lastVisit ? new Date(c.lastVisit).toLocaleDateString('en-GB') : '-'
          }));
        setData(customerData);
      }
    } catch (err: any) {
      console.error('Error fetching reports:', err);
      setError('Failed to load reports.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [activeTab, startDate, endDate, paymentFilter, systemTypeFilter, globalBills, globalProducts, globalAppointments, globalCustomers]);

  const exportExcel = () => {
    if (!filteredData.length) { toast.error('No data.'); return; }
    const numericKeys: string[] = ['Quantity', 'Price', 'Discount (₹)', 'GST', 'Total', 'Service Amount', 'Commission Earned'];
    const totals: any = { 'S.No': 'Total' };
    filteredData.forEach(row => numericKeys.forEach(key => {
      const val = parseFloat(String(row[key] ?? '0').replace('₹', '').replace('%', '').trim());
      if (!isNaN(val)) totals[key] = (totals[key] || 0) + val;
    }));
    numericKeys.forEach(key => totals[key] = parseFloat((totals[key] || 0).toFixed(2)));
    const processedData = [...filteredData, totals].map(row => {
      const newRow = { ...row };
      Object.keys(newRow).forEach(key => {
        if (typeof newRow[key] === 'object' && newRow[key] !== null) {
          // If it's a React element (like the one from getDisplayPaymentMethod), 
          // we should use a string representation for Excel.
          if (key === 'Payment Method') {
            newRow[key] = 'CASH + UPI';
          }
        }
      });
      return newRow;
    });
    const ws = utils.json_to_sheet(processedData);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, activeTab);
    writeFile(wb, `${activeTab}_report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const filteredData = data.filter((row: any) => {
    let matchVendor = true;
    if (vendorFilter && vendorFilter !== 'ALL') {
      const rowVendor = row.Supplier || row.Customer || row['Customer Mode'] || '';
      matchVendor = rowVendor.toLowerCase().includes(vendorFilter.toLowerCase());
    }
    let matchBill = true;
    if (billNoFilter) {
      const rowBill = row['Bill ID'] || row['Bill No'] || row['Barcode'] || '';
      matchBill = rowBill.toLowerCase().includes(billNoFilter.toLowerCase());
    }
    return matchVendor && matchBill;
  });

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
          Reports Dashboard
          <button onClick={() => setShowHiddenBillsModal(true)} className="opacity-20 hover:opacity-100 p-1 text-gray-400 hover:text-gray-800">
            <Lock size={16} />
          </button>
        </h1>
        <div className="flex gap-3">
          <button onClick={() => setShowCancelledModal(true)} className="px-3 py-1.5 text-sm text-sm bg-red-600 text-white rounded-lg flex items-center gap-2 hover:bg-red-700">
            <Filter size={18} /> View Cancelled
          </button>
          <button onClick={exportExcel} className="px-3 py-1.5 text-sm text-sm bg-green-600 text-white rounded-lg flex items-center gap-2 hover:bg-green-700">
            <Download size={18} /> Export Excel
          </button>
        </div>
      </header>

      {showCancelledModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b bg-red-50 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-red-800">Cancelled Bills</h2>
              <button onClick={() => setShowCancelledModal(false)} className="text-gray-500 hover:text-red-600 text-2xl font-bold">&times;</button>
            </div>
            <div className="p-4 border-b flex flex-wrap gap-4 items-end">
              <div><label className="block text-xs font-semibold mb-1">From</label><input type="date" value={modalStartDate} onChange={e => setModalStartDate(e.target.value)} className="border rounded p-1" /></div>
              <div><label className="block text-xs font-semibold mb-1">To</label><input type="date" value={modalEndDate} onChange={e => setModalEndDate(e.target.value)} className="border rounded p-1" /></div>
              <button onClick={fetchCancelledReportsOnly} className="bg-blue-600 text-white px-4 py-1.5 rounded">Filter</button>
              <button onClick={downloadCancelledExcel} className="bg-green-600 text-white px-4 py-1.5 rounded">Export</button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {cancelledBills.length === 0 ? <p className="text-center py-10">No records.</p> : cancelledBills.map(b => (
                <div key={b.id} className="border rounded p-4 mb-4 bg-red-50/20">
                  <p className="font-bold">{b.id} - {new Date(b.createdAt).toLocaleString()}</p>
                  <table className="w-full mt-2 text-sm">
                    <tr className="border-b"><th>Item</th><th>Qty</th><th>Total</th></tr>
                    {b.items.map((it, idx) => <tr key={idx}><td>{it.productName}</td><td>{it.quantity}</td><td>₹{it.netAmount}</td></tr>)}
                  </table>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showHiddenBillsModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-5xl max-h-[85vh] overflow-hidden flex flex-col border-2 border-slate-700">
            <div className="p-6 border-b bg-slate-100 flex justify-between items-center">
              <h2 className="text-2xl font-bold">Hidden Bills (Estimates)</h2>
              <button onClick={() => setShowHiddenBillsModal(false)} className="text-gray-500 hover:text-slate-800 text-2xl font-bold">&times;</button>
            </div>
            <div className="p-4 border-b flex flex-wrap gap-4 items-end">
              <div><label className="block text-xs font-semibold mb-1">From</label><input type="date" value={modalStartDate} onChange={e => setModalStartDate(e.target.value)} className="border rounded p-1" /></div>
              <div><label className="block text-xs font-semibold mb-1">To</label><input type="date" value={modalEndDate} onChange={e => setModalEndDate(e.target.value)} className="border rounded p-1" /></div>
              <button onClick={fetchHiddenReportsOnly} className="bg-slate-700 text-white px-4 py-1.5 rounded">Filter</button>
              <button onClick={downloadHiddenExcel} className="bg-green-600 text-white px-4 py-1.5 rounded">Export</button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 bg-slate-50">
              {hiddenBills.map(b => (
                <div key={b.id} className="border rounded p-4 mb-4 bg-white shadow-sm">
                  <div className="flex justify-between font-bold"><span>{b.id}</span><span>₹{b.finalAmount}</span></div>
                  <p className="text-xs text-slate-500">{new Date(b.createdAt).toLocaleString()}</p>
                  <table className="w-full mt-2 text-sm">
                    {b.items.map((it, idx) => <tr key={idx}><td>{it.productName}</td><td>{it.quantity}</td><td className="text-right">₹{it.netAmount}</td></tr>)}
                  </table>
                </div>
              ))}
            </div>
            <div className="p-4 bg-slate-100 font-bold text-right text-xl px-8">Total: ₹{(hiddenBills.reduce((s, b) => s + (b.finalAmount || 0), 0) || 0).toFixed(2)}</div>
          </div>
        </div>
      )}

      <div className="bg-white p-6 rounded-lg shadow-sm flex flex-wrap items-end gap-6">
        <div><label className="block text-sm font-medium">From</label><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="mt-1 border rounded p-2" /></div>
        <div><label className="block text-sm font-medium">To</label><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="mt-1 border rounded p-2" /></div>
        <select value={paymentFilter} onChange={e => setPaymentFilter(e.target.value as any)} className="mt-1 border rounded p-2">
          <option value="all">All Payments</option>
          <option value="cash">Cash</option>
          <option value="upi">UPI</option>
          <option value="cash + upi">CASH + UPI</option>
          <option value="card">Card</option>
          <option value="other">Other</option>
        </select>
        
        <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium">Filter by Vendor</label>
            <input
                type="text"
                list="report-vendor-list"
                placeholder="Search Vendor..."
                className="mt-1 w-full border rounded p-2"
                value={vendorFilter}
                onChange={e => setVendorFilter(e.target.value)}
            />
            <datalist id="report-vendor-list">
                {vendors.map(v => (
                    <option key={v.id} value={v.name} />
                ))}
            </datalist>
        </div>
        <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium">Bill No</label>
            <input
                type="text"
                placeholder="Search Bill No..."
                className="mt-1 w-full border rounded p-2"
                value={billNoFilter}
                onChange={e => setBillNoFilter(e.target.value)}
            />
        </div>

        <span className="ml-auto text-blue-900 font-extrabold text-2xl tracking-wide">Count: {new Set(filteredData.map(r => r['Bill ID'] || r['Barcode'])).size}</span>
      </div>

      <div className="bg-white p-2 rounded-lg shadow-sm flex gap-2 overflow-x-auto">
        <Tab icon={ShoppingCart} label="All Sales" active={activeTab === 'sales'} onClick={() => setActiveTab('sales')} />
        <Tab icon={TrendingUp} label="Service Sales" active={activeTab === 'services'} onClick={() => setActiveTab('services')} />
        <Tab icon={ShoppingCart} label="Product Sales" active={activeTab === 'products'} onClick={() => setActiveTab('products')} />
        <Tab icon={TrendingUp} label="Staff Commissions" active={activeTab === 'staff'} onClick={() => setActiveTab('staff')} />
        <Tab icon={Truck} label="Inventory" active={activeTab === 'inventory'} onClick={() => setActiveTab('inventory')} />
        <Tab icon={TrendingUp} label="Profit" active={activeTab === 'profit'} onClick={() => setActiveTab('profit')} />
        <Tab icon={Filter} label="Appointments" active={activeTab === 'appointments'} onClick={() => setActiveTab('appointments')} />
        <Tab icon={Filter} label="Customers" active={activeTab === 'customers'} onClick={() => setActiveTab('customers')} />
      </div>

      {isLoading ? <div className="text-center py-20">Loading...</div> : <ReportTable data={filteredData} activeTab={activeTab} totalBills={totalBills} />}
    </div>
  );
};

const Tab = ({ icon: Icon, label, active, onClick }: any) => (
  <button onClick={onClick} className={`flex-1 py-3 px-4 rounded-md font-semibold flex items-center justify-center gap-2 transition ${active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
    <Icon size={18} /> {label}
  </button>
);

const ReportTable = ({ data, activeTab, totalBills }: { data: any[]; activeTab: ReportTab; totalBills: number }) => {
  if (!data.length) return <div className="text-center py-20">No data found.</div>;
  const headers = Object.keys(data[0]);
  const moneyCols = new Set(['Price', 'Discount (₹)', 'GST', 'Total', 'Purchase', 'Sold', 'Profit (₹)']);
  const quantityCols = new Set(['Quantity', 'Stock']);

  const totals: any = {};
  data.forEach(row => headers.forEach(h => {
    if (moneyCols.has(h) || quantityCols.has(h)) {
      const val = parseFloat((row[h] || '0').toString().replace('₹', '').replace('%', '').trim());
      if (!isNaN(val)) totals[h] = (totals[h] || 0) + val;
    }
  }));

  const formatTotal = (h: string) => {
    if (quantityCols.has(h)) return totals[h]?.toFixed(0) || '0';
    if (moneyCols.has(h)) return `₹${totals[h]?.toFixed(0) || 0}`;
    return '';
  };

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-x-auto border mt-4">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50 border-b"><tr>{headers.map(h => <th key={h} className="p-4">{h}</th>)}</tr></thead>
        <tbody>
          {data.map((row, i) => <tr key={i} className="border-t">
            {headers.map(h => <td key={h} className="p-4">{moneyCols.has(h) ? `₹${row[h]}` : row[h]}</td>)}
          </tr>)}
          <tr className="border-t font-bold bg-green-50">
            {headers.map(h => <td key={h} className="p-4">{h === 'S.No' ? 'TOTAL' : formatTotal(h)}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default Reports;
