import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart,
  Package, AlertTriangle, Download, Users, Check, X, Pencil, Calendar,
  Crown, Award, Medal, Sparkles, Scissors, Flame, ArrowUpRight, UserCheck, Star,
  Search, Filter, Building2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer
} from 'recharts';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { format, subDays, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, startOfYear, endOfMonth, endOfYear, addDays } from 'date-fns';
import { billingApi, productApi, daybookApi, vendorApi, appointmentApi, customerApi, staffApi, Bill, Product, Vendor, DayBookEntry, Appointment, Customer, Staff } from '@/lib/api';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import LowStockProductsModal from './LowStockProductsModal';

type DashboardPeriod = 'day' | 'week' | 'month' | 'year';

const DashboardOverview = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [dashboardView, setDashboardView] = useState<DashboardPeriod>('day');
  const [isLowStockModalOpen, setIsLowStockModalOpen] = useState(false);

  // Raw data
  const [bills, setBills] = useState<Bill[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [expenses, setExpenses] = useState<DayBookEntry[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [chartDataFetched, setChartDataFetched] = useState<any[]>([]);

  // UI state
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ purchaseRate: number, sellingPrice: number }>({ purchaseRate: 0, sellingPrice: 0 });
  const [selectedProductDetails, setSelectedProductDetails] = useState<any | null>(null);
  const [priceMarginSearch, setPriceMarginSearch] = useState("");
  
  // Analytics section UI state
  const [analyticsTab, setAnalyticsTab] = useState<'products' | 'services'>('products');
  const [productSearchTerm, setProductSearchTerm] = useState("");
  const [productSortBy, setProductSortBy] = useState<'qty' | 'revenue' | 'margin'>('qty');
  const [staffSearchTerm, setStaffSearchTerm] = useState("");

  const getDateRange = (view: DashboardPeriod) => {
    const now = new Date();
    if (view === 'day') {
      // Day view implies current week days (Mon-Sat)
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    }
    if (view === 'week') {
      // Week view implies weeks of current month (1st Week to 5th Week)
      return { start: startOfMonth(now), end: endOfMonth(now) };
    }
    if (view === 'month') {
      return { start: startOfMonth(now), end: endOfMonth(now) };
    }
    return { start: startOfYear(now), end: endOfYear(now) };
  };

  const handleEditClick = (product: Product) => {
    setEditingProductId(product.id || null);
    setEditValues({
      purchaseRate: product.purchaseRate || 0,
      sellingPrice: product.sellingPrice || 0
    });
  };

  const handleSaveEdit = async (productId: string) => {
    if (editValues.purchaseRate <= 0) {
      toast({ title: 'Invalid Input', description: 'Buying price must be greater than 0', variant: 'destructive' });
      return;
    }
    if (editValues.sellingPrice < editValues.purchaseRate) {
      toast({ title: 'Invalid Input', description: 'Selling price must be greater than or equal to buying price', variant: 'destructive' });
      return;
    }

    try {
      await productApi.update(productId, {
        purchaseRate: editValues.purchaseRate,
        sellingPrice: editValues.sellingPrice
      });

      // Update local state instantly
      setProducts(products.map(p =>
        p.id === productId ? { ...p, purchaseRate: editValues.purchaseRate, sellingPrice: editValues.sellingPrice } : p
      ));

      setEditingProductId(null);
      toast({ title: 'Success', description: 'Pricing updated successfully' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update pricing', variant: 'destructive' });
    }
  };

  const handleCancelEdit = () => {
    setEditingProductId(null);
  };


  useEffect(() => {
    let unsubscribeBills: () => void;
    let unsubscribeDaybook: () => void;
    
    const fetchGlobalData = async () => {
      setLoading(true);
      try {
        const [productsRes, vendorsRes, apptsRes, custRes, staffRes] = await Promise.all([
          productApi.getAll(),
          vendorApi.getAll(),
          appointmentApi.getAll(),
          customerApi.getAll(),
          staffApi.getAll()
        ]);

        if (Array.isArray(productsRes.data)) setProducts(productsRes.data);
        if (Array.isArray(vendorsRes.data)) setVendors(vendorsRes.data);
        if (Array.isArray(apptsRes.data)) setAppointments(apptsRes.data);
        if (Array.isArray(custRes.data)) setCustomers(custRes.data);
        if (Array.isArray(staffRes.data)) setStaff(staffRes.data);
        
        // Real-time listener for bills with normalization
        unsubscribeBills = onSnapshot(collection(db, 'bills'), (snap) => {
          setBills(snap.docs.map(d => {
            const data = d.data();
            let createdAt = data.createdAt || data.date || data.billDate;
            if (createdAt && typeof createdAt === 'object') {
              const s = createdAt.seconds ?? createdAt._seconds;
              if (s !== undefined) createdAt = new Date(s * 1000).toISOString();
              else if (typeof createdAt.toDate === 'function') createdAt = createdAt.toDate().toISOString();
            }
            if (!createdAt) createdAt = new Date().toISOString();
            const finalAmt = Number(data.finalAmount ?? data.totalAmount ?? data.amountPaid ?? 0);
            return {
              ...data,
              id: d.id,
              createdAt,
              date: data.date || createdAt,
              finalAmount: finalAmt,
              totalAmount: Number(data.totalAmount ?? finalAmt),
              invoiceNumber: data.invoiceNumber || data.invoiceId || d.id
            };
          }) as unknown as Bill[]);
        });

        // Real-time listener for daybook (expenses)
        unsubscribeDaybook = onSnapshot(collection(db, 'daybook'), (snap) => {
          const entries = snap.docs.map(d => ({ ...d.data(), id: d.id })) as DayBookEntry[];
          setExpenses(entries.filter(e => e.type === 'EXPENSE'));
        });
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchGlobalData();
    
    return () => {
      if (unsubscribeBills) unsubscribeBills();
      if (unsubscribeDaybook) unsubscribeDaybook();
    };
  }, []);

  // Safe date parser for bills
  const parseBillDate = (bill: any): Date => {
    const val = bill?.createdAt || bill?.date || bill?.billDate || bill?.timestamp;
    if (!val) return new Date();
    if (val instanceof Date) return val;
    if (typeof val === 'object') {
      const s = val.seconds ?? val._seconds;
      if (s !== undefined) return new Date(s * 1000);
      if (typeof val.toDate === 'function') return val.toDate();
    }
    const d = new Date(val);
    return isNaN(d.getTime()) ? new Date() : d;
  };

  // Helper to reliably identify salon services vs retail cosmetics
  const checkIsService = (item: any): boolean => {
    if (!item) return false;
    const type = String(item.type || '').toUpperCase();
    if (type === 'SERVICE') return true;
    if (item.serviceId) return true;
    const cat = String(item.category || '').toLowerCase();
    if (cat === 'service' || cat === 'salon services' || cat.includes('service')) return true;
    const name = String(item.productName || item.name || item.serviceName || '').toLowerCase();
    return /haircut|styling|facial|shaving|shave|beard|coloring|hair spa|spa|pedicure|manicure|massage|bridal|bleach|cleanup|threading|waxing|treatment/i.test(name);
  };

  // Filter bills based on time range (Global for charts)
  const dateFilteredBills = useMemo(() => {
    const start = startOfDay(new Date(startDate));
    const end = endOfDay(new Date(endDate));

    return bills.filter(bill => {
      if (bill.status === 'CANCELLED' || bill.status === 'HOLD' || bill.status === 'REFUNDED') return false;
      const billDate = parseBillDate(bill);
      return billDate >= start && billDate <= end;
    });
  }, [bills, startDate, endDate]);

  const filteredBills = useMemo(() => {
    return dateFilteredBills;
  }, [dateFilteredBills]);

  const filteredProducts = useMemo(() => {
    return products;
  }, [products]);

  // Helper to aggregate chart data across views
  const aggregateChartData = (view: DashboardPeriod, rawData: { date: string; income: number; expense: number }[]) => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    if (view === 'year') {
      // 12 Months of the current year (Jan to Dec)
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const monthlyAgg: Record<string, { income: number; expense: number }> = {};
      months.forEach(m => monthlyAgg[m] = { income: 0, expense: 0 });

      rawData.forEach((d) => {
        const dDate = new Date(d.date);
        if (!isNaN(dDate.getTime()) && dDate.getFullYear() === currentYear) {
          const mName = months[dDate.getMonth()];
          if (monthlyAgg[mName]) {
            monthlyAgg[mName].income += (d.income || 0);
            monthlyAgg[mName].expense += (d.expense || 0);
          }
        }
      });
      return months.map(m => ({
        date: m,
        income: Math.round(monthlyAgg[m].income),
        expense: Math.round(monthlyAgg[m].expense)
      }));
    } else if (view === 'month') {
      // 12 Months comparison or days of current month
      const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
      const dayMap = new Map<number, { income: number; expense: number }>();

      rawData.forEach((d) => {
        const dDate = new Date(d.date);
        if (!isNaN(dDate.getTime()) && dDate.getMonth() === currentMonth && dDate.getFullYear() === currentYear) {
          const dayNum = dDate.getDate();
          const prev = dayMap.get(dayNum) || { income: 0, expense: 0 };
          dayMap.set(dayNum, {
            income: prev.income + (d.income || 0),
            expense: prev.expense + (d.expense || 0)
          });
        }
      });

      const fullMonthData = [];
      for (let i = 1; i <= daysInCurrentMonth; i++) {
        const dayData = dayMap.get(i);
        fullMonthData.push({
          date: i.toString(),
          income: Math.round(dayData?.income || 0),
          expense: Math.round(dayData?.expense || 0)
        });
      }
      return fullMonthData;
    } else if (view === 'week') {
      // 5 Weeks of the current month
      const weeksData = [
        { date: '1st Week', income: 0, expense: 0 },
        { date: '2nd Week', income: 0, expense: 0 },
        { date: '3rd Week', income: 0, expense: 0 },
        { date: '4th Week', income: 0, expense: 0 },
        { date: '5th Week', income: 0, expense: 0 }
      ];
      rawData.forEach((d) => {
        const dDate = new Date(d.date);
        if (!isNaN(dDate.getTime()) && dDate.getMonth() === currentMonth && dDate.getFullYear() === currentYear) {
          const dayNum = dDate.getDate();
          let weekIdx = Math.floor((dayNum - 1) / 7);
          if (weekIdx > 4) weekIdx = 4;
          weeksData[weekIdx].income += (d.income || 0);
          weeksData[weekIdx].expense += (d.expense || 0);
        }
      });
      return weeksData.map(w => ({
        ...w,
        income: Math.round(w.income),
        expense: Math.round(w.expense)
      }));
    } else {
      // 'day' view: All 7 days of the current week (Monday through Sunday)
      const weekStart = startOfWeek(now, { weekStartsOn: 1 });
      const fullWeekData = [];
      const dataMap = new Map<string, { income: number; expense: number }>();
      rawData.forEach((d) => {
        const dDate = new Date(d.date);
        if (!isNaN(dDate.getTime())) {
          const dayKey = format(dDate, 'yyyy-MM-dd');
          dataMap.set(dayKey, d);
        }
      });

      for (let i = 0; i < 7; i++) {
        const currentDay = addDays(weekStart, i);
        const dayKey = format(currentDay, 'yyyy-MM-dd');
        const shortDay = format(currentDay, 'EEE (dd)');
        const dayData = dataMap.get(dayKey);
        fullWeekData.push({
          date: shortDay,
          income: Math.round(dayData?.income || 0),
          expense: Math.round(dayData?.expense || 0)
        });
      }
      return fullWeekData;
    }
  };

  const [allPeriodsData, setAllPeriodsData] = useState<Record<DashboardPeriod, any[]>>({
    day: [], week: [], month: [], year: []
  });

  useEffect(() => {
    try {
      const rawDataMap = new Map<string, { date: string, income: number, expense: number }>();
      
      const productMap = new Map(products.map(p => [p.name.toLowerCase().trim(), p]));
      const productIdMap = new Map(products.map(p => [p.id, p]));

      // 1. Process all non-cancelled bills to calculate real earnings and cost/commission expenses
      bills.forEach(b => {
        if (b.status === 'CANCELLED' || b.status === 'HOLD' || b.status === 'REFUNDED') return;
        const bDate = parseBillDate(b);
        const dateStr = format(bDate, 'yyyy-MM-dd');
        if (!rawDataMap.has(dateStr)) {
          rawDataMap.set(dateStr, { date: dateStr, income: 0, expense: 0 });
        }
        
        const finalAmt = Number(b.finalAmount ?? b.totalAmount ?? b.amountPaid ?? 0);
        rawDataMap.get(dateStr)!.income += finalAmt;

        // Calculate product COGS and staff commissions for this bill
        let billCost = 0;
        let billComm = Number(b.staffCommissionAmount) || 0;
        let itemsComm = 0;

        b.items?.forEach((item: any) => {
          const isService = checkIsService(item);
          const q = Number(item.quantity ?? item.qty ?? 1);
          const price = Number(item.unitPrice ?? item.price ?? 0);

          if (!isService) {
            const prod = productIdMap.get(item.productId) || productMap.get((item.productName || item.name || '').toLowerCase().trim());
            if (prod) {
              billCost += (Number(prod.purchaseRate) || 0) * q;
            } else if (item.purchaseRate && Number(item.purchaseRate) > 0) {
              billCost += Number(item.purchaseRate) * q;
            } else {
              billCost += (price * q) * 0.5; // default 50% wholesale margin if unrecorded
            }
          }

          if (item.staffCommissionAmount) {
            itemsComm += Number(item.staffCommissionAmount);
          }
        });

        const totalCommissionForBill = itemsComm > 0 ? itemsComm : billComm;
        rawDataMap.get(dateStr)!.expense += (billCost + totalCommissionForBill);
      });

      // 2. Process all daybook expenses (rent, utilities, salon supplies, tea/coffee, etc.)
      expenses.forEach(e => {
        const rawDate = e.date || (e as any).createdAt;
        let eDate: Date;
        if (rawDate && typeof rawDate === 'object') {
          const s = (rawDate as any).seconds ?? (rawDate as any)._seconds;
          eDate = s !== undefined ? new Date(s * 1000) : new Date();
        } else if (rawDate) {
          eDate = new Date(rawDate);
        } else {
          eDate = new Date();
        }
        if (isNaN(eDate.getTime())) eDate = new Date();

        const dateStr = format(eDate, 'yyyy-MM-dd');
        if (!rawDataMap.has(dateStr)) {
          rawDataMap.set(dateStr, { date: dateStr, income: 0, expense: 0 });
        }
        rawDataMap.get(dateStr)!.expense += (Number(e.amount) || 0);
      });

      const rawData = Array.from(rawDataMap.values());

      const dayData = aggregateChartData('day', rawData);
      const weekData = aggregateChartData('week', rawData);
      const monthData = aggregateChartData('month', rawData);
      const yearData = aggregateChartData('year', rawData);

      setAllPeriodsData({ day: dayData, week: weekData, month: monthData, year: yearData });

      // Update the main chart view
      if (dashboardView === 'day') setChartDataFetched(dayData);
      else if (dashboardView === 'week') setChartDataFetched(weekData);
      else if (dashboardView === 'month') setChartDataFetched(monthData);
      else if (dashboardView === 'year') setChartDataFetched(yearData);
    } catch (err) {
      console.log("Chart data calculation issue: ", err);
    }
  }, [dashboardView, bills, expenses, products]);

  // KPIs
  const { totalRevenue, totalTransactions, totalProfit, totalCOGS, serviceRevenue, productRevenue, totalCommission } = useMemo(() => {
    let rev = 0;
    let profit = 0;
    let cogs = 0;
    let sRev = 0;
    let pRev = 0;
    let comm = 0;

    // Create a product map for quick lookup
    const productMap = new Map(products.map(p => [p.name.toLowerCase().trim(), p]));
    const productIdMap = new Map(products.map(p => [p.id, p]));

    filteredBills.forEach(bill => {
      const finalAmt = Number(bill.finalAmount ?? bill.totalAmount ?? bill.amountPaid ?? 0);
      rev += finalAmt;

      let billComm = Number(bill.staffCommissionAmount) || 0;
      let itemsComm = 0;
      let billCost = 0;

      bill.items?.forEach(item => {
        const isService = checkIsService(item);
        const q = Number(item.quantity ?? item.qty ?? 1);
        const price = Number(item.unitPrice ?? item.price ?? 0);
        const disc = Number(item.discountAmount ?? 0);
        const itemNet = Number(item.netAmount ?? item.total ?? (price * q - disc));

        if (isService) {
          sRev += itemNet;
          // Services have zero COGS
        } else {
          pRev += itemNet;
          const prod = productIdMap.get(item.productId) || productMap.get((item.productName || item.name || '').toLowerCase().trim());
          if (prod) {
            billCost += (Number(prod.purchaseRate) || 0) * q;
          } else if (item.purchaseRate && Number(item.purchaseRate) > 0) {
            billCost += Number(item.purchaseRate) * q;
          } else {
            // Rough estimate for retail product without recorded cost
            billCost += (price * q) * 0.7;
          }
        }

        if (item.staffCommissionAmount) {
          itemsComm += Number(item.staffCommissionAmount);
        }
      });

      comm += (itemsComm > 0 ? itemsComm : billComm);
      cogs += billCost;
      profit += (finalAmt - billCost);
    });

    return {
      totalRevenue: rev,
      totalTransactions: filteredBills.length,
      totalProfit: profit,
      totalCOGS: cogs,
      serviceRevenue: sRev,
      productRevenue: pRev,
      totalCommission: comm
    };
  }, [filteredBills, products]);

  // Transaction Stats for Dropdown
  const txStats = useMemo(() => {
    let upi = 0, cash = 0, card = 0, split = 0, partial = 0;
    filteredBills.forEach(b => {
      const method = (b.paymentMethod || 'Cash').toLowerCase();
      if (method.includes('split') || method.includes('mixed') || (method.includes('cash') && method.includes('upi'))) {
        split++;
      } else if (method.includes('upi') || method.includes('online')) {
        upi++;
      } else if (method.includes('card')) {
        card++;
      } else if (method.includes('partial')) {
        partial++;
      } else {
        cash++;
      }
    });
    return { upi, cash, card, split, partial };
  }, [filteredBills]);

  const dateFilteredAppointments = useMemo(() => {
    const start = startOfDay(new Date(startDate));
    const end = endOfDay(new Date(endDate));

    return appointments.filter(appt => {
      const apptDate = new Date(appt.date);
      return apptDate >= start && apptDate <= end;
    });
  }, [appointments, startDate, endDate]);

  const totalAppointmentsCount = dateFilteredAppointments.length;

  // 1. Strictly Retail Product Performance (Excluding salon services)
  const retailProductPerformance = useMemo(() => {
    const perf: Record<string, {
      id: string;
      barcode?: string;
      name: string;
      qtySold: number;
      revenue: number;
      category: string;
      margin: number;
      purchaseRate: number;
      sellingPrice: number;
      stock: number;
      purchaseDate?: string;
      hashtagNumber?: string;
    }> = {};

    const productMap = new Map<string, any>(products.map(p => [p.id, p] as [string, any]));
    const productNameMap = new Map<string, any>(products.map(p => [p.name.toLowerCase().trim(), p] as [string, any]));
    const productBarcodeMap = new Map<string, any>(
      products
        .filter(p => p.barcode)
        .map(p => [p.barcode, p] as [string, any])
    );

    filteredBills.forEach(bill => {
      bill.items?.forEach(item => {
        const itemName = item.productName || item.name || 'Unknown Item';
        const prod = productMap.get(item.productId) || productNameMap.get(itemName.toLowerCase().trim()) || productBarcodeMap.get(item.productId);
        
        // Exclude salon services using unified checkIsService
        if (checkIsService(item) || checkIsService(prod)) return;

        const pid = prod ? prod.id : (item.productId || itemName);

        if (!perf[pid]) {
          const pr = prod?.purchaseRate || item.purchaseRate || (Number(item.price || item.unitPrice || 0) * 0.7);
          const sp = prod?.sellingPrice || prod?.price || Number(item.price || item.unitPrice || 0);
          perf[pid] = {
            id: prod?.id || item.productId || 'N/A',
            barcode: prod?.barcode || '',
            name: prod?.name || itemName,
            qtySold: 0,
            revenue: 0,
            category: prod?.category || 'Retail Product',
            purchaseRate: pr,
            sellingPrice: sp,
            margin: sp > 0 ? ((sp - pr) / sp) * 100 : 0,
            stock: prod?.stockQuantity ?? (prod?.quantity || 0),
            purchaseDate: prod?.purchaseDate || prod?.createdAt || '',
            hashtagNumber: prod?.hashtagNumber || prod?.id || ''
          };
        }

        const q = Number(item.quantity ?? item.qty ?? 1);
        const price = Number(item.price || item.unitPrice || 0);
        const disc = Number(item.discountAmount || 0);
        const itemNet = Number(item.netAmount || (price * q - disc));
        perf[pid].qtySold += q;
        perf[pid].revenue += itemNet;
      });
    });

    return Object.values(perf).sort((a, b) => b.qtySold - a.qtySold);
  }, [filteredBills, products]);

  // 2. Salon Services Performance
  const servicePerformance = useMemo(() => {
    const perf: Record<string, {
      id: string;
      name: string;
      timesPerformed: number;
      revenue: number;
      category: string;
      avgPrice: number;
    }> = {};

    filteredBills.forEach(bill => {
      bill.items?.forEach(item => {
        const serviceName = item.productName || item.name || item.serviceName || 'Unknown Service';
        if (!checkIsService(item)) return;

        const sid = item.serviceId || item.productId || serviceName;

        if (!perf[sid]) {
          perf[sid] = {
            id: sid,
            name: serviceName,
            timesPerformed: 0,
            revenue: 0,
            category: 'Salon Service',
            avgPrice: Number(item.price || item.unitPrice || 0)
          };
        }

        const q = Number(item.quantity ?? item.qty ?? 1);
        const price = Number(item.price || item.unitPrice || 0);
        const disc = Number(item.discountAmount || 0);
        const itemNet = Number(item.netAmount || (price * q - disc));
        perf[sid].timesPerformed += q;
        perf[sid].revenue += itemNet;
      });
    });

    return Object.values(perf).sort((a, b) => b.timesPerformed - a.timesPerformed);
  }, [filteredBills]);

  // Combined product performance fallback for existing references
  const productPerformance = useMemo(() => {
    if (retailProductPerformance.length > 0) return retailProductPerformance;
    const perf: Record<string, any> = {};
    products.forEach(p => {
      perf[p.id] = {
        id: p.id,
        name: p.name,
        qtySold: 0,
        revenue: 0,
        category: p.category || 'Cosmetics',
        margin: p.sellingPrice && p.purchaseRate ? ((p.sellingPrice - p.purchaseRate) / p.sellingPrice) * 100 : 0,
        purchaseRate: p.purchaseRate || 0,
        sellingPrice: p.sellingPrice || 0,
        stock: p.stockQuantity || 0,
        purchaseDate: p.purchaseDate || p.createdAt || '',
        hashtagNumber: p.hashtagNumber || p.id
      };
    });
    return Object.values(perf);
  }, [retailProductPerformance, products]);

  const topSellingProducts = useMemo(() => {
    return productPerformance.map(p => ({
      ...p,
      totalQty: (p.qtySold || 0) + (p.stock || 0),
      chartLabel: p.name
    })).sort((a, b) => b.qtySold - a.qtySold);
  }, [productPerformance]);

  // 3. Best Staff Performance Aggregation
  const staffPerformance = useMemo(() => {
    const staffMap = new Map<string, {
      id: string;
      name: string;
      role: string;
      phone: string;
      servicesCount: number;
      totalRevenue: number;
      totalCommission: number;
      appointmentsCount: number;
      avgTicket: number;
      active: boolean;
      sharePercent: number;
    }>();

    const staffNameMap = new Map<string, string>();

    staff.forEach(s => {
      staffMap.set(s.id, {
        id: s.id,
        name: s.name,
        role: s.role || (s as any).designation || 'Stylist',
        phone: s.phone || '',
        servicesCount: 0,
        totalRevenue: 0,
        totalCommission: 0,
        appointmentsCount: 0,
        avgTicket: 0,
        active: s.isActive !== false,
        sharePercent: 0
      });
      if (s.name) {
        staffNameMap.set(s.name.toLowerCase().trim(), s.id);
      }
    });

    let totalStaffServiceRevenue = 0;

    filteredBills.forEach(bill => {
      bill.items?.forEach(item => {
        let sid = item.staffId || bill.staffId;
        if (sid && !staffMap.has(sid)) {
          const byName = staffNameMap.get(String(sid).toLowerCase().trim());
          if (byName) sid = byName;
        }

        if (sid && staffMap.has(sid)) {
          const sObj = staffMap.get(sid)!;
          const isService = checkIsService(item);
          const q = Number(item.quantity ?? item.qty ?? 1);
          const price = Number(item.price || item.unitPrice || 0);
          const disc = Number(item.discountAmount || 0);
          const itemNet = Number(item.netAmount || (price * q - disc));

          if (isService) {
            sObj.servicesCount += q;
          }
          sObj.totalRevenue += itemNet;
          sObj.totalCommission += Number(item.staffCommissionAmount || 0);
          totalStaffServiceRevenue += itemNet;
        }
      });

      let bSid = bill.staffId;
      if (bSid && !staffMap.has(bSid)) {
        const byName = staffNameMap.get(String(bSid).toLowerCase().trim());
        if (byName) bSid = byName;
      }
      if (bSid && staffMap.has(bSid) && bill.staffCommissionAmount) {
        const itemsCommSum = bill.items?.reduce((s, it) => s + (Number(it.staffCommissionAmount) || 0), 0) || 0;
        if (itemsCommSum === 0 && Number(bill.staffCommissionAmount) > 0) {
          staffMap.get(bSid)!.totalCommission += Number(bill.staffCommissionAmount);
        }
      }
    });

    dateFilteredAppointments.forEach(appt => {
      if (appt.staffId && staffMap.has(appt.staffId)) {
        staffMap.get(appt.staffId)!.appointmentsCount++;
      }
    });

    const list = Array.from(staffMap.values()).map(s => {
      const avg = s.servicesCount > 0 ? s.totalRevenue / s.servicesCount : 0;
      const share = totalStaffServiceRevenue > 0 ? (s.totalRevenue / totalStaffServiceRevenue) * 100 : 0;
      return {
        ...s,
        avgTicket: avg,
        sharePercent: share
      };
    });

    return list.sort((a, b) => b.totalRevenue - a.totalRevenue || b.servicesCount - a.servicesCount);
  }, [staff, filteredBills, dateFilteredAppointments]);

  const topPerformingByRevenue = useMemo(() => {
    return [...topSellingProducts].sort((a, b) => b.revenue - a.revenue);
  }, [topSellingProducts]);

  const topPerformingByMargin = useMemo(() => {
    return [...topSellingProducts].sort((a, b) => b.margin - a.margin);
  }, [topSellingProducts]);

  const [bottomTableSearch, setBottomTableSearch] = useState("");

  const productPurchases = useMemo(() => {
    if (!selectedProductDetails) return [];

    return bills.filter(bill => {
      if (bill.status === 'CANCELLED') return false;
      return bill.items?.some(item =>
        item.productId === selectedProductDetails.id ||
        item.productName === selectedProductDetails.name
      );
    }).map(bill => {
      const item = bill.items?.find(i =>
        i.productId === selectedProductDetails.id ||
        i.productName === selectedProductDetails.name
      );
      return {
        customerName: bill.customerName,
        customerPhone: bill.customerPhone,
        quantity: item?.quantity || 1,
        date: bill.createdAt,
        total: (item?.unitPrice || 0) * (item?.quantity || 1)
      };
    });
  }, [selectedProductDetails, bills]);

  const lowStockProducts = useMemo(() => {
    return productPerformance.filter(p => (p.stock || 0) <= 5);
  }, [productPerformance]);

  const lowStockRawMaterials = useMemo(() => {
    return []; // Removed raw materials entirely from dashboard
  }, []);

  const totalExpenseAmount = useMemo(() => expenses.reduce((sum, e) => sum + (e.amount || 0), 0), [expenses]);

  // Helper to calculate pie data
  const getPieDataForRange = (start: Date, end: Date) => {
    let revenue = 0;
    let cogs = 0;

    const filteredRangeBills = bills.filter(bill => {
      if (bill.status === 'CANCELLED' || bill.status === 'HOLD') return false;
      const billDate = new Date(bill.createdAt || new Date());
      return billDate >= start && billDate <= end;
    });

    // Create a product map for quick lookup
    const productMap = new Map(products.map(p => [p.name, p]));
    const productIdMap = new Map(products.map(p => [p.id, p]));

    filteredRangeBills.forEach(bill => {
      revenue += (bill.finalAmount || bill.amountPaid || 0);
      bill.items?.forEach(item => {
        const prod = productIdMap.get(item.productId) || productMap.get(item.productName);
        cogs += prod ? ((prod.purchaseRate || 0) * item.quantity) : (item.unitPrice * item.quantity * 0.7);
      });
    });

    const filteredRangeExpenses = expenses.filter((entry: any) => {
      const dateStr = entry.date || entry.createdAt;
      if (!dateStr) return false;
      const expenseDate = new Date(dateStr);
      return !isNaN(expenseDate.getTime()) && expenseDate >= start && expenseDate <= end;
    });

    const profit = revenue - cogs;
    const expenseAmount = filteredRangeExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    return [
      { name: 'Revenue', value: revenue, color: '#3b82f6' },
      { name: 'Profit', value: profit, color: '#10b981' },
      { name: 'Cost of Goods', value: cogs, color: '#facc15' },
      { name: 'Expenses', value: expenseAmount, color: '#ef4444' }
    ];
  };

  const pieData = useMemo(() => {
    return getPieDataForRange(startOfDay(new Date(startDate)), endOfDay(new Date(endDate)));
  }, [bills, expenses, products, startDate, endDate]);

  const allPieData = useMemo(() => {
    const now = new Date();
    return {
      day: getPieDataForRange(startOfWeek(now, { weekStartsOn: 1 }), endOfWeek(now, { weekStartsOn: 1 })),
      week: getPieDataForRange(startOfMonth(now), endOfMonth(now)),
      month: getPieDataForRange(startOfMonth(now), endOfMonth(now)),
      year: getPieDataForRange(startOfYear(now), endOfYear(now))
    };
  }, [bills, expenses, products]);



  const handleDownloadReport = async () => {
    const element = document.getElementById("report-container");
    if (!element) return;

    // Temporarily make it visible for capture (off-screen)
    element.style.display = "block";
    element.style.position = "absolute";
    element.style.left = "-9999px";
    element.style.top = "0";

    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      windowWidth: 1200 // Ensure consistent width for report
    });

    element.style.display = "none";

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");

    const imgWidth = 210;
    const pageHeight = 295;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(`Business_Dashboard_Report_${format(new Date(), 'yyyy-MM-dd')}.pdf`);

    toast({ title: "Success", description: "Report downloaded successfully" });
  };

  // Helper to aggregate data for report
  const getReportData = () => {
    // Current date range stats
    const reportKpis = [
      { label: 'Total Revenue', value: `₹${totalRevenue.toLocaleString()}` },
      { label: 'Total Profit', value: `₹${totalProfit.toLocaleString()}` },
      { label: 'Total Expense', value: `₹${totalExpenseAmount.toLocaleString()}` },
      { label: 'Total Transactions', value: totalTransactions },
      { label: 'Low Stock Count', value: lowStockProducts.length + lowStockRawMaterials.length }
    ];

    // Top 5 Products with full data
    const topProducts = topSellingProducts.slice(0, 5).map((p, i) => ({
      rank: i + 1,
      date: p.purchaseDate ? format(new Date(p.purchaseDate), 'dd MMM yyyy') : 'N/A',
      productId: p.id || 'N/A',
      name: p.name,
      category: p.category || 'N/A',
      purchasePrice: `₹${p.purchaseRate.toLocaleString()}`,
      sellingPrice: `₹${p.sellingPrice.toLocaleString()}`,
      qtySold: p.qtySold,
      stock: p.stock
    }));

    // Top 5 Staff with performance data
    const topStaff = staffPerformance.slice(0, 5).map((s, i) => ({
      rank: i + 1,
      name: s.name,
      role: s.role,
      servicesCount: s.servicesCount,
      revenue: `₹${s.totalRevenue.toLocaleString()}`,
      commission: `₹${s.totalCommission.toLocaleString()}`,
      appointments: s.appointmentsCount
    }));

    return { reportKpis, topProducts, topStaff };
  };

  const { reportKpis, topProducts, topStaff } = getReportData();

  if (loading && totalRevenue === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="p-8 bg-white min-h-full space-y-10 font-sans">
      <div className="flex flex-col xl:flex-row gap-6 justify-between items-start xl:items-center">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 font-medium">Business performance and analytics</p>
        </div>
        <div className="flex flex-wrap gap-4 items-center w-full xl:w-auto">

            <div className="flex flex-wrap gap-3 items-center w-full sm:w-auto">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">From</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border-slate-200 rounded text-xs bg-slate-50 focus:ring-slate-400 px-3 py-2 border outline-none font-medium w-full sm:w-auto"
              />
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">To</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border-slate-200 rounded text-xs bg-slate-50 focus:ring-slate-400 px-3 py-2 border outline-none font-medium w-full sm:w-auto"
              />
            </div>
            <button
              onClick={handleDownloadReport}
              className="flex justify-center items-center gap-2 bg-blue-600 text-white px-4 py-2 text-sm rounded hover:bg-blue-700 transition-colors w-full sm:w-auto mt-2 sm:mt-0 font-medium"
            >
              <Download size={16} /> Download Report
            </button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {/* Total Revenue */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between min-h-[100px]">
          <div className="flex justify-between items-start">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Revenue</p>
            <DollarSign size={16} className="text-slate-400" />
          </div>
          <h3 className="text-xl sm:text-2xl font-semibold tracking-tighter text-slate-900 truncate">₹{totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
        </div>

        {/* Total Profit */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between min-h-[100px]">
          <div className="flex justify-between items-start">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Profit</p>
            <TrendingUp size={16} className="text-slate-400" />
          </div>
          <h3 className="text-xl sm:text-2xl font-semibold tracking-tighter text-slate-900 truncate">₹{totalProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
        </div>

        {/* Total Expense */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between min-h-[100px]">
          <div className="flex justify-between items-start">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Expense</p>
            <TrendingDown size={16} className="text-slate-400" />
          </div>
          <h3 className="text-xl sm:text-2xl font-semibold tracking-tighter text-slate-900 truncate">₹{totalExpenseAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
        </div>

        {/* Mode of Transactions */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between min-h-[100px]">
          <div className="flex items-start justify-between mb-2">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Transactions</p>
            <ShoppingCart size={16} className="text-slate-400" />
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-1">
            <div className="flex items-center justify-between text-[10px] text-slate-600"><span>UPI</span> <span className="font-semibold text-slate-900">{txStats.upi}</span></div>
            <div className="flex items-center justify-between text-[10px] text-slate-600"><span>Cash</span> <span className="font-semibold text-slate-900">{txStats.cash}</span></div>
            <div className="flex items-center justify-between text-[10px] text-slate-600"><span>Card</span> <span className="font-semibold text-slate-900">{txStats.card}</span></div>
            <div className="flex items-center justify-between text-[10px] text-slate-600"><span>Split</span> <span className="font-semibold text-slate-900">{txStats.split}</span></div>
            <div className="flex items-center justify-between text-[10px] text-slate-600 col-span-2"><span>Partial</span> <span className="font-semibold text-slate-900">{txStats.partial}</span></div>
          </div>
        </div>

        {/* Low Stock Alerts */}
        <div
          className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between min-h-[100px] cursor-pointer hover:border-slate-300 transition-colors"
          onClick={() => setIsLowStockModalOpen(true)}
        >
          <div className="flex justify-between items-start">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Low Stock</p>
            <AlertTriangle size={16} className={lowStockProducts.length > 0 ? 'text-amber-500' : 'text-slate-400'} />
          </div>
          <h3 className={`text-xl sm:text-2xl font-semibold tracking-tighter truncate ${lowStockProducts.length > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
            {lowStockProducts.length}
          </h3>
        </div>

        {/* Appointments */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between min-h-[100px]">
          <div className="flex justify-between items-start">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Appointments</p>
            <Calendar size={16} className="text-slate-400" />
          </div>
          <h3 className="text-xl sm:text-2xl font-semibold tracking-tighter text-slate-900 truncate">{totalAppointmentsCount}</h3>
        </div>

        {/* Service Revenue */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between min-h-[100px]">
          <div className="flex justify-between items-start">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Services</p>
            <TrendingUp size={16} className="text-slate-400" />
          </div>
          <h3 className="text-xl sm:text-2xl font-semibold tracking-tighter text-slate-900 truncate">₹{serviceRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
        </div>

        {/* Product Revenue */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between min-h-[100px]">
          <div className="flex justify-between items-start">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Products</p>
            <Package size={16} className="text-slate-400" />
          </div>
          <h3 className="text-xl sm:text-2xl font-semibold tracking-tighter text-slate-900 truncate">₹{productRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
        </div>

        {/* Total Commission */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between min-h-[100px]">
          <div className="flex justify-between items-start">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Commission</p>
            <Users size={16} className="text-slate-400" />
          </div>
          <h3 className="text-xl sm:text-2xl font-semibold tracking-tighter text-slate-900 truncate">₹{totalCommission.toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
        </div>

        {/* Customers Count */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between min-h-[100px]">
          <div className="flex justify-between items-start">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Customers</p>
            <Users size={16} className="text-slate-400" />
          </div>
          <h3 className="text-xl sm:text-2xl font-semibold tracking-tighter text-slate-900 truncate">{customers.length}</h3>
        </div>

        {/* Staff Count */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between min-h-[100px]">
          <div className="flex justify-between items-start">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Active Staff</p>
            <Users size={16} className="text-slate-400" />
          </div>
          <h3 className="text-xl sm:text-2xl font-semibold tracking-tighter text-slate-900 truncate">{staff.filter(s => s.isActive).length}</h3>
        </div>

        {/* Suppliers Count / Quick Link */}
        <div
          onClick={() => navigate('/admin/suppliers')}
          className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between min-h-[100px] cursor-pointer hover:border-pink-300 hover:bg-pink-50/30 transition-all group"
          title="Click to view Supplier Details & Products"
        >
          <div className="flex justify-between items-start">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider group-hover:text-pink-600 transition-colors">Suppliers</p>
            <Building2 size={16} className="text-slate-400 group-hover:text-pink-500 transition-colors" />
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <h3 className="text-xl sm:text-2xl font-semibold tracking-tighter text-slate-900">{vendors.length}</h3>
            <span className="text-[10px] text-pink-600 font-bold group-hover:underline">Details &rarr;</span>
          </div>
        </div>
      </div>

      <LowStockProductsModal
        isOpen={isLowStockModalOpen}
        onClose={() => setIsLowStockModalOpen(false)}
        lowStockProducts={lowStockProducts}
      />

      {/* Time Range Toggle Row */}
      <div className="flex justify-end">
        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 overflow-x-auto max-w-full">
          {(['day', 'week', 'month', 'year'] as const).map(view => (
            <button
              key={view}
              onClick={() => setDashboardView(view)}
              className={`px-4 py-1.5 text-[11px] font-semibold rounded transition-all tracking-wider uppercase ${dashboardView === view ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {view === 'day' ? 'DAILY' : view === 'week' ? 'WEEKLY' : view === 'month' ? 'MONTHLY' : 'YEARLY'}
            </button>
          ))}
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-xl border border-slate-200 lg:col-span-2">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900 tracking-tight">Earnings vs Expenses</h3>
              <p className="text-xs text-slate-500 mt-0.5">Real-time revenue, product costs, staff commissions & salon expenses</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-100 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                Earnings: ₹{chartDataFetched.reduce((sum, d) => sum + (Number(d.income) || 0), 0).toLocaleString('en-IN')}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 text-xs font-bold border border-rose-100 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                Expenses: ₹{chartDataFetched.reduce((sum, d) => sum + (Number(d.expense) || 0), 0).toLocaleString('en-IN')}
              </span>
            </div>
          </div>
          <div className="h-[300px]">
            {chartDataFetched.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 font-medium">
                No transactions for selected period
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartDataFetched} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    tickFormatter={(v) => v >= 1000 ? `₹${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `₹${v}`}
                    dx={-10}
                  />
                  <RechartsTooltip
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: any, name: string) => [`₹${Number(value || 0).toLocaleString('en-IN')}`, name]}
                  />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                  <Bar dataKey="income" name="Earnings" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={36} minPointSize={4} />
                  <Bar dataKey="expense" name="Expenses" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={36} minPointSize={4} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900 tracking-tight">Revenue Distribution</h3>
            <span className="text-[10px] font-semibold text-slate-500 px-2 py-1 bg-slate-100 rounded uppercase tracking-wider">Synced</span>
          </div>
          <div className="h-[250px] flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} innerRadius={65} outerRadius={85} paddingAngle={4} dataKey="value" stroke="none">
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip formatter={(value) => `₹${Number(value).toLocaleString()}`} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 10px rgb(0 0 0 / 0.1)' }} />
                <Legend verticalAlign="bottom" height={40} iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* BEST STAFF PERFORMANCE */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Users size={18} />
            </div>
            <h3 className="text-lg font-bold text-slate-900 tracking-tight">Best Staff Performance</h3>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-initial">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search staff name..."
                value={staffSearchTerm}
                onChange={(e) => setStaffSearchTerm(e.target.value)}
                className="pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 w-full sm:w-48 font-medium"
              />
            </div>
            <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">
              {staff.filter(s => s.isActive !== false).length} Active Staff
            </span>
          </div>
        </div>

        {/* Staff Table */}
        <div className="overflow-x-auto max-h-[380px] custom-scrollbar border border-slate-200 rounded-xl">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-slate-50 z-10">
              <tr className="text-[11px] text-slate-500 uppercase tracking-widest border-b border-slate-200">
                <th className="p-3.5 font-semibold text-center w-16">Rank</th>
                <th className="p-3.5 font-semibold">Staff Member</th>
                <th className="p-3.5 font-semibold">Role / Designation</th>
                <th className="p-3.5 font-semibold text-center">Services Done</th>
                <th className="p-3.5 font-semibold text-center">Appts</th>
                <th className="p-3.5 font-semibold text-right">Revenue Generated</th>
                <th className="p-3.5 font-semibold text-right">Avg / Service</th>
                <th className="p-3.5 font-semibold text-right">Commission</th>
                <th className="p-3.5 font-semibold text-center">Contribution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-medium">
              {staffPerformance
                .filter(s => !staffSearchTerm || s.name.toLowerCase().includes(staffSearchTerm.toLowerCase()) || s.role.toLowerCase().includes(staffSearchTerm.toLowerCase()))
                .map((s, idx) => {
                  return (
                    <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 text-center">
                        <span className={`inline-flex items-center justify-center font-bold px-2 py-0.5 rounded text-[11px] border ${
                          idx === 0 ? 'bg-amber-50 text-amber-800 border-amber-200' :
                          idx === 1 ? 'bg-slate-100 text-slate-700 border-slate-300' :
                          idx === 2 ? 'bg-orange-50 text-orange-800 border-orange-200' :
                          'bg-slate-50 text-slate-500 border-slate-200'
                        }`}>
                          #{idx + 1}
                        </span>
                      </td>
                      <td className="p-3 font-bold text-slate-900">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0">
                            {s.name.slice(0, 1).toUpperCase()}
                          </div>
                          <span className="truncate">{s.name}</span>
                        </div>
                      </td>
                      <td className="p-3 text-slate-600 font-medium">{s.role}</td>
                      <td className="p-3 text-center">
                        <span className="bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded border border-blue-100">
                          {s.servicesCount}
                        </span>
                      </td>
                      <td className="p-3 text-center text-slate-600 font-medium">{s.appointmentsCount}</td>
                      <td className="p-3 text-right font-bold text-slate-900">
                        ₹{s.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                      <td className="p-3 text-right text-slate-600">
                        ₹{s.avgTicket.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                      <td className="p-3 text-right font-bold text-slate-700">
                        ₹{s.totalCommission.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${Math.min(100, s.sharePercent)}%` }} />
                          </div>
                          <span className="text-[10px] font-bold text-slate-500 w-8 text-right">{s.sharePercent.toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              {staffPerformance.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400 font-medium">No staff performance data available for this date range</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* BEST SELLING PRODUCTS */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Package size={18} />
            </div>
            <h3 className="text-lg font-bold text-slate-900 tracking-tight">Best Selling Products</h3>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            {/* View Switcher: Products vs Services */}
            <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-semibold">
              <button
                onClick={() => setAnalyticsTab('products')}
                className={`px-3 py-1 rounded transition-all ${analyticsTab === 'products' ? 'bg-white text-blue-700 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Products ({retailProductPerformance.length})
              </button>
              <button
                onClick={() => setAnalyticsTab('services')}
                className={`px-3 py-1 rounded transition-all ${analyticsTab === 'services' ? 'bg-white text-blue-700 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Services ({servicePerformance.length})
              </button>
            </div>

            {/* Search Input */}
            <div className="relative flex-1 sm:flex-initial">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder={analyticsTab === 'products' ? "Search products..." : "Search services..."}
                value={productSearchTerm}
                onChange={(e) => setProductSearchTerm(e.target.value)}
                className="pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 w-full sm:w-44 font-medium"
              />
            </div>
          </div>
        </div>

        {/* Products / Services Table */}
        {analyticsTab === 'products' ? (
          <div className="overflow-x-auto max-h-[420px] custom-scrollbar border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-slate-50 z-10">
                <tr className="text-[11px] text-slate-500 uppercase tracking-widest border-b border-slate-200">
                  <th className="p-3.5 font-semibold text-center w-16">Rank</th>
                  <th className="p-3.5 font-semibold">Product Name</th>
                  <th className="p-3.5 font-semibold">Category</th>
                  <th className="p-3.5 font-semibold text-right">Selling Price</th>
                  <th className="p-3.5 font-semibold text-right">Buying Price</th>
                  <th className="p-3.5 font-semibold text-right">Margin (%)</th>
                  <th className="p-3.5 font-semibold text-center">Units Sold</th>
                  <th className="p-3.5 font-semibold text-right">Revenue</th>
                  <th className="p-3.5 font-semibold text-center">Stock</th>
                  <th className="p-3.5 font-semibold text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium">
                {retailProductPerformance
                  .filter(p => !productSearchTerm || p.name.toLowerCase().includes(productSearchTerm.toLowerCase()) || p.category.toLowerCase().includes(productSearchTerm.toLowerCase()))
                  .map((p, i) => {
                    return (
                      <tr key={p.id || i} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 text-center">
                          <span className={`inline-flex items-center justify-center font-bold px-2 py-0.5 rounded text-[11px] border ${
                            i === 0 ? 'bg-amber-50 text-amber-800 border-amber-200' :
                            i === 1 ? 'bg-slate-100 text-slate-700 border-slate-300' :
                            i === 2 ? 'bg-orange-50 text-orange-800 border-orange-200' :
                            'bg-slate-50 text-slate-500 border-slate-200'
                          }`}>
                            #{i + 1}
                          </span>
                        </td>
                        <td className="p-3">
                          <p className="font-bold text-slate-900 leading-tight">{p.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-slate-400 font-mono">{p.id || p.barcode}</span>
                            {(p.vendorName || p.vendorId) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/admin/suppliers/${p.vendorId || p.vendorName}`);
                                }}
                                className="text-[10px] font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200 inline-flex items-center gap-1 transition-colors"
                                title={`Supplier: ${p.vendorName || p.vendorId}`}
                              >
                                <Building2 size={10} />
                                <span className="truncate max-w-[100px]">{p.vendorName || p.vendorId}</span>
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                            {p.category}
                          </span>
                        </td>
                        <td className="p-3 text-right font-semibold text-slate-900">
                          ₹{p.sellingPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </td>
                        <td className="p-3 text-right text-slate-500">
                          ₹{p.purchaseRate.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </td>
                        <td className="p-3 text-right">
                          <span className={`font-bold ${p.margin >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {p.margin.toFixed(1)}%
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
                            {p.qtySold}
                          </span>
                        </td>
                        <td className="p-3 text-right font-bold text-slate-900">
                          ₹{p.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded inline-flex items-center gap-1 ${
                            p.stock <= 5 ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-slate-50 text-slate-700 border border-slate-200'
                          }`}>
                            {p.stock <= 5 && <AlertTriangle size={11} className="text-red-500" />}
                            {p.stock}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => setSelectedProductDetails(p)}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2.5 py-1 rounded bg-blue-50 hover:bg-blue-100 transition-colors inline-flex items-center gap-1"
                            title="View Customers"
                          >
                            <Users size={12} /> Insights
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                {retailProductPerformance.length === 0 && (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-slate-400 font-medium">No product sales recorded for this date range</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[420px] custom-scrollbar border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-slate-50 z-10">
                <tr className="text-[11px] text-slate-500 uppercase tracking-widest border-b border-slate-200">
                  <th className="p-3.5 font-semibold text-center w-16">Rank</th>
                  <th className="p-3.5 font-semibold">Service Name</th>
                  <th className="p-3.5 font-semibold">Category</th>
                  <th className="p-3.5 font-semibold text-right">Avg Price</th>
                  <th className="p-3.5 font-semibold text-center">Times Rendered</th>
                  <th className="p-3.5 font-semibold text-right">Total Service Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium">
                {servicePerformance
                  .filter(s => !productSearchTerm || s.name.toLowerCase().includes(productSearchTerm.toLowerCase()))
                  .map((s, i) => (
                    <tr key={s.id || i} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 text-center">
                        <span className={`inline-flex items-center justify-center font-bold px-2 py-0.5 rounded text-[11px] border ${
                          i === 0 ? 'bg-blue-50 text-blue-800 border-blue-200' :
                          i === 1 ? 'bg-slate-100 text-slate-700 border-slate-300' :
                          i === 2 ? 'bg-orange-50 text-orange-800 border-orange-200' :
                          'bg-slate-50 text-slate-500 border-slate-200'
                        }`}>
                          #{i + 1}
                        </span>
                      </td>
                      <td className="p-3 font-bold text-slate-900">{s.name}</td>
                      <td className="p-3 text-slate-500">{s.category}</td>
                      <td className="p-3 text-right font-semibold text-slate-700">₹{s.avgPrice.toFixed(0)}</td>
                      <td className="p-3 text-center">
                        <span className="bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded border border-blue-100">
                          {s.timesPerformed}
                        </span>
                      </td>
                      <td className="p-3 text-right font-bold text-slate-900">
                        ₹{s.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  ))}
                {servicePerformance.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400 font-medium">No salon service sales recorded for this date range</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* View Product Modal */}
      {selectedProductDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
          >
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                  <Package className="text-blue-600" size={28} />
                  Product Sales Intelligence
                </h2>
                <p className="text-slate-500 font-bold text-sm mt-1">
                  Showing customers who purchased <span className="text-blue-600">"{selectedProductDetails.name}"</span>
                </p>
              </div>
              <button
                onClick={() => setSelectedProductDetails(null)}
                className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 rounded-full text-slate-400 hover:text-rose-500 hover:border-rose-100 transition-all hover:rotate-90"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div className="bg-blue-600 p-4 rounded-2xl text-white">
                  <p className="text-[10px] uppercase font-black opacity-80">Product ID</p>
                  <p className="text-base font-mono font-black truncate">{selectedProductDetails.id}</p>
                </div>
                <div className="bg-slate-100 p-4 rounded-2xl border border-slate-200">
                  <p className="text-[10px] uppercase font-black text-slate-400">Total Units Sold</p>
                  <p className="text-xl font-black text-slate-800">{selectedProductDetails.qtySold}</p>
                </div>
                <div className="bg-slate-100 p-4 rounded-2xl border border-slate-200">
                  <p className="text-[10px] uppercase font-black text-slate-400">Total Revenue</p>
                  <p className="text-xl font-black text-slate-800">₹{selectedProductDetails.revenue.toLocaleString()}</p>
                </div>
                <div className="bg-slate-100 p-4 rounded-2xl border border-slate-200">
                  <p className="text-[10px] uppercase font-black text-slate-400">Remaining Stock</p>
                  <p className={`text-xl font-black ${selectedProductDetails.stock <= 5 ? 'text-rose-600' : 'text-slate-800'}`}>{selectedProductDetails.stock}</p>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                <div className="p-5 bg-slate-50 border-b border-slate-200">
                  <h3 className="font-black text-slate-800 flex items-center gap-2">
                    <Users size={18} className="text-blue-500" />
                    Purchasing Customers
                  </h3>
                </div>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white text-[10px] text-slate-400 uppercase font-bold tracking-widest border-b border-slate-100">
                      <th className="p-4">Customer Details</th>
                      <th className="p-4">Purchase Qty</th>
                      <th className="p-4">Purchase Date</th>
                      <th className="p-4 text-right">Total Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 font-medium">
                    {productPurchases.map((hist: any, idx: number) => (
                      <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                        <td className="p-4">
                          <p className="font-bold text-slate-800">{hist.customerName}</p>
                          <p className="text-[10px] text-slate-400">PH: {hist.customerPhone}</p>
                        </td>
                        <td className="p-4">
                          <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-black">{hist.quantity} Units</span>
                        </td>
                        <td className="p-4 text-slate-500 text-xs font-bold">
                          {format(new Date(hist.date), 'dd MMM yyyy')}
                        </td>
                        <td className="p-4 text-right font-black text-slate-800">
                          ₹{hist.total.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    {productPurchases.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-10 text-center text-slate-400 font-bold italic">No purchase history found for this product</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedProductDetails(null)}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-black text-sm hover:bg-blue-700 transition"
              >
                CLOSE DETAILS
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Hidden Report Container */}
      <div id="report-container" style={{ display: 'none', width: '1000px', backgroundColor: 'white', color: 'black', padding: '40px', fontFamily: 'Inter, sans-serif' }}>
        {/* Header Section */}
        <div style={{ textAlign: 'center', marginBottom: '40px', borderBottom: '2px solid #f1f5f9', paddingBottom: '20px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', margin: '0' }}>Business Dashboard Report</h1>
          <p style={{ color: '#64748b', marginTop: '10px', fontSize: '16px' }}>
            Period: {format(new Date(startDate), 'dd MMM yyyy')} - {format(new Date(endDate), 'dd MMM yyyy')}
          </p>
          <p style={{ color: '#94a3b8', fontSize: '14px' }}>
            Generated on: {format(new Date(), 'dd MMM yyyy, hh:mm a')}
          </p>
        </div>

        {/* Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '20px', marginBottom: '40px' }}>
          {reportKpis.map((kpi, i) => (
            <div key={i} style={{ padding: '20px', border: '1px solid #e2e8f0', borderRadius: '12px', textAlign: 'center', backgroundColor: '#f8fafc' }}>
              <p style={{ fontSize: '14px', color: '#64748b', fontWeight: 'medium', marginBottom: '8px' }}>{kpi.label}</p>
              <p style={{ fontSize: '20px', fontWeight: 'bold', color: '#1e293b' }}>{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Charts Sections */}
        {(['day', 'week', 'month', 'year'] as const).map((view) => (
          <div key={view} style={{ 
            marginBottom: '40px', 
            breakBefore: (view === 'month' || view === 'year') ? 'page' : 'auto',
            paddingTop: (view === 'month' || view === 'year') ? '20px' : '0' 
          }}>
            <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '20px', borderLeft: '4px solid #3b82f6', paddingLeft: '15px', color: '#1e293b', textTransform: 'capitalize' }}>
              {view === 'day' ? 'Daily' : view === 'week' ? 'Weekly' : view === 'month' ? 'Monthly' : 'Yearly'} Analytics
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div style={{ border: '1px solid #f1f5f9', borderRadius: '12px', padding: '15px', backgroundColor: '#fff' }}>
                <h3 style={{ fontSize: '13px', fontWeight: 'bold', textAlign: 'center', marginBottom: '10px' }}>Revenue vs Expenses</h3>
                <BarChart width={440} height={220} data={allPeriodsData[view]} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{fontSize: 9}} />
                  <YAxis tick={{fontSize: 9}} tickFormatter={(v) => `₹${v/1000}k`} />
                  <Bar dataKey="income" name="Earnings" fill="#10b981" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="expense" name="Expenses" fill="#ef4444" radius={[3, 3, 0, 0]} />
                </BarChart>
              </div>
              <div style={{ border: '1px solid #f1f5f9', borderRadius: '12px', padding: '15px', backgroundColor: '#fff' }}>
                <h3 style={{ fontSize: '13px', fontWeight: 'bold', textAlign: 'center', marginBottom: '10px' }}>Revenue Distribution</h3>
                <PieChart width={440} height={220}>
                  <Pie data={allPieData[view]} innerRadius={35} outerRadius={65} dataKey="value" stroke="#fff" strokeWidth={2}>
                    {allPieData[view].map((entry: any, index: number) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                  </Pie>
                  <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{fontSize: '9px'}} />
                </PieChart>
              </div>
            </div>
          </div>
        ))}

        {/* Best Selling Products Graph (Pricing) */}
        <div style={{ marginBottom: '40px', breakBefore: 'page', paddingTop: '20px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '20px', borderLeft: '4px solid #6366f1', paddingLeft: '15px', color: '#1e293b' }}>
            Best Selling Products UI (Pricing)
          </h2>
          <div style={{ border: '1px solid #f1f5f9', borderRadius: '12px', padding: '20px', backgroundColor: '#fff' }}>
            <BarChart width={900} height={350} data={topSellingProducts.slice(0, 8)} margin={{ top: 10, right: 10, left: 10, bottom: 80 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="chartLabel" interval={0} angle={-25} textAnchor="end" tick={{fontSize: 10, fontWeight: 600}} tickFormatter={(val) => val.length > 20 ? val.substring(0, 20) + '...' : val} dy={15} />
              <YAxis tick={{fontSize: 10}} />
              <Bar dataKey="totalQty" name="Total Quantity" fill="#94a3b8" radius={[4, 4, 0, 0]} />
              <Bar dataKey="qtySold" name="Quantity Sold" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="stock" name="Remaining Stock" fill="#f97316" radius={[4, 4, 0, 0]} />
              <Legend verticalAlign="top" align="right" wrapperStyle={{paddingBottom: '20px', fontSize: '12px'}} />
            </BarChart>
          </div>
        </div>

        {/* Top Performing Products */}
        <div style={{ marginBottom: '40px', breakBefore: 'page' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px', borderLeft: '4px solid #10b981', paddingLeft: '15px' }}>Top 5 Performing Products</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
            <thead style={{ backgroundColor: '#f8fafc', textAlign: 'left', fontSize: '10px', textTransform: 'uppercase' }}>
              <tr>
                <th style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>Rank</th>
                <th style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>Date</th>
                <th style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>Product ID</th>
                <th style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>Product Name</th>
                <th style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>Category</th>
                <th style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>Purchase Price</th>
                <th style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>Selling Price</th>
                <th style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>Qty Sold</th>
                <th style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>Stock</th>
              </tr>
            </thead>
            <tbody style={{ fontSize: '10px' }}>
              {topProducts.map((p, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px' }}>{p.rank}</td>
                  <td style={{ padding: '10px' }}>{p.date}</td>
                  <td style={{ padding: '10px', fontFamily: 'monospace' }}>{p.productId}</td>
                  <td style={{ padding: '10px', fontWeight: 'bold' }}>{p.name}</td>
                  <td style={{ padding: '10px' }}>{p.category}</td>
                  <td style={{ padding: '10px' }}>{p.purchasePrice}</td>
                  <td style={{ padding: '10px' }}>{p.sellingPrice}</td>
                  <td style={{ padding: '10px', fontWeight: 'bold', color: '#059669' }}>{p.qtySold}</td>
                  <td style={{ padding: '10px', color: p.stock <= 5 ? '#ef4444' : '#64748b' }}>{p.stock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Top Performing Salon Staff */}
        <div style={{ marginBottom: '40px', breakBefore: 'page' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px', borderLeft: '4px solid #6366f1', paddingLeft: '15px', color: '#1e293b' }}>
            Top Performing Salon Staff
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
            <thead style={{ backgroundColor: '#f8fafc', textAlign: 'left', fontSize: '10px', textTransform: 'uppercase' }}>
              <tr>
                <th style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>Rank</th>
                <th style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>Staff Name</th>
                <th style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>Role / Designation</th>
                <th style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>Services Rendered</th>
                <th style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>Appointments</th>
                <th style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>Revenue Generated</th>
                <th style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>Commission Earned</th>
              </tr>
            </thead>
            <tbody style={{ fontSize: '10px' }}>
              {topStaff.map((s, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px', fontWeight: 'bold' }}>#{s.rank}</td>
                  <td style={{ padding: '10px', fontWeight: 'bold', color: '#1e293b' }}>{s.name}</td>
                  <td style={{ padding: '10px', color: '#64748b' }}>{s.role}</td>
                  <td style={{ padding: '10px', fontWeight: 'bold', color: '#3b82f6' }}>{s.servicesCount}</td>
                  <td style={{ padding: '10px', color: '#64748b' }}>{s.appointments}</td>
                  <td style={{ padding: '10px', fontWeight: 'bold', color: '#059669' }}>{s.revenue}</td>
                  <td style={{ padding: '10px', fontWeight: 'bold', color: '#d97706' }}>{s.commission}</td>
                </tr>
              ))}
              {topStaff.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>No staff performance data available</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Low Stock Products Section */}
        <div style={{ marginBottom: '50px', breakBefore: 'page' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px', borderLeft: '4px solid #ef4444', paddingLeft: '15px', color: '#1e293b' }}>
            Low Stock Products Details
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
            <thead style={{ backgroundColor: '#fef2f2' }}>
              <tr style={{ textAlign: 'left', fontSize: '9px', textTransform: 'uppercase', color: '#64748b' }}>
                <th style={{ padding: '8px', borderBottom: '1px solid #e2e8f0' }}>S.No</th>
                <th style={{ padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Date</th>
                <th style={{ padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Supplier Name</th>
                <th style={{ padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Supplier ID</th>
                <th style={{ padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Product Name</th>
                <th style={{ padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Series</th>
                <th style={{ padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Product ID</th>
                <th style={{ padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Category</th>
                <th style={{ padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Purchase Price</th>
                <th style={{ padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Total Qty</th>
                <th style={{ padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Sold Out (qty sold)</th>
                <th style={{ padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Available Stock</th>
              </tr>
            </thead>
            <tbody style={{ fontSize: '9px' }}>
              {lowStockProducts.map((p, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: p.stock === 0 ? '#fff1f2' : 'transparent' }}>
                  <td style={{ padding: '8px' }}>{i + 1}</td>
                  <td style={{ padding: '8px' }}>{p.purchaseDate ? format(new Date(p.purchaseDate), 'dd MMM yyyy') : 'N/A'}</td>
                  <td style={{ padding: '8px' }}>{p.vendorName || 'N/A'}</td>
                  <td style={{ padding: '8px', fontFamily: 'monospace' }}>#{p.vendorId?.slice(-8) || 'N/A'}</td>
                  <td style={{ padding: '8px', fontWeight: 'bold' }}>{p.name}</td>
                  <td style={{ padding: '8px' }}>#{p.hashtagNumber || 'N/A'}</td>
                  <td style={{ padding: '8px', fontFamily: 'monospace' }}>{p.id}</td>
                  <td style={{ padding: '8px' }}>{p.category || 'N/A'}</td>
                  <td style={{ padding: '8px' }}>₹{p.purchaseRate.toLocaleString()}</td>
                  <td style={{ padding: '8px' }}>{(p.qtySold || 0) + (p.stock || 0)}</td>
                  <td style={{ padding: '8px', color: '#059669', fontWeight: 'bold' }}>{p.qtySold || 0}</td>
                  <td style={{ padding: '8px', color: '#ef4444', fontWeight: 'bold' }}>{p.stock}</td>
                </tr>
              ))}
              {lowStockProducts.length === 0 && <tr><td colSpan={10} style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>No low stock products</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DashboardOverview;
