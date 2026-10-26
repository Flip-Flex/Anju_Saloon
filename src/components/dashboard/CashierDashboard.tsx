import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ShoppingCart, DollarSign, AlertTriangle, Clock, TrendingUp, Calendar } from 'lucide-react';
import { billingApi, productApi, appointmentApi, Bill, Product, Appointment } from '@/lib/api';
import { startOfDay, endOfDay, format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const CashierDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [bills, setBills] = useState<Bill[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    let unsubscribeBills: () => void;

    const fetchData = async () => {
      try {
        const [productsRes, apptsRes] = await Promise.all([
          productApi.getAll(),
          appointmentApi.getAll(),
        ]);
        if (Array.isArray(productsRes.data)) setProducts(productsRes.data);
        if (Array.isArray(apptsRes.data)) setAppointments(apptsRes.data);

        // Real-time listener for bills
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
      } catch (error) {
        console.error("Failed to fetch data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();

    return () => {
      if (unsubscribeBills) unsubscribeBills();
    };
  }, []);

  const { todayBills, todayRevenue, lowStockCount, todayAppointmentsCount, recentBills } = useMemo(() => {
    const now = new Date();
    const start = startOfDay(now);
    const end = endOfDay(now);

    const parseDate = (val: any): Date => {
      if (!val) return new Date(0);
      if (val instanceof Date) return val;
      if (typeof val === 'object') {
        const s = val.seconds ?? val._seconds;
        if (s !== undefined) return new Date(s * 1000);
        if (typeof val.toDate === 'function') return val.toDate();
      }
      const d = new Date(val);
      return isNaN(d.getTime()) ? new Date(0) : d;
    };

    const todays = bills.filter(bill => {
      if (bill.status === 'CANCELLED' || bill.status === 'HOLD' || bill.status === 'REFUNDED') return false;
      const billDate = parseDate(bill.createdAt || (bill as any).date);
      return billDate >= start && billDate <= end;
    });

    const revenue = todays.reduce((sum, bill) => sum + Number(bill.finalAmount ?? bill.totalAmount ?? bill.amountPaid ?? 0), 0);
    const lowStock = products.filter(p => (p.stockQuantity || 0) <= 5).length;
    
    const sortedBills = [...bills]
      .sort((a, b) => parseDate(b.createdAt || (b as any).date).getTime() - parseDate(a.createdAt || (a as any).date).getTime())
      .slice(0, 5);

    const todayStr = format(now, 'yyyy-MM-dd');
    const todayAppts = appointments.filter(a => a.date === todayStr).length;

    return {
      todayBills: todays.length,
      todayRevenue: revenue,
      lowStockCount: lowStock,
      todayAppointmentsCount: todayAppts,
      recentBills: sortedBills
    };
  }, [bills, products, appointments]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="p-8 bg-white min-h-full space-y-10 font-sans">
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Cashier Dashboard</h1>
          <p className="text-sm text-slate-500 font-medium">Overview of today's activities</p>
        </div>
        <button 
          onClick={() => navigate('/cashier/billing')}
          className="bg-blue-600 text-white px-5 py-2.5 text-sm rounded hover:bg-blue-700 transition-colors flex items-center gap-2 font-medium"
        >
          <ShoppingCart size={16} /> New Bill
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 flex flex-col justify-between h-40">
          <div className="flex justify-between items-start">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Today's Revenue</p>
            <DollarSign size={18} className="text-slate-400" />
          </div>
          <h3 className="text-4xl font-semibold tracking-tighter text-slate-900">₹{todayRevenue.toLocaleString()}</h3>
        </div>

        <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 flex flex-col justify-between h-40">
          <div className="flex justify-between items-start">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Today's Bills</p>
            <ShoppingCart size={18} className="text-slate-400" />
          </div>
          <h3 className="text-4xl font-semibold tracking-tighter text-slate-900">{todayBills}</h3>
        </div>

        <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 flex flex-col justify-between h-40">
          <div className="flex justify-between items-start">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Low Stock Alerts</p>
            <AlertTriangle size={18} className={lowStockCount > 0 ? "text-amber-500" : "text-slate-400"} />
          </div>
          <h3 className={`text-4xl font-semibold tracking-tighter ${lowStockCount > 0 ? 'text-amber-600' : 'text-slate-900'}`}>{lowStockCount}</h3>
        </div>

        <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 flex flex-col justify-between h-40">
          <div className="flex justify-between items-start">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Today's Appointments</p>
            <Calendar size={18} className="text-slate-400" />
          </div>
          <h3 className="text-4xl font-semibold tracking-tighter text-slate-900">{todayAppointmentsCount}</h3>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2 tracking-tight">
            Recent Transactions
          </h3>
          <button 
            onClick={() => navigate('/cashier/printed-bills')}
            className="text-sm text-slate-600 hover:text-slate-900 font-medium transition-colors"
          >
            View All →
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50">
              <tr className="text-[11px] text-slate-500 uppercase tracking-widest border-b border-slate-200">
                <th className="p-5 font-semibold">Date & Time</th>
                <th className="p-5 font-semibold">Customer</th>
                <th className="p-5 font-semibold">Items</th>
                <th className="p-5 font-semibold">Total</th>
                <th className="p-5 font-semibold text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentBills.map(bill => (
                <tr key={bill.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="p-5 text-sm font-medium text-slate-600">
                    {bill.createdAt ? format(new Date(bill.createdAt), 'dd MMM, hh:mm a') : 'N/A'}
                  </td>
                  <td className="p-5">
                    <p className="text-sm font-semibold text-slate-900">{bill.customerName}</p>
                    <p className="text-xs text-slate-500">{bill.customerPhone}</p>
                  </td>
                  <td className="p-5 text-sm font-medium text-slate-600">
                    {bill.items?.reduce((sum, item) => sum + item.quantity, 0) || 0} items
                  </td>
                  <td className="p-5 text-sm font-mono font-semibold text-slate-900">
                    ₹{(bill.finalAmount || bill.amountPaid || 0).toLocaleString()}
                  </td>
                  <td className="p-5 text-right">
                    <span className={`text-[11px] font-semibold px-2.5 py-1 uppercase tracking-wider rounded-full ${
                      bill.status === 'PAID' ? 'bg-blue-600 text-white' :
                      bill.status === 'CANCELLED' ? 'bg-red-50 text-red-600 border border-red-100' :
                      bill.status === 'HOLD' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {bill.status || 'PAID'}
                    </span>
                  </td>
                </tr>
              ))}
              {recentBills.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-400 font-medium text-sm">
                    No recent transactions
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CashierDashboard;
