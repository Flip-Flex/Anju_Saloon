import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ShoppingCart, Package, Users, BarChart2, Settings, LogOut, Printer, ClipboardList, Briefcase, ChevronLeft, ChevronRight, Scissors, Calendar, ArchiveRestore, Gift, Building2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const Sidebar = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const navItems = [
    { name: 'Dashboard', path: '/admin/dashboard', icon: BarChart2 },
    { name: 'Billing', path: '/admin/billing', icon: ShoppingCart },
    { name: 'Products', path: '/admin/products', icon: Package },
    { name: 'Services', path: '/admin/services', icon: Scissors },
    { name: 'Packages', path: '/admin/packages', icon: Gift },
    { name: 'Appointments', path: '/admin/appointments', icon: Calendar },
    { name: 'Stock Movements', path: '/admin/stock-movements', icon: ArchiveRestore },
    { name: 'Supplier Details', path: '/admin/suppliers', icon: Building2 },
    { name: 'Customer Details', path: '/admin/customers', icon: Users },
    { name: 'Staff Management', path: '/admin/staff', icon: Briefcase },
    { name: 'Printed Bills', path: '/admin/printed-bills', icon: Printer },
    { name: 'Daily Actions', path: '/admin/daily-actions', icon: ClipboardList },
    { name: 'Reports', path: '/admin/reports', icon: BarChart2 },
    { name: 'Settings', path: '/admin/settings', icon: Settings },
  ];

  return (
    <aside className={`${isCollapsed ? 'w-20' : 'w-64'} transition-all duration-300 ease-in-out h-screen overflow-hidden flex-shrink-0 bg-blue-500 text-white flex flex-col p-4 sticky top-0`}>
      <div className={`flex items-center mb-8 pt-2 flex-shrink-0 relative h-8 ${isCollapsed ? 'justify-center' : 'justify-between px-1'}`}>
        <div className={`text-base font-bold whitespace-nowrap transition-all duration-300 ease-in-out overflow-hidden ${isCollapsed ? 'w-0 opacity-0 pointer-events-none' : 'w-auto opacity-100'}`}>
          Anjus Beauty Saloon
        </div>
        <button onClick={() => setIsCollapsed(!isCollapsed)} className="p-1 rounded-md hover:bg-blue-600 transition-colors flex-shrink-0">
          {isCollapsed ? <ChevronRight size={24} /> : <ChevronLeft size={24} />}
        </button>
      </div>
      <nav className="flex-1 space-y-2 overflow-x-hidden overflow-y-auto scrollbar-hide pb-4">
        {navItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.path}
            end={item.path === '/admin' || item.path === '/admin/dashboard'}
            title={isCollapsed ? item.name : undefined}
            className={({ isActive }) =>
              `flex items-center py-3 rounded-lg transition-colors ${isActive ? 'bg-blue-700 shadow-inner' : 'hover:bg-blue-600'
              } ${isCollapsed ? 'justify-center px-2 gap-0' : 'px-4 gap-3'}`
            }
          >
            <item.icon size={20} className="flex-shrink-0" />
            <span className={`font-medium whitespace-nowrap overflow-hidden transition-all duration-300 ease-in-out ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
              {item.name}
            </span>
          </NavLink>
        ))}
      </nav>
      <div className="pt-4 border-t border-blue-400/30 overflow-x-hidden">
        <button
          onClick={handleLogout}
          title={isCollapsed ? "Logout" : undefined}
          className={`w-full flex items-center py-3 rounded-lg hover:bg-blue-600 transition-colors ${isCollapsed ? 'justify-center px-2 gap-0' : 'px-4 gap-3'}`}
        >
          <LogOut size={20} className="flex-shrink-0" />
          <span className={`font-medium whitespace-nowrap overflow-hidden transition-all duration-300 ease-in-out ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
            Logout
          </span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
