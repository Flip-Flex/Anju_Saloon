import React, { useState, useEffect, useRef } from "react";
import { billingApi, productApi, customerApi, estimationApi, appointmentApi, Appointment, staffApi, packageApi, customerPackageApi, SalonService } from "@/lib/api";
import { numberToWords } from "@/utils/numberToWords";
import { useGlobalData } from "@/context/GlobalDataContext";
import { useCachedResource } from '@/hooks/useCachedResource';
import { utils, writeFile } from "xlsx";
import {
  Printer,
  Save,
  RotateCcw,
  Pause,
  FileSpreadsheet,
  ShoppingCart,
  User,
  Phone,
  PackageSearch,
  Undo2,
  RefreshCw,
  X,
  MessageSquare,
  Search,
  Mail,
  MessageCircle,
  Briefcase,
  FileText,
  Bell,
  AlertCircle,
  PlusCircle,
  Calendar
} from "lucide-react";
import { motion } from "framer-motion";
import { useLocation } from "react-router-dom";
// Removed useLocalStorage
// import { db } from "@/lib/firebase"; // Removed
// import { doc, getDoc } from "firebase/firestore"; // Removed
import { toast } from 'react-hot-toast';
import { useConfirm } from '@/hooks/useConfirm';
import { SyncIndicator } from '@/components/SyncIndicator';
import { BillRenderer } from "@/components/BillRenderer";
import { mapExeBillData } from "@/utils/exeBillAdapter";
import { useReactToPrint } from 'react-to-print';
import ServiceSelector from './ServiceSelector';

// --- Reusable Center Popup ---


// --- Interfaces ---
interface Product {
  id: string;
  barcode: string;
  name: string;
  price: number;
  sellingPrice?: number;
  RetailSellingPrice?: number;
  quantity?: number;
  stockQuantity?: number | null;
  availabilityStatus?: 'AVAILABLE' | 'UNAVAILABLE' | 'DISCONTINUED';
  inventoryTracking?: 'NOT_TRACKED' | 'TRACKED';
  imageUrl?: string;
  vendorId?: string;
  vendorName?: string;
}

interface BillItem extends Product {
  type?: 'PRODUCT' | 'SERVICE' | 'PACKAGE';
  serviceId?: string;
  packageId?: string;
  isRedeemed?: boolean;
  customerPackageId?: string;
  staffId?: string;
  staffName?: string;
  qty: number | string;
  total: number;
  GST: number;
  gstPrice?: number;
  finalPrice?: number;
  Discount: number | string; // %
  discount?: number | string;
  discountAmt?: number | string; // Amount
  purchaseRate?: number;
  RetailSellingPrice?: number;
  sellingPrice?: number;
  systemType?: "Retail" | "SERVICE" | "PACKAGE";
  commissionType?: 'PERCENTAGE' | 'FIXED';
  commissionValue?: number;
  staffCommissionAmount?: number;
  category?: string;
}


// --- Return Modal Component (unchanged) ---

// --- Return Modal Component (unchanged) ---
const ReturnModal = ({ onFind, onClose }: { onFind: (invoiceId: string) => void; onClose: () => void; }) => {
  const [invoiceId, setInvoiceId] = useState("");
  const handleFindClick = () => { if (invoiceId.trim()) { onFind(invoiceId.trim()); } };
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">Find Bill for Return</h2><button onClick={onClose} className="text-gray-500 hover:text-gray-800"><X /></button></div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Enter Invoice Number..."
            value={invoiceId}
            onChange={(e) => setInvoiceId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleFindClick();
              }
            }}
            className="form-input flex-grow"
          />
          <button onClick={handleFindClick} className="px-3 py-1.5 text-sm bg-blue-500 text-white font-semibold rounded-md hover:bg-blue-600">Find</button>
        </div>
      </motion.div>
    </div>
  );
};

// --- Helpers from Reference ---
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const standardizeProduct = (p: any) => {
  const price = Number(p.price || p.RetailSellingPrice || p.sellingPrice || 0);

  return {
    ...p,
    id: p.id,
    barcode: p.barcode || p.id,
    name: p.name,
    price: price,
    stockQuantity: p.inventoryTracking === 'NOT_TRACKED' ? null : Number(p.stockQuantity || p.RetailStockQuantity || 0),
    availabilityStatus: p.availabilityStatus || 'AVAILABLE',
    inventoryTracking: p.inventoryTracking || 'NOT_TRACKED',
    gst: Number(p.gst || p.GST || p.gstPercent || 0),
    imageUrl: p.imageUrl || "",
    systemType: p.systemType || "Retail"
  };
};

const computeItem = (item: BillItem): BillItem => {
  const unitPrice = Number(item.price || 0);
  const qty = Number(item.qty || 0);
  const discountRate = Number(item.Discount || 0);
  const gstRate = Number(item.GST || 0);

  const subtotal = round2(unitPrice * qty);
  const discountAmount = round2(subtotal * (discountRate / 100));
  const amountAfterDiscount = round2(subtotal - discountAmount);

  const taxable = round2(amountAfterDiscount / (1 + (gstRate / 100)));
  const gstAmount = round2(amountAfterDiscount - taxable);
  const netAmount = round2(amountAfterDiscount);

  return {
    ...item,
    total: netAmount,
  };
};



const buildPayloadFromUIItems = (
  uiItems: BillItem[],
  customerName: string,
  customerPhoneRaw: string,
  customerEmail: string,
  customerAddress: string,
  paymentMethod: string,
  receivedAmountRaw: string,
  customerGst: string,
  invoiceMode: string,
  staffId?: string,
  staffCommissionPercentage?: string | number,
  cashAmountRaw?: string,
  onlineAmountRaw?: string,
  enableExpiryReminder?: boolean,
  expiryDays?: string | number,
  customerId?: string | null,
  taxType: "INTRA_STATE" | "INTER_STATE" = "INTRA_STATE",
  loyaltyDiscount: number = 0,
  loyaltyPointsRedeemed: number = 0,
  loyaltyPointsEarned: number = 0
) => {
  const items = uiItems.map((ui) => {
    const unitPrice = Number(ui.price || 0);
    const qty = Number(ui.qty || 0);
    const discountRate = Number(ui.Discount || 0);
    const gstRate = Number(ui.GST || 0);

    const subtotal = round2(unitPrice * qty);
    const discountAmount = round2(subtotal * (discountRate / 100));
    const amountAfterDiscount = round2(subtotal - discountAmount);

    // Inclusive GST math
    const taxable = round2(amountAfterDiscount / (1 + (gstRate / 100)));
    const gstAmount = round2(amountAfterDiscount - taxable);
    const netAmount = amountAfterDiscount;

    const cgstAmount = taxType === "INTRA_STATE" ? round2(gstAmount / 2) : 0;
    const sgstAmount = taxType === "INTRA_STATE" ? round2(gstAmount / 2) : 0;
    const igstAmount = taxType === "INTER_STATE" ? gstAmount : 0;

    const productId = (ui as any).id || ui.barcode || "";
    const isService = ui.type === "SERVICE" || !!ui.serviceId;
    const itemStaffId = ui.staffId || staffId || "";

    let itemStaffComm = 0;
    if (isService && itemStaffId) {
      if (ui.commissionType === 'FIXED') {
        itemStaffComm = (Number(ui.commissionValue) || 0) * Number(qty);
      } else if (ui.commissionValue && Number(ui.commissionValue) > 0) {
        itemStaffComm = (netAmount * Number(ui.commissionValue)) / 100;
      } else if (staffCommissionPercentage && Number(staffCommissionPercentage) > 0) {
        itemStaffComm = (netAmount * Number(staffCommissionPercentage)) / 100;
      }
      itemStaffComm = round2(itemStaffComm);
    }

    return {
      type: ui.type || (ui.serviceId ? "SERVICE" : "PRODUCT"),
      productId: isService ? "" : productId,
      serviceId: isService ? (ui.serviceId || productId) : "",
      packageId: ui.type === "PACKAGE" ? productId : "",
      staffId: itemStaffId,
      staffName: ui.staffName || "",
      productName: ui.name || "",
      quantity: Number(qty) || 0,
      qty: Number(qty) || 0,
      unitPrice: Number(unitPrice) || 0,
      price: Number(unitPrice) || 0,
      gstPercent: Number(gstRate) || 0,
      gstRate: Number(gstRate) || 0,
      discountRate: Number(discountRate) || 0,
      purchaseRate: Number(ui.purchaseRate || 0),
      purchaseGstRate: 0,
      subtotal,
      baseAmount: taxable,
      discountAmount,
      gstAmount,
      cgstAmount,
      sgstAmount,
      igstAmount,
      finalAmount: netAmount,
      netAmount,
      total: netAmount,
      imageUrl: ui.imageUrl || "",
      isRedeemed: ui.isRedeemed || false,
      customerPackageId: ui.customerPackageId || "",
      commissionType: ui.commissionType || "",
      commissionValue: ui.commissionValue || 0,
      staffCommissionAmount: itemStaffComm
    };
  });

  const totalDiscountAmount = round2(items.reduce((s, it) => s + it.discountAmount, 0));
  const totalGstAmount = round2(items.reduce((s, it) => s + it.gstAmount, 0));
  const cgstAmountTotal = round2(items.reduce((s, it) => s + (it as any).cgstAmount || 0, 0));
  const sgstAmountTotal = round2(items.reduce((s, it) => s + (it as any).sgstAmount || 0, 0));
  const igstAmountTotal = round2(items.reduce((s, it) => s + (it as any).igstAmount || 0, 0));
  let finalAmount = round2(items.reduce((s, it) => s + it.netAmount, 0));
  
  // Apply Loyalty Discount
  if (loyaltyDiscount > 0) {
    finalAmount = round2(Math.max(0, finalAmount - loyaltyDiscount));
  }

  const receivedAmount = parseFloat(receivedAmountRaw || "") || 0;
  let amountPaid = (paymentMethod === 'Cash' && receivedAmount >= finalAmount)
    ? finalAmount
    : (receivedAmount > 0 || paymentMethod === 'PARTIAL' ? receivedAmount : finalAmount);

  let cashPaid = 0;
  let onlinePaid = 0;
  if (paymentMethod === 'Split Payment') {
    cashPaid = parseFloat(cashAmountRaw || "") || 0;
    onlinePaid = parseFloat(onlineAmountRaw || "") || 0;
    amountPaid = cashPaid + onlinePaid;
  }

  const totalItemCommissions = round2(items.reduce((s, it) => s + (it.staffCommissionAmount || 0), 0));
  const staffCommissionAmount = totalItemCommissions > 0
    ? totalItemCommissions
    : ((staffCommissionPercentage && Number(staffCommissionPercentage) > 0)
        ? round2(finalAmount * (Number(staffCommissionPercentage) / 100))
        : 0);

  const isPartial = paymentMethod === 'PARTIAL';
  const pendingAmount = isPartial ? round2(finalAmount - amountPaid) : 0;
  const nowIso = new Date().toISOString();

  return {
    customerName: customerName || "",
    customerPhone: Number(customerPhoneRaw ? customerPhoneRaw.toString().replace(/\D/g, '') : 0) || 0,
    customerEmail: customerEmail || "",
    customerAddress: customerAddress || "",
    customerGst: customerGst || "",
    invoiceMode: invoiceMode || "GST_INVOICE",
    staffId: staffId || "",
    staffCommissionPercentage: Number(staffCommissionPercentage) || 0,
    staffCommissionAmount,
    paymentMethod: paymentMethod === 'Split Payment' ? 'CASH + UPI' : paymentMethod,
    amountPaid: Number(round2(amountPaid)),
    pendingAmount: Number(round2(pendingAmount)),
    cashAmount: paymentMethod === 'Split Payment' ? Number(round2(cashPaid)) : 0,
    onlineAmount: paymentMethod === 'Split Payment' ? Number(round2(onlinePaid)) : 0,
    items,
    totalDiscountAmount,
    totalGstAmount,
    cgstAmount: cgstAmountTotal,
    sgstAmount: sgstAmountTotal,
    igstAmount: igstAmountTotal,
    taxType,
    subtotal: round2(items.reduce((s, it) => s + (it.unitPrice * it.quantity), 0)),
    totalAmount: finalAmount,
    finalAmount,
    enableExpiryReminder: !!enableExpiryReminder,
    expiryDays: (expiryDays !== undefined && expiryDays !== null && expiryDays !== "") ? Number(expiryDays) : 30,
    customerId: customerId || "",
    billType: invoiceMode === "ESTIMATE" ? "ESTIMATE" : "RETAIL",
    systemType: "Retail",
    loyaltyDiscount,
    loyaltyPointsRedeemed,
    loyaltyPointsEarned,
    createdAt: nowIso,
    date: nowIso
  };
};

const ProductSelectionModal = ({ products, onSelect, onClose }: { products: any[]; onSelect: (product: any) => void; onClose: () => void; }) => {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
      <motion.div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Select Product</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800"><X /></button>
        </div>
        <div className="flex-grow overflow-y-auto border rounded-md">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-100 sticky top-0">
              <tr>
                <th className="p-3 font-semibold text-center">Image</th>
                <th className="p-3 font-semibold">Name</th>
                <th className="p-3 font-semibold">Price</th>
                <th className="p-3 font-semibold">Inventory</th>
                <th className="p-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id || product.barcode} className="border-b hover:bg-gray-50">
                  <td className="p-3 text-center">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt={product.name} className="w-10 h-10 object-cover rounded mx-auto shadow-sm" />
                    ) : (
                      <div className="w-10 h-10 bg-gray-100 border border-dashed border-gray-300 rounded mx-auto flex items-center justify-center text-[10px] text-gray-400 font-medium">Img</div>
                    )}
                  </td>
                  <td className="p-3">{product.name}</td>
                  <td className="p-3">₹{product.price}</td>
                  <td className="p-3">{product.inventoryTracking === 'NOT_TRACKED' ? 'Unlimited' : product.stockQuantity}</td>
                  <td className="p-3">
                    <button
                      onClick={() => onSelect(product)}
                      className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-xs"
                    >
                      Select
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
};

const AppointmentModal = ({ appointments, onSelect, onClose }: { appointments: Appointment[]; onSelect: (appt: Appointment) => void; onClose: () => void; }) => {
  const today = new Date().toISOString().split('T')[0];
  const scheduledAppointments = appointments.filter(a => a.status === 'SCHEDULED' && a.date === today);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
      >
        <div className="bg-blue-600 px-6 py-4 flex justify-between items-center text-white">
          <div className="flex items-center gap-2">
            <Calendar size={20} />
            <h2 className="text-base font-bold">Select Today's Appointment</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
          {scheduledAppointments.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              <Calendar className="mx-auto h-12 w-12 opacity-20 mb-3" />
              <p>No scheduled appointments for today.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {scheduledAppointments.map(appt => (
                <div key={appt.id} className="bg-white border rounded-lg p-4 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer flex justify-between items-center" onClick={() => onSelect(appt)}>
                  <div>
                    <h3 className="font-bold text-gray-800">{appt.customerName}</h3>
                    <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                      <Phone size={14} /> {appt.customerPhone || 'No Phone'}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-semibold bg-blue-100 text-blue-800 px-2 py-1 rounded-full">{appt.time}</span>
                    <p className="text-xs text-gray-500 mt-1">{appt.serviceIds.length} Service(s)</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

const Billing: React.FC = () => {
  const {
    products: globalProducts,
    salonServices,
    packages,
    appointments,
    refreshAppointments,

    customers: globalCustomers,
    staff,
    bills: globalBills,
    holds: globalHolds,
    cancelledBills: globalCancelled,
    loading: globalLoading,
    isSyncing: globalSyncing,
    refreshProducts,
    refreshSalonServices,
    refreshPackages,

    refreshCustomers,
    refreshBills,
    refreshHolds,
    refreshCancelled,
    settings
  } = useGlobalData();

  const [barcode, setBarcode] = useState("");
  const [items, setItems] = useState<BillItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerGst, setCustomerGst] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [loading, setLoading] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [lastSelectedProduct, setLastSelectedProduct] = useState<any | null>(null);
  const [receivedAmount, setReceivedAmount] = useState("");
  const [loadEstId, setLoadEstId] = useState("");
  // Split Payment state variables
  const [cashAmount, setCashAmount] = useState("");
  const [onlineAmount, setOnlineAmount] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [staffCommissionPercentage, setStaffCommissionPercentage] = useState("");
  const [enableExpiryReminder, setEnableExpiryReminder] = useState(false);
  const [expiryDays, setExpiryDays] = useState("30");
  const [taxType, setTaxType] = useState<"INTRA_STATE" | "INTER_STATE">("INTRA_STATE");
  const [dismissedReminders, setDismissedReminders] = useState<string[]>([]);

  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerPackages, setCustomerPackages] = useState<any[]>([]);

  useEffect(() => {
    if (customerId) {
      customerPackageApi.getByCustomer(customerId).then(res => {
        if (res.data) setCustomerPackages(res.data);
      }).catch(console.error);
    } else {
      setCustomerPackages([]);
    }
  }, [customerId]);

  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSelectionModalOpen, setIsSelectionModalOpen] = useState(false);
  const [isReturnMode, setIsReturnMode] = useState(false);
  const [originalBillDate, setOriginalBillDate] = useState<Date | null>(null);
  const [originalInvoiceId, setOriginalInvoiceId] = useState<string>("");
  const [originalTotal, setOriginalTotal] = useState(0);
  const [customerMode, setCustomerMode] = useState("Walk-in");
  const [documentMode, setDocumentMode] = useState<"Billing" | "Estimation">("Billing");
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);

  const location = useLocation();

  // Handle appointment state passed via navigation or persistent URL query param
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const queryApptId = searchParams.get('appointmentId');
    const apt = location.state?.appointment || (queryApptId ? appointments.find(a => a.id === queryApptId) : null);

    if (apt && salonServices.length > 0) {
      if (!selectedAppointmentId || selectedAppointmentId !== apt.id) {
        setCustomerName(apt.customerName || "");
        setCustomerPhone(apt.customerPhone || "");
        
        const newItems: BillItem[] = [];
        apt.serviceIds?.forEach((serviceId: string) => {
          const service = salonServices.find(s => s.id === serviceId);
          if (service) {
            const item = standardizeProduct(service);
            newItems.push(computeItem({
              ...item,
              type: 'SERVICE',
              qty: 1,
              Discount: 0,
              staffId: apt.staffId || ""
            } as any));
          }
        });
        
        if (newItems.length > 0) {
          setItems(newItems);
        }
        
        setSelectedAppointmentId(apt.id || null);
      }
    }
  }, [location.state, location.search, appointments, salonServices, selectedAppointmentId]);

  const [activeBillId, setActiveBillId] = useState<string | null>(null);
  const [isHoldLoaded, setIsHoldLoaded] = useState(false);
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const [highlightedProductIndex, setHighlightedProductIndex] = useState(0);
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);

  const barcodeInputRef = React.useRef<HTMLInputElement>(null);
  const customerNameRef = React.useRef<HTMLInputElement>(null);
  const customerPhoneRef = useRef<HTMLInputElement>(null);
  const customerEmailRef = useRef<HTMLInputElement>(null);
  const customerGstRef = useRef<HTMLInputElement>(null);
  const customerAddressRef = useRef<HTMLInputElement>(null);

  const shopName = settings?.shopName || 'Anjus Beauty Saloon';
  const gstNumberRaw = settings?.gstNumber || '33HFVPS1108J1Z0';
  const defaultGst = settings?.defaultGst || '0';

  // Loyalty Settings
  const loyaltyEnabled = settings?.loyaltyEnabled || false;
  const loyaltySpendRatio = settings?.loyaltySpendRatio || 100;
  const loyaltyRedeemValue = settings?.loyaltyRedeemValue || 1;
  const [loyaltyPointsToRedeem, setLoyaltyPointsToRedeem] = useState<number>(0);

  const gstNumber =
    !gstNumberRaw || gstNumberRaw === 'YOUR_GST_NUMBER_HERE'
      ? '33HFVPS1108J1Z0'
      : gstNumberRaw.toString().trim();

  const billMessage = settings?.billMessage || 'Thank You For Your Purchasing';
  const isSyncing = globalSyncing;

  const holds = React.useMemo(() => {
    return (globalHolds || []).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [globalHolds]);

  const savedEstimations = React.useMemo(() => {
    return (globalBills || []).filter((b: any) =>
      ((b as any).invoiceMode === 'ESTIMATE' || b.billType === 'ESTIMATE') && b.status !== 'CANCELLED'
    ).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [globalBills]);


  useEffect(() => {
    refreshBills();
    refreshHolds();
    refreshProducts();
    if (refreshSalonServices) refreshSalonServices();
    if (refreshPackages) refreshPackages();
  }, []);

  // Recalculate prices when switching between Retail and Retail
  useEffect(() => {
    setItems((prev) =>
      prev.map((item) => {
        const product = globalProducts.find((p: any) => p.barcode === item.barcode);
        if (!product) return item;

        const resolvedPrice = product.price;
        return {
          ...item,
          price: resolvedPrice,
          total: calculateItemTotal(resolvedPrice, item.qty, item.Discount, item.GST)
        };
      })
    );
  }, [globalProducts]);

  // Auto-detect taxType based on Customer GST
  useEffect(() => {
    if (customerGst && customerGst.trim().length > 0) {
      const trimmedGst = customerGst.trim();
      // If starts with 33 -> TN (Intra-state)
      // If starts with anything else (1, 2, 3, etc.) -> Inter-state
      if (trimmedGst.startsWith("33")) {
        setTaxType("INTRA_STATE");
      } else {
        setTaxType("INTER_STATE");
      }
    } else {
      // Default to Intra-state if no GST provided
      setTaxType("INTRA_STATE");
    }
  }, [customerGst]);

  const [customerSuggestions, setCustomerSuggestions] = useState<any[]>([]);
  const [phoneSuggestions, setPhoneSuggestions] = useState<any[]>([]);
  const [productSuggestions, setProductSuggestions] = useState<any[]>([]);

  const { confirm: confirmAction, ConfirmationDialog } = useConfirm();

  const addProductToBill = (product: any) => {
    console.log('[BILLING DEBUG] addProductToBill called with:', product);
    const detectedType = product.systemType || "Retail";

    setLastSelectedProduct(product);

    setItems((prev) => {
      const itemKey = product.barcode || product.id;
      const existingItem = prev.find((i) => (i.barcode || i.id) === itemKey);

      if (existingItem) {
        return prev.map((i) =>
          (i.barcode || i.id) === itemKey
            ? { ...i, qty: Number(i.qty) + 1, total: calculateItemTotal(Number(i.price), Number(i.qty) + 1, i.Discount, i.GST) }
            : i
        );
      } else {
        const resolvedPrice = Number(product.price) || 0;
        const resolvedGst = Number(product.gst || defaultGst) || 0;

        if (resolvedPrice <= 0) {
          toast.error(`Cannot add product with zero price: ${product.name}`);
          return prev;
        }

        const newItem: BillItem = {
          id: product.id,
          barcode: product.barcode || product.id,
          name: product.name,
          price: resolvedPrice,
          RetailSellingPrice: Number(product.RetailSellingPrice || product.sellingPrice || resolvedPrice),
          GST: resolvedGst,
          Discount: "",
          quantity: Number(product.quantity ?? product.stockQuantity) || 1,
          qty: 1,
          total: calculateItemTotal(resolvedPrice, 1, 0, resolvedGst),
          purchaseRate: Number(product.purchaseRate) || 0,
          systemType: detectedType,
          imageUrl: product.imageUrl || ""
        };
        return [...prev, newItem];
      }
    });
    setBarcode("");
    setProductSuggestions([]);
    setSearchResults([]);
    setIsSelectionModalOpen(false);
    toast.success(`Added ${product.name}`);
    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 50);
  };

  const handleProductSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setBarcode(val);

    if (val.trim()) {
      const normalizeId = (id: any) => id ? id.toString().replace(/^0+/, '') : '';
      const normalizedInput = normalizeId(val);
      const allSearchableItems = [
        ...globalProducts,
        ...salonServices.map(s => ({ ...s, systemType: 'SERVICE', price: s.price })),
        ...packages.map(p => ({ ...p, systemType: 'PACKAGE', price: p.price }))
      ];

      const matches = allSearchableItems
        .filter(p =>
          (((p as any).barcode && normalizeId((p as any).barcode) === normalizedInput)) ||
          (p.id && normalizeId(p.id) === normalizedInput) ||
          (p.name && p.name.toLowerCase().includes(val.toLowerCase()))
        )
        .slice(0, 10)
        .map(p => standardizeProduct(p));

      setProductSuggestions(matches);
      setIsProductDropdownOpen(true);
      setHighlightedProductIndex(0);
    } else {
      setProductSuggestions([]);
      setIsProductDropdownOpen(false);
    }
  };

  const handleProductKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIsProductDropdownOpen(true);
      setHighlightedProductIndex(prev => (prev + 1) % productSuggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIsProductDropdownOpen(true);
      setHighlightedProductIndex(prev => (prev - 1 + productSuggestions.length) % productSuggestions.length);
    } else if (e.key === "Enter") {
      if (isProductDropdownOpen && productSuggestions.length > 0) {
        e.preventDefault();
        addProductToBill(productSuggestions[highlightedProductIndex]);
        setIsProductDropdownOpen(false);
      } else {
        handleAddProduct();
      }
    } else if (e.key === "Escape") {
      setIsProductDropdownOpen(false);
    }
  };

  const handleCustomerNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomerName(val);

    if (val.trim()) {
      const cleanVal = val.replace(/\D/g, '');
      const matches = globalCustomers.filter(c =>
        c.name.toLowerCase().includes(val.toLowerCase()) ||
        (c.phone && c.phone.includes(val)) ||
        (cleanVal.length >= 3 && (c.phone || '').replace(/\D/g, '').includes(cleanVal))
      ).slice(0, 10);
      setCustomerSuggestions(matches);
    } else {
      setCustomerSuggestions([]);
      if (customerId && !customerPhone) setCustomerId(null);
    }
  };

  const handleCustomerNameBlur = () => {
    setTimeout(() => {
      setCustomerSuggestions([]);
      if (!customerId && customerName && customerName.trim().length > 1) {
        const match = globalCustomers.find(c =>
          c.name.trim().toLowerCase() === customerName.trim().toLowerCase()
        );
        if (match) {
          selectCustomer(match);
          toast.success(`Existing customer loaded: ${match.name}`, { id: 'cust-match' });
        }
      }
    }, 250);
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomerPhone(val);

    if (val.trim()) {
      const cleanVal = val.replace(/\D/g, '');
      const matches = globalCustomers.filter(c => {
        const cPhone = (c.phone || '').toString().replace(/\D/g, '');
        return (c.phone && c.phone.includes(val)) ||
               (cleanVal.length >= 2 && cPhone.includes(cleanVal)) ||
               c.name.toLowerCase().includes(val.toLowerCase());
      }).slice(0, 10);
      setPhoneSuggestions(matches);

      // Auto-fetch existing customer if exact 10 digits entered
      if (cleanVal.length >= 10) {
        const exact = globalCustomers.find(c => {
          const cPhone = (c.phone || '').toString().replace(/\D/g, '');
          return cPhone === cleanVal || (cPhone.length >= 10 && cPhone.slice(-10) === cleanVal.slice(-10));
        });
        if (exact) {
          selectCustomer(exact);
          toast.success(`Existing customer loaded: ${exact.name}`, { id: 'cust-match' });
        }
      }
    } else {
      setPhoneSuggestions([]);
      if (customerId && !customerName) setCustomerId(null);
    }
  };

  const handlePhoneBlur = () => {
    setTimeout(() => {
      setPhoneSuggestions([]);
      if (!customerId && customerPhone) {
        const cleanVal = customerPhone.replace(/\D/g, '');
        if (cleanVal.length >= 7) {
          const match = globalCustomers.find(c => {
            const cp = (c.phone || '').toString().replace(/\D/g, '');
            return cp === cleanVal || (cp.length >= 10 && cleanVal.length >= 10 && cp.slice(-10) === cleanVal.slice(-10));
          });
          if (match) {
            selectCustomer(match);
            toast.success(`Existing customer loaded: ${match.name}`, { id: 'cust-match' });
          }
        }
      }
    }, 250);
  };

  const selectCustomer = (customer: any) => {
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone || "");
    setCustomerEmail(customer.email || "");
    setCustomerAddress(customer.address || customer.location || customer.Address || "");
    setCustomerGst(customer.gstin || customer.gst || "");
    setCustomerId(customer.id);
    setLoyaltyPointsToRedeem(0);
    setCustomerSuggestions([]);
    setPhoneSuggestions([]);
  };

  // fetchCustomers removed as we use globalCustomers context


  const calculateItemTotal = (price: number, qty: number | string, discountPercent: number | string, gstPercent: number | string): number => {
    const p = Number(price) || 0;
    const q = Number(qty) || 0;
    const dp = Number(discountPercent) || 0;

    // Inclusive logic: price already includes GST
    const baseAmount = p * q;
    const discountAmt = baseAmount * (dp / 100);
    const amountAfterDiscount = baseAmount - discountAmt;

    return Math.round(amountAfterDiscount);
  };

  const handleDiscountChange = (barcode: string, discount: string) => {
    const val = discount === "" ? "" : Number(discount);
    setItems((prev) =>
      prev.map((i) => {
        if ((i.barcode || i.id) === barcode) {
          const baseAmount = Number(i.price) * Number(i.qty || 0);
          const amt = val === "" ? 0 : (baseAmount * (Number(val) / 100));
          return {
            ...i,
            Discount: val,
            discountAmt: amt || "",
            total: calculateItemTotal(i.price, i.qty, val, i.GST)
          };
        }
        return i;
      })
    );
  };

  const handleDiscountAmtChange = (barcode: string, discountAmt: string) => {
    const amt = discountAmt === "" ? "" : Number(discountAmt);
    setItems((prev) =>
      prev.map((i) => {
        if ((i.barcode || i.id) === barcode) {
          const baseAmount = Number(i.price) * Number(i.qty || 0);
          const percent = (amt === "" || baseAmount === 0) ? 0 : (Number(amt) / baseAmount) * 100;
          return {
            ...i,
            discountAmt: amt,
            Discount: percent.toFixed(2),
            total: calculateItemTotal(i.price, i.qty, percent, i.GST)
          };
        }
        return i;
      })
    );
  };

  const handleSendSMS = async () => {
    if (!items.length) {
      toast.error("Add at least one item to send an SMS.");
      return;
    }
    if (!customerPhone || customerPhone.trim().length < 10) {
      toast.error("Please enter a valid 10-digit customer phone number.");
      return;
    }

    confirmAction(`Send bill details via SMS to ${customerPhone}?`, async () => {
      setLoading(true);
      try {
        const billId = await handleSaveBill();
        const domain = window.location.hostname === 'localhost' ? 'https://anjussaloon.web.app' : window.location.origin;
        const billUrl = `${domain}/bill/${billId}`;
        const message = `Thank you for shopping at ${shopName}! View your bill for Rs. ${(totalAmount || 0).toFixed(2)} here: ${billUrl}`;

        // Send SMS securely via the backend or SMS service
        let formattedPhone = customerPhone.trim();
        if (!formattedPhone.startsWith("+")) formattedPhone = "+91" + formattedPhone;

        const smsApiUrl = (import.meta as any).env.VITE_SMS_API_URL || (window.location.hostname === 'localhost' ? 'http://localhost:5000/send-sms' : '/api/send-sms');
        try {
          const response = await fetch(smsApiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ to: formattedPhone, body: message })
          });

          const responseData = await response.json();
          if (!response.ok) throw new Error(responseData.error || "Failed to send SMS");

          toast.success(`SMS sent successfully to ${customerPhone}!`);
        } catch (fetchErr: any) {
          console.warn("SMS gateway unreachable:", fetchErr);
          toast.error("SMS service not available. Please use WhatsApp to share the bill link.");
        }
      } catch (err: any) {
        console.error("🔥 Error in saving bill for SMS:", err);
        toast.error(err.message || "Failed to process bill.");
      } finally {
        setLoading(false);
      }
    });
  };

  const handleSendWhatsApp = async () => {
    if (!items.length) {
      toast.error("Add at least one item to send a WhatsApp message.");
      return;
    }
    if (!customerPhone || customerPhone.trim().length < 10) {
      toast.error("Please enter a valid 10-digit customer phone number.");
      return;
    }

    confirmAction(`Send bill details via WhatsApp to ${customerPhone} automatically?`, async () => {
      setLoading(true);
      try {
        const billId = await handleSaveBill();
        const domain = window.location.hostname === 'localhost' ? 'https://anjussaloon.web.app' : window.location.origin;
        const billUrl = `${domain}/bill/${billId}`;
        const message = `*Invoice from ${shopName}*\n\nHello *${customerName || 'Customer'}*,\nThank you for shopping with us!\nYour bill (ID: ${billId}) for *Rs. ${(Number(totalAmount) || 0).toFixed(2)}* is ready.\n\n📄 *View & Download Invoice:* \n${billUrl}\n\nHave a great day!`;

        let phone = customerPhone.replace(/\D/g, '');
        if (phone.length === 10) phone = '91' + phone;
        const encodedMessage = encodeURIComponent(message);
        const whatsappUrl = `https://wa.me/${phone}?text=${encodedMessage}`;
        window.open(whatsappUrl, '_blank');
        toast.success("WhatsApp opened! Please click send.");
      } catch (err: any) {
        console.error("Error in sending WhatsApp:", err);
        toast.error(err.message || "Failed to process WhatsApp request.");
      } finally {
        setLoading(false);
      }
    });
  };

  const handleAddProduct = async () => {
    console.log('[BILLING DEBUG] handleAddProduct called. barcode:', JSON.stringify(barcode));
    console.log('[BILLING DEBUG] globalProducts count:', globalProducts?.length, 'first:', globalProducts?.[0]);
    if (!barcode || barcode.trim() === "") {
      const allProducts = [
        ...globalProducts.map(p => ({ ...p, type: 'PRODUCT' })),
        ...salonServices.map(s => ({ ...standardizeProduct(s), type: 'SERVICE' }))
      ];
      const availableProducts = allProducts.filter(p => (p.availabilityStatus || 'AVAILABLE') === 'AVAILABLE' || p.type === 'SERVICE');
      
      // Deduplicate by ID
      const uniqueAvailableProducts = Array.from(new Map(availableProducts.map(p => [p.id, p])).values());

      setSearchResults(uniqueAvailableProducts);
      setIsSelectionModalOpen(true);
      return;
    }

    const processedBarcode = barcode.trim();

    const addToItems = (product: any) => {
      setLastSelectedProduct(product);

      setItems((prev) => {
        const itemKey = product.barcode || product.id;
        const existingItem = prev.find((i) => (i.barcode || i.id) === itemKey);

        if (existingItem) {
          return prev.map((i) =>
            (i.barcode || i.id) === itemKey
              ? { ...i, qty: Number(i.qty) + 1, total: calculateItemTotal(i.price, Number(i.qty) + 1, i.Discount, i.GST) }
              : i
          );
        } else {
          const newItem: BillItem = {
            id: product.id,
            barcode: product.barcode || product.id,
            name: product.name,
            price: product.price,
            RetailSellingPrice: product.RetailSellingPrice,
            GST: Number(defaultGst) || 0,
            Discount: 0,
            quantity: product.quantity ?? product.stockQuantity ?? 1,
            qty: 1,
            total: calculateItemTotal(product.price, 1, 0, Number(defaultGst) || 0),
            purchaseRate: product.purchaseRate || 0,
            type: product.type || "PRODUCT",
            systemType: product.systemType || "Retail",
            imageUrl: product.imageUrl || ""
          };
          return [...prev, newItem];
        }
      });
      setBarcode("");
      setSearchResults([]);
      setIsSelectionModalOpen(false);
    };

    const normalizeId = (id: any) => id ? id.toString().trim() : '';
    const normalizedInput = processedBarcode;

    const allProducts = [
      ...globalProducts.map(p => ({ ...p, type: 'PRODUCT' })),
      ...salonServices.map(s => ({ ...standardizeProduct(s), type: 'SERVICE' }))
    ];
    const availableProducts = allProducts.filter(p => (p.availabilityStatus || 'AVAILABLE') === 'AVAILABLE' || p.type === 'SERVICE');
    const uniqueAvailableProducts = Array.from(new Map(availableProducts.map(p => [p.id, p])).values());

    const matches = uniqueAvailableProducts.filter(p =>
      (p.barcode && normalizeId(p.barcode) === normalizedInput) ||
      (p.id && normalizeId(p.id) === normalizedInput) ||
      (p.name && p.name.toLowerCase().includes(barcode.toLowerCase()))
    );

    if (matches.length === 1) {
      addToItems(matches[0]);
      return;
    } else if (matches.length > 1) {
      setSearchResults(matches);
      setIsSelectionModalOpen(true);
      return;
    }

    try {
      setLoading(true);
      const fetchProduct = async (code: string) => {
        try {
          const res = await productApi.getByBarcode(encodeURIComponent(code));
          return res.data;
        } catch (e) { return null; }
      };

      let product = await fetchProduct(processedBarcode);

      if (!product && processedBarcode.length === 6) {
        product = await fetchProduct(`0${processedBarcode}`);
      }

      if (product) {
        addToItems(product);
      } else {
        toast.error("Product not found.");
      }
    } catch (err: any) {
      toast.error("An error occurred during search.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddService = (service: SalonService) => {
    const newItem: BillItem = {
      type: 'SERVICE',
      serviceId: service.id,
      id: service.id || '',
      name: service.name,
      category: service.categoryId || '',
      barcode: '', // services don't have barcodes
      purchaseRate: 0,
      sellingPrice: service.price,
      price: service.price,
      stockQuantity: null,
      inventoryTracking: 'NOT_TRACKED',
      availabilityStatus: 'AVAILABLE',
      vendorId: '',
      vendorName: '',
      qty: 1,
      quantity: 1,
      total: calculateItemTotal(service.price, 1, 0, Number(defaultGst) || 0),
      GST: Number(defaultGst) || 0,
      Discount: 0,
      commissionType: service.commissionType || 'PERCENTAGE',
      commissionValue: Number(service.commissionValue || 0),
    };

    setItems((prev) => {
      const existingItem = prev.find((i) => i.type === 'SERVICE' && i.serviceId === service.id);
      if (existingItem) {
        return prev.map((i) =>
          i.type === 'SERVICE' && i.serviceId === service.id
            ? { ...i, qty: Number(i.qty) + 1, total: calculateItemTotal(i.price, Number(i.qty) + 1, i.Discount, i.GST) }
            : i
        );
      }
      return [...prev, newItem];
    });
  };

  const handleRedeemPackageService = (pkg: any, itemIndex: number) => {
    if (!pkg || !pkg.items || !pkg.items[itemIndex]) {
      toast.error("Invalid package service selected");
      return;
    }
    const serviceItem = pkg.items[itemIndex];
    const totalQty = Number(serviceItem.totalQuantity) || 0;
    const usedQty = Number(serviceItem.usedQuantity) || 0;
    const remaining = totalQty - usedQty;
    
    if (remaining <= 0) {
      toast.error("This service has been fully used in this package.");
      return;
    }

    // Check if user already added this package service to current cart
    const alreadyInCart = items
      .filter(it => it.isRedeemed && it.customerPackageId === pkg.id && it.serviceId === serviceItem.serviceId)
      .reduce((sum, it) => sum + (Number(it.quantity || it.qty) || 1), 0);

    if (alreadyInCart >= remaining) {
      toast.error(`All ${remaining} remaining session(s) of this service are already added to your bill.`);
      return;
    }
    
    const newItem: BillItem = {
      id: `redeem-${pkg.id}-${serviceItem.serviceId}-${Date.now()}`,
      barcode: `PKG-${(pkg.packageName || '').substring(0, 3).toUpperCase()}`,
      name: `(Package Redemption) ${serviceItem.serviceName}`,
      price: 0,
      RetailSellingPrice: 0,
      GST: 0,
      Discount: 0,
      quantity: 1,
      qty: 1,
      total: 0,
      systemType: "Retail",
      type: "SERVICE",
      serviceId: serviceItem.serviceId,
      isRedeemed: true,
      customerPackageId: pkg.id,
      staffId: selectedStaffId || "", 
    };
    
    setItems((prev) => [...prev, newItem]);
    toast.success(`Redeemed ${serviceItem.serviceName} from ${pkg.packageName}`);
  };

  const handleSelectAppointment = async (appt: Appointment) => {
    setIsAppointmentModalOpen(false);
    setSelectedAppointmentId(appt.id || null);

    // Fill customer details
    setCustomerName(appt.customerName || "");
    setCustomerPhone(appt.customerPhone || "");

    // Attempt to load services
    if (appt.serviceIds && appt.serviceIds.length > 0) {
      let addedCount = 0;
      appt.serviceIds.forEach(svcId => {
        const svcProduct = globalProducts.find(p => p.id === svcId);
        if (svcProduct) {
          handleAddService(svcProduct as any);
          addedCount++;
        }
      });

      if (addedCount > 0) {
        toast.success(`Loaded ${addedCount} service(s) from appointment`);
      } else {
        toast.error("Could not find matching services in catalog.");
      }
    }
  };

  const handleQtyChange = (barcode: string, qty: string) => {
    const val = qty === "" ? "" : Number(qty);
    // Allow blank, and don't restrict min(1) while typing
    setItems((prev) =>
      prev.map((i) =>
        (i.barcode || i.id) === barcode
          ? { ...i, qty: val, total: calculateItemTotal(i.price, val, i.Discount, i.GST) }
          : i
      )
    );
  };



  const handlePriceChange = (barcode: string, newPrice: number) => {
    const validPrice = Math.max(0, newPrice);
    setItems((prev) =>
      prev.map((i) => {
        if ((i.barcode || i.id) === barcode) {
          const updated = { ...i, price: validPrice };
          // If we manually change the price, we should probably update RetailSellingPrice if in Retail mode
          // matching Kamal's handlePriceChange behavior (lines 945-949)
          updated.RetailSellingPrice = validPrice;
          updated.total = calculateItemTotal(validPrice, i.qty, i.Discount, i.GST);
          return updated;
        }
        return i;
      })
    );
  };



  const handleGSTChange = (barcode: string, gst: string) => {
    const val = gst === "" ? "" : Number(gst);
    setItems((prev) =>
      prev.map((i) =>
        (i.barcode || i.id) === barcode
          ? { ...i, GST: val as number, total: calculateItemTotal(i.price, i.qty, i.Discount, val) }
          : i
      )
    );
  };

  const handleRemoveItem = (barcode: string) => setItems((prev) => prev.filter((i) => (i.barcode || i.id) !== barcode));

  const handleStaffChange = (barcode: string, staffId: string, staffName: string) => {
    setItems((prev) =>
      prev.map((i) =>
        (i.barcode || i.id) === barcode ? { ...i, staffId, staffName } : i
      )
    );
  };

  const totals = items.reduce((acc, item) => {
    const q = Number(item.qty) || 0;
    const d = Number(item.Discount) || 0;
    const g = Number(item.GST) || 0;

    // Inclusive math for UI totals
    const subtotal = item.price * q;
    const discountAmt = subtotal * (d / 100);
    const amountAfterDiscount = subtotal - discountAmt;

    const taxableAmount = amountAfterDiscount / (1 + (g / 100));
    const gstAmount = amountAfterDiscount - taxableAmount;

    return {
      subtotal: acc.subtotal + (taxableAmount || 0),
      gst: acc.gst + (gstAmount || 0),
      total: acc.total + (item.total || 0) // sum up row totals for final amount
    };
  }, { subtotal: 0, gst: 0, total: 0 });

  const totalTaxableAmount = totals.subtotal;
  const totalGstAmountDisplay = totals.gst;
  
  const selectedCustomerData = customerId ? globalCustomers.find((c: any) => c.id === customerId) : null;
  const availableLoyaltyPoints = selectedCustomerData?.loyaltyPoints || 0;
  
  const maxPointsRedeemable = Math.min(
     availableLoyaltyPoints, 
     Math.ceil(totals.total / (loyaltyRedeemValue || 1))
  );

  // Auto-correct if user changed items and max redeemable dropped
  if (loyaltyPointsToRedeem > maxPointsRedeemable && maxPointsRedeemable >= 0) {
     setTimeout(() => setLoyaltyPointsToRedeem(maxPointsRedeemable), 0);
  }

  const loyaltyDiscountAmount = loyaltyEnabled ? (loyaltyPointsToRedeem * loyaltyRedeemValue) : 0;
  const totalAmount = Math.max(0, totals.total - loyaltyDiscountAmount);



  const parsedReceivedAmount = parseFloat(receivedAmount) || 0;
  const changeDue = (paymentMethod === 'Cash' && parsedReceivedAmount > totalAmount) ? parsedReceivedAmount - totalAmount : 0;

  const handleFindBill = async (invoiceId: string) => {
    try {
      setLoading(true);

      // 1. Try Local Search first (from globalBills cache)
      const localMatch = globalBills?.find((b: any) =>
        (b.id && b.id.toString().toLowerCase() === invoiceId.toLowerCase()) ||
        (b.invoiceNumber && b.invoiceNumber.toString().toLowerCase() === invoiceId.toLowerCase())
      );

      let bill = localMatch;

      // 2. If not found locally, try API
      if (!bill) {
        try {
          const response = await billingApi.getById(encodeURIComponent(invoiceId));
          bill = response.data;
        } catch (apiErr) {
          console.warn("API fetch failed for bill:", apiErr);
          // Fallback: Try searching "all" endpoint if getById fails (optional, but 'allBills' should cover it)
        }
      }

      if (bill) {
        if (!bill.items || bill.items.length === 0) {
          toast.error(`No items found for invoice ${invoiceId}.`);
          setLoading(false); return;
        }

        if (bill.createdAt) {
          const createdAtDate = new Date(bill.createdAt);
          setOriginalBillDate(createdAtDate);
        }
        // CRITICAL FIX: Ensure exact case is used to prevent Firestore lookup failures
        const exactId = bill.id || bill.invoiceNumber || invoiceId.toUpperCase();
        setOriginalInvoiceId(exactId);


        const loadedItems: BillItem[] = bill.items.map((i: any) => {
          const unitPrice = parseFloat(i.unitPrice || 0);
          const qty = parseInt(i.quantity || 1);
          const discountRate = parseFloat(i.discountRate || 0);
          const gstRate = parseFloat(i.gstRate || 0);

          const subtotal = unitPrice * qty;
          const discountAmount = subtotal * (discountRate / 100);
          const amountAfterDiscount = subtotal - discountAmount;

          // Inclusive logic: finalTotal is just the amount after discount
          const finalTotal = amountAfterDiscount;

          return {
            id: i.productId || "",
            barcode: i.productId || "",
            name: i.productName || "",
            price: unitPrice,
            qty: qty,
            total: Math.round(finalTotal), // Include GST in total
            GST: gstRate,
            Discount: discountRate,
            purchaseRate: Number(i.purchaseRate || 0),
            quantity: Math.max(1, qty),
          };
        });

        setItems(loadedItems);
        setOriginalTotal(loadedItems.reduce((acc: number, item: BillItem) => acc + item.total, 0));

        setCustomerName(bill.customerName || "");
        const cPhone = bill.customerPhone ? bill.customerPhone.toString() : "";
        setCustomerPhone(cPhone);
        const foundCustomer = globalCustomers.find((c: any) => c.phone === cPhone);
        setCustomerId(foundCustomer ? foundCustomer.id : null);
        setCustomerAddress(bill.customerAddress || "");
        setPaymentMethod(bill.paymentMethod || "Cash");
        setCustomerGst((bill as any).customerGst || "");

        // Load split payment amounts if they exist
        if (bill.paymentMethod === "Split Payment") {
          setCashAmount((bill as any).cashAmount?.toString() || "");
          setOnlineAmount((bill as any).onlineAmount?.toString() || "");
        }



        setSelectedStaffId(bill.staffId || "");
        const staffPct = Number(bill.staffCommissionPercentage || 0);
        setStaffCommissionPercentage(staffPct > 0 ? staffPct.toString() : "");

        setEnableExpiryReminder(!!bill.enableExpiryReminder);
        setExpiryDays(bill.expiryDays?.toString() || "30");

        setIsReturnMode(true);
        setIsReturnModalOpen(false);
        toast.success(`Bill ${bill.id} loaded for Return/Update`);
        setTimeout(() => {
          barcodeInputRef.current?.focus();
        }, 100);
      } else {
        toast.error(`No bill found with ID: ${invoiceId}`);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to fetch bill.");
    } finally {
      setLoading(false);
    }
  };



  const handleRestoreStock = async (barcode: string, qtyToRestore: number) => {
    if (!isReturnMode) return;
    const product = items.find((p) => (p.barcode || p.id) === barcode);
    if (!product) return;

    if (product.type === "SERVICE") {
      toast.error("Services cannot be restored to stock.");
      return;
    }

    const input = prompt(`How many of ${product.name} (Qty: ${product.qty}) to restore?`, qtyToRestore.toString());
    if (!input) return;
    const restoreQty = Math.min(parseInt(input), Number(product.qty));
    if (isNaN(restoreQty) || restoreQty <= 0) return;

    confirmAction(`Confirm restoring ${restoreQty} unit(s) of ${product.name}?`, async () => {
      try {
        setLoading(true);
        const allRes = await productApi.getAll();
        const allProducts = (allRes.data as any) || [];
        const existingProduct = allProducts.find((p: any) => (p.barcode?.toString().trim() || p.id?.toString().trim()) === barcode.toString().trim());

        if (existingProduct) {
          await productApi.updateStock(existingProduct.id, restoreQty, null);
          setItems((prev) => prev.map((i) => (i.barcode || i.id) === barcode ? { ...i, qty: Number(i.qty) - restoreQty, total: calculateItemTotal(i.price, Number(i.qty) - restoreQty, i.Discount, i.GST) } : i).filter((i) => Number(i.qty) > 0));
          toast.success(`Restocked ${restoreQty} unit(s) of ${product.name}.`);
        } else {
          toast.error(`Product ${barcode} not found in inventory.`);
        }
      } catch (err: any) {
        console.error("Restoration failed", err);
        toast.error("Failed to restore stock.");
      } finally {
        setLoading(false);
      }
    });
  };

  const handleSaveBill = async (billType = "GST_INVOICE", forceCustomerId?: string) => {
    if (!items.length) throw new Error("Add at least one item!");

    let resolvedCustomerId = forceCustomerId || customerId;

    // Check if customer already exists in database by phone or exact name to prevent duplicates
    if (!resolvedCustomerId) {
      const cleanPhone = (customerPhone || '').replace(/\D/g, '');
      const existing = (cleanPhone.length >= 7)
        ? globalCustomers.find(c => {
            const cp = (c.phone || '').toString().replace(/\D/g, '');
            return cp === cleanPhone || (cp.length >= 10 && cleanPhone.length >= 10 && cp.slice(-10) === cleanPhone.slice(-10));
          })
        : (customerName && customerName.trim().length > 0)
          ? globalCustomers.find(c => c.name.trim().toLowerCase() === customerName.trim().toLowerCase())
          : null;
      if (existing) {
        resolvedCustomerId = existing.id;
        // Update contact info without creating a duplicate
        customerApi.update(existing.id, {
          name: customerName || existing.name,
          phone: customerPhone || existing.phone,
          email: customerEmail || existing.email || '',
          address: customerAddress || existing.address || '',
          gstin: customerGst || existing.gstin || '',
          lastVisit: new Date().toISOString()
        } as any).catch(err => console.error("Customer background update failed:", err));
      }
    }

    // Auto-create customer ONLY if genuinely new (not found in database)
    if (!resolvedCustomerId && customerName && customerName.trim().length > 0) {
      try {
        const addRes = await customerApi.add({
          name: customerName,
          phone: customerPhone || '',
          email: customerEmail || '',
          address: customerAddress || '',
          gstin: customerGst || '',
          totalSpent: 0,
          totalPaid: 0,
          pendingBalance: 0,
          visitCount: 0,
          loyaltyPoints: 0,
          createdAt: new Date().toISOString()
        } as any);
        if (addRes.data && (addRes.data as any).id) {
          resolvedCustomerId = (addRes.data as any).id;
        }
      } catch (err) {
        console.error("Failed to create customer during handleSaveBill:", err);
      }
      refreshCustomers();
    }

    const billData = buildPayloadFromUIItems(
      items, customerName, customerPhone, customerEmail, customerAddress,
      paymentMethod, receivedAmount, customerGst, billType,
      selectedStaffId,
      staffCommissionPercentage,
      cashAmount, onlineAmount, enableExpiryReminder, expiryDays, resolvedCustomerId, taxType
    );

    // Inject the freshly created/resolved customer ID if available
    if (resolvedCustomerId) {
      (billData as any).customerId = resolvedCustomerId;
    }

    // The helper returns a payload object. We can extend it.
    // (Status being "PAID" is handled by the backend's /create endpoint logic)

    try {
      console.log("Billing Payload:", billData);
      const response = await billingApi.create(billData as any);
      const createdBill = response.data;

      if (!createdBill || !createdBill.id) {
        // If ID is missing, we can't reliably guess it without fetching, which is slow.
        // Better to warn or assume backend is fixing it.
        // However, if we MUST fallback, we should try a lighter approach or just error out.
        // For now, removing the heavy getAll() call.
        console.warn("Backend response missing ID:", createdBill);
        throw new Error("Parameters returned from server invalid (Missing ID)");
      }

      // Process Staff Commissions for SERVICES
      for (const item of (billData.items as any[])) {
        if (item.type === 'SERVICE' && item.staffId && item.staffCommissionAmount > 0) {
          try {
            await staffApi.addCommission({
              staffId: item.staffId,
              staffName: item.staffName,
              billId: createdBill.id,
              date: new Date().toISOString(),
              amount: item.staffCommissionAmount,
              serviceId: item.serviceId,
              serviceName: item.productName,
              status: 'UNPAID'
            });
          } catch (commErr) {
            console.error("Failed to add commission for staff:", item.staffId, commErr);
          }
        }
        // Handle Packages: Assign CustomerPackage
        if (item.type === 'PACKAGE' && resolvedCustomerId) {
          try {
            // Find the package from global packages to get its services
            const pkg = packages.find((p: any) => p.id === item.packageId);
            if (pkg) {
              await customerPackageApi.add({
                customerId: resolvedCustomerId,
                packageId: pkg.id!,
                packageName: pkg.name,
                purchaseDate: new Date().toISOString(),
                billId: createdBill.id,
                isActive: true,
                items: pkg.items.map((i: any) => ({
                  serviceId: i.serviceId,
                  serviceName: i.serviceName || 'Unknown Service',
                  totalQuantity: i.quantity * Number(item.qty || 1),
                  usedQuantity: 0
                }))
              });
            }
          } catch (pkgErr) {
            console.error("Failed to assign package to customer:", pkgErr);
          }
        }

        // Handle Redeemed Package Services: Update usage
        if (item.isRedeemed && item.customerPackageId && item.serviceId) {
          try {
            await customerPackageApi.usePackage(item.customerPackageId, item.serviceId, Number(item.quantity) || 1);
          } catch (useErr) {
            console.error("Failed to update package usage:", useErr);
          }
        }
      }

      // Refresh available customer packages if customer was linked
      if (resolvedCustomerId) {
        try {
          const updatedPackages = await customerPackageApi.getByCustomer(resolvedCustomerId);
          if (updatedPackages.data) {
            setCustomerPackages(updatedPackages.data);
          }
        } catch (pkgRefErr) {
          console.warn("Failed to refresh customer packages after billing:", pkgRefErr);
        }
      }

      return createdBill.id;
    } catch (err) {
      console.error("Create bill error:", err);
      throw new Error("Failed to create bill");
    }
  };

  const printRef = React.useRef<HTMLDivElement>(null);
  const [printInvoiceId, setPrintInvoiceId] = useState<string>("");
  const [tempInvoiceNumber, setTempInvoiceNumber] = useState<string>("");
  const [printWithGst, setPrintWithGst] = useState<boolean>(true);

  const handlePrintReact = useReactToPrint({
    contentRef: printRef,
  });

  const handlePrint = (invoiceNumber: string, onPrintComplete: () => void, withGst: boolean, localId?: string) => {
    setPrintInvoiceId(invoiceNumber);
    setTempInvoiceNumber(localId || "");
    setPrintWithGst(withGst);

    // Slight delay to ensure React state updates and renders the ref component
    setTimeout(() => {
      handlePrintReact();
      onPrintComplete();
    }, 100);
  };

  const handleSaveAndPrint = async (withGst: boolean) => {
    if (!items.length) {
      toast.error("Add at least one item!");
      return;
    }

    if (documentMode !== "Estimation") {
      if (paymentMethod === "Cash") {
        if (!receivedAmount || parseFloat(receivedAmount) <= 0) {
          toast.error("Please enter the amount received.");
          return;
        }
        if (parseFloat(receivedAmount) < totalAmount) {
          toast.error(`Received amount is less than the payable amount.`);
          return;
        }
      }

      if (paymentMethod === "Split Payment") {
        const cash = parseFloat(cashAmount) || 0;
        const online = parseFloat(onlineAmount) || 0;
        const total = cash + online;

        if (cash <= 0 || online <= 0) {
          toast.error("Both Cash and Online amounts must be greater than zero for Split Payment.");
          return;
        }

        if (Math.abs(total - totalAmount) > 0.01) { // Allow small floating point differences
          toast.error(`Split payment amounts (₹${(total || 0).toFixed(2)}) must equal the bill total (₹${(totalAmount || 0).toFixed(2)}).`);
          return;
        }
      }

      if (paymentMethod === "PARTIAL") {
        if (!customerId) {
          toast.error("Partial payment allowed only for registered customers. Please select or create a customer.");
          return;
        }
      }
    }

    if (documentMode === "Estimation") {
      setLoading(true);
      try {
        const estPayload: any = {
          customerName,
          customerPhone: Number(customerPhone.replace(/\D/g, '')) || 0,
          customerEmail,
          customerAddress,
          customerGst,
          systemType: "Retail",
          items: items.map(ui => ({
            productId: ui.id || ui.barcode,
            productName: ui.name,
            quantity: Number(ui.qty),
            unitPrice: ui.price,
            netAmount: ui.total,
            gstRate: ui.GST,
            discountRate: Number(ui.Discount || 0)
          }))
        };

        let estId;
        if (loadEstId) {
          await estimationApi.update(loadEstId, estPayload);
          estId = loadEstId;
        } else {
          const res = await estimationApi.create(estPayload);
          estId = res.data?.estimationId || res.data?.id || 'EST-UNKNOWN';
        }

        handlePrint(estId, () => {
          toast.success(`Estimation ${estId} saved & printed!`);
          setTimeout(handleReset, 1500);
        }, true);
        return;
      } catch (err: any) {
        toast.error("Failed to save estimation.");
        setLoading(false);
        return;
      }
    }

    setLoading(true);

    try {
      // 1. Save/Get Customer Logic
      let finalCustomerId = customerId;

      // Check if customer already exists in database by phone or name to avoid duplicate creation
      if (!finalCustomerId) {
        const cleanPhone = (customerPhone || '').replace(/\D/g, '');
        const existing = (cleanPhone.length >= 7)
          ? globalCustomers.find(c => {
              const cp = (c.phone || '').toString().replace(/\D/g, '');
              return cp === cleanPhone || (cp.length >= 10 && cleanPhone.length >= 10 && cp.slice(-10) === cleanPhone.slice(-10));
            })
          : (customerName && customerName.trim().length > 0)
            ? globalCustomers.find(c => c.name.trim().toLowerCase() === customerName.trim().toLowerCase())
            : null;
        if (existing) {
          finalCustomerId = existing.id;
        }
      }

      if (finalCustomerId) {
        // Existing customer — update their contact info without creating a duplicate
        customerApi.update(finalCustomerId, { name: customerName, phone: customerPhone, email: customerEmail, address: customerAddress, gstin: customerGst } as any)
          .then(() => refreshCustomers())
          .catch(err => console.error("Background customer update failed:", err));
      } else if (customerName && customerName.trim().length > 0) {
        // Genuinely new customer — create only if no match found
        try {
          const addRes = await customerApi.add({
            name: customerName,
            phone: customerPhone || '',
            email: customerEmail || '',
            address: customerAddress || '',
            gstin: customerGst || '',
            totalSpent: 0,
            totalPaid: 0,
            pendingBalance: 0,
            visitCount: 0,
            loyaltyPoints: 0,
            createdAt: new Date().toISOString()
          } as any);
          if (addRes.data && (addRes.data as any).id) {
            finalCustomerId = (addRes.data as any).id;
          }
        } catch (err) {
          console.error("Failed to create/link customer:", err);
        }
        refreshCustomers();
      }

      // --- Unified Bill Creation/Conversion Logic ---
      const type = withGst ? "GST_INVOICE" : "ESTIMATE";
      
      const payload = await buildPayloadFromUIItems(
        items, customerName, customerPhone, customerEmail, customerAddress,
        paymentMethod, receivedAmount, customerGst, type, selectedStaffId, staffCommissionPercentage, cashAmount, onlineAmount,
        enableExpiryReminder, expiryDays, finalCustomerId, taxType,
        (loyaltyEnabled ? loyaltyPointsToRedeem * loyaltyRedeemValue : 0),
        (loyaltyEnabled ? loyaltyPointsToRedeem : 0),
        0 // Temporary earned points
      );

      if (loyaltyEnabled && loyaltySpendRatio > 0) {
        payload.loyaltyPointsEarned = Math.floor(payload.finalAmount / loyaltySpendRatio);
      }

      // Status PAID triggers stock deduction and commissions on the backend
      (payload as any).status = "PAID";
      (payload as any).appointmentId = selectedAppointmentId || null;

      // 1. Create or Pay the bill (In-place update for conversion)
      console.log("Billing Payload:", payload);
      const res = activeBillId
        ? await billingApi.pay(activeBillId, payload as any)
        : await billingApi.create(payload as any);

      const billData = res.data;
      const finalId = billData.id || billData.invoiceNumber || billData.invoice_no;

      // 2. Refresh and reset- Clean up activeBillId via handleReset
      handlePrint(finalId, () => {
        toast.success(activeBillId ? `Held Bill Converted & Printed!` : `Bill ${finalId} Saved & Printed!`);
        setTimeout(handleReset, 1500);
        refreshBills();
        refreshHolds();
        refreshCancelled();
        refreshProducts();

        // Customer purchase stats & loyalty are authoritatively updated in api.ts /billing/create.
        // Refresh customer global data so UI reflects updated stats immediately.
        if (finalCustomerId) {
          refreshCustomers();
        }

        // Update appointment status if one was linked
        if (selectedAppointmentId) {
          appointmentApi.update(selectedAppointmentId, { status: 'COMPLETED', billId: finalId } as any)
            .then(() => refreshAppointments())
            .catch(e => console.error('Failed to update appointment status', e));
        }

      }, withGst);

    } catch (err: any) {
      console.error("Save & Print error:", err);
      toast.error(err.response?.data?.error || err.message || "Failed to process bill.");
    } finally {
      setLoading(false);
    }
  };

  const handleHoldBill = async () => {

    if (!items.length) return toast.error("No items to hold!");
    try {
      setLoading(true);
      const bType = documentMode === "Estimation" ? "ESTIMATE" : "GST_INVOICE";
      const payload = buildPayloadFromUIItems(
        items, customerName, customerPhone, customerEmail, customerAddress,
        "HOLD", receivedAmount, customerGst, bType,
        selectedStaffId,
        staffCommissionPercentage,
        cashAmount, onlineAmount, enableExpiryReminder, expiryDays, customerId, taxType
      );

      // Explicitly force status for safety
      (payload as any).status = "HOLD";
      (payload as any).paymentMethod = "HOLD"; // Force ignore payment method for drafts

      console.log("Billing Payload:", payload);
      let res;
      if (activeBillId) {
        // Update existing draft identity (Reserved Model)
        res = await billingApi.update(activeBillId, payload as any);
      } else {
        // First Hold: Generate Reserved Identity
        res = await billingApi.hold(payload as any);
      }

      if (res.status === 200 || res.status === 201) {
        const savedBill = res.data;
        const assignedId = savedBill.id || savedBill.invoiceNumber;

        toast.success(activeBillId ? `Hold updated (ID: ${assignedId})` : `Bill placed on hold (ID: ${assignedId})`);

        // If it was a new bill, bind to the new Reserved ID
        if (!activeBillId) {
          setActiveBillId(assignedId);
          setIsHoldLoaded(true);
        }

        // SSS Behavior: We can stay on screen OR reset. 
        // User rule 8 says reset on completed/new. 
        // Let's reset to allow next transaction as per common retail flow
        handleReset();

        setTimeout(() => {
          refreshBills();
          refreshHolds();
          refreshProducts();

        }, 500);
      } else {
        toast.error("Failed to hold bill. Please try again.");
      }
    } catch (err: any) {
      console.error("hold error:", err);
      toast.error(err.response?.data?.error || err.message || "Failed to hold bill.");
    } finally {
      setLoading(false);
    }
  };

  const handleRetrieveHold = async (bill: any) => {
    // 1. FULL UI REPLACEMENT - Wipe current state first (SSS Rule 4)
    handleReset();

    // 2. Bind to Reserved Identity (SSS Rule 3)
    setActiveBillId(bill.id ?? null);
    setIsHoldLoaded(true);

    // 3. Populate from Hold Data
    setItems(bill.items.map((i: any) => {
      const unitPrice = parseFloat(i.unitPrice || 0);
      const qty = parseInt(i.quantity || 1);
      const discountRate = parseFloat(i.discountRate || 0);
      const gstRate = parseFloat(i.gstRate || 0);

      const subtotal = unitPrice * qty;
      const discountAmount = subtotal * (discountRate / 100);
      const taxableAmount = subtotal - discountAmount;
      const gstAmount = taxableAmount * (gstRate / 100);
      const finalTotal = taxableAmount + gstAmount;

      return {
        id: i.productId,
        barcode: i.productId,
        name: i.productName,
        price: unitPrice,
        qty: qty,
        total: Math.round(finalTotal),
        quantity: qty,
        GST: gstRate,
        Discount: discountRate,
        purchaseRate: Number(i.purchaseRate || 0)
      };
    }));
    setCustomerName(bill.customerName || "");
    const cPhone = bill.customerPhone ? String(bill.customerPhone) : "";
    setCustomerPhone(cPhone);
    const foundCustomer = globalCustomers.find((c: any) => c.phone === cPhone);
    setCustomerId(foundCustomer ? foundCustomer.id : null);
    setCustomerEmail(bill.customerEmail || "");
    setCustomerAddress(bill.customerAddress || "");
    setCustomerGst(bill.customerGst || "");

    setPaymentMethod("Cash"); // Reset for finalization
    setReceivedAmount(""); // Force fresh input
    if (bill.paymentMethod === "Split Payment") {
      setCashAmount((bill as any).cashAmount?.toString() || "");
      setOnlineAmount((bill as any).onlineAmount?.toString() || "");
    }
    setSelectedStaffId(bill.staffId || "");
    setStaffCommissionPercentage(bill.staffCommissionPercentage || "");
    setEnableExpiryReminder(!!bill.enableExpiryReminder);
    setExpiryDays(bill.expiryDays?.toString() || "30");

    toast.success(`Loaded Reserved Bill: ${bill.id}`);
  };

  const handleDeleteHeldBill = async (billId: string, event?: React.MouseEvent) => {
    if (event) event.stopPropagation();
    confirmAction('Are you sure you want to CANCEL this held bill?', async () => {
      try {
        setLoading(true);
        // Task: Mark the existing bill as CANCELLED (Preserves original data and ID)
        await billingApi.cancelHold(billId);
        toast.success('Held bill marked as Cancelled!');

        // Reset the UI if we are currently editing the bill being cancelled
        if (activeBillId === billId) {
          handleReset();
        }

        await refreshBills();
        await refreshHolds();
        await refreshProducts();
      } catch (err: any) {
        toast.error(err.response?.data?.error || `Failed to cancel bill.`);
      } finally {
        setLoading(false);
      }
    });
  };

  const handleReset = () => {
    setItems([]); setBarcode(""); setCustomerName(""); setCustomerPhone(""); setCustomerEmail("");
    setCustomerGst(""); setCustomerAddress("");
    setPaymentMethod("Cash"); setReceivedAmount("");
    setCashAmount(""); setOnlineAmount("");
    setIsReturnMode(false);
    setOriginalBillDate(null);
    setOriginalInvoiceId("");
    setOriginalTotal(0);
    setCustomerMode("Walk-in");
    setActiveBillId(null);
    setSelectedAppointmentId(null);
    setIsHoldLoaded(false);
    setIsHoldLoaded(false);
    setSelectedStaffId("");
    setStaffCommissionPercentage("");
    setCustomerId(null);
    setLoyaltyPointsToRedeem(0);
    setLoadEstId("");
    setEnableExpiryReminder(false);
    setExpiryDays("30");
    setLastSelectedProduct(null);
    setZoomedImage(null);
  };

  const exportToExcel = () => {
    const wb = utils.book_new();
    const data = items.map((i, idx) => ({
      SN: idx + 1, Customer: customerName, Phone: customerPhone, Payment: paymentMethod,
      Product: i.name, Quantity: i.qty, Price: i.price, Total: i.total,
    }));
    const ws = utils.json_to_sheet(data);
    utils.book_append_sheet(wb, ws, "Bill");
    writeFile(wb, `${customerName || "Bill"}.xlsx`);
  };

  // --- Save Return (Cancel Old Bill & Create New Bill) ---
  const handleSaveReturnAndPrint = async () => {
    if (!items.length) {
      toast.error("No items to save!");
      return;
    }

    // Safety: Converted bills MUST have a real payment method
    if (paymentMethod === "HOLD") {
      setPaymentMethod("Cash");
      toast.error("Please select a valid payment method before finalizing.");
      return;
    }

    setLoading(true);
    try {
      const payload = buildPayloadFromUIItems(
        items,
        customerName,
        customerPhone,
        customerEmail,
        customerAddress,
        paymentMethod,
        receivedAmount || totalAmount.toString(), // Use receivedAmount if exists, else total
        customerGst,
        "GST_INVOICE",
        selectedStaffId,
        staffCommissionPercentage,
        cashAmount,
        onlineAmount,
        enableExpiryReminder,
        expiryDays,
        customerId,
        taxType
      );

      // MANDATORY: Include original ID in payload to ensure backend updates the SAME document
      (payload as any).id = originalInvoiceId;
      (payload as any).invoiceId = originalInvoiceId;
      (payload as any).invoiceNumber = originalInvoiceId;
      (payload as any).status = "PAID";

      // Call UPDATE API
      await billingApi.update(originalInvoiceId, payload as any);

      const localPrintId = originalInvoiceId;
      handlePrint(localPrintId, () => {
        toast.success(`Bill ${localPrintId} successfully updated!`);
        setTimeout(handleReset, 1500);
      }, true);

    } catch (err: any) {
      console.error("Return processing error:", err);
      const errMsg = err.response?.data?.error || err.message;
      toast.error(`Failed to process return. (${errMsg})`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="hidden">
        <BillRenderer
          ref={printRef}
          data={mapExeBillData({
            items,
            totalAmount,
            totalTaxableAmount,
            subtotal: totalTaxableAmount,
            paymentMethod,
            receivedAmount,
            cashAmount,
            onlineAmount,
            billNo: tempInvoiceNumber || printInvoiceId || activeBillId || "NEW",
            billType: "RETAIL",
            invoiceMode: printWithGst ? "GST_INVOICE" : "ESTIMATE",
            customerName,
            customerPhone,
            customerAddress,
            customerGst,
            taxType,
            settings: {
              gstPercentage: 12,
              customBillMessage: billMessage
            }
          })}
        />
      </div>
      <ConfirmationDialog />
      {isReturnModalOpen && <ReturnModal onFind={handleFindBill} onClose={() => setIsReturnModalOpen(false)} />}
      {isAppointmentModalOpen && <AppointmentModal appointments={appointments} onSelect={handleSelectAppointment} onClose={() => setIsAppointmentModalOpen(false)} />}

      {zoomedImage && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-6" onClick={() => setZoomedImage(null)}>
          <div className="relative max-w-3xl w-full h-[80vh] bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setZoomedImage(null)}
              className="absolute top-3 right-3 z-10 bg-white/90 rounded-full p-2 text-gray-700 shadow-lg hover:bg-white"
            >
              <X size={20} />
            </button>
            <img src={zoomedImage} alt="" className="w-full h-full object-contain" />
          </div>
        </div>
      )}
      {isSelectionModalOpen && (
        <ProductSelectionModal
          products={searchResults}
          onSelect={(product) => {
            setItems((prev) => {
              const existingItem = prev.find((i) => i.barcode === product.barcode);
              if (existingItem) {
                return prev.map((i) =>
                  i.barcode === product.barcode
                    ? { ...i, qty: Number(i.qty) + 1, total: calculateItemTotal(Number(i.price) || 0, Number(i.qty) + 1, i.Discount, i.GST) }
                    : i
                );
              } else {
                const resolvedPrice = Number(product.price) || 0;
                const newItem: BillItem = {
                  id: product.id,
                  barcode: product.barcode,
                  name: product.name,
                  price: resolvedPrice,
                  RetailSellingPrice: Number(product.RetailSellingPrice) || 0,
                  GST: Number(defaultGst) || 0,
                  Discount: "",
                  quantity: Number(product.quantity ?? product.stockQuantity) || 1,
                  qty: 1,
                  total: calculateItemTotal(resolvedPrice, 1, 0, Number(defaultGst) || 0),
                  imageUrl: product.imageUrl || "",
                  systemType: product.systemType || "Retail",
                };
                return [...prev, newItem];
              }
            });
            setBarcode("");
            setSearchResults([]);
            setIsSelectionModalOpen(false);
            toast.success(`Added ${product.name}`);
          }}
          onClose={() => setIsSelectionModalOpen(false)}
        />
      )}

      <div className="flex flex-col gap-6 h-full mb-6 pb-20">
        {/* TOP PANE - CART */}
        <div className="flex-1 flex flex-col bg-white/80 rounded-2xl shadow-xl overflow-hidden border border-blue-100 min-h-[400px]">
          {/* Header */}
          <div className="p-4 bg-gradient-to-br from-indigo-50 to-blue-50 border-b border-blue-100/50">
            {/* Premium Top Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/90 p-4 rounded-2xl shadow-sm border border-gray-100">
              <div className="flex items-center gap-4">
                <div className="p-2.5 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl shadow-lg shadow-blue-200">
                  <ShoppingCart className="text-white" size={22} />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
                    {isReturnMode ? "Return Processing" : (documentMode === "Estimation" ? "Estimation" : "Point of Sale")}
                    <SyncIndicator isSyncing={isSyncing} className="ml-1" />
                  </h1>
                  <p className="text-xs text-gray-500 font-medium">Smart Billing Dashboard</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => { refreshProducts(); refreshCustomers(); toast("Refreshing data..."); }}
                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-all"
                  title="Refresh Data"
                >
                  <RefreshCw size={18} className={globalLoading ? "animate-spin" : ""} />
                </button>

                {/* Estimation Toggle Removed */}
              </div>
            </div>
          </div>

          {/* Search Areas */}
          <div className="p-4 bg-white/60 border-b border-gray-100">
            {/* Search Input Area */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* Product Search */}
              <motion.div className="bg-white p-2 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-2 transition-all hover:shadow-md focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-300 relative z-50">
                <div className="pl-3 text-blue-400">
                  <PackageSearch size={20} />
                </div>
                <div className="relative flex-1">
                  <input type="text" placeholder="Scan Barcode or Enter Product Name..." value={barcode}
                    ref={barcodeInputRef}
                    onChange={handleProductSearchChange}
                    onKeyDown={handleProductKeyDown}
                    onFocus={() => { if (barcode.trim()) setIsProductDropdownOpen(true); }}
                    className="w-full bg-transparent border-none focus:ring-0 text-gray-700 placeholder-gray-400 font-medium py-2 px-2 text-sm outline-none"
                  />
                  {isProductDropdownOpen && productSuggestions.length > 0 && (
                    <div className="absolute top-full mt-2 left-0 w-full bg-white border-2 border-blue-600 rounded-xl shadow-2xl z-[9999] max-h-60 overflow-y-auto ring-4 ring-blue-500/10 divide-y divide-gray-100 animate-in fade-in-50 duration-150">
                      <div className="px-3 py-1.5 bg-blue-50 text-[10px] font-black uppercase tracking-wider text-blue-800 flex items-center justify-between sticky top-0 z-10 border-b border-blue-200">
                        <span className="flex items-center gap-1"><PackageSearch size={12} /> Matching Products</span>
                        <span className="text-[9px] text-blue-600 font-semibold">↑↓ to navigate, Enter to select</span>
                      </div>
                      {productSuggestions.map((prod, idx) => (
                        <div
                          key={prod.id || prod.barcode}
                          className={`px-3 py-2 text-sm cursor-pointer border-b border-gray-50 last:border-b-0 flex justify-between items-center transition-colors ${idx === highlightedProductIndex ? 'bg-blue-600 text-white' : 'hover:bg-blue-50 text-gray-800'}`}
                          onMouseEnter={() => setHighlightedProductIndex(idx)}
                          onClick={() => {
                            addProductToBill(prod);
                            setIsProductDropdownOpen(false);
                          }}
                        >
                          <div>
                            <div className={`font-bold ${idx === highlightedProductIndex ? 'text-white' : 'text-gray-900'}`}>{prod.name}</div>
                            <div className={`text-xs ${idx === highlightedProductIndex ? 'text-blue-100' : 'text-gray-500'} font-mono`}>{prod.barcode || prod.id}</div>
                          </div>
                          <div className="text-right">
                            <div className={`font-bold ${idx === highlightedProductIndex ? 'text-white' : 'text-green-600'}`}>₹{prod.price}</div>
                            <div className={`text-xs ${idx === highlightedProductIndex ? 'text-blue-100' : 'text-gray-500'}`}>Stock: {prod.stockQuantity ?? 'N/A'}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {lastSelectedProduct?.imageUrl && (
                  <div className="w-10 h-10 shrink-0 rounded-lg overflow-hidden border border-gray-100 cursor-zoom-in mr-1 shadow-sm" onClick={() => setZoomedImage(lastSelectedProduct.imageUrl)}>
                    <img src={lastSelectedProduct.imageUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                )}

                <button onClick={handleAddProduct} disabled={loading}
                  className={`px-3 py-1.5 text-sm text-sm rounded-xl text-sm font-bold shadow-sm transition-all ${loading ? 'bg-gray-100 text-gray-400' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200'}`}
                >
                  {loading ? "..." : "Add"}
                </button>
              </motion.div>

              {/* Service Search */}
              <motion.div className="relative z-40 h-full flex items-center">
                <div className="w-full">
                  <ServiceSelector onAddService={handleAddService} disabled={loading} />
                </div>
              </motion.div>
            </div>
          </div>

          {/* Table Container */}
          <div className="flex-1 overflow-auto bg-white/50 min-h-0">
            <div className="min-w-[800px]">
              <table className="w-full text-sm text-gray-700">
                <thead className="bg-gradient-to-r from-blue-100 to-indigo-100 text-sm text-gray-700">
                  <tr>
                    <th className="p-3 text-center">S. NO</th>
                    <th className="p-3 text-center">Image</th>
                    <th className="p-3 text-left">Item ID</th>
                    <th className="p-3 text-left">Item Name</th>
                    <th className="p-3 text-left">Staff</th>
                    <th className="p-3 text-center">Price (Incl. GST)</th>
                    <th className="p-3 text-center">Qty</th>
                    <th className="p-3 text-center">Disc (%)</th>
                    <th className="p-3 text-center">Disc (₹)</th>
                    <th className="p-3 text-center">GST (%)</th>
                    <th className="p-3 text-center">Total (Incl. GST)</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i, idx) => (
                    <motion.tr key={`${i.barcode || i.id || 'item'}-${idx}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      className="border-t hover:bg-blue-50/60 transition"
                    >
                      <td className="p-2 text-center">{idx + 1}</td>
                      <td className="p-2 text-center">
                        {i.imageUrl ? (
                          <img src={i.imageUrl} alt={i.name} className="w-10 h-10 object-cover rounded shadow-sm mx-auto" />
                        ) : (
                          <div className="w-10 h-10 bg-gray-100 border border-dashed border-gray-300 rounded mx-auto flex items-center justify-center text-[10px] text-gray-400 font-medium">Img</div>
                        )}
                      </td>
                      <td className="p-2 text-left font-mono">{i.barcode || i.id}</td>
                      <td className="p-2 text-left font-medium">
                        {i.name}
                        {i.type === 'SERVICE' && (
                          <span className="ml-2 text-[10px] bg-pink-100 text-pink-700 px-1.5 py-0.5 rounded-full">SERVICE</span>
                        )}
                        {i.type === 'PACKAGE' && (
                          <span className="ml-2 text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">PACKAGE</span>
                        )}
                      </td>
                      <td className="p-2 text-left">
                        {i.type === 'SERVICE' ? (
                          <select
                            value={i.staffId || ''}
                            onChange={(e) => {
                              const staffMember = staff.find(s => s.id === e.target.value);
                              handleStaffChange(i.barcode || i.id || "", e.target.value, staffMember?.name || "");
                            }}
                            className="border p-1 rounded text-xs w-full max-w-[120px]"
                          >
                            <option value="">Select Staff</option>
                            {staff.map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-gray-400 text-xs">-</span>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        <input
                          type="number"
                          onWheel={(e) => (e.target as HTMLInputElement).blur()}
                          min="0"
                          step="0.01"
                          value={i.price}
                          onChange={(e) => handlePriceChange(i.barcode || i.id || "", parseFloat(e.target.value) || 0)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const nextEl = (e.target as HTMLElement).closest('td')?.nextElementSibling?.querySelector('input');
                              nextEl?.focus();
                              if (nextEl) (nextEl as HTMLInputElement).select();
                            }
                          }}
                          className="border w-20 p-1 rounded mx-auto text-center"
                        />
                      </td>
                      <td className="p-2 text-center w-24">
                        <input type="number" onWheel={(e) => (e.target as HTMLInputElement).blur()} value={i.qty} onChange={(e) => handleQtyChange(i.barcode || i.id || "", e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const nextTd = (e.target as HTMLElement).closest('td')?.nextElementSibling;
                              const nextEl = nextTd?.querySelector('input:not([disabled]), button');
                              if (nextEl) {
                                (nextEl as HTMLElement).focus();
                                if ((nextEl as any).select) (nextEl as HTMLInputElement).select();
                              } else {
                                // Skip disabled input
                                const nextNextTd = nextTd?.nextElementSibling?.nextElementSibling?.nextElementSibling;
                                nextNextTd?.querySelector('button')?.focus();
                              }
                            }
                          }}
                          className="border w-16 p-1 rounded mx-auto text-center"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <input type="number" onWheel={(e) => (e.target as HTMLInputElement).blur()} value={i.Discount} max={100} onChange={(e) => handleDiscountChange(i.barcode || i.id || "", e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const nextInput = (e.target as HTMLElement).closest('td')?.nextElementSibling?.querySelector('input');
                              nextInput?.focus();
                              (nextInput as any)?.select();
                            }
                          }}
                          className="border w-16 p-1 rounded mx-auto text-center"
                          disabled={isReturnMode || i.type === 'PACKAGE'}
                        />
                      </td>
                      <td className="p-2 text-center">
                        <input type="number" onWheel={(e) => (e.target as HTMLInputElement).blur()} value={i.discountAmt} onChange={(e) => handleDiscountAmtChange(i.barcode || i.id || "", e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const nextInput = (e.target as HTMLElement).closest('td')?.nextElementSibling?.querySelector('input');
                              nextInput?.focus();
                              (nextInput as any)?.select();
                            }
                          }}
                          className="border w-20 p-1 rounded mx-auto text-center font-mono text-xs"
                          disabled={isReturnMode || i.type === 'PACKAGE'}
                        />
                      </td>
                      <td className="p-2 text-center">
                        <input type="number" onWheel={(e) => (e.target as HTMLInputElement).blur()} value={i.GST} onChange={(e) => handleGSTChange(i.barcode || i.id || "", e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const actionBtn = (e.target as HTMLElement).closest('tr')?.querySelector('td:last-child button');
                              (actionBtn as HTMLElement)?.focus();
                            }
                          }}
                          className="border w-16 p-1 rounded mx-auto text-center"
                          disabled={isReturnMode}
                        />
                      </td>
                      <td className="p-2 text-center font-semibold">₹{(i.total || 0).toFixed(2)}</td>
                      <td className="p-2 text-center">
                        {isReturnMode ? (
                          <button onClick={() => handleRestoreStock(i.barcode || i.id || "", Number(i.qty))} className="text-green-600 hover:text-green-800" title="Restore to Stock">
                            <RefreshCw size={18} />
                          </button>
                        ) : (
                          <button className="text-red-500 cursor-pointer hover:text-red-700" onClick={() => handleRemoveItem(i.barcode || i.id || "")}>Remove</button>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* BOTTOM PANE - SETTINGS & TOTALS */}
        <div className="w-full bg-white/90 rounded-2xl shadow-xl overflow-visible border border-blue-100 p-5 grid grid-cols-1 md:grid-cols-3 gap-6 bg-gradient-to-b from-gray-50/50 to-white relative z-20">

          {/* Column 1: Customer Details */}
          <div className="flex flex-col gap-4 h-full relative z-30">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3 h-full relative z-30">
              <div className="flex justify-between items-center mb-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-800 flex items-center gap-2"><User size={16} className="text-blue-500" /> Customer</h3>
                  {customerId && (
                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center shadow-sm whitespace-nowrap">
                      ✓ Linked
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {customerId && (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomerId(null);
                        setCustomerName("");
                        setCustomerPhone("");
                        setCustomerEmail("");
                        setCustomerAddress("");
                        setCustomerGst("");
                        toast("Customer unlinked", { icon: 'ℹ️' });
                      }}
                      className="text-[11px] text-gray-500 hover:text-red-600 px-2 py-0.5 rounded hover:bg-red-50 transition-colors"
                      title="Clear customer link"
                    >
                      Clear
                    </button>
                  )}
                  <motion.button whileHover={{ scale: 1.02 }} onClick={() => setIsAppointmentModalOpen(true)} className="bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1 transition-colors"><Calendar size={12} /> Load Appt</motion.button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="relative w-full z-40">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input type="text" placeholder="Customer Name" ref={customerNameRef} value={customerName} onChange={handleCustomerNameChange} onBlur={handleCustomerNameBlur} onFocus={() => { if (customerName) handleCustomerNameChange({ target: { value: customerName } } as any); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); customerPhoneRef.current?.focus(); } }} className="pl-9 pr-3 py-2 border border-gray-200 rounded-lg w-full text-sm focus:ring-2 focus:ring-blue-500 bg-gray-50/50 outline-none transition-all font-medium text-gray-800" />
                  {customerSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 w-full min-w-[320px] bg-white border-2 border-blue-600 rounded-xl shadow-2xl mt-1 z-[9999] max-h-60 overflow-y-auto divide-y divide-gray-100 animate-in fade-in-50 duration-150">
                      <div className="px-3 py-1.5 bg-blue-50 text-[10px] font-black uppercase tracking-wider text-blue-800 flex items-center justify-between sticky top-0 z-10 border-b border-blue-200">
                        <span className="flex items-center gap-1"><User size={12} /> Available Customers ({customerSuggestions.length})</span>
                        <span className="text-[9px] text-blue-600 font-semibold">Click to select</span>
                      </div>
                      {customerSuggestions.map((c: any) => (
                        <div
                          key={c.id}
                          onMouseDown={(e) => { e.preventDefault(); selectCustomer(c); }}
                          onClick={() => selectCustomer(c)}
                          className="px-3.5 py-2.5 hover:bg-blue-600 hover:text-white cursor-pointer transition-colors group flex justify-between items-center"
                        >
                          <div>
                            <div className="font-bold text-gray-900 group-hover:text-white text-sm flex items-center gap-2">
                              {c.name}
                              {c.visitCount ? (
                                <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 group-hover:bg-white group-hover:text-blue-700 px-1.5 py-0.5 rounded-full">
                                  ✓ {c.visitCount} visits
                                </span>
                              ) : null}
                            </div>
                            <div className="text-xs text-blue-600 group-hover:text-blue-100 font-mono font-medium flex items-center gap-1 mt-0.5">
                              <Phone size={11} /> {c.phone || "No Phone"}
                            </div>
                          </div>
                          {c.pendingBalance > 0 && (
                            <span className="text-[10px] font-bold text-red-600 group-hover:text-red-200">
                              Due: ₹{c.pendingBalance}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 relative z-30">
                  <div className="relative w-full z-30">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input type="text" placeholder="Phone" ref={customerPhoneRef} value={customerPhone} onChange={handlePhoneChange} onBlur={handlePhoneBlur} onFocus={() => { if (customerPhone) handlePhoneChange({ target: { value: customerPhone } } as any); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); customerEmailRef.current?.focus(); } }} className="pl-9 pr-3 py-2 border border-gray-200 rounded-lg w-full text-sm focus:ring-2 focus:ring-blue-500 bg-gray-50/50 outline-none transition-all font-medium text-gray-800" />
                    {phoneSuggestions.length > 0 && (
                      <div className="absolute top-full left-0 w-full min-w-[320px] bg-white border-2 border-blue-600 rounded-xl shadow-2xl mt-1 z-[9999] max-h-60 overflow-y-auto divide-y divide-gray-100 animate-in fade-in-50 duration-150">
                        <div className="px-3 py-1.5 bg-blue-50 text-[10px] font-black uppercase tracking-wider text-blue-800 flex items-center justify-between sticky top-0 z-10 border-b border-blue-200">
                          <span className="flex items-center gap-1"><Phone size={12} /> Matching Numbers ({phoneSuggestions.length})</span>
                          <span className="text-[9px] text-blue-600 font-semibold">Click to select</span>
                        </div>
                        {phoneSuggestions.map((c: any) => (
                          <div
                            key={c.id}
                            onMouseDown={(e) => { e.preventDefault(); selectCustomer(c); }}
                            onClick={() => selectCustomer(c)}
                            className="px-3.5 py-2.5 hover:bg-blue-600 hover:text-white cursor-pointer transition-colors group flex justify-between items-center"
                          >
                            <div>
                              <div className="font-bold text-gray-900 group-hover:text-white text-sm flex items-center gap-2">
                                {c.name}
                                {c.visitCount ? (
                                  <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 group-hover:bg-white group-hover:text-blue-700 px-1.5 py-0.5 rounded-full">
                                    ✓ {c.visitCount} visits
                                  </span>
                                ) : null}
                              </div>
                              <div className="text-xs text-blue-600 group-hover:text-blue-100 font-mono font-bold flex items-center gap-1 mt-0.5">
                                <Phone size={11} /> {c.phone}
                              </div>
                            </div>
                            {c.totalSpent > 0 && (
                              <span className="text-[10px] font-semibold text-gray-500 group-hover:text-blue-100">
                                Spent: ₹{c.totalSpent}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="relative w-full">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input ref={customerEmailRef} type="email" placeholder="Email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); customerGstRef.current?.focus(); } }} className="pl-9 pr-3 py-2 border border-gray-200 rounded-lg w-full text-sm focus:ring-2 focus:ring-blue-500 bg-gray-50/50 outline-none transition-all" />
                  </div>
                </div>

                <div className="relative w-full">
                  <input ref={customerGstRef} type="text" placeholder="Customer GST (Optional)" value={customerGst} onChange={(e) => setCustomerGst(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); customerAddressRef.current?.focus(); } }} className="px-3 py-2 border border-gray-200 rounded-lg w-full text-sm focus:ring-2 focus:ring-blue-500 bg-gray-50/50 outline-none transition-all" />
                </div>
                <div className="relative w-full">
                  <input ref={customerAddressRef} type="text" placeholder="Customer Address (Optional)" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); } }} className="px-3 py-2 border border-gray-200 rounded-lg w-full text-sm focus:ring-2 focus:ring-blue-500 bg-gray-50/50 outline-none transition-all" />
                </div>
              </div>
            </div>

            {customerPackages.length > 0 && !isReturnMode && documentMode !== "Estimation" && (
              <div className="bg-purple-50/50 rounded-xl shadow-sm border border-purple-200/50 p-4 space-y-2 max-h-[160px] overflow-y-auto custom-scrollbar">
                <h3 className="font-semibold text-purple-800 flex items-center gap-2 text-sm"><PackageSearch size={14} /> Available Packages ({customerPackages.filter(p => p.isActive).length})</h3>
                <div className="space-y-2">
                  {customerPackages.filter(p => p.isActive).map((pkg) => (
                    <div key={pkg.id} className="bg-white border border-purple-100 rounded-lg p-2 shadow-sm text-sm">
                      <div className="font-semibold text-gray-800 mb-1 flex justify-between">
                        <span>{pkg.packageName}</span>
                      </div>
                      <div className="space-y-1">
                        {pkg.items?.map((item: any, idx: number) => {
                          const remaining = item.totalQuantity - item.usedQuantity;
                          if (remaining <= 0) return null;
                          return (
                            <div key={idx} className="flex justify-between items-center text-xs border-b border-gray-50 last:border-0 pb-1 last:pb-0">
                              <span className="text-gray-600 truncate w-3/5" title={item.serviceName}>{item.serviceName}</span>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-purple-700 font-medium">{remaining} left</span>
                                <button 
                                  onClick={() => handleRedeemPackageService(pkg, idx)}
                                  className="px-2 py-0.5 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded transition-colors"
                                >
                                  Redeem
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Column 2: Order & Payment */}
          <div className="flex flex-col gap-4 h-full">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2"><Briefcase size={16} className="text-indigo-500" /> Order Details</h3>

              <div className="flex gap-2">
                <select value={customerMode} onChange={(e) => setCustomerMode(e.target.value)} className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-gray-50/50 focus:ring-2 focus:ring-indigo-400 outline-none transition-all">
                  <option value="Walk-in">Walk-in Mode</option>
                  <option value="Online">Online Mode</option>
                </select>

                {documentMode !== "Estimation" && (
                  <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-gray-50/50 focus:ring-2 focus:ring-indigo-400 outline-none transition-all">
                    <option value="Cash">Cash</option><option value="Card">Card</option>
                    <option value="UPI">UPI</option><option value="Split Payment">Split</option>
                    <option value="PARTIAL">Partial</option>
                    <option value="Other">Other</option>
                  </select>
                )}
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <select value={selectedStaffId} onChange={(e) => setSelectedStaffId(e.target.value)} className="pl-9 pr-3 py-2 border border-gray-200 rounded-lg w-full text-sm focus:ring-2 focus:ring-indigo-400 bg-gray-50/50 outline-none appearance-none transition-all text-gray-600">
                    <option value="">Sales Staff (Optional)</option>
                    {Array.isArray(staff) && staff.filter((s: any) => s.isActive).map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                {selectedStaffId && (
                  <div className="relative w-24">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                    <input type="number" placeholder="Comm" value={staffCommissionPercentage} onChange={(e) => setStaffCommissionPercentage(e.target.value)} className="pl-7 pr-2 py-2 border border-gray-200 rounded-lg w-full text-sm focus:ring-2 focus:ring-indigo-400 bg-gray-50/50 outline-none transition-all" />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
                <input type="checkbox" id="expiryReminderToggle" checked={enableExpiryReminder} onChange={(e) => setEnableExpiryReminder(e.target.checked)} className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer" />
                <label htmlFor="expiryReminderToggle" className="font-medium text-gray-700 cursor-pointer text-sm select-none">Reminder</label>
                {enableExpiryReminder && (
                  <div className="flex items-center gap-1 ml-auto">
                    <input type="number" onWheel={(e) => (e.target as HTMLInputElement).blur()} value={expiryDays} onChange={(e) => setExpiryDays(e.target.value)} className="w-16 border border-gray-200 rounded-md px-2 py-1 text-center font-medium text-indigo-800 bg-indigo-50 focus:ring-2 focus:ring-indigo-400 outline-none text-sm" />
                    <span className="text-xs text-gray-500">days</span>
                  </div>
                )}
              </div>
            </div>

            {!isReturnMode && holds.length > 0 && (
              <div className="bg-yellow-50/50 rounded-xl shadow-sm border border-yellow-200/50 p-4 space-y-2">
                <h3 className="font-semibold text-yellow-800 flex items-center gap-2 text-sm"><AlertCircle size={14} /> Held Bills ({holds.length})</h3>
                <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                  {holds.map((h: any) => (
                    <div key={h.id} onClick={() => handleRetrieveHold(h)} className="shrink-0 w-32 p-2 bg-white border border-yellow-200 rounded-lg cursor-pointer hover:bg-yellow-50 hover:border-yellow-300 transition-colors shadow-sm relative group">
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteHeldBill(h.id); }} className="absolute -top-1 -right-1 p-0.5 bg-red-100 text-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X size={12} /></button>
                      <div className="text-xs font-bold text-gray-800 truncate">{h.customerName || "Unnamed"}</div>
                      <div className="text-xs text-green-600 font-semibold mt-1">₹{h.finalAmount}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Column 3: Totals & Actions */}
          <div className="flex flex-col gap-4 h-full">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col justify-between h-full relative z-10">

              {paymentMethod === "Cash" && documentMode !== "Estimation" && (
                <div className="relative mb-3">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">₹</span>
                  <input type="number" placeholder="Cash Received" value={receivedAmount} onChange={(e) => setReceivedAmount(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (isReturnMode) handleSaveReturnAndPrint(); else handleSaveAndPrint(true); } }} className="pl-8 pr-3 py-2.5 text-sm border-2 border-green-200 bg-green-50/30 rounded-xl w-full focus:ring-0 focus:border-green-400 font-semibold text-green-800 transition-colors outline-none" />
                </div>
              )}
              {paymentMethod === "Split Payment" && documentMode !== "Estimation" && (
                <div className="flex gap-2 mb-3">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">₹</span>
                    <input type="number" placeholder="Cash" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (isReturnMode) handleSaveReturnAndPrint(); else handleSaveAndPrint(true); } }} className="pl-8 pr-2 py-2 text-sm border-2 border-green-200 bg-green-50/30 rounded-xl w-full focus:ring-0 focus:border-green-400 font-semibold text-green-800 transition-colors outline-none" />
                  </div>
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">₹</span>
                    <input type="number" placeholder="Online" value={onlineAmount} onChange={(e) => setOnlineAmount(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (isReturnMode) handleSaveReturnAndPrint(); else handleSaveAndPrint(true); } }} className="pl-8 pr-2 py-2 text-sm border-2 border-blue-200 bg-blue-50/30 rounded-xl w-full focus:ring-0 focus:border-blue-400 font-semibold text-blue-800 transition-colors outline-none" />
                  </div>
                </div>
              )}

              {loyaltyEnabled && selectedCustomerData && availableLoyaltyPoints > 0 && documentMode !== "Estimation" && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 mb-3">
                  <div className="flex justify-between items-center mb-2 text-sm">
                    <span className="font-semibold text-indigo-800">Loyalty Points</span>
                    <span className="font-mono text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">{availableLoyaltyPoints} Available</span>
                  </div>
                  <div className="flex gap-2 items-center">
                    <input 
                      type="number" 
                      min="0" 
                      max={maxPointsRedeemable}
                      value={loyaltyPointsToRedeem || ''}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        setLoyaltyPointsToRedeem(Math.min(val, maxPointsRedeemable));
                      }}
                      placeholder="Redeem points"
                      className="flex-1 px-3 py-1.5 text-sm border border-indigo-200 rounded-md focus:ring-2 focus:ring-indigo-400 outline-none"
                    />
                    {loyaltyPointsToRedeem > 0 && (
                      <span className="text-sm font-semibold text-green-600">-₹{(loyaltyPointsToRedeem * loyaltyRedeemValue).toFixed(2)}</span>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-1.5 mb-4">
                <div className="flex justify-between items-center pb-1.5 mb-1.5 border-b border-gray-100">
                  <span className="text-[10px] font-black tracking-wider uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
                    GST Inclusive Bill
                  </span>
                  <span className="text-[10px] text-gray-500 font-medium">All item prices include GST</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Taxable Value (Excl. Tax)</span>
                  <span className="font-mono">₹{(totalTaxableAmount || 0).toFixed(2)}</span>
                </div>
                {loyaltyPointsToRedeem > 0 && (
                  <div className="flex justify-between text-xs text-green-600 font-medium">
                    <span>Loyalty Discount</span>
                    <span className="font-mono">-₹{(loyaltyDiscountAmount || 0).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs text-emerald-700 font-medium">
                  <span>Total GST (Included in Total)</span>
                  <span className="font-mono">₹{(totalGstAmountDisplay || 0).toFixed(2)}</span>
                </div>
                {isReturnMode && (
                  <div className="flex justify-between text-sm font-semibold text-gray-700 pt-1 border-t border-gray-100 mt-1">
                    <span>Original Total</span>
                    <span className="font-mono">₹{(originalTotal || 0).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between items-end pt-2 border-t border-gray-200 mt-2">
                  <span className="text-sm font-bold text-gray-800 uppercase tracking-wide">{isReturnMode ? "New Total" : "Grand Total"}</span>
                  <span className="text-3xl font-black text-blue-700 tracking-tight">₹{(totalAmount || 0).toFixed(2)}</span>
                </div>

                {isReturnMode && (
                  <div className={`flex justify-between text-sm font-bold mt-1 px-2 py-1.5 rounded-md ${totalAmount - originalTotal >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    <span>{totalAmount - originalTotal >= 0 ? "Additional Due" : "Refund Due"}</span>
                    <span>₹{Math.abs(totalAmount - (originalTotal || 0)).toFixed(2)}</span>
                  </div>
                )}
                {changeDue > 0 && (
                  <div className="flex justify-between text-sm font-bold mt-1 px-2 py-1.5 rounded-md bg-green-100 text-green-700">
                    <span>Change Due</span>
                    <span>₹{(changeDue || 0).toFixed(2)}</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {isReturnMode ? (
                  <>
                    <button onClick={handleSaveReturnAndPrint} disabled={loading} className="col-span-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-200 hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2">
                      {loading ? <RefreshCw className="animate-spin" size={18} /> : <Printer size={18} />} {loading ? "Processing..." : "Save & Print Return"}
                    </button>
                    <button onClick={handleReset} disabled={loading} className="col-span-2 bg-gray-100 text-gray-700 py-2.5 rounded-xl font-semibold hover:bg-gray-200 transition-colors flex items-center justify-center gap-2">
                      Exit Return Mode
                    </button>
                  </>
                ) : (
                  <>
                    <>
                      <button onClick={() => handleSaveAndPrint(true)} disabled={loading} className="col-span-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white py-3.5 rounded-xl font-bold text-base shadow-lg shadow-green-200 hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 tracking-wide">
                        {loading ? <RefreshCw className="animate-spin" size={20} /> : <Save size={20} />} {loading ? "Saving..." : "Save & Print Bill"}
                      </button>
                      <button onClick={handleHoldBill} disabled={loading} className="col-span-1 bg-yellow-50 text-yellow-700 border border-yellow-200 py-2.5 rounded-xl font-semibold hover:bg-yellow-100 transition-colors flex items-center justify-center gap-2">
                        Hold
                      </button>
                      <button onClick={handleReset} disabled={loading} className="col-span-1 bg-red-50 text-red-600 border border-red-200 py-2.5 rounded-xl font-semibold hover:bg-red-100 transition-colors flex items-center justify-center gap-2">
                        Reset
                      </button>

                      <div className="col-span-2 flex justify-between mt-1 gap-2">
                        <button onClick={() => setIsReturnModalOpen(true)} className="flex-1 bg-white border border-gray-200 text-gray-700 py-2 rounded-lg text-xs font-semibold hover:bg-gray-50 flex items-center justify-center gap-1"><Undo2 size={12} /> Return</button>
                        <button onClick={handleSendWhatsApp} disabled={loading || !customerPhone || customerPhone.trim().length < 10} className="flex-1 bg-[#25D366]/10 border border-[#25D366]/30 text-[#128C7E] disabled:opacity-50 disabled:cursor-not-allowed py-2 rounded-lg text-xs font-semibold hover:bg-[#25D366]/20 flex items-center justify-center gap-1"><MessageCircle size={12} /> WhatsApp</button>
                      </div>
                    </>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Billing;

