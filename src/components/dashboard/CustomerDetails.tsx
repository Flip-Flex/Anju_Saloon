import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
    User, Phone, Mail, MapPin, Calendar, Clock, ArrowLeft,
    Package, AlertCircle, CheckCircle2, CreditCard,
    ChevronRight, ExternalLink, IndianRupee, Bell, PackageSearch
} from 'lucide-react';
import {
    customerApi, billingApi, customerPackageApi,
    Customer, Bill, BillDetails
} from '@/lib/api';
import { useGlobalData } from '@/context/GlobalDataContext';
import toast from 'react-hot-toast';

const CustomerDetails = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const billId = searchParams.get('billId');
    const { bills } = useGlobalData();
    const [customer, setCustomer] = useState<Customer | null>(null);
    const [customerBills, setCustomerBills] = useState<Bill[]>([]);
    const [customerPackages, setCustomerPackages] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const reminderRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (id) {
            fetchData();
        }
    }, [id, bills]);

    // Handle auto-scroll to reminder
    useEffect(() => {
        if (!loading && billId && reminderRef.current) {
            setTimeout(() => {
                reminderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 500);
        }
    }, [loading, billId]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch customer details directly by ID
            const res = await customerApi.getById(id!);
            const found = res.data;

            if (found) {
                setCustomer(found);

                // Filter bills for this customer
                const cleanFoundPhone = found.phone ? found.phone.toString().replace(/\D/g, '') : '';
                const filteredBills = bills.filter(b => {
                    if (b.customerId === id || (b as any).customer_id === id) return true;
                    if (cleanFoundPhone.length >= 7 && b.customerPhone) {
                        const bPhone = b.customerPhone.toString().replace(/\D/g, '');
                        if (bPhone === cleanFoundPhone || (bPhone.length >= 10 && cleanFoundPhone.length >= 10 && bPhone.slice(-10) === cleanFoundPhone.slice(-10))) {
                            return true;
                        }
                    }
                    if (found.name && b.customerName && b.customerName.toString().trim().toLowerCase() === found.name.toString().trim().toLowerCase()) {
                        return true;
                    }
                    return false;
                });
                setCustomerBills(filteredBills);

                // Fetch customer packages
                try {
                    const pkgRes = await customerPackageApi.getByCustomer(id!);
                    if (pkgRes.data) {
                        setCustomerPackages(pkgRes.data);
                    }
                } catch (pkgErr) {
                    console.error("Failed to fetch customer packages", pkgErr);
                }
            }
        } catch (err) {
            console.error("Failed to fetch customer details", err);
            toast.error("Failed to load customer details");
        } finally {
            setLoading(false);
        }
    };

    const getRemainingDue = (bill: Bill) => {
        const total = bill.finalAmount || 0;
        const paid = bill.amountPaid || 0;
        return Math.max(0, total - paid);
    };

    const getReminderStatus = (bill: Bill) => {
        if (!bill.enableExpiryReminder || !bill.createdAt) return null;

        const createdDate = new Date(bill.createdAt);
        const createdMidnight = new Date(createdDate.getFullYear(), createdDate.getMonth(), createdDate.getDate());
        const todayMidnight = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
        const totalDays = Number(bill.expiryDays) || 30;

        const diffDays = Math.floor((todayMidnight.getTime() - createdMidnight.getTime()) / (1000 * 60 * 60 * 24));
        const remainingDays = totalDays - diffDays;

        const deadlineDate = new Date(createdMidnight);
        deadlineDate.setDate(deadlineDate.getDate() + totalDays);

        if (remainingDays < 0) {
            return {
                label: `Overdue by ${Math.abs(remainingDays)} days`,
                color: 'text-red-700 bg-red-50 border-red-200',
                iconColor: 'text-red-500',
                badgeColor: 'bg-red-100 text-red-800',
                highlight: 'red'
            };
        } else if (remainingDays <= 3) {
            return {
                label: `Pay within ${remainingDays} days`,
                color: 'text-amber-700 bg-amber-50 border-amber-200',
                iconColor: 'text-amber-500',
                badgeColor: 'bg-amber-100 text-amber-800',
                highlight: 'orange'
            };
        } else {
            return {
                label: `Payment due in ${remainingDays} days`,
                color: 'text-green-700 bg-green-50 border-green-200',
                iconColor: 'text-green-500',
                badgeColor: 'bg-green-100 text-green-800',
                highlight: 'green'
            };
        }
    };

    const getDeadlineDateAsObject = (bill: Bill) => {
        if (!bill.createdAt || !bill.expiryDays) return null;
        const date = new Date(bill.createdAt);
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() + Number(bill.expiryDays));
        return date;
    };

    const getDeadlineDate = (bill: Bill) => {
        const date = getDeadlineDateAsObject(bill);
        if (!date) return 'N/A';
        return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    if (loading) {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                    <p className="text-gray-500 font-bold animate-pulse">Loading Customer Intelligence...</p>
                </div>
            </div>
        );
    }

    if (!customer) {
        return (
            <div className="p-8 text-center h-[80vh] flex flex-col items-center justify-center">
                <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mb-6">
                    <AlertCircle className="text-gray-300" size={64} />
                </div>
                <h2 className="text-2xl font-black text-gray-800">CUSTOMER NOT FOUND</h2>
                <p className="text-gray-500 mb-8 max-w-sm">The customer profile you're looking for doesn't exist or has been removed.</p>
                <button
                    onClick={() => navigate(-1)}
                    className="px-5 py-2 text-sm bg-blue-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-all"
                >
                    <ArrowLeft size={20} /> GO BACK
                </button>
            </div>
        );
    }

    // Prepare product list from all bills
    const allProducts = customerBills.flatMap(bill =>
        (bill.items || []).map(item => ({
            ...item,
            billId: bill.id,
            billInvoiceId: bill.invoiceNumber || bill.invoiceId || bill.id,
            billDate: bill.createdAt,
            totalBillAmount: bill.finalAmount,
            paidBillAmount: bill.amountPaid,
            dueBillAmount: getRemainingDue(bill),
            reminder: getReminderStatus(bill),
            deadline: getDeadlineDate(bill)
        }))
    ).sort((a, b) => new Date(b.billDate || 0).getTime() - new Date(a.billDate || 0).getTime());

    // Specific Reminder logic
    const activeReminderBill = billId ? customerBills.find(b => b.id === billId) : null;
    const activeReminderStatus = activeReminderBill ? getReminderStatus(activeReminderBill) : null;

    // Point 7: Isolation logic
    // If we're in "Focused View" (from notification), we strictly show only relevant data
    const isFocusedView = !!billId;

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
                        title="Go Back"
                    >
                        <ArrowLeft size={24} />
                    </button>
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
                            <span className="bg-blue-600 text-white p-2 rounded-xl shadow-lg shadow-blue-200">
                                <User size={28} />
                            </span>
                            {customer.name}
                        </h1>
                        <p className="text-gray-500 font-medium ml-14 -mt-1">
                            {isFocusedView ? 'Payment Summary & Reminder' : 'Customer Details & Lifecycle'}
                        </p>
                    </div>
                </div>

                <div className="flex bg-white p-2 rounded-2xl shadow-sm border border-gray-100 items-center gap-6 px-6">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Phone size={18} /></div>
                        <span className="font-bold text-gray-800">{customer.phone}</span>
                    </div>
                    {customer.email && (
                        <div className="hidden lg:flex items-center gap-2">
                            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg"><Mail size={18} /></div>
                            <span className="font-bold text-gray-800">{customer.email}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Active Payment Reminder Section (Point 5, 6, 8) */}
            {activeReminderBill && activeReminderStatus && (
                <div
                    id="payment-reminder-focus"
                    ref={reminderRef}
                    className={`p-8 rounded-[2.5rem] border-2 shadow-xl shrink-0 flex flex-col md:flex-row items-center justify-between gap-8 ${activeReminderStatus.color} transition-all duration-500 ring-8 ring-blue-500/10 animate-fade-in-down`}
                >
                    <div className="flex gap-6 items-center w-full md:w-auto">
                        <div className={`p-5 rounded-3xl bg-white shadow-lg shrink-0 ${activeReminderStatus.iconColor} animate-bounce-subtle`}>
                            <Bell size={40} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="font-black text-2xl mb-2 flex items-center gap-3">
                                Active Payment Reminder
                                <span className="text-xs font-mono bg-white/60 px-3 py-1 rounded-full border border-black/5 shadow-sm text-gray-600">Bill #{activeReminderBill.invoiceNumber || activeReminderBill.id}</span>
                            </h3>

                            {/* Point 4: Product Details */}
                            <div className="mb-4 flex flex-col gap-1">
                                <p className="text-[10px] font-black opacity-40 uppercase tracking-widest">Purchased Products</p>
                                <div className="flex flex-wrap gap-2">
                                    {(activeReminderBill.items || []).map((item: any, i: number) => (
                                        <span key={i} className="text-xs font-bold bg-white/60 px-2 py-0.5 rounded-lg border border-black/5">
                                            {item.productName} (x{item.quantity || 1})
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Point 4: Totals */}
                            <div className="flex flex-wrap items-center gap-x-10 gap-y-4 text-sm">
                                <div className="flex flex-col">
                                    <span className="opacity-60 text-[10px] font-black uppercase tracking-widest">Total Amount</span>
                                    <span className="font-black text-2xl">₹{(activeReminderBill.finalAmount || 0).toLocaleString()}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="opacity-60 text-[10px] font-black uppercase tracking-widest">Paid Amount</span>
                                    <span className="font-black text-2xl text-green-600">₹{(activeReminderBill.amountPaid || 0).toLocaleString()}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="opacity-60 text-[10px] font-black uppercase tracking-widest">Balance Amount</span>
                                    <span className="font-black text-2xl underline decoration-4 underline-offset-8 text-blue-700">₹{getRemainingDue(activeReminderBill).toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Deadline & Status (Point 5 & 6) */}
                    <div className="text-left md:text-right bg-white p-6 rounded-[2rem] shadow-xl border border-transparent shrink-0 min-w-[240px] flex flex-col items-start md:items-end justify-center">
                        <div className="text-[10px] font-black opacity-40 uppercase tracking-[0.2em] mb-1">Payment Deadline</div>
                        <div className="text-2xl font-black mb-3 text-gray-900">{getDeadlineDate(activeReminderBill)}</div>
                        <div className={`inline-flex items-center px-3 py-1.5 text-sm rounded-xl text-sm font-black shadow-md uppercase tracking-wider ${activeReminderStatus.badgeColor}`}>
                            {activeReminderStatus.label}
                        </div>
                    </div>
                </div>
            )}

            {/* Stats Row & Purchase History - Conditional Point 7 Isolation */}
            {!isFocusedView ? (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 animate-in slide-in-from-bottom-4 duration-700">
                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-4 hover:shadow-md transition-shadow">
                            <div className="w-12 h-12 rounded-2xl bg-blue-500 flex items-center justify-center text-white shadow-lg shadow-blue-100">
                                <IndianRupee size={24} />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Orders</p>
                                <p className="text-2xl font-black text-gray-900">{customerBills.length}</p>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-4 hover:shadow-md transition-shadow">
                            <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center text-white shadow-lg shadow-emerald-100">
                                <CheckCircle2 size={24} />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Spent</p>
                                <p className="text-2xl font-black text-gray-900">₹{(customer.totalSpent || 0).toLocaleString()}</p>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-4 hover:shadow-md transition-shadow">
                            <div className="w-12 h-12 rounded-2xl bg-orange-500 flex items-center justify-center text-white shadow-lg shadow-orange-100">
                                <Clock size={24} />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Remaining Due</p>
                                <p className="text-2xl font-black text-orange-600">
                                    ₹{customerBills.reduce((sum, b) => sum + getRemainingDue(b), 0).toLocaleString()}
                                </p>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-4 hover:shadow-md transition-shadow">
                            <div className="w-12 h-12 rounded-2xl bg-purple-500 flex items-center justify-center text-white shadow-lg shadow-purple-100">
                                <Calendar size={24} />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Last Visit</p>
                                <p className="text-2xl font-black text-gray-900">
                                    {customer.lastVisit ? new Date(customer.lastVisit).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : 'N/A'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Active Packages Section */}
                    {customerPackages.length > 0 && (
                        <div className="space-y-6 mt-10">
                            <div className="flex items-center justify-between">
                                <h2 className="text-2xl font-black text-purple-800 flex items-center gap-3">
                                    <Package className="text-purple-600" />
                                    Active Packages
                                    <span className="text-sm font-bold bg-purple-100 text-purple-700 px-3 py-1 rounded-full">{customerPackages.length} Packages</span>
                                </h2>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {customerPackages.map((pkg) => (
                                    <div key={pkg.id} className="bg-white rounded-3xl p-6 border-2 border-purple-100 shadow-sm relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                            <Package size={80} className="text-purple-600" />
                                        </div>
                                        <div className="relative z-10">
                                            <div className="flex justify-between items-start mb-4">
                                                <div>
                                                    <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase mb-2 ${pkg.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                                                        {pkg.isActive ? 'ACTIVE' : 'EXHAUSTED / INACTIVE'}
                                                    </span>
                                                    <h3 className="font-black text-xl text-gray-900 leading-tight">{pkg.packageName}</h3>
                                                </div>
                                            </div>
                                            
                                            <div className="space-y-3 mt-4">
                                                {(() => {
                                                    const sessionItems = (pkg.remainingSessions || pkg.items || pkg.services || []).map((s: any) => ({
                                                        serviceName: s.serviceName || s.name || 'Service',
                                                        total: s.totalSessions ?? s.totalQuantity ?? s.sessions ?? 1,
                                                        remaining: s.remainingSessions ?? (s.totalSessions ? s.totalSessions - (s.usedSessions || 0) : (s.totalQuantity ? s.totalQuantity - (s.usedQuantity || 0) : 0)),
                                                        used: s.usedSessions ?? s.usedQuantity ?? 0
                                                    }));

                                                    return sessionItems.map((item: any, idx: number) => {
                                                        const percentage = item.total > 0 ? Math.min(100, Math.round((item.used / item.total) * 100)) : 0;
                                                        return (
                                                            <div key={idx} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                                                <div className="flex justify-between items-center mb-1">
                                                                    <span className="text-sm font-bold text-gray-800 truncate pr-2">{item.serviceName}</span>
                                                                    <span className="text-xs font-black text-purple-600 bg-purple-100 px-2 py-0.5 rounded-md whitespace-nowrap">
                                                                        {item.remaining} left
                                                                    </span>
                                                                </div>
                                                                <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2 overflow-hidden">
                                                                    <div 
                                                                        className="bg-purple-500 h-1.5 rounded-full transition-all" 
                                                                        style={{ width: `${percentage}%` }}
                                                                    ></div>
                                                                </div>
                                                                <div className="text-[10px] text-gray-400 mt-1 font-medium text-right">
                                                                    {item.used} / {item.total} used
                                                                </div>
                                                            </div>
                                                        );
                                                    });
                                                })()}
                                            </div>

                                            {/* Redemption History Accordion / List if present */}
                                            {Array.isArray(pkg.redemptionHistory) && pkg.redemptionHistory.length > 0 && (
                                                <div className="mt-3 pt-3 border-t border-purple-50">
                                                    <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Redemption History</div>
                                                    <div className="space-y-1 max-h-24 overflow-y-auto custom-scrollbar text-xs">
                                                        {pkg.redemptionHistory.map((rh: any, rhIdx: number) => (
                                                            <div key={rhIdx} className="flex justify-between items-center text-gray-600 bg-purple-50/50 px-2 py-1 rounded">
                                                                <span className="truncate">{rh.serviceName || 'Session used'}</span>
                                                                <span className="text-[10px] text-gray-400 whitespace-nowrap">
                                                                    {rh.date ? new Date(rh.date).toLocaleDateString() : 'Redeemed'}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            
                                            <div className="mt-4 pt-4 border-t border-purple-50 flex items-center justify-between text-xs font-medium text-gray-500">
                                                <span>Active: {pkg.activationDate || pkg.purchaseDate || pkg.createdAt ? new Date(pkg.activationDate || pkg.purchaseDate || pkg.createdAt).toLocaleDateString() : 'Active'}</span>
                                                {pkg.expiryDate && <span>Expires: {new Date(pkg.expiryDate).toLocaleDateString()}</span>}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="space-y-6 mt-10">
                        <div className="flex items-center justify-between">
                            <h2 className="text-2xl font-black text-gray-800 flex items-center gap-3">
                                <Package className="text-blue-600" />
                                Purchase History
                                <span className="text-sm font-bold bg-blue-100 text-blue-700 px-3 py-1 rounded-full">{allProducts.length} Items</span>
                            </h2>
                        </div>

                        {allProducts.length === 0 ? (
                            <div className="bg-gray-50 border-2 border-dashed rounded-3xl p-12 text-center">
                                <Package className="mx-auto text-gray-300 mb-4" size={64} />
                                <p className="text-gray-500 font-bold text-base">No purchases recorded for this customer.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {allProducts.map((item, idx) => (
                                    <PurchaseCard key={`${item.billId}-${idx}`} item={item} billId={billId} navigate={navigate} />
                                ))}
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <div className="bg-white p-10 rounded-[3rem] border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center space-y-6">
                    <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center text-blue-600">
                        <Clock size={40} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-gray-900">Focused View Mode</h2>
                        <p className="text-gray-500 max-w-md mx-auto mt-2">
                            You are viewing a specific payment deadline for <strong>{customer.name}</strong>.
                            Other history and data are suppressed to prevent distraction.
                        </p>
                    </div>
                    <button
                        onClick={() => navigate(`/admin/customers/${id}`)}
                        className="px-5 py-2 text-sm bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all flex items-center gap-2"
                    >
                        View Full History & Stats <ChevronRight size={20} />
                    </button>
                </div>
            )}
        </div>
    );
};

const PurchaseCard = ({ item, billId, navigate }: { item: any, billId: string | null, navigate: any }) => {
    const isCurrentlyReminded = billId === item.billId;
    const itemAmount = Number(item.netAmount || item.total || (Number(item.price || 0) * Number(item.qty || 1)) || 0);

    return (
        <div
            className={`group bg-white rounded-[2rem] border-2 shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden relative
                ${isCurrentlyReminded ? 'ring-4 ring-blue-500/20 border-blue-200' : ''}
                ${item.reminder?.highlight === 'red' ? 'border-red-100 hover:border-red-400' :
                    item.reminder?.highlight === 'orange' ? 'border-orange-100 hover:border-orange-400' :
                        'border-gray-100 hover:border-blue-400'}`}
        >
            {/* Status Badge */}
            {item.reminder && (
                <div className={`absolute top-4 right-4 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-tighter border shadow-sm ${item.reminder.color}`}>
                    {item.reminder.label}
                </div>
            )}

            <div className="p-8">
                <div className="flex items-start justify-between mb-4">
                    <div className="space-y-1">
                        <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Bill #{item.billInvoiceId}</p>
                        <h3 className="text-xl font-black text-gray-900 leading-tight group-hover:text-blue-600 transition-colors">
                            {item.productName || item.name || item.serviceName || 'Unknown Item'}
                        </h3>
                    </div>
                </div>

                <div className="space-y-4 mb-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gray-50 rounded-2xl p-3">
                            <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Total Amount</p>
                            <p className="font-black text-gray-900">₹{itemAmount.toFixed(2)}</p>
                        </div>
                        <div className="bg-green-50 rounded-2xl p-3">
                            <p className="text-[9px] font-black text-green-400 uppercase mb-1">Paid (Share)</p>
                            <p className="font-black text-green-700">
                                ₹{(((item.paidBillAmount || 0) / (item.totalBillAmount || 1)) * itemAmount).toFixed(2)}
                            </p>
                        </div>
                    </div>

                    <div className="bg-blue-600 rounded-3xl p-4 flex items-center justify-between">
                        <div>
                            <p className="text-[9px] font-black text-gray-400 uppercase">Remaining Due (Bill)</p>
                            <p className="text-base font-black text-white">₹{(item.dueBillAmount || 0).toFixed(2)}</p>
                        </div>
                        <div className="h-10 w-10 bg-white/10 rounded-xl flex items-center justify-center text-white">
                            <CreditCard size={20} />
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-dashed border-gray-100">
                    <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-lg ${item.reminder?.highlight === 'red' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                            <Calendar size={14} />
                        </div>
                        <div>
                            <p className="text-[8px] font-black text-gray-400 uppercase">Deadline</p>
                            <p className="text-xs font-black text-gray-800">{item.deadline}</p>
                        </div>
                    </div>
                    <button
                        onClick={() => navigate(`/admin/billing?id=${item.billId}`)}
                        className="p-2 hover:bg-gray-50 text-blue-500 rounded-full transition-colors"
                        title="View Original Bill"
                    >
                        <ArrowLeft className="rotate-180" size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CustomerDetails;
