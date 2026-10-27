import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from 'react-hot-toast';

import Login from "./pages/Login";
import BillView from "@/pages/BillView";
import NotFound from "@/pages/NotFound";
import ProtectedRoute from "@/components/ProtectedRoute";

// Layouts
import AdminLayout from '@/pages/dashboard/AdminLayout';
import CashierLayout from '@/pages/dashboard/CashierLayout';

// Dashboard Components
import DashboardOverview from '@/components/dashboard/DashboardOverview';
import Billing from '@/components/dashboard/Billing';
import Products from '@/components/dashboard/Products';

import DailyActions from '@/components/dashboard/DailyActions';
import Suppliers from '@/components/dashboard/Suppliers';
import SupplierDetails from '@/components/dashboard/SupplierDetails';
import Customers from '@/components/dashboard/Customers';
import CustomerDetails from '@/components/dashboard/CustomerDetails';
import StaffManagement from '@/components/dashboard/StaffManagement';
import Reports from '@/components/dashboard/Reports';
import Settings from '@/components/dashboard/Settings';
import PrintedBills from '@/components/dashboard/PrintedBills';
import CashierReports from '@/components/dashboard/CashierReports';
import ViewProduct from '@/components/dashboard/ViewProduct';
import CashierDashboard from '@/components/dashboard/CashierDashboard';
import Services from '@/components/dashboard/Services';
import Appointments from '@/components/dashboard/Appointments';
import StockMovements from '@/components/dashboard/StockMovements';
import Packages from '@/components/dashboard/Packages';

import { AuthProvider } from "@/context/AuthContext";
import { GlobalDataProvider } from "@/context/GlobalDataContext";
import { NotificationProvider } from "@/context/NotificationContext";

const App = () => {
  return (
    <AuthProvider>
      <GlobalDataProvider>
        <NotificationProvider>
          <BrowserRouter>
            <Toaster position="top-right" reverseOrder={false} />

            <Routes>
              {/* Public */}
              <Route path="/" element={<Login />} />
              <Route path="/bill/:id" element={<BillView />} />

              {/* ADMIN SECURE ROUTES */}
              <Route element={<ProtectedRoute requiredRole="Admin" />}>
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<DashboardOverview />} />
                  <Route path="dashboard" element={<DashboardOverview />} />
                  <Route path="billing" element={<Billing />} />
                  <Route path="products" element={<Products />} />
                  <Route path="suppliers" element={<Suppliers />} />
                  <Route path="suppliers/:id" element={<SupplierDetails />} />
                  <Route path="customers" element={<Customers />} />
                  <Route path="customers/:id" element={<CustomerDetails />} />
                  <Route path="view-product" element={<ViewProduct />} />
                  <Route path="staff" element={<StaffManagement />} />
                  <Route path="services" element={<Services />} />
                  <Route path="packages" element={<Packages />} />
                  <Route path="appointments" element={<Appointments />} />
                  <Route path="printed-bills" element={<PrintedBills />} />


                  <Route path="daily-actions" element={<DailyActions />} />
                  <Route path="stock-movements" element={<StockMovements />} />
                  <Route path="reports" element={<Reports />} />
                  <Route path="settings" element={<Settings />} />
                </Route>
              </Route>

              {/* CASHIER SECURE ROUTES */}
              <Route element={<ProtectedRoute requiredRole="Cashier" />}>
                <Route path="/cashier" element={<CashierLayout />}>
                  <Route index element={<CashierDashboard />} />
                  <Route path="billing" element={<Billing />} />
                  <Route path="products" element={<Products />} />
                  <Route path="services" element={<Services />} />
                  <Route path="appointments" element={<Appointments />} />
                  <Route path="customers" element={<Customers />} />
                  <Route path="customers/:id" element={<CustomerDetails />} />
                  <Route path="suppliers/:id" element={<SupplierDetails />} />
                  <Route path="daily-actions" element={<DailyActions />} />
                  <Route path="printed-bills" element={<PrintedBills />} />
                  <Route path="sales-report" element={<CashierReports />} />
                </Route>
              </Route>

              {/* 404 */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </NotificationProvider>
      </GlobalDataProvider>
    </AuthProvider>
  );
};

export default App;
