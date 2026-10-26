import React, { useState, useEffect, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import autoTable from 'jspdf-autotable';
import {
    Banknote,
    TrendingUp,
    TrendingDown,
    Calendar,
    Plus,
    Save,
    Calculator,
    AlertCircle,
    CheckCircle,
    Loader2,
    CreditCard,
    Smartphone,
    Coins,
    BarChart2,
    X,
    Pencil,
    Trash2,
    FileDown,
    Download,
    Printer,
    Clock
} from 'lucide-react';
import { daybookApi, DayBookEntry, CashTally, billingApi, Bill, staffApi, Commission } from '@/lib/api';
import { SyncIndicator } from '@/components/SyncIndicator';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const DENOMINATIONS = ["500", "200", "100", "50", "20", "10", "Coin"];

const parseAmount = (val: any) => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') return parseFloat(val) || 0;
    return 0;
};

const parseDate = (d: any) => {
    if (!d) return 0;
    // Handle Firestore Timestamps
    if (d.seconds) return d.seconds * 1000;
    if (d._seconds) return d._seconds * 1000;

    // Handle string format like "25 December 2025 at 22:02:33 UTC+5:30"
    if (typeof d === 'string' && d.includes(' at ')) {
        const cleaned = d.replace(' at ', ' ').replace('UTC', '');
        const date = new Date(cleaned);
        if (!isNaN(date.getTime())) return date.getTime();
    }

    const date = new Date(d);
    return isNaN(date.getTime()) ? 0 : date.getTime();
};

const getBillSystemType = (b: any) => {
    if (b.billType) {
        if (b.billType.toUpperCase() === "Retail") return "Retail";
        if (b.billType.toUpperCase() === "RETAIL") return "Retail";
    }
    if (b.systemType) return b.systemType;
    const id = (b.invoiceNumber || b.id || "").toString();
    if (id.startsWith("MSWS")) return "Retail";
    if (id.startsWith("MSRE")) return "Retail";
    return "Retail"; // Default to Retail
};

const DailyActions = () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const [startDate, setStartDate] = useState(today);
    const [endDate, setEndDate] = useState(today);
    const [loading, setLoading] = useState(false);
    const [entries, setEntries] = useState<DayBookEntry[]>([]);
    const [bills, setBills] = useState<Bill[]>([]);
    const [commissions, setCommissions] = useState<Commission[]>([]);
    const [salesSummary, setSalesSummary] = useState({ total: 0, cash: 0, upi: 0, card: 0 });
    const [isSyncing, setIsSyncing] = useState(false);
    const [showGraph, setShowGraph] = useState(false);
    const [isEntrySaving, setIsEntrySaving] = useState(false);
    const [isTallySaving, setIsTallySaving] = useState(false);

    // New Entry Form State
    const [newEntry, setNewEntry] = useState({
        type: 'EXPENSE' as 'INCOME' | 'EXPENSE',
        description: '',
        amount: '',
        paymentMethod: 'Cash' as 'Cash' | 'UPI' | 'Card'
    });
    const [editingId, setEditingId] = useState<string | null>(null);
    const [systemTypeFilter, setSystemTypeFilter] = useState<'All' | 'Retail' | 'Retail'>('All');

    // Tally State
    const [openingBalance, setOpeningBalance] = useState<string>('');
    const [denominations, setDenominations] = useState<Record<string, string>>({});

    const graphRef = useRef<HTMLDivElement>(null);
    const fullPageRef = useRef<HTMLDivElement>(null);
    const accountReportRef = useRef<HTMLDivElement>(null);
    const sectionSummaryRef = useRef<HTMLDivElement>(null);
    const sectionVerificationRef = useRef<HTMLDivElement>(null);
    const sectionRevenueRef = useRef<HTMLDivElement>(null);
    const sectionExpenseRef = useRef<HTMLDivElement>(null);

    // --- Fetch Data ---
    const [viewMode, setViewMode] = useState<'DAY' | 'MONTH' | 'YEAR'>('DAY');
    const [rangeData, setRangeData] = useState<{ date: string; income: number; expense: number }[]>([]);

    // --- Fetch Data ---
    const fetchData = async () => {
        setLoading(true);
        setIsSyncing(true);
        try {
            if (viewMode === 'DAY') {
                if (new Date(startDate) > new Date(endDate)) {
                    toast.error("Start date cannot be after End date");
                    setLoading(false);
                    setIsSyncing(false);
                    return;
                }

                const [summaryRes, tallyRes, billsRes, staffCommRes] = await Promise.all([
                    daybookApi.getSummary(undefined, startDate, endDate),
                    daybookApi.getTally(startDate),
                    billingApi.getAll(), // Use getAll and filter locally to ensure nothing is missed
                    staffApi.getAllCommissions().catch(() => ({ data: [] }))
                ]);

                if (summaryRes.data) {
                    const data: any = summaryRes.data;
                    if (Array.isArray(data)) {
                        setEntries(data);
                    } else if (typeof data === 'object') {
                        setEntries(Array.isArray(data.entries) ? data.entries : []);
                        setSalesSummary(data.salesSummary || { total: 0, cash: 0, upi: 0, card: 0 });
                    }
                }

                // Process Commissions
                let allCommissions: Commission[] = [];
                if (staffCommRes.data) {
                    const staffData = Array.isArray(staffCommRes.data) ? staffCommRes.data : ((staffCommRes.data as any).data || (staffCommRes.data as any).commissions || []);
                    allCommissions = [...allCommissions, ...(staffData as unknown as Commission[])];
                }

                // Filter out commissions to only keep PAID and within date range
                const filteredCommissions = allCommissions.filter(c => {
                    if (c.status !== 'PAID') return false;
                    const cDate = parseDate(c.date || c.paidDate); // Paid date or created date
                    if (!cDate) return false;
                    const commDay = format(new Date(cDate), 'yyyy-MM-dd');

                    if (startDate === endDate) {
                        return commDay === startDate;
                    } else {
                        return commDay >= startDate && commDay <= endDate;
                    }
                });

                setCommissions(filteredCommissions);

                let extractedBills: Bill[] = [];
                if (billsRes.data) {
                    const bData: any = billsRes.data;

                    if (Array.isArray(bData)) {
                        extractedBills = bData;
                    } else if (bData && typeof bData === 'object') {
                        extractedBills = bData.bills || bData.data || bData.items || [];
                        if (extractedBills.length === 0) {
                            const firstArray = Object.values(bData).find(v => Array.isArray(v));
                            if (firstArray) extractedBills = firstArray as Bill[];
                        }
                    }

                    // Frontend filtering to be extra safe about dates and status
                    const filteredBills = extractedBills.filter(b => {
                        if (!b.createdAt) return true;
                        
                        // Exclude non-paid bills from financial totals
                        const status = (b.status || "").toUpperCase();
                        const pm = (b.paymentMethod || "").toUpperCase();
                        if (status === "HOLD" || status === "CANCELLED") return false;
                        if (!status && (pm === "HOLD" || pm === "CANCELLED")) return false;

                        try {
                            const bDate = parseDate(b.createdAt);
                            if (!bDate) return false;
                            const billDay = format(new Date(bDate), 'yyyy-MM-dd');

                            if (startDate === endDate) {
                                return billDay === startDate;
                            } else {
                                return billDay >= startDate && billDay <= endDate;
                            }
                        } catch (e) {
                            return false;
                        }
                    });

                    setBills(filteredBills);
                }

                const tally = tallyRes.data;
                if (tally) {
                    // Check if the returned tally is for the SELECTED date or a previous one
                    // Normalize dates to strings to be safe
                    let tallyDate = '';
                    if (tally.date) {
                        try {
                            tallyDate = typeof tally.date === 'string' ? tally.date : format(new Date(tally.date), 'yyyy-MM-dd');
                        } catch (e) {
                            tallyDate = '';
                        }
                    }
                    const isSameDate = tallyDate === startDate;

                    if (isSameDate) {
                        // It is the current day's saved tally
                        const openBal = parseFloat(tally.openingBalance?.toString() || '0');
                        setOpeningBalance(tally.openingBalance?.toString() || '');

                        const denoms: Record<string, string> = {};
                        let denomTotal = 0;

                        if (tally.denominations) {
                            Object.entries(tally.denominations).forEach(([k, v]) => {
                                denoms[k] = v.toString();
                                const val = k === "Coin" ? 1 : parseInt(k);
                                denomTotal += (parseInt(v.toString()) || 0) * val;
                            });
                        }

                        // Heuristic: If Denominations sum exactly to Opening Balance AND No Transactions exist,
                        // it is likely an auto-carried forward record. 
                        // The user prefers to start with empty counts to verify physical cash manually.
                        const hasActivity = (summaryRes.data?.entries?.length || 0) > 0 || (extractedBills.length > 0);

                        // Use a small epsilon for float comparison just in case, though usually integers
                        const tallyTotal = tally.totalCashHand || 0;
                        const isAutoCarry = Math.abs(tallyTotal - openBal) < 1;

                        if (!hasActivity && isAutoCarry) {
                            setDenominations({});
                        } else {
                            setDenominations(denoms);
                        }
                    } else {
                        // It is a PREVIOUS day's tally -> Use its closing as Opening Balance, but CLEAR stored counts
                        // totalCashHand of yesterday is Opening Balance of today
                        setOpeningBalance(tally.totalCashHand?.toString() || '');
                        setDenominations({});
                    }
                } else {
                    setOpeningBalance('');
                    setDenominations({});
                }
            } else {
                // Fetch Range Data
                let start = '', end = '';
                const selectedDate = new Date(startDate);
                if (viewMode === 'MONTH') {
                    // Start of Month
                    start = format(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1), 'yyyy-MM-dd');
                    // End of Month
                    end = format(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0), 'yyyy-MM-dd');
                } else if (viewMode === 'YEAR') {
                    start = format(new Date(selectedDate.getFullYear(), 0, 1), 'yyyy-MM-dd');
                    end = format(new Date(selectedDate.getFullYear(), 11, 31), 'yyyy-MM-dd');
                }

                const [res, staffCommRes] = await Promise.all([
                    daybookApi.getRange(start, end),
                    staffApi.getAllCommissions()
                ]);
                const rawData = res.data?.dailyBreakdown || res.data?.chartData || [];

                // If filtering by sector, override income from bills for accurate range distribution
                let processedData = rawData;
                if (systemTypeFilter !== 'All') {
                    const billIncomes: Record<string, number> = {};
                    bills.forEach(bill => {
                         const bType = getBillSystemType(bill);
                         if (bType === systemTypeFilter) {
                            const dateKey = format(new Date(parseDate(bill.createdAt)), 'yyyy-MM-dd');
                            billIncomes[dateKey] = (billIncomes[dateKey] || 0) + parseAmount(bill.finalAmount || bill.amountPaid);
                         }
                    });

                    processedData = rawData.map((d: any) => ({
                        ...d,
                        income: billIncomes[format(new Date(parseDate(d.date)), 'yyyy-MM-dd')] || 0,
                        expense: 0 // Reset expenses to be recalculated from commissions only
                    }));
                }

                let allCommissions: any[] = [];
                if (staffCommRes.data) {
                    const staffData = Array.isArray(staffCommRes.data) ? staffCommRes.data : ((staffCommRes.data as any).data || (staffCommRes.data as any).commissions || []);
                    allCommissions = [...allCommissions, ...staffData];
                }
                const rangeCommissions = allCommissions.filter(c => c.status === 'PAID');

                if (viewMode === 'YEAR') {
                    // Force complete Jan-Dec x-axis
                    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                    const monthlyAgg: Record<string, { income: number; expense: number }> = {};

                    months.forEach(m => monthlyAgg[m] = { income: 0, expense: 0 });

                    processedData.forEach((d: any) => {
                        const dDate = new Date(parseDate(d.date));
                        if (!isNaN(dDate.getTime())) {
                            const mIndex = dDate.getMonth();
                            const mName = months[mIndex];
                            if (monthlyAgg[mName]) {
                                monthlyAgg[mName].income += (d.income || 0);
                                monthlyAgg[mName].expense += (d.expense || 0);
                            }
                        }
                    });

                    rangeCommissions.forEach(c => {
                        // Filter commissions by sector
                        const bId = (c.billId || "").toString();
                        const isRetailComm = bId.startsWith("MSWS");
                        const commType = isRetailComm ? "Retail" : "Retail";
                        if (systemTypeFilter !== 'All' && commType !== systemTypeFilter) return;

                        const cDate = parseDate(c.date || c.paidDate);
                        if (cDate) {
                            const dDate = new Date(cDate);
                            const commDay = format(dDate, 'yyyy-MM-dd');
                            if (commDay >= start && commDay <= end) {
                                const mName = months[dDate.getMonth()];
                                if (monthlyAgg[mName]) {
                                    monthlyAgg[mName].expense += parseAmount(c.staffCommissionAmount || c.commissionAmount || c.amount);
                                }
                            }
                        }
                    });

                    setRangeData(months.map(m => ({
                        date: m,
                        name: m,
                        income: monthlyAgg[m].income,
                        expense: monthlyAgg[m].expense
                    })));

                } else {
                    // MONTH Mode: Show Daily (Fill 1-lastDay)
                    const daysInMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate();
                    const fullMonthDesc: any[] = [];

                    for (let i = 1; i <= daysInMonth; i++) {
                        const currentD = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), i);
                        const dateStr = format(currentD, 'yyyy-MM-dd');

                        const found = processedData.find((d: any) => {
                            const dDate = parseDate(d.date);
                            return Boolean(dDate) && format(new Date(dDate), 'yyyy-MM-dd') === dateStr;
                        });

                        const dayComms = rangeCommissions.filter(c => {
                            const bId = (c.billId || "").toString();
                            const isRetailComm = bId.startsWith("MSWS");
                            const commType = isRetailComm ? "Retail" : "Retail";
                            if (systemTypeFilter !== 'All' && commType !== systemTypeFilter) return false;

                            const cDate = parseDate(c.date || c.paidDate);
                            return cDate && format(new Date(cDate), 'yyyy-MM-dd') === dateStr;
                        });
                        const commTotal = dayComms.reduce((sum, c) => sum + parseAmount(c.staffCommissionAmount || c.commissionAmount || c.amount), 0);

                        fullMonthDesc.push({
                            date: dateStr,
                            name: format(currentD, 'dd'), // Just Day Number for cleaner x-axis in month view, or 'dd MMM'
                            income: found ? found.income : 0,
                            expense: (found ? found.expense : 0) + commTotal
                        });
                    }
                    setRangeData(fullMonthDesc);
                }
            }
        } catch (error) {
            console.error("Failed to fetch data", error);
            // toast.error("Failed to load records"); // Suppress error for now as backend might not support it yet
        } finally {
            setLoading(false);
            setIsSyncing(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [startDate, endDate, viewMode]);

    // --- Handlers ---
    const handleAddEntry = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newEntry.description || !newEntry.amount) return;

        const amount = parseFloat(newEntry.amount);
        if (isNaN(amount) || amount <= 0) {
            toast.error("Please enter a valid amount");
            return;
        }

        setIsSyncing(true);
        setIsEntrySaving(true);
        try {
            // Determine the date/time for the entry
            let submissionDate = new Date(startDate);
            const now = new Date();

            // Default to current time on selected date for new entries or fallback
            submissionDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());

            if (editingId) {
                const original = entries.find(e => e.id === editingId);
                if (original) {
                    const originalTime = parseDate(original.date);
                    if (originalTime) {
                        submissionDate = new Date(originalTime);
                    }
                }
            }

            const payload: DayBookEntry = {
                type: newEntry.type,
                description: newEntry.description,
                amount: amount,
                date: submissionDate.toISOString(),
                paymentMethod: newEntry.paymentMethod
            };

            if (editingId) {
                await daybookApi.updateEntry(editingId, payload);
                toast.success("Entry updated");
            } else {
                await daybookApi.addEntry(payload);
                toast.success("Entry added");
            }

            setNewEntry({ type: 'EXPENSE', description: '', amount: '', paymentMethod: 'Cash' }); // Reset form
            setEditingId(null);
            fetchData(); // Refresh all data
        } catch (error) {
            toast.error(editingId ? "Failed to update entry" : "Failed to add entry");
        } finally {
            setIsSyncing(false);
            setIsEntrySaving(false);
        }
    };

    const handleEdit = (entry: DayBookEntry) => {
        setNewEntry({
            type: entry.type,
            description: entry.description,
            amount: entry.amount.toString(),
            paymentMethod: entry.paymentMethod || 'Cash'
        });
        setEditingId(entry.id || null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancelEdit = () => {
        setNewEntry({ type: 'EXPENSE', description: '', amount: '', paymentMethod: 'Cash' });
        setEditingId(null);
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("Are you sure you want to delete this entry?")) return;

        setIsSyncing(true);
        setIsEntrySaving(true);
        try {
            await daybookApi.deleteEntry(id);
            toast.success("Entry deleted");
            // Refresh list
            const res = await daybookApi.getSummary(undefined, startDate, endDate);
            if (res.data) {
                setEntries(res.data.entries || []);
                setSalesSummary(res.data.salesSummary || { total: 0, cash: 0, upi: 0, card: 0 });
            } else {
                // If response is null after delete (edge case), just clear entries
                setEntries([]);
                setSalesSummary({ total: 0, cash: 0, upi: 0, card: 0 });
            }
        } catch (error) {
            toast.error("Failed to delete entry");
        } finally {
            setIsSyncing(false);
            setIsEntrySaving(false);
        }
    };

    const handleSaveTally = async () => {
        const denomNumbers: Record<string, number> = {};
        Object.entries(denominations).forEach(([k, v]) => {
            const val = parseInt(v) || 0;
            if (val > 0) denomNumbers[k] = val;
        });

        const tally: CashTally = {
            date: startDate,
            openingBalance: parseFloat(openingBalance) || 0,
            expectedCash: systemNet,
            totalCashHand: physicalTotal,
            difference: physicalTotal - systemNet,
            denominations: denomNumbers,
            closedAt: new Date().toISOString(),
            isClosed: true
        };

        setIsSyncing(true);
        setIsTallySaving(true);
        try {
            await daybookApi.saveTally(tally);
            toast.success("Cash tally saved successfully");
        } catch (error) {
            toast.error("Failed to save tally");
        } finally {
            setIsSyncing(false);
            setIsTallySaving(false);
        }
    };

    const handleDenomChange = (denom: string, value: string) => {
        const val = value.replace(/[^0-9]/g, '');
        setDenominations(prev => ({ ...prev, [denom]: val }));
    };

    const {
        salesBucket,
        expenseBucket,
        availableBucket,
        systemNet,
        totalManualIncome,
        totalManualExpense,
        totalCommissionExpense
    } = useMemo(() => {
        const sales = { cash: 0, upi: 0, card: 0, total: 0 };
        const expense = { cash: 0, upi: 0, card: 0, total: 0 };

        // 1. Sales from Bills ONLY
        bills.forEach(b => {
            if (b.status === 'CANCELLED' || b.status === 'RETURNED' || b.status === 'HOLD') return;
            const bType = getBillSystemType(b);
            if (systemTypeFilter !== 'All' && bType !== systemTypeFilter) return;

            const method = (b.paymentMethod || 'Cash').toLowerCase();
            const finalAmt = parseAmount(b.finalAmount || b.amountPaid);

            if (method.includes('split') || method.includes('cash +') || (b.cashAmount || b.onlineAmount)) {
                const cashAmt = parseAmount(b.cashAmount);
                const upiAmt = parseAmount(b.onlineAmount);
                if (cashAmt === 0 && upiAmt === 0) {
                    // Fallback to cash if both 0 but it's a split format
                    sales.cash += finalAmt;
                    sales.total += finalAmt;
                } else {
                    sales.cash += cashAmt;
                    sales.upi += upiAmt;
                    sales.total += (cashAmt + upiAmt);
                }
            } else {
                if (method.includes('cash')) sales.cash += finalAmt;
                else if (method.includes('upi') || method.includes('online')) sales.upi += finalAmt;
                else sales.card += finalAmt;
                sales.total += finalAmt;
            }
        });

        // 2. Expenses from DayBookEntries + Commissions
        let manualIncomesTotal = 0;
        let manualIncomesCash = 0;
        let manualExpTotal = 0;
        let commExpTotal = 0;

        entries.forEach(e => {
            const amount = parseAmount(e.amount);
            const method = (e.paymentMethod || 'Cash').toLowerCase();

            if (e.type === 'INCOME') {
                manualIncomesTotal += amount;
                if (method.includes('cash')) manualIncomesCash += amount;
            } else {
                manualExpTotal += amount;
                if (method.includes('cash')) expense.cash += amount;
                else if (method.includes('upi')) expense.upi += amount;
                else expense.card += amount;
                expense.total += amount;
            }
        });

        commissions.forEach(c => {
            const commType = "Retail";
            if (systemTypeFilter !== 'All' && commType !== systemTypeFilter) return;

            const amount = parseAmount(c.staffCommissionAmount || c.commissionAmount || c.amount);
            const method = (c.paymentMethod || 'Cash').toLowerCase();
            commExpTotal += amount;

            if (method.includes('cash')) expense.cash += amount;
            else if (method.includes('upi')) expense.upi += amount;
            else expense.card += amount;
            expense.total += amount;
        });

        const available = {
            cash: sales.cash - expense.cash,
            upi: sales.upi - expense.upi,
            card: sales.card - expense.card,
            total: sales.total - expense.total
        };

        const open = parseAmount(openingBalance);

        // Expected Net Cash Calculation
        const sysNet = open + sales.cash + manualIncomesCash - expense.cash;

        return {
            salesBucket: sales,
            expenseBucket: expense,
            availableBucket: available,
            systemNet: sysNet,
            totalManualIncome: manualIncomesTotal,
            totalManualExpense: manualExpTotal,
            totalCommissionExpense: commExpTotal
        };
    }, [bills, entries, commissions, openingBalance, systemTypeFilter]);

    const physicalTotal = useMemo(() => {
        const cash = DENOMINATIONS.reduce((acc, d) => {
            const count = parseInt(denominations[d] || '0');
            const val = d === "Coin" ? 1 : parseInt(d);
            return acc + (count * val);
        }, 0);
        return cash;
    }, [denominations]);

    const difference = physicalTotal - systemNet;
    const isMatched = Math.abs(difference) < 1;

    // --- Combined Transaction List ---
    const allTransactions = useMemo(() => {
        // Transform bills to generic transaction shape
        const billTrans = bills.filter(b => b.status !== 'HOLD').map(b => ({
            id: b.id,
            type: 'SALE',
            description: `Sale - ${b.customerName || 'Guest'} (${b.paymentMethod || 'Unknown'})`,
            amount: parseAmount(b.finalAmount),
            time: parseDate(b.createdAt),
            isBill: true,
            rawBill: b,
            paymentMethod: b.paymentMethod,
            isCommission: false,
            systemType: getBillSystemType(b)
        })).filter(b => systemTypeFilter === 'All' || b.systemType === systemTypeFilter);

        // Transform manual entries
        const manualTrans = entries.map(e => ({
            id: e.id,
            type: e.type,
            description: e.description,
            amount: parseAmount(e.amount),
            time: parseDate(e.date),
            isBill: false,
            rawBill: null,
            paymentMethod: e.paymentMethod,
            isCommission: false
        }));

        // Transform commissions to expense entries
        const commTrans = commissions.map(c => {
            const method = (c.paymentMethod || 'Cash');
            const isStaffComm = !!(c.staffId || c.staffName || c.staffCommissionAmount);
            const commTypeStr = 'Staff Commission';
            const name = c.staffName || 'Unknown';
            return {
                id: c.id,
                type: 'EXPENSE',
                description: `${commTypeStr} | ${name} | ID: ${c.billId || 'Manual'} | Mode: ${method.toUpperCase()}`,
                amount: parseAmount(c.staffCommissionAmount || c.commissionAmount || c.amount),
                time: parseDate(c.date || c.paidDate),
                isBill: false,
                rawBill: null,
                paymentMethod: method,
                isCommission: true,
                systemType: (c.billId || "").toString().startsWith("MSWS") ? "Retail" : "Retail"
            };
        }).filter(c => systemTypeFilter === 'All' || c.systemType === systemTypeFilter);

        // Merge and sort by time (descending)
        return [...billTrans, ...manualTrans, ...commTrans].sort((a, b) => b.time - a.time);
    }, [bills, entries, commissions, systemTypeFilter]);


    // --- Chart Data ---
    const chartData = useMemo(() => {
        const data = [
            { name: 'Cash Sales', amount: salesBucket.cash },
            { name: 'UPI Sales', amount: salesBucket.upi },
            { name: 'Card Sales', amount: salesBucket.card },
        ];

        // Only include manual expenses in 'All' view, otherwise show only commissions
        const expenseAmt = systemTypeFilter === 'All' 
            ? totalManualExpense + totalCommissionExpense 
            : totalCommissionExpense;
        
        data.push({ name: 'Expenses', amount: expenseAmt });

        // Add Manual Income if any in 'All' view
        if (systemTypeFilter === 'All' && totalManualIncome > 0) {
            data.push({ name: 'Manual Inc', amount: totalManualIncome });
        }

        return data;
    }, [salesBucket, totalManualIncome, totalManualExpense, totalCommissionExpense, systemTypeFilter]);

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-white p-3 border border-slate-200 shadow-xl rounded-lg">
                    <p className="text-sm font-bold text-slate-700 mb-1">{label}</p>
                    {payload.map((entry: any, index: number) => (
                        <p key={index} className="text-sm font-mono flex items-center justify-between gap-4" style={{ color: entry.color }}>
                            <span>{entry.name}:</span>
                            <span className="font-bold">₹{entry.value.toLocaleString()}</span>
                        </p>
                    ))}
                </div>
            );
        }
        return null;
    };


    // Render Sales Summary Card
    const SalesCard = ({ title, amount, color, icon: Icon }: any) => (
        <div className={`p-4 rounded-xl border ${color} bg-white shadow-sm flex flex-col justify-between`}>
            <div className="flex justify-between items-start mb-2">
                <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">{title}</span>
                <div className={`p-1.5 rounded-lg ${color.replace('border-', 'bg-').replace('200', '50')}`}>
                    <Icon size={16} className={color.replace('border-', 'text-').replace('200', '600')} />
                </div>
            </div>
            <span className="text-xl font-bold text-slate-800">₹{amount.toLocaleString()}</span>
        </div>
    );

    const drawMiniBarChart = (doc: jsPDF, startX: number, startY: number, width: number, height: number, data: { label: string, value: number, color: number[] }[], title: string) => {
        const padding = 12;
        const chartW = width - (padding * 2);
        const chartH = height - (padding * 2.5);

        // Subtile Background Frame
        doc.setDrawColor(241, 245, 249);
        doc.setFillColor(252, 253, 254);
        doc.roundedRect(startX, startY, width, height, 2, 2, 'FD');

        // Title
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(51, 65, 85);
        doc.text(title, startX + padding, startY + 10);

        // Axes
        doc.setDrawColor(226, 232, 240);
        doc.line(startX + padding, startY + height - padding, startX + width - padding, startY + height - padding);

        const maxVal = Math.max(...data.map(d => d.value), 100);
        const barW = (chartW / data.length) * 0.55;
        const gap = (chartW / data.length) * 0.45;

        data.forEach((d, i) => {
            const barH = (d.value / maxVal) * chartH;
            const x = startX + padding + (i * (barW + gap)) + (gap / 2);
            const y = startY + height - padding - barH;

            if (d.color && d.color.length >= 3) {
                doc.setFillColor(d.color[0], d.color[1], d.color[2]);
                doc.rect(x, y, barW, barH, 'F');
            }

            doc.setFontSize(7);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(100, 116, 139);
            doc.text(`Rs.${Math.round(d.value)}`, x + (barW / 2), y - 2, { align: 'center' });
            doc.text(d.label, x + (barW / 2), startY + height - padding + 5, { align: 'center' });
        });
    };

    const drawDualBarChart = (doc: jsPDF, startX: number, startY: number, width: number, height: number, data: { label: string, income: number, expense: number }[], title: string) => {
        const padding = 12;
        const chartW = width - (padding * 2);
        const chartH = height - (padding * 2.5);

        // Subtile Background Frame
        doc.setDrawColor(241, 245, 249);
        doc.setFillColor(252, 253, 254);
        doc.roundedRect(startX, startY, width, height, 2, 2, 'FD');

        // Title
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(51, 65, 85);
        doc.text(title, startX + padding, startY + 10);

        // Axes
        doc.setDrawColor(226, 232, 240);
        doc.line(startX + padding, startY + height - padding, startX + width - padding, startY + height - padding);

        const maxVal = Math.max(...data.map(d => Math.max(d.income, d.expense)), 100);
        const slotW = chartW / data.length;
        const barW = slotW * 0.35;
        const gap = slotW * 0.1;

        data.forEach((d, i) => {
            const xBase = startX + padding + (i * slotW) + (slotW * 0.1);

            // Income
            const incomeH = (d.income / maxVal) * chartH;
            const incomeY = startY + height - padding - incomeH;
            doc.setFillColor(34, 197, 94);
            doc.rect(xBase, incomeY, barW, incomeH, 'F');

            // Expense
            const expenseH = (d.expense / maxVal) * chartH;
            const expenseY = startY + height - padding - expenseH;
            doc.setFillColor(239, 68, 68);
            doc.rect(xBase + barW + gap, expenseY, barW, expenseH, 'F');

            const showLabel = data.length <= 15 || i % Math.ceil(data.length / 15) === 0;
            if (showLabel) {
                doc.setFontSize(6);
                doc.setFont("helvetica", "normal");
                doc.setTextColor(100, 116, 139);
                doc.text(d.label, xBase + barW + (gap / 2), startY + height - padding + 4, { align: 'center' });
            }
        });

        // Legend Bottom Right
        doc.setFontSize(7);
        doc.setFillColor(34, 197, 94);
        doc.rect(startX + width - 45, startY + 5, 4, 4, 'F');
        doc.setTextColor(100, 116, 139);
        doc.text("In", startX + width - 40, startY + 8.5);

        doc.setFillColor(239, 68, 68);
        doc.rect(startX + width - 30, startY + 5, 4, 4, 'F');
        doc.text("Out", startX + width - 25, startY + 8.5);
    };

    const appendAnalysisPages = async (doc: jsPDF, startY?: number) => {
        const now = new Date(startDate);
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 20;
        let currentY = startY !== undefined ? startY : margin;

        // Force a new page if startY is too low or if we're at the very bottom
        if (startY !== undefined && startY > pageHeight - 60) {
            doc.addPage();
            currentY = margin;
        }

        // Fetch Month and Year Data 
        const startOfMonth = format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd');
        const endOfMonth = format(new Date(now.getFullYear(), now.getMonth() + 1, 0), 'yyyy-MM-dd');
        const startOfYear = format(new Date(now.getFullYear(), 0, 1), 'yyyy-MM-dd');
        const endOfYear = format(new Date(now.getFullYear(), 11, 31), 'yyyy-MM-dd');

        const [monthRes, yearRes] = await Promise.all([
            daybookApi.getRange(startOfMonth, endOfMonth),
            daybookApi.getRange(startOfYear, endOfYear)
        ]);

        // Process Month Data
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const fullMonthData: { label: string, income: number, expense: number }[] = [];
        const fetchedMonthData = monthRes.data?.dailyBreakdown || monthRes.data?.chartData || [];

        for (let i = 1; i <= daysInMonth; i++) {
            const targetDate = new Date(now.getFullYear(), now.getMonth(), i);
            const targetDateStr = format(targetDate, 'yyyy-MM-dd');

            const found = fetchedMonthData.find((d: any) => {
                const dDate = new Date(parseDate(d.date));
                return !isNaN(dDate.getTime()) && format(dDate, 'yyyy-MM-dd') === targetDateStr;
            });
            fullMonthData.push({
                label: i.toString(),
                income: found ? (found.income || 0) : 0,
                expense: found ? (found.expense || 0) : 0
            });
        }

        // Process Year Data
        const yearRawData = yearRes.data?.dailyBreakdown || yearRes.data?.chartData || [];
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const fullYearData = months.map(m => ({ label: m, income: 0, expense: 0 }));

        yearRawData.forEach((d: any) => {
            const dDate = new Date(parseDate(d.date));
            if (!isNaN(dDate.getTime())) {
                const mIndex = dDate.getMonth();
                if (mIndex >= 0 && mIndex < 12) {
                    fullYearData[mIndex].income += (d.income || 0);
                    fullYearData[mIndex].expense += (d.expense || 0);
                }
            }
        });

        // --- PDF Generation ---
        doc.setFontSize(18);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42); // slate-900
        doc.text("FINANCIAL ANALYSIS SUMMARY", 14, currentY);

        // Summary Table
        autoTable(doc, {
            startY: currentY + 12,
            head: [['Category', 'Total Sales', 'Total Expenses', 'Available Amount']],
            body: [
                ['Total Amount', `Rs.${salesBucket.total.toLocaleString()}`, `Rs.${expenseBucket.total.toLocaleString()}`, `Rs.${availableBucket.total.toLocaleString()}`],
                ['Cash Amount', `Rs.${salesBucket.cash.toLocaleString()}`, `Rs.${expenseBucket.cash.toLocaleString()}`, `Rs.${availableBucket.cash.toLocaleString()}`],
                ['UPI Amount', `Rs.${salesBucket.upi.toLocaleString()}`, `Rs.${expenseBucket.upi.toLocaleString()}`, `Rs.${availableBucket.upi.toLocaleString()}`],
                ['Card Amount', `Rs.${salesBucket.card.toLocaleString()}`, `Rs.${expenseBucket.card.toLocaleString()}`, `Rs.${availableBucket.card.toLocaleString()}`],
            ],
            theme: 'grid',
            headStyles: { fillColor: [37, 99, 235], fontSize: 10, halign: 'center' },
            columnStyles: {
                0: { fontStyle: 'bold' },
                1: { halign: 'right', textColor: [34, 197, 94] },
                2: { halign: 'right', textColor: [239, 68, 68] },
                3: { halign: 'right', fontStyle: 'bold' }
            },
            styles: { fontSize: 9, cellPadding: 4 }
        });

        currentY = (doc as any).lastAutoTable.finalY + 8;

        autoTable(doc, {
            startY: currentY,
            body: [
                ['Expected Net Cash (System)', `Rs. ${systemNet.toLocaleString()}`]
            ],
            theme: 'plain',
            styles: { fontSize: 10, fontStyle: 'bold' }
        });

        currentY = (doc as any).lastAutoTable.finalY + 15;

        // Check if chart header fits
        if (currentY > pageHeight - 30) {
            doc.addPage();
            currentY = margin;
        }

        // --- DRAW ANALYSIS CHARTS ---
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42); // slate-900
        doc.text("FINANCIAL ANALYSIS CHARTS", 14, currentY);
        currentY += 12;

        const dayChartItems = [
            { label: 'Total', value: salesBucket.total, color: [59, 130, 246] },
            { label: 'Cash', value: salesBucket.cash, color: [16, 185, 129] },
            { label: 'UPI', value: salesBucket.upi, color: [168, 85, 247] },
            { label: 'Card', value: salesBucket.card, color: [249, 115, 22] },
            { label: 'Expenses', value: expenseBucket.total, color: [239, 68, 68] }
        ];

        if (currentY + 60 > pageHeight) { doc.addPage(); currentY = margin; }
        drawMiniBarChart(doc, 14, currentY, 182, 50, dayChartItems, startDate === endDate ? "Current Day Breakdown" : "Selected Range Breakdown");
        currentY += 60;

        // Monthly Chart (50mm height)
        if (currentY + 60 > pageHeight) { doc.addPage(); currentY = margin; }
        drawDualBarChart(doc, 14, currentY, 182, 50, fullMonthData, `Monthly Analysis (${format(now, 'MMMM yyyy')})`);
        currentY += 60;

        // Yearly Chart (50mm height)
        if (currentY + 60 > pageHeight) { doc.addPage(); currentY = margin; }
        drawDualBarChart(doc, 14, currentY, 182, 50, fullYearData, `Yearly Analysis (${now.getFullYear()})`);
    };

    const handleDownloadPDF = async () => {
        setIsSyncing(true);
        try {
            const doc = new jsPDF();
            await appendAnalysisPages(doc);
            const reportName = startDate === endDate ? startDate : `${startDate}_to_${endDate}`;
            doc.save(`Analysis_Report_${reportName}.pdf`);
            toast.success("Full analysis report generated!");
        } catch (error) {
            console.error("Full report generation failed", error);
            toast.error("Failed to generate full report.");
        } finally {
            setIsSyncing(false);
        }
    };

    const handleDownloadAccountingReport = async () => {
        setIsSyncing(true);
        try {
            const element = accountReportRef.current;
            if (!element) return;

            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                width: 794,
                windowWidth: 794
            });

            const imgData = canvas.toDataURL('image/png', 1.0);
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            const pageHeight = pdf.internal.pageSize.getHeight();

            let heightLeft = pdfHeight;
            let position = 0;

            pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
            heightLeft -= pageHeight;

            while (heightLeft > 0) {
                position = heightLeft - pdfHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
                heightLeft -= pageHeight;
            }

            // Calculate occupied height on the last page to pass as startY
            const occupiedHeight = pdfHeight % pageHeight || pageHeight;
            await appendAnalysisPages(pdf, occupiedHeight);

            const reportName = startDate === endDate ? startDate : `${startDate}_to_${endDate}`;
            pdf.save(`Day_Book_Report_${reportName}.pdf`);
            toast.success("Full consolidated report generated successfully!");
        } catch (error) {
            console.error("Report generation failed", error);
            toast.error("Failed to generate consolidated report");
        } finally {
            setIsSyncing(false);
        }
    };

    const handleDownloadFullPage = async () => {
        if (!fullPageRef.current) return;
        setIsSyncing(true);

        try {
            const element = fullPageRef.current;
            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                // This ensures we capture the full scrollable height even if the container is long
                height: element.scrollHeight,
                width: element.scrollWidth,
                onclone: (doc) => {
                    // Hide buttons/elements that shouldn't be in the PDF if needed
                    // For now, WYSIWYG as requested
                }
            });

            const imgData = canvas.toDataURL('image/png', 1.0);
            const pdf = new jsPDF('p', 'mm', 'a4');
            const imgProps = pdf.getImageProperties(imgData);
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

            const pageHeight = pdf.internal.pageSize.getHeight();
            let heightLeft = pdfHeight;
            let position = 0;

            pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
            heightLeft -= pageHeight;

            while (heightLeft >= 0) {
                position = heightLeft - pdfHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
                heightLeft -= pageHeight;
            }

            const reportName = startDate === endDate ? startDate : `${startDate}_to_${endDate}`;
            pdf.save(`Daily_Day_Book_Full_Report_${reportName}.pdf`);
            toast.success("Full page report downloaded!");
        } catch (error) {
            console.error("Full page export failed", error);
            toast.error("Failed to generate full page report");
        } finally {
            setIsSyncing(false);
        }
    };

    const handleDownloadGraph = () => {
        if (!graphRef.current) return;
        const svg = graphRef.current.querySelector('svg');
        if (!svg) {
            toast.error("Graph not found");
            return;
        }

        // --- FIXED: Reliable Scaling for Canvas Export ---
        const svgRect = svg.getBoundingClientRect();
        const width = 1200; // Use a fixed large width for high quality
        const height = (svgRect.height / svgRect.width) * width;

        const clonedSvg = svg.cloneNode(true) as SVGElement;
        clonedSvg.setAttribute('width', `${width}px`);
        clonedSvg.setAttribute('height', `${height}px`);
        // Force white background for the SVG internal area if needed
        clonedSvg.style.backgroundColor = 'white';

        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(clonedSvg);

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = width + 80;
        canvas.height = height + 100;

        const img = new Image();
        img.onload = () => {
            // Background
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Shadow/Border Effect
            ctx.strokeStyle = '#e2e8f0';
            ctx.strokeRect(20, 70, width + 40, height + 10);

            // Title
            ctx.font = 'bold 32px sans-serif';
            ctx.fillStyle = '#1e293b';
            ctx.fillText(`Financial Analysis: Earnings vs Expenses`, 40, 50);

            // Subtitle
            ctx.font = '20px sans-serif';
            ctx.fillStyle = '#64748b';
            ctx.fillText(`Mode: ${viewMode} | Date: ${format(new Date(startDate), 'dd MMM yyyy')}`, 40, 85);

            // Main SVG Data
            ctx.drawImage(img, 40, 110, width, height);

            const pngUrl = canvas.toDataURL('image/png', 1.0);
            const link = document.createElement('a');
            link.href = pngUrl;
            const reportName = startDate === endDate ? startDate : `${startDate}_to_${endDate}`;
            link.download = `Analysis_${viewMode}_${reportName}.png`;
            link.click();
        };

        // Encode SVG correctly for all browsers
        const svg64 = btoa(unescape(encodeURIComponent(svgString)));
        img.src = 'data:image/svg+xml;base64,' + svg64;
    };

    return (
        <div className="p-6 w-full space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold text-slate-800">Daily Day Book</h1>
                    <SyncIndicator isSyncing={isSyncing} />
                </div>
                <div className="flex items-center gap-2">

                    <button
                        onClick={handleDownloadAccountingReport}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-slate-800 border-slate-700 text-white hover:bg-slate-700 transition-all shadow-sm"
                        title="Download report (A4 PDF)"
                    >
                        <Printer size={18} />
                        <span className="text-sm font-medium">Download Report</span>
                    </button>
                    <button
                        onClick={() => setShowGraph(!showGraph)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${showGraph ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                        title="Toggle Analysis Graph"
                    >
                        {showGraph ? <X size={18} /> : <BarChart2 size={18} />}
                        <span className="text-sm font-medium">Analysis</span>
                    </button>
                    <div className="flex items-center gap-3 bg-slate-100 p-1 rounded-lg border border-slate-200">
                        <div className="flex items-center gap-2 px-2">
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="bg-transparent border-none focus:ring-0 text-sm font-medium text-slate-700 w-32 p-0"
                            />
                        </div>
                        <div className="w-px h-4 bg-slate-300"></div>
                        <div className="flex items-center gap-2 px-2">
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="bg-transparent border-none focus:ring-0 text-sm font-medium text-slate-700 w-32 p-0"
                            />
                        </div>
                        <button
                            onClick={fetchData}
                            className="bg-blue-600 text-white p-1.5 rounded-md hover:bg-blue-700 transition-colors shadow-sm"
                            title="Fetch Report"
                        >
                            <Calendar size={16} />
                        </button>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
            ) : (
                <div ref={fullPageRef} className="space-y-6">
                    {/* Financial Buckets - 3 Row Layout */}
                    {viewMode === 'DAY' && (
                        <div className="space-y-4">
                            {/* Row 1: TOTAL SALES */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <SalesCard title="Total Sales" amount={salesBucket.total} color="border-blue-200" icon={TrendingUp} />
                                <SalesCard title="Cash Sales" amount={salesBucket.cash} color="border-emerald-200" icon={Banknote} />
                                <SalesCard title="UPI Sales" amount={salesBucket.upi} color="border-purple-200" icon={Smartphone} />
                                <SalesCard title="Card Sales" amount={salesBucket.card} color="border-orange-200" icon={CreditCard} />
                            </div>

                            {/* Row 2: EXPENSES */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <SalesCard title="Total Expense" amount={expenseBucket.total} color="border-red-200" icon={TrendingDown} />
                                <SalesCard title="Cash Expense" amount={expenseBucket.cash} color="border-slate-200" icon={Banknote} />
                                <SalesCard title="UPI Expense" amount={expenseBucket.upi} color="border-slate-200" icon={Smartphone} />
                                <SalesCard title="Card Expense" amount={expenseBucket.card} color="border-slate-200" icon={CreditCard} />
                            </div>

                            {/* Row 3: NET AVAILABLE */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <SalesCard title="Net Available" amount={availableBucket.total} color="border-lime-200" icon={BarChart2} />
                                <SalesCard title="Available Cash" amount={availableBucket.cash} color="border-emerald-200" icon={Banknote} />
                                <SalesCard title="Available UPI" amount={availableBucket.upi} color="border-purple-200" icon={Smartphone} />
                                <SalesCard title="Available Card" amount={availableBucket.card} color="border-orange-200" icon={CreditCard} />
                            </div>
                        </div>
                    )}

                    {/* Graph Section */}
                    {showGraph && (
                        <div ref={graphRef} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 animate-in fade-in slide-in-from-top-4 duration-300">
                            <h3 className="text-base font-bold text-slate-700 mb-6 flex justify-between">
                                <span>Earnings vs Expenses</span>
                                <div className="text-sm font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                                    {startDate === endDate
                                        ? `Showing Report for ${format(new Date(startDate), 'dd MMM yyyy')}`
                                        : `Showing Report From ${format(new Date(startDate), 'dd MMM yyyy')} To ${format(new Date(endDate), 'dd MMM yyyy')}`
                                    }
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={handleDownloadPDF} className="px-3 py-1 rounded text-sm bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 flex items-center gap-2" title="Download Full Analysis Report">
                                        <Download size={14} />
                                    </button>
                                    <button onClick={() => setViewMode('DAY')} className={`px-3 py-1 rounded text-sm ${viewMode === 'DAY' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>Day</button>
                                    <button onClick={() => setViewMode('MONTH')} className={`px-3 py-1 rounded text-sm ${viewMode === 'MONTH' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>Month</button>
                                    <button onClick={() => setViewMode('YEAR')} className={`px-3 py-1 rounded text-sm ${viewMode === 'YEAR' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>Year</button>
                                </div>
                            </h3>

                            <div className="h-80 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={viewMode === 'DAY' ? chartData : rangeData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} dy={10} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} tickFormatter={(val) => `₹${val}`} />
                                        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#F1F5F9' }} />

                                        {viewMode === 'DAY' ? (
                                            <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                                                {chartData.map((entry: any, index: number) => (
                                                    <Cell key={`cell-${index}`} fill={entry.name === 'Expenses' ? '#EF4444' : (entry.name === 'Manual Inc' ? '#22C55E' : '#3B82F6')} />
                                                ))}
                                            </Bar>
                                        ) : (
                                            <>
                                                <Bar dataKey="income" name="Income" fill="#22C55E" radius={[4, 4, 0, 0]} />
                                                <Bar dataKey="expense" name="Expense" fill="#EF4444" radius={[4, 4, 0, 0]} />
                                            </>
                                        )}
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}

                    {/* Column Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* --- LEFT COLUMN: Ledger --- */}
                        <div className="space-y-6">
                            {/* Net System Cash Card */}
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center">
                                <div>
                                    <p className="text-sm font-medium text-slate-500 uppercase tracking-wide">Expected Net Cash (System)</p>
                                    <p className="text-3xl font-bold text-slate-800 mt-1">₹{systemNet.toLocaleString()}</p>
                                    <p className="text-xs text-slate-400 mt-1">
                                        (Op. Balance + Cash Sales + Income - Expenses)
                                    </p>
                                </div>
                                <div className="bg-emerald-50 p-3 rounded-full text-emerald-600 border border-emerald-100">
                                    <Coins size={28} />
                                </div>
                            </div>

                            {/* Add Entry Form */}
                            <div className={`bg-white p-6 rounded-xl shadow-sm border border-slate-200 transition-colors ${editingId ? 'border-amber-200 bg-amber-50/30' : ''}`}>
                                <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center">
                                    {editingId ? <Pencil size={18} className="mr-2 text-amber-600" /> : <Plus size={18} className="mr-2" />}
                                    {editingId
                                        ? (newEntry.type === 'INCOME' ? 'Edit Income' : 'Edit Expense')
                                        : 'Add Expense'
                                    }
                                </h3>
                                <form onSubmit={handleAddEntry} className="flex flex-col gap-4">
                                    <div className="flex gap-4">
                                        <input
                                            type="number"
                                            placeholder="Amount"
                                            value={newEntry.amount}
                                            onChange={(e) => setNewEntry({ ...newEntry, amount: e.target.value })}
                                            className="w-1/4 bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                            required
                                        />
                                        <input
                                            type="text"
                                            placeholder="Description (e.g. Tea, Petrol)"
                                            value={newEntry.description}
                                            onChange={(e) => setNewEntry({ ...newEntry, description: e.target.value })}
                                            className="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                            required
                                        />
                                        <select
                                            value={newEntry.paymentMethod}
                                            onChange={(e) => setNewEntry({ ...newEntry, paymentMethod: e.target.value as any })}
                                            className="w-1/4 bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        >
                                            <option value="Cash">Cash</option>
                                            <option value="UPI">UPI</option>
                                            <option value="Card">Card</option>
                                        </select>
                                    </div>
                                    <div className="flex gap-3 justify-end items-center">
                                        <button type="submit" disabled={isEntrySaving} className={`flex items-center gap-2 text-white px-5 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${newEntry.type === 'EXPENSE' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}>
                                            {isEntrySaving ? <Loader2 size={16} className="animate-spin" /> : null}
                                            {editingId ? 'Update' : (newEntry.type === 'INCOME' ? 'Add Income' : 'Add Expense')}
                                        </button>
                                        {editingId && (
                                            <button type="button" onClick={handleCancelEdit} disabled={isEntrySaving} className="bg-slate-200 text-slate-600 px-5 py-2 rounded-lg font-medium text-sm hover:bg-slate-300">
                                                Cancel
                                            </button>
                                        )}
                                    </div>
                                </form>
                            </div>

                            {/* Income History */}
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
                                <div className="p-4 border-b border-slate-100 bg-emerald-50/50 flex justify-between items-center">
                                    <h3 className="font-bold text-slate-700">Sales and Income History</h3>
                                    <span className="text-xs text-slate-500 font-medium bg-white px-2 py-1 rounded border border-slate-200">
                                        {allTransactions.filter(t => t.type === 'SALE' || t.type === 'INCOME').length} Records
                                    </span>
                                </div>
                                <div className="max-h-[300px] overflow-auto">
                                    {allTransactions.filter(t => t.type === 'SALE' || t.type === 'INCOME').length === 0 ? (
                                        <p className="text-center text-slate-400 py-10">No sales or income records.</p>
                                    ) : (
                                        <div className="divide-y divide-slate-100">
                                            {allTransactions.filter(t => t.type === 'SALE' || t.type === 'INCOME').map((trx, idx) => (
                                                <div key={trx.id || `inc-${idx}`} className={`p-4 flex justify-between items-center transition-colors ${editingId === trx.id ? 'bg-amber-50' : 'hover:bg-slate-50'}`}>
                                                    <div className="flex item-start gap-3">
                                                        <div className={`mt-1 p-1.5 rounded-full ${trx.type === 'SALE' ? 'bg-sky-100 text-sky-600' : 'bg-green-100 text-green-600'}`}>
                                                            {trx.type === 'SALE' ? <Banknote size={14} /> : <TrendingUp size={14} />}
                                                        </div>
                                                        <div>
                                                            <p className="font-medium text-slate-800 text-sm">{trx.description}</p>
                                                            <span className="text-xs text-slate-400">
                                                                {trx.isBill
                                                                    ? (trx.time ? format(new Date(trx.time), 'hh:mm a') : 'Auto-Fetched')
                                                                    : (trx.time ? format(new Date(trx.time), 'hh:mm a') : 'Manual')
                                                                }
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <p className="font-bold font-mono text-green-600">
                                                            +₹{trx.amount.toLocaleString()}
                                                        </p>
                                                        {!trx.isBill && (
                                                            <div className="flex gap-1">
                                                                <button onClick={() => trx.id && handleEdit(entries.find(e => e.id === trx.id)!)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Edit"><Pencil size={16} /></button>
                                                                <button onClick={() => trx.id && handleDelete(trx.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Delete"><Trash2 size={16} /></button>
                                                            </div>
                                                        )}
                                                        {trx.isBill && <div className="w-[52px]"></div>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Expense History */}
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                <div className="p-4 border-b border-slate-100 bg-red-50/50 flex justify-between items-center">
                                    <h3 className="font-bold text-slate-700">Expense History</h3>
                                    <span className="text-xs text-slate-500 font-medium bg-white px-2 py-1 rounded border border-slate-200">
                                        {allTransactions.filter(t => t.type === 'EXPENSE').length} Records
                                    </span>
                                </div>
                                <div className="max-h-[300px] overflow-auto">
                                    {allTransactions.filter(t => t.type === 'EXPENSE').length === 0 ? (
                                        <p className="text-center text-slate-400 py-10">No expense records.</p>
                                    ) : (
                                        <div className="divide-y divide-slate-100">
                                            {allTransactions.filter(t => t.type === 'EXPENSE').map((trx, idx) => (
                                                <div key={trx.id || `exp-${idx}`} className={`p-4 flex justify-between items-center transition-colors ${editingId === trx.id ? 'bg-amber-50' : 'hover:bg-slate-50'}`}>
                                                    <div className="flex item-start gap-3">
                                                        <div className="mt-1 p-1.5 rounded-full bg-red-100 text-red-600">
                                                            <TrendingDown size={14} />
                                                        </div>
                                                        <div>
                                                            <p className="font-medium text-slate-800 text-sm">{trx.description}</p>
                                                            <span className="text-xs text-slate-400">
                                                                {trx.isBill
                                                                    ? (trx.time ? format(new Date(trx.time), 'hh:mm a') : 'Auto-Fetched')
                                                                    : (trx.time ? format(new Date(trx.time), 'hh:mm a') : 'Manual')
                                                                }
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <p className="font-bold font-mono text-red-500">
                                                            -₹{trx.amount.toLocaleString()}
                                                        </p>
                                                        {(!trx.isBill && !trx.isCommission) && (
                                                            <div className="flex gap-1">
                                                                <button onClick={() => trx.id && handleEdit(entries.find(e => e.id === trx.id)!)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Edit"><Pencil size={16} /></button>
                                                                <button onClick={() => trx.id && handleDelete(trx.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Delete"><Trash2 size={16} /></button>
                                                            </div>
                                                        )}
                                                        {(trx.isBill || trx.isCommission) && <div className="w-[52px]"></div>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* --- RIGHT COLUMN: Physical Verification --- */}
                        <div className="bg-slate-900 text-white rounded-xl shadow-xl p-6 flex flex-col h-full border border-slate-800">
                            <div className="flex items-center gap-2 mb-6 text-emerald-400">
                                <Calculator size={24} />
                                <h2 className="text-xl font-bold">Physical Cash Verify</h2>
                            </div>

                            {/* Opening Balance */}
                            <div className="mb-6">
                                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2 block">Opening Balance (From Yesterday)</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">₹</span>
                                    <input
                                        type="number"
                                        value={openingBalance}
                                        onChange={(e) => setOpeningBalance(e.target.value)}
                                        placeholder="0.00"
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg py-3 pl-8 pr-4 text-base font-mono font-bold focus:ring-2 focus:ring-emerald-500 outline-none transition-all placeholder:text-slate-600"
                                    />
                                </div>
                            </div>

                            {/* Denomination Grid */}
                            <div className="flex-1 bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                                <div className="grid grid-cols-3 gap-2 mb-2 text-xs font-medium text-slate-500 uppercase px-2">
                                    <span>Note</span>
                                    <span className="text-center">Count</span>
                                    <span className="text-right">Total</span>
                                </div>
                                <div className="space-y-3">
                                    {DENOMINATIONS.map((denom) => {
                                        const count = denominations[denom] || '';
                                        const val = denom === "Coin" ? 1 : parseInt(denom);
                                        const total = (parseInt(count) || 0) * val;

                                        return (
                                            <div key={denom} className="grid grid-cols-3 gap-3 items-center">
                                                <div className="text-sm font-bold text-slate-300 bg-slate-800 py-2 px-3 rounded border border-slate-700 text-center">
                                                    {denom === "Coin" ? 'Coin' : `₹${denom}`}
                                                </div>
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={count}
                                                    onChange={(e) => handleDenomChange(denom, e.target.value)}
                                                    className="bg-slate-900 border border-slate-700 rounded py-2 px-3 text-center font-mono focus:border-emerald-500 outline-none focus:bg-slate-800 transition-colors"
                                                    placeholder="0"
                                                />
                                                <div className="text-right font-mono font-medium text-slate-300 py-2">
                                                    {total > 0 ? `₹${total.toLocaleString()}` : '-'}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Total Calculation */}
                            <div className="mt-6 pt-6 border-t border-slate-700 space-y-4">
                                <div className="flex justify-between items-center text-base">
                                    <span className="text-slate-400">Physical Total</span>
                                    <span className="font-bold font-mono text-2xl">₹{physicalTotal.toLocaleString()}</span>
                                </div>

                                {/* Verification Box */}
                                <div className={`p-4 rounded-xl border ${isMatched ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                                    <div className="flex justify-between items-center mb-1">
                                        <span className={`text-sm font-bold flex items-center gap-2 ${isMatched ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {isMatched ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                                            {isMatched ? "MATCHED" : "MISMATCH"}
                                        </span>
                                        {!isMatched && (
                                            <span className="font-mono font-bold text-red-400">
                                                {difference > 0 ? '+' : ''}{difference.toLocaleString()}
                                            </span>
                                        )}
                                    </div>
                                    {!isMatched && <p className="text-xs text-red-300/70">Physical cash does not match system records.</p>}
                                </div>

                                <button
                                    onClick={handleSaveTally}
                                    disabled={isTallySaving}
                                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all mt-2 active:scale-95 disabled:scale-100 disabled:opacity-70 disabled:cursor-not-allowed"
                                >
                                    {isTallySaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                                    {isTallySaving ? "Saving..." : "Save Day Book"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 📄 Professional A4 Ledger Report (Deterministic Layout) */}
            <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '794px' }}>
                <div ref={accountReportRef} className="bg-white">

                    {/* PAGE 1: EXECUTIVE SUMMARY */}
                    <div className="w-[794px] min-h-[1123px] p-[16mm] flex flex-col space-y-6">
                        <div className="text-center space-y-2 pb-6 border-b border-slate-200">
                            <h1 className="text-2xl font-bold text-slate-800 tracking-tight uppercase leading-none">
                                Daily Day Book – Sales Report
                            </h1>
                            <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest">
                                {startDate === endDate
                                    ? format(new Date(startDate), 'dd MMMM yyyy')
                                    : `Report From: ${format(new Date(startDate), 'dd MMM yyyy')} To: ${format(new Date(endDate), 'dd MMM yyyy')}`
                                }
                            </p>
                        </div>

                        {/* Financial Summary Table */}
                        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr className="text-[9pt] font-bold text-slate-500 uppercase tracking-widest">
                                        <th className="py-3 px-5">Category</th>
                                        <th className="py-3 px-5 text-center border-x border-slate-200">Cash</th>
                                        <th className="py-3 px-5 text-center border-r border-slate-200">UPI</th>
                                        <th className="py-3 px-5 text-center border-r border-slate-200">Card</th>
                                        <th className="py-3 px-5 text-right">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    <tr>
                                        <td className="py-3 px-5 text-[10pt] font-bold text-slate-700 uppercase">Sales</td>
                                        <td className="py-3 px-5 text-center font-mono text-[10pt] font-semibold text-slate-700 border-x border-slate-100">₹{salesBucket.cash.toLocaleString()}</td>
                                        <td className="py-3 px-5 text-center font-mono text-[10pt] font-semibold text-slate-700 border-r border-slate-100">₹{salesBucket.upi.toLocaleString()}</td>
                                        <td className="py-3 px-5 text-center font-mono text-[10pt] font-semibold text-slate-700 border-r border-slate-100">₹{salesBucket.card.toLocaleString()}</td>
                                        <td className="py-3 px-5 text-right font-mono text-[10pt] font-bold text-blue-700">₹{salesBucket.total.toLocaleString()}</td>
                                    </tr>
                                    <tr className="bg-red-50/30">
                                        <td className="py-3 px-5 text-[10pt] font-bold text-red-600 uppercase">Expense</td>
                                        <td className="py-3 px-5 text-center font-mono text-[10pt] font-semibold text-red-600 border-x border-slate-100">₹{expenseBucket.cash.toLocaleString()}</td>
                                        <td className="py-3 px-5 text-center font-mono text-[10pt] font-semibold text-red-600 border-r border-slate-100">₹{expenseBucket.upi.toLocaleString()}</td>
                                        <td className="py-3 px-5 text-center font-mono text-[10pt] font-semibold text-red-600 border-r border-slate-100">₹{expenseBucket.card.toLocaleString()}</td>
                                        <td className="py-3 px-5 text-right font-mono text-[10pt] font-bold text-red-700">₹{expenseBucket.total.toLocaleString()}</td>
                                    </tr>
                                    <tr className="bg-emerald-50/30">
                                        <td className="py-3 px-5 text-[10pt] font-bold text-slate-700 uppercase">Available</td>
                                        <td className="py-3 px-5 text-center font-mono text-[10pt] font-semibold text-slate-700 border-x border-slate-100">₹{availableBucket.cash.toLocaleString()}</td>
                                        <td className="py-3 px-5 text-center font-mono text-[10pt] font-semibold text-slate-700 border-r border-slate-100">₹{availableBucket.upi.toLocaleString()}</td>
                                        <td className="py-3 px-5 text-center font-mono text-[10pt] font-semibold text-slate-700 border-r border-slate-100">₹{availableBucket.card.toLocaleString()}</td>
                                        <td className="py-3 px-5 text-right font-mono text-[10pt] font-bold text-emerald-700">₹{availableBucket.total.toLocaleString()}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* Summary Metrics (2x2 Grid) */}
                        <div className="grid grid-cols-2 gap-4">
                            {[
                                { title: 'Cash Sales', amount: salesBucket.cash, icon: Banknote, color: 'border-slate-200 text-slate-600 bg-slate-50/50' },
                                { title: 'UPI / Online', amount: salesBucket.upi, icon: Smartphone, color: 'border-slate-200 text-slate-600 bg-slate-50/50' },
                                { title: 'Card / Cheque', amount: salesBucket.card, icon: CreditCard, color: 'border-slate-200 text-slate-600 bg-slate-50/50' },
                                { title: 'Total Sales', amount: salesBucket.total, icon: TrendingUp, color: 'border-blue-200 text-blue-700 bg-blue-50/30' }
                            ].map((item, idx) => (
                                <div key={idx} className={`p-4 rounded-lg border ${item.color.split(' ')[0]} ${item.color.split(' ').slice(2).join(' ')} flex flex-col justify-between h-[90px]`}>
                                    <div className="flex justify-between items-start">
                                        <span className="text-[10pt] font-semibold uppercase tracking-wider text-slate-500">{item.title}</span>
                                        <item.icon size={18} className={item.color.split(' ')[1]} />
                                    </div>
                                    <span className="text-xl font-bold text-slate-800">₹{item.amount.toLocaleString()}</span>
                                </div>
                            ))}
                        </div>

                        {/* Total Income & Expenses (Secondary Metrics) */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 rounded-lg border border-slate-100 bg-slate-50/50 flex justify-between items-center">
                                <div>
                                    <p className="text-[9pt] font-semibold text-slate-400 uppercase tracking-wider">Total Income</p>
                                    <p className="text-base font-bold text-slate-800 mt-1">₹{(salesBucket.total + totalManualIncome).toLocaleString()}</p>
                                </div>
                                <Plus size={24} className="text-slate-400 opacity-50" />
                            </div>
                            <div className="p-4 rounded-lg border border-slate-100 bg-slate-50/50 flex justify-between items-center">
                                <div>
                                    <p className="text-[9pt] font-semibold text-slate-400 uppercase tracking-wider">Total Expenses</p>
                                    <p className="text-base font-bold text-slate-800 mt-1">₹{(totalManualExpense + totalCommissionExpense).toLocaleString()}</p>
                                </div>
                                <TrendingDown size={24} className="text-slate-400 opacity-50" />
                            </div>
                        </div>

                        {/* Expected Net Cash (Executive Callout) - Refined for document use */}
                        <div className="bg-slate-50 p-6 rounded-lg border border-slate-200 flex justify-between items-center relative overflow-hidden mt-2">
                            <div className="relative z-10 w-full">
                                <p className="text-[10pt] font-semibold text-slate-500 uppercase tracking-widest">Expected Net Cash (System)</p>
                                <div className="flex items-baseline gap-4 mt-1">
                                    <p className="text-4xl font-bold text-slate-900 tracking-tighter leading-none font-mono">₹{systemNet.toLocaleString()}</p>
                                    <div className="h-4 w-px bg-slate-200"></div>
                                    <div className="flex gap-4">
                                        <div className="text-[8pt] font-medium text-slate-500 uppercase">
                                            Opening: ₹{openingBalance || '0'}
                                        </div>
                                        <div className="text-[8pt] font-medium text-slate-500 uppercase">
                                            {startDate === endDate ? 'Sales' : 'Total Revenue'}: ₹{salesBucket.total.toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                                <p className="text-[7pt] text-slate-400 mt-3 font-medium uppercase tracking-tight italic">
                                    * Calculation based on cumulative inflows minus outflows for the period.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* PAGE 2: PHYSICAL VERIFICATION */}
                    <div className="w-[794px] min-h-[1123px] p-[16mm] bg-white space-y-6">
                        <div className="flex items-center gap-3 mb-2 pb-4 border-b border-slate-100">
                            <Calculator className="text-slate-600" size={24} />
                            <h2 className="text-xl font-bold text-slate-800 uppercase tracking-tight">Physical Cash Verification</h2>
                        </div>

                        <div className="bg-white rounded-lg border border-slate-200">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr className="text-[9pt] font-bold text-slate-500 uppercase tracking-widest">
                                        <th className="py-3 px-6">Denomination</th>
                                        <th className="py-3 px-6 text-center border-x border-slate-200">Count</th>
                                        <th className="py-3 px-6 text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {DENOMINATIONS.map((denom) => {
                                        const count = denominations[denom] || '0';
                                        const val = denom === "Coin" ? 1 : parseInt(denom);
                                        const total = (parseInt(count) || 0) * val;
                                        return (
                                            <tr key={denom}>
                                                <td className="py-2 px-6 text-[10pt] font-semibold text-slate-600">
                                                    {denom === "Coin" ? 'COIN' : `₹${denom}`}
                                                </td>
                                                <td className="py-2 px-6 text-center border-x border-slate-100 font-mono text-[11pt] font-bold text-slate-800">
                                                    {count}
                                                </td>
                                                <td className="py-2 px-6 text-right font-mono text-[10pt] font-semibold text-slate-700">
                                                    ₹{total.toLocaleString()}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="p-6 rounded-lg border border-slate-200 bg-slate-50/50 flex justify-between items-center">
                            <div>
                                <p className="text-[10pt] font-semibold text-slate-500 uppercase tracking-widest">Physical Total</p>
                                <p className="text-3xl font-bold text-slate-900 mt-1 font-mono">₹{physicalTotal.toLocaleString()}</p>
                            </div>
                            <div className={`px-3 py-1.5 text-sm text-sm rounded-lg border-2 flex items-center gap-3 ${isMatched ? 'bg-white border-emerald-100' : 'bg-white border-red-100'}`}>
                                {isMatched ? <CheckCircle className="text-emerald-500" size={24} /> : <AlertCircle className="text-red-500" size={24} />}
                                <div>
                                    <p className={`text-[10pt] font-bold uppercase tracking-widest ${isMatched ? 'text-emerald-600' : 'text-red-600'}`}>
                                        {isMatched ? "VERIFIED" : "MISMATCH"}
                                    </p>
                                    {!isMatched && (
                                        <p className="text-base font-bold text-red-600 font-mono italic">
                                            {difference > 0 ? '+' : ''}{difference.toLocaleString()}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* PAGE 3: REVENUE LEDGER */}
                    <div className="w-[794px] min-h-[1123px] p-[16mm] bg-white space-y-6">
                        <div className="flex justify-between items-end border-b border-slate-200 pb-3">
                            <div>
                                <h3 className="text-xl font-bold text-slate-800 uppercase tracking-tight">Sales & Income History</h3>
                            </div>
                            <div className="text-right">
                                <p className="text-[8pt] font-bold text-slate-500 uppercase tracking-tight">
                                    {allTransactions.filter(t => t.type === 'SALE' || t.type === 'INCOME').length} LINE ITEMS
                                </p>
                            </div>
                        </div>

                        <table className="w-full text-left border-collapse border border-slate-200">
                            <thead className="bg-slate-50 text-[9pt] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-200">
                                <tr>
                                    <th className="p-3 border-r border-slate-200 w-32">Time/Mode</th>
                                    <th className="p-3">Description</th>
                                    <th className="p-3 text-right">Inflow (₹)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 italic-data">
                                {allTransactions.filter(t => t.type === 'SALE' || t.type === 'INCOME').length === 0 ? (
                                    <tr><td colSpan={3} className="p-10 text-center text-[10pt] font-medium text-slate-300 uppercase tracking-widest">No entries found</td></tr>
                                ) : (
                                    allTransactions.filter(t => t.type === 'SALE' || t.type === 'INCOME').map((trx, idx) => (
                                        <tr key={idx}>
                                            <td className="p-2 px-3 border-r border-slate-100">
                                                <p className="text-[9pt] font-bold text-slate-700 leading-none">
                                                    {trx.time ? format(new Date(trx.time), 'hh:mm a') : '--:--'}
                                                </p>
                                                <span className="text-[7pt] font-semibold text-slate-400 uppercase mt-1 inline-block">
                                                    {trx.paymentMethod || 'CASH'}
                                                </span>
                                            </td>
                                            <td className="p-2 px-3 text-[10pt] font-medium text-slate-600 uppercase truncate max-w-[400px]">
                                                {trx.description}
                                                <span className="text-[7pt] ml-2 text-slate-400 font-bold">[{trx.type}]</span>
                                            </td>
                                            <td className="p-2 px-3 text-right font-mono text-[10pt] font-bold text-emerald-600">
                                                +{trx.amount.toLocaleString()}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* PAGE 4: EXPENSE LEDGER */}
                    <div className="w-[794px] min-h-[1123px] p-[16mm] bg-white space-y-6">
                        <div className="flex justify-between items-end border-b border-slate-200 pb-3">
                            <div>
                                <h3 className="text-xl font-bold text-slate-800 uppercase tracking-tight">Expense History</h3>
                            </div>
                        </div>

                        <table className="w-full text-left border-collapse border border-slate-200">
                            <thead className="bg-slate-50 text-[9pt] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-200">
                                <tr>
                                    <th className="p-3 border-r border-slate-200 w-32">Time/Method</th>
                                    <th className="p-3">Description</th>
                                    <th className="p-3 text-right">Outflow (₹)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {allTransactions.filter(t => t.type === 'EXPENSE').length === 0 ? (
                                    <tr><td colSpan={3} className="p-10 text-center text-[10pt] font-medium text-slate-300 uppercase tracking-widest">No entries found</td></tr>
                                ) : (
                                    allTransactions.filter(t => t.type === 'EXPENSE').map((trx, idx) => (
                                        <tr key={idx}>
                                            <td className="p-2 px-3 border-r border-slate-100">
                                                <p className="text-[9pt] font-bold text-slate-700 leading-none">
                                                    {trx.time ? format(new Date(trx.time), 'hh:mm a') : '--:--'}
                                                </p>
                                                <span className="text-[7pt] font-semibold text-slate-400 uppercase mt-1 inline-block">
                                                    {trx.paymentMethod || 'CASH'}
                                                </span>
                                            </td>
                                            <td className="p-2 px-3 text-[10pt] font-medium text-slate-600 uppercase truncate max-w-[440px]">{trx.description}</td>
                                            <td className="p-2 px-3 text-right font-mono text-[10pt] font-bold text-red-600">
                                                -{trx.amount.toLocaleString()}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DailyActions;
