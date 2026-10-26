import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Pencil, Trash2, PlusCircle, X, Layers, Upload, Download, Printer, ListPlus,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CheckCircle, Info, Calendar,
  CreditCard, CheckCircle2, AlertCircle, RefreshCw, UserPlus, UserCheck, DollarSign, Image as ImageIcon,
  FileSpreadsheet, ChevronDown
} from 'lucide-react';
import { utils, writeFile, read } from 'xlsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { auth } from '@/lib/firebase';
import { productApi, vendorApi, stockTransactionApi, Vendor, Product as BaseProduct } from '@/lib/api';
import { useGlobalData } from '@/context/GlobalDataContext';
import { useAuth } from '@/context/AuthContext';
import Barcode from 'react-barcode';
import * as Papa from 'papaparse';
import MultiProductFormModal from './MultiProductFormModal';
import { generateSixDigitId, formatDate } from '@/lib/utils';
import { SyncIndicator } from '@/components/SyncIndicator';
import { useConfirm } from '@/hooks/useConfirm';
import { formatBarcodeMeta } from '@/lib/barcodeUtils';
import { printProductBarcodes } from '@/lib/printBarcodeUtils';

// Data Structures
type Product = BaseProduct;

type SelectedProducts = {
  [productId: string]: {
    quantity: number;
    barcode: string;
    name: string;
    price: number;
    vendorNickname: string;
  }
};





// =================================================================================
// START: STYLISH PAGINATION COMPONENT
// =================================================================================
const Pagination = ({
  currentPage,
  totalPages,
  onPageChange
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) => {
  if (totalPages <= 1) return null;

  const getPageNumbers = () => {
    const delta = 2;
    const range = [];
    const rangeWithDots = [];
    let l;

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
        range.push(i);
      }
    }

    for (const i of range) {
      if (l) {
        if (i - l === 2) rangeWithDots.push(l + 1);
        else if (i - l !== 1) rangeWithDots.push('...');
      }
      rangeWithDots.push(i);
      l = i;
    }
    return rangeWithDots;
  };

  return (
    <div className="flex justify-between items-center px-6 py-4 border-t bg-gray-50">
      <div className="text-sm text-gray-500 font-medium">
        Page {currentPage} of {totalPages}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          className="p-2 rounded-lg hover:bg-white hover:shadow-sm text-gray-600 disabled:opacity-30 disabled:hover:shadow-none transition-all"
          title="First Page"
        >
          <ChevronsLeft size={18} />
        </button>
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-2 rounded-lg hover:bg-white hover:shadow-sm text-gray-600 disabled:opacity-30 disabled:hover:shadow-none transition-all"
          title="Previous Page"
        >
          <ChevronLeft size={18} />
        </button>

        <div className="flex gap-1 mx-2">
          {getPageNumbers().map((page, index) => (
            <React.Fragment key={index}>
              {page === '...' ? (
                <span className="px-2 self-end text-gray-400 font-medium select-none mb-1">...</span>
              ) : (
                <button
                  onClick={() => onPageChange(Number(page))}
                  className={`
                    w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold transition-all duration-200
                    ${currentPage === page
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-gray-600 hover:bg-white hover:shadow-sm'
                    }
                  `}
                >
                  {page}
                </button>
              )}
            </React.Fragment>
          ))}
        </div>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="p-2 rounded-lg hover:bg-white hover:shadow-sm text-gray-600 disabled:opacity-30 disabled:hover:shadow-none transition-all"
          title="Next Page"
        >
          <ChevronRight size={18} />
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          className="p-2 rounded-lg hover:bg-white hover:shadow-sm text-gray-600 disabled:opacity-30 disabled:hover:shadow-none transition-all"
          title="Last Page"
        >
          <ChevronsRight size={18} />
        </button>
      </div>
    </div>
  );
};

const ResultCard = ({ icon, label, value, color = "text-gray-900" }: { icon: React.ReactNode; label: string; value: string | number; color?: string }) => (
  <div className="bg-gray-50 border border-gray-100 p-4 rounded-xl flex items-center gap-4 hover:shadow-md transition-shadow">
    <div className="p-3 bg-white rounded-lg shadow-sm">
      {icon}
    </div>
    <div>
      <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">{label}</p>
      <p className={`text-base font-black ${color}`}>{value}</p>
    </div>
  </div>
);

const normalizeString = (str: string) => {
  if (!str) return '';
  return str.toString().toLowerCase().trim().replace(/\s+/g, ' ');
};

const normalizeGst = (gst: string) => {
  if (!gst) return '';
  // Remove all spaces and convert to uppercase
  const normalized = gst.toString().replace(/\s+/g, '').toUpperCase();
  return normalized;
};

const Products = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const { products: globalProducts, vendors: globalVendors, loading: globalLoading, refreshProducts, refreshVendors, isSyncing } = useGlobalData();

  // Combine all products for a unified view
  const allProducts = React.useMemo(() => [
    ...(globalProducts || []).map(p => ({ ...p, systemType: 'Retail' }))
  ], [globalProducts]);

  const { confirm: confirmAction, ConfirmationDialog } = useConfirm();
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');
  const highlightStatus = searchParams.get('status');

  const [categories, setCategories] = useState<string[]>([]);
  // Local derived state for UI
  const [displayedProducts, setDisplayedProducts] = useState<Product[]>([]);

  const [isLoading, setIsLoading] = useState(false); // For local actions like delete/save
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMultiAddModalOpen, setIsMultiAddModalOpen] = useState(false);
  const [isCategoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { settings } = useGlobalData();
  const defaultGst = Number(settings?.defaultGst || 5);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedProducts, setSelectedProducts] = useState<SelectedProducts>({});
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [appliedStartDate, setAppliedStartDate] = useState('');
  const [appliedEndDate, setAppliedEndDate] = useState('');

  // Image Upload State
  const [uploadingImageId, setUploadingImageId] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const handleImageUpload = async (productId: string, file: File) => {
    try {
      setUploadingImageId(productId);
      await productApi.uploadImage(productId, file);
      toast.success('Image uploaded successfully');
      refreshProducts();
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error('Failed to upload image');
    } finally {
      setUploadingImageId(null);
    }
  };

  const handleApplyFilter = () => {
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
    setCurrentPage(1);
    toast.success('Date filter applied');
  };

  // Inline Editing State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});


  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(100);
  const shopName = settings?.shopName || 'Anjus Beauty Saloon';

  // Helper to sort products (client-side now)
  const getSortedProducts = (list: Product[]) => {
    return [...list].sort((a, b) => {
      const dateA = new Date(a.createdAt || '').getTime();
      const dateB = new Date(b.createdAt || '').getTime();
      const validDateA = isNaN(dateA) ? 0 : dateA;
      const validDateB = isNaN(dateB) ? 0 : dateB;
      const dateDiff = validDateB - validDateA;
      if (dateDiff !== 0) return dateDiff;
      return parseInt(b.id || '0', 10) - parseInt(a.id || '0', 10);
    });
  };

  // Filter products based on search
  const filteredProducts = (allProducts as Product[]).filter((p) => {
    const lowerSearchTerm = searchTerm.toLowerCase().trim();
    let matchesSearch = true;

    if (lowerSearchTerm) {
      const searchNum = Number(lowerSearchTerm);
      const isNumber = !isNaN(searchNum) && lowerSearchTerm !== '';

      matchesSearch = Boolean(
        (p.name && String(p.name).toLowerCase().includes(lowerSearchTerm)) ||
        (p.category && String(p.category).toLowerCase().includes(lowerSearchTerm)) ||
        (p.id && String(p.id).toLowerCase().includes(lowerSearchTerm)) ||
        (p.barcode && String(p.barcode).toLowerCase().includes(lowerSearchTerm)) ||
        (p.vendorName && String(p.vendorName).toLowerCase().includes(lowerSearchTerm)) ||
        (p.price != null && String(p.price).toLowerCase().includes(lowerSearchTerm)) ||
        (isNumber && p.price === searchNum) ||
        ((p as any).productName && String((p as any).productName).toLowerCase().includes(lowerSearchTerm)) ||
        ((p as any).productId && String((p as any).productId).toLowerCase().includes(lowerSearchTerm)) ||
        ((p as any).sellingPrice != null && String((p as any).sellingPrice).toLowerCase().includes(lowerSearchTerm)) ||
        (isNumber && (p as any).sellingPrice === searchNum)
      );
    }

    if (!matchesSearch) return false;

    // Date Filter logic
    if (!appliedStartDate && !appliedEndDate) return true;

    const pDateStr = p.createdAt || p.updatedAt;
    if (!pDateStr) return false;

    const pDate = new Date(pDateStr);
    if (isNaN(pDate.getTime())) return false;

    pDate.setHours(0, 0, 0, 0);

    if (appliedStartDate) {
      const sDate = new Date(appliedStartDate);
      sDate.setHours(0, 0, 0, 0);
      if (pDate < sDate) return false;
    }
    if (appliedEndDate) {
      const eDate = new Date(appliedEndDate);
      eDate.setHours(0, 0, 0, 0);
      if (pDate > eDate) return false;
    }
    return true;
  });

  // Sort and Paginate
  const sortedProducts = getSortedProducts(filteredProducts);
  const totalItems = sortedProducts.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const totalStock = filteredProducts.reduce((acc, p) => acc + Number(p.stockQuantity || 0), 0);

  // Slice for current view
  const currentViewProducts = sortedProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Sync displayed products
  useEffect(() => {
    setDisplayedProducts(currentViewProducts);
  }, [globalProducts, currentPage, searchTerm, itemsPerPage, appliedStartDate, appliedEndDate]);

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  const handleSaveProduct = async (formData: any, imageFile?: File | null) => {
    setIsSaving(true);
    const isEditing = !!formData.id;
    const now = new Date().toISOString();
    const payload = {
      id: formData.id || generateSixDigitId(),
      name: formData.name,
      brand: formData.brand || '',
      sku: formData.sku || '',
      category: formData.category,
      series: formData.series || '',
      purchaseRate: parseFloat(formData.purchaseRate as any) || 0,
      purchaseGst: parseFloat(formData.purchaseGst as any) || 0,
      purchaseDisc: parseFloat(formData.purchaseDisc as any) || 0,
      price: parseFloat(formData.price as any) || 0,
      sellingPrice: parseFloat(formData.price as any) || 0,
      mrp: parseFloat(formData.mrp as any) || 0,
      discount: parseFloat(formData.discount as any) || 0,
      stockQuantity: parseInt(formData.stockQuantity as any, 10) || 0,
      inventoryTracking: formData.inventoryTracking || 'TRACKED',
      availabilityStatus: formData.availabilityStatus || 'AVAILABLE',
      active: true,
      batchNumber: formData.batchNumber || '',
      expiryDate: formData.expiryDate || '',
      unit: formData.unit || '',
      vendorId: formData.vendorId,
      vendorName: formData.vendorName,
      vendorNickname: formData.vendorNickname || '',
      barcode: formData.barcode || formData.id || generateSixDigitId(),
      createdAt: formData.createdAt || now,
      updatedAt: now
    };

    const processSave = async () => {
      try {
        let savedId = payload.id;
        const originalProduct = isEditing
          ? (globalProducts as Product[]).find(p => p.id === formData.id) || null
          : null;

        if (isEditing) {
          const { createdAt, ...updatePayload } = payload;

          await productApi.update(formData.id, updatePayload);

          const stockChanged = Number(originalProduct?.stockQuantity || 0) !== Number(payload.stockQuantity || 0);

          if (stockChanged) {
            try {
              await stockTransactionApi.add({
                productId: formData.id as string,
                productName: payload.name,
                transactionType: 'ADJUSTMENT',
                quantity: payload.stockQuantity - (originalProduct?.stockQuantity || 0),
                previousStock: originalProduct?.stockQuantity || 0,
                resultingStock: payload.stockQuantity,
                reason: 'Manual stock update',
                createdAt: new Date().toISOString()
              });
            } catch (stErr) {
              console.error('Stock transaction failed:', stErr);
            }
          }

          toast.success('Product updated successfully');
        } else {
          const res = await productApi.add(payload);
          savedId = res.data?.id || payload.id;
          payload.id = savedId;

          try {
            await stockTransactionApi.add({
              productId: savedId as string,
              productName: payload.name,
              transactionType: 'OPENING_STOCK',
              quantity: payload.stockQuantity,
              previousStock: 0,
              resultingStock: payload.stockQuantity,
              reason: 'Initial stock',
              createdAt: new Date().toISOString()
            });
          } catch (stErr) {
            console.error('Stock transaction failed:', stErr);
          }


          if (payload.mrp > 0 && savedId) {
            try {
              await productApi.update(savedId, { mrp: payload.mrp });
            } catch (e) {
              console.error('MRP Patch failed');
            }
          }
          if (imageFile && savedId) {
            await productApi.uploadImage(savedId, imageFile);
          }
          toast.success('Product created successfully');
        }

        if (isEditing && imageFile) {
          await productApi.uploadImage(formData.id, imageFile);
        }
        await refreshProducts();
        await refreshVendors();
        setIsModalOpen(false);
      } catch (err: any) {
        toast.error(`Error saving product: ${err.response?.data?.error || err.message}`);
      } finally {
        setIsSaving(false);
      }
    };

    if (payload.stockQuantity <= 0 && isEditing) {
      confirmAction(
        `Product ${payload.name} stock is 0. Do you want to delete this product entirely?`,
        async () => {
          try {
            await productApi.delete(formData.id);
            await refreshProducts();
            setIsModalOpen(false);
            setIsSaving(false);
          } catch (err: any) {
            toast.error(`Delete failed: ${err.message}`);
            setIsSaving(false);
          }
        },
        'Delete Product?',
        () => {
          processSave();
        },
        { cancelText: 'No, Keep (0 Stock)', confirmText: 'Yes, Delete' }
      );
      return;
    }

    await processSave();
  };

  const handleDeleteProduct = (id: string) => {
    confirmAction('Are you sure you want to delete this product? This will remove it from stock.', async () => {
      try {
        await productApi.delete(id);
        await refreshProducts();
        toast.success("Product deleted successfully.");
      } catch (err: any) {
        toast.error(`Delete failed: ${err.message}`);
      }
    }, 'Delete Product');
  };

  // Edit Handlers (Moved here to fix scope issues)
  const handleEditClick = (product: Product) => {
    setEditingId(product.id);
    setEditForm({
      id: product.id || '',
      name: product.name || '',
      category: product.category || '',
      vendorId: product.vendorId || '',
      vendorName: product.vendorName || '',
      vendorNickname: product.vendorNickname || '',
      purchaseRate: product.purchaseRate ?? '',
      purchaseDisc: product.purchaseDisc ?? '',
      price: product.price ?? '',
      stockQuantity: product.stockQuantity ?? '',
      purchaseGst: product.purchaseGst ?? '',
      discount: product.discount ?? '',
      barcode: product.barcode || '',
      mrp: product.mrp ?? ''
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleSaveInline = async () => {
    if (!editingId) return;

    // Validate supplier only when supplier was modified
    const originalProduct = (globalProducts as Product[]).find(p => p.id === editingId);
    const vendorChanged =
      String(originalProduct?.vendorId || "").trim() !==
      String(editForm.vendorId || "").trim();

    if (vendorChanged) {
      const supplierExists = globalVendors.some(
        (v) => String(v.id).trim() === String(editForm.vendorId).trim()
      );
      if (!supplierExists) {
        toast.error("Invalid Supplier ID. Please enter a valid supplier.");
        return;
      }
    }

    // Basic validations
    if (parseFloat(editForm.price) < parseFloat(editForm.purchaseRate)) {
      toast.error("Selling Price cannot be less than Purchase Rate.");
      return;
    }
    // Call existing save handler
    await handleSaveProduct(editForm);
    setEditingId(null);
  };

  const fetchCategories = async () => {
    try {
      const res = await productApi.getCategories();
      if (Array.isArray(res?.data)) {
        const uniqueCats = Array.from(new Set(res.data.map((c: any) => c.name || c))) as string[];
        setCategories(uniqueCats);
      } else {
        setCategories([]);
      }
    } catch (err: any) {
      console.error('Error fetching categories:', err);
      setError('Failed to load categories.');
    }
  };

  useEffect(() => {
    fetchCategories();
    refreshProducts();
    refreshVendors();
  }, []);

  const handleAddOrUpdateCategory = async (oldCategory: string | null, newCategory: string) => {
    if (!newCategory.trim()) return;
    try {
      if (oldCategory) {
        // Fetch to find the ID of the category we want to update
        const res = await productApi.getCategories();
        const categoryObj = res.data.find((c: any) => c.name === oldCategory);

        if (categoryObj && categoryObj.id) {
          await productApi.updateCategory(categoryObj.id, { name: newCategory.trim() });
          toast.success("Category updated successfully");
        } else {
          throw new Error("Category ID not found in database");
        }
      } else {
        await productApi.addCategory({ name: newCategory.trim() });
        toast.success("Category added successfully");
      }
      await fetchCategories();
    } catch (err: any) {
      console.error("Category save error:", err);
      toast.error(`Failed to save category: ${err.response?.data?.error || err.message}`);
      throw err;
    }
  };


  const handleOpenModal = (product: Product | null) => {
    setEditingProduct(product);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
  };

  const [uploadResults, setUploadResults] = useState<{
    total: number;
    success: number;
    failed: number;
    newSuppliers: number;
    mappedSuppliers: number;
    totalCredit: number;
    errors: string[];
    isOpen: boolean;
  } | null>(null);

  const matchSupplier = (inputName: string, inputId: string, inputPhone: string, vendors: Vendor[]) => {
    const normName = normalizeString(inputName);
    const normPhone = normalizeString(inputPhone);

    // 1. Match by ID (Exact)
    if (inputId) {
      const match = vendors.find(v => v.id === inputId);
      if (match) return match;
    }

    // 2. Match by Name (Normalized)
    if (normName) {
      const match = vendors.find(v => normalizeString(v.name) === normName);
      if (match) return match;
    }

    // 3. Match by Phone (Normalized)
    if (normPhone) {
      const match = vendors.find(v => normalizeString(v.phone) === normPhone);
      if (match) return match;
    }

    return null;
  };

  const processUnifiedUpload = async (csvData: any[]) => {
    setIsLoading(true);
    let successCount = 0;
    let failedCount = 0;
    let newSuppliersCount = 0;
    let mappedSuppliersCount = 0;
    let totalCreditAdded = 0;
    const errors: string[] = [];

    try {
      // 0. Auto-add missing categories
      const uniqueCategories = Array.from(new Set(csvData.map(r => (r['Category'] || r['category'])?.trim()).filter(Boolean)));
      for (const cat of uniqueCategories) {
        if (!categories.includes(cat)) {
          try {
            await productApi.addCategory({ name: cat });
          } catch(err) {
            console.error("Failed to add missing category from CSV", cat, err);
          }
        }
      }

      // 1. Group Rows by Supplier Name
      const billGroups: { [key: string]: any[] } = {};
      csvData.forEach(row => {
        const supplierName = row['Supplier Name'] || row['supplierName'] || '';
        const groupKey = `${normalizeString(supplierName)}`;
        if (!billGroups[groupKey]) billGroups[groupKey] = [];
        billGroups[groupKey].push(row);
      });

      // 2. Process each Group
      for (const groupKey in billGroups) {
        const groupRows = billGroups[groupKey];
        const firstRow = groupRows[0];

        // Validations & defaults
        const supplierName = (firstRow['Supplier Name'] || firstRow['supplierName'] || 'General Supplier').toString().trim() || 'General Supplier';
        const date = (firstRow['Date'] || firstRow['date'] || new Date().toISOString().split('T')[0]).toString().trim();

        // Identify / Create Supplier
        let vendor = matchSupplier(
          supplierName,
          firstRow['Supplier ID'] || firstRow['supplierId'] || '',
          firstRow['Supplier Contact'] || firstRow['supplierContact'] || '',
          globalVendors
        );

        const rawGst = firstRow['Supplier GST'] || firstRow['supplierGst'] || '';
        const normalizedGst = normalizeGst(rawGst);
        const isValidGst = normalizedGst.length === 15;

        if (rawGst && !isValidGst) {
          errors.push(`Warning for supplier "${supplierName}": GST "${rawGst}" is not 15 characters.`);
        }

        if (vendor) {
          // Rule: If existing supplier matches but has no GST, update it. Do NOT overwrite if present.
          const existingGst = vendor.gstin || (vendor as any).gstNo;
          if (!existingGst && isValidGst) {
            try {
              await vendorApi.updateVendor(vendor.id, { gstNo: normalizedGst } as any);
              // Update local object to reflect the change
              (vendor as any).gstNo = normalizedGst;
              vendor.gstin = normalizedGst;
            } catch (err) {
              console.warn("Could not auto-update supplier GST", err);
            }
          }
          mappedSuppliersCount++;
        } else {
          try {
            const newVendorPayload: any = {
              name: supplierName,
              nickname: firstRow['Supplier Nickname'] || firstRow['supplierNickname'] || supplierName,
              phone: firstRow['Supplier Contact'] || firstRow['supplierContact'] || '',
              gstNo: normalizedGst, // Use standardized gstNo for backend
              address: firstRow['Supplier Address'] || firstRow['supplierAddress'] || '',
            };
            const res = await vendorApi.addVendor(newVendorPayload);
            vendor = { ...newVendorPayload, id: res.data.id, gstin: normalizedGst } as Vendor;
            newSuppliersCount++;
            // Update globalVendors locally so next bill from same new supplier matches
            globalVendors.push(vendor);
          } catch (err: any) {
            failedCount += groupRows.length;
            errors.push(`Failed to create supplier "${supplierName}": ${err.message}`);
            continue;
          }
        }
        // Process Products in this Bill
        const billProducts: any[] = [];
        let billTotalAmount = 0;

        for (const row of groupRows) {
          // Normalization & Calculation
          const buyPriceTotal = parseFloat(row['Purchase Price'] || row['purchasePrice']) || 0;
          const gstPercent = parseFloat(row['GST %'] || row['gst%'] || 0) || 0;

          // Split total price into Base Rate + GST Amount for backend calculations
          // This ensures (purchaseRate + purchaseGst) * qty === buyPriceTotal * qty
          const baseRate = buyPriceTotal / (1 + gstPercent / 100);
          const gstAmountPerUnit = buyPriceTotal - baseRate;

          const productName = row['Product Name'] || row['productName'];
          const sellPrice = parseFloat(row['Selling Price'] || row['sellingPrice']) || 0;
          const productType = (row['Product Type'] || row['productType'] || 'RETAIL').toUpperCase();
          const unlimitedRaw = row['Unlimited Stock'] || row['unlimitedStock'] || '';
          const isUnlimited = unlimitedRaw.toLowerCase().startsWith('y') || unlimitedRaw.toLowerCase() === 'true';

          let qty = parseInt(row['Stock Quantity'] || row['stockQuantity'], 10) || 0;
          if (isUnlimited) qty = 0;

          if (!productName || buyPriceTotal < 0 || (!isUnlimited && qty <= 0 && productType !== 'SERVICE')) {
            failedCount++;
            errors.push(`Row in CSV: Invalid Product Name, Purchase Price, or Quantity.`);
            continue;
          }

          // Smart matching for product: By Name
          const existingProduct = globalProducts.find(p => normalizeString(p.name) === normalizeString(productName));
          const productId = existingProduct ? existingProduct.id : (row['Product ID'] || row['productId'] || generateSixDigitId());

          const productPayload = {
            id: productId,
            name: productName,
            category: row['Category'] || row['category'] || 'General',
            purchaseRate: Number(baseRate.toFixed(2)),
            purchaseGst: Number(gstAmountPerUnit.toFixed(2)),
            price: sellPrice,
            sellingPrice: sellPrice,
            stockQuantity: existingProduct ? (existingProduct.stockQuantity + qty) : qty,
            inventoryTracking: (isUnlimited ? 'NOT_TRACKED' : 'TRACKED') as 'NOT_TRACKED' | 'TRACKED',
            systemType: productType,
            vendorId: vendor.id,
            vendorName: vendor.name,
            vendorNickname: vendor.nickname || vendor.name,
            createdAt: date,
          };

          try {
            if (existingProduct) {
              await productApi.update(existingProduct.id, productPayload);
            } else {
              await productApi.add(productPayload);
            }
            successCount++;
            billProducts.push(productPayload);
            billTotalAmount += buyPriceTotal * qty;
          } catch (err: any) {
            failedCount++;
            errors.push(`Failed to save product "${productName}": ${err.message}`);
          }
        }


      }

      setUploadResults({
        total: csvData.length,
        success: successCount,
        failed: failedCount,
        newSuppliers: newSuppliersCount,
        mappedSuppliers: mappedSuppliersCount,
        totalCredit: totalCreditAdded,
        errors: errors,
        isOpen: true
      });

      await refreshProducts();
      await refreshVendors();
      toast.success("CSV Upload completed.");
    } catch (err: any) {
      toast.error("Critical error during upload: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const processInBatches = async (productsToUpload: any[]) => {
    let successCount = 0;
    let errorCount = 0;

    for (const p of productsToUpload) {
      try {
        const existing = await productApi.getByBarcode(p.barcode).catch(() => null);
        if (existing?.data) {
          errorCount++;
          toast.error(`Barcode ${p.barcode} already exists.`);
          continue;
        }
        const res = await productApi.add(p);
        const newId = res.data?.id || p.id;
        
        try {
          const transactionDate = p.dateAdded ? new Date(p.dateAdded).toISOString() : new Date().toISOString();
          await stockTransactionApi.add({
            productId: newId as string,
            productName: p.name,
            transactionType: 'OPENING_STOCK',
            quantity: Number(p.stockQuantity) || 0,
            previousStock: 0,
            resultingStock: Number(p.stockQuantity) || 0,
            reason: 'Initial stock from bulk import',
            createdAt: transactionDate
          });
        } catch (err) {
          console.error('Failed to log stock transaction for bulk import:', err);
        }

        if (p.imageFile && newId) {
          await productApi.uploadImage(newId, p.imageFile);
        }
        successCount++;
      } catch (err: any) {
        console.error(`Failed to add product ${p.name}:`, err);
        errorCount++;
      }
    }
    return { successCount, errorCount };
  };

  const handleDownloadTemplate = (format: 'excel' | 'csv' = 'excel') => {
    const fileName = format === 'csv' ? 'products_upload_template.csv' : 'products_upload_template.xlsx';
    const link = document.createElement('a');
    link.href = `/${fileName}`;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(format === 'csv' ? 'CSV Template downloaded!' : 'Excel Template downloaded!');
  };

  const handleSaveMultipleProducts = async (productsToSave: any[]) => {
    setIsLoading(true);

    // Auto-add new categories
    const uniqueCategories = Array.from(new Set(productsToSave.map(p => p.category?.trim()).filter(Boolean)));
    for (const cat of uniqueCategories) {
      if (!categories.includes(cat)) {
        try {
          await productApi.addCategory({ name: cat });
        } catch(err) {
          console.error("Failed to add missing category", cat, err);
        }
      }
    }

    const { successCount, errorCount } = await processInBatches(productsToSave);

    toast.success(`${successCount} products added successfully.\n${errorCount} products failed to add.`, { duration: 2500 });
    await fetchCategories();
    await refreshProducts();
    await refreshVendors();
    setIsLoading(false);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsLoading(true);

    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = utils.sheet_to_json(worksheet);
          if (!jsonData || jsonData.length === 0) {
            toast.error("Excel file is empty or formatted incorrectly.");
            setIsLoading(false);
            return;
          }
          await processUnifiedUpload(jsonData);
        } catch (err: any) {
          toast.error("Error parsing Excel file: " + err.message);
          setIsLoading(false);
        } finally {
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
      };
      reader.onerror = () => {
        toast.error("Failed to read Excel file.");
        setIsLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      };
      reader.readAsArrayBuffer(file);
    } else {
      Papa.parse(file, {
        header: true, skipEmptyLines: true,
        complete: async (results: Papa.ParseResult<any>) => {
          if (results.data.length === 0) {
            toast.error("CSV file is empty or formatted incorrectly.");
            setIsLoading(false); return;
          }
          await processUnifiedUpload(results.data);
          if (fileInputRef.current) fileInputRef.current.value = "";
        },
        error: (error) => {
          toast.error("Error parsing CSV file: " + error.message);
          setIsLoading(false);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
      });
    }
  };

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleSelectProduct = (productId: string, product: Product) => {
    setSelectedProducts(prev => {
      const newSelection = { ...prev };
      if (newSelection[productId]) {
        delete newSelection[productId];
      } else {
        // Resolve nickname: use stored field first, then look up from globalVendors (covers old docs)
        const vendor = globalVendors.find(v => v.id === product.vendorId);
        const resolvedNickname =
          product.vendorNickname ||
          vendor?.nickname ||
          vendor?.name ||
          product.vendorName ||
          '';
        newSelection[productId] = {
          quantity: 1,
          barcode: product.barcode,
          name: product.name,
          price: product.price,
          vendorNickname: resolvedNickname,
        };
      }
      return newSelection;
    });
  };

  const handleBarcodeQuantityChange = (productId: string, quantity: number) => {
    setSelectedProducts(prev => ({
      ...prev,
      [productId]: { ...prev[productId], quantity: Math.max(1, quantity) }
    }));
  };

  const handlePrintBarcodes = async () => {
    const productsToPrint = Object.entries(selectedProducts).map(([productId, item]) => {
      const metadata = formatBarcodeMeta({
        vendorNickname: item.vendorNickname
      });
      return {
        id: productId,
        barcode: item.barcode,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        metadata: metadata
      };
    });

    if (productsToPrint.length === 0) {
      toast.error("No products selected for printing");
      return;
    }

    printProductBarcodes(productsToPrint);
  };

  // handled by filteredProducts definition at top scope


  const isAllSelected = filteredProducts.length > 0 && filteredProducts.every(p => !!selectedProducts[p.id]);

  const handleSelectAll = () => {
    if (isAllSelected) {
      setSelectedProducts({});
    } else {
      const newSelection: SelectedProducts = {};
      filteredProducts.forEach(p => {
        const vendor = globalVendors.find(v => v.id === p.vendorId);
        const resolvedNickname =
          p.vendorNickname ||
          vendor?.nickname ||
          vendor?.name ||
          p.vendorName ||
          '';
        newSelection[p.id] = {
          quantity: 1,
          barcode: p.barcode,
          name: p.name,
          price: p.price,
          vendorNickname: resolvedNickname,
        };
      });
      setSelectedProducts(newSelection);
    }
  };



  if (globalLoading && globalProducts.length === 0) return <div className="p-6 text-center text-gray-500">Loading products...</div>;


  return (
    <div className="space-y-6 pb-12">
      <ConfirmationDialog />
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-bold text-gray-800">Retail Products (Total Stock: {totalStock})</h1>
        <button
          onClick={async () => {
            await refreshProducts();
            await refreshVendors();
            toast.success('Products refreshed');
          }}
          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-gray-200"
          title="Refresh products from database"
        >
          <RefreshCw size={18} className={isSyncing ? "animate-spin text-blue-600" : ""} />
        </button>
        <SyncIndicator isSyncing={isSyncing} />
      </div>
      {error && <div className="p-4 text-red-600 bg-red-100 rounded-md">{error}</div>}
      <div className="bg-white p-4 md:p-6 rounded-lg shadow-sm flex flex-col 2xl:flex-row justify-between items-start 2xl:items-center gap-6">
        <div className="flex flex-wrap items-center gap-4 w-full 2xl:w-auto flex-1">
          <input 
            type="text" 
            placeholder="Search all products..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
            className="form-input w-full md:w-auto md:flex-1 min-w-[250px]" 
          />
          <div className="flex flex-wrap items-center gap-2 bg-gray-50/50 p-2 rounded-lg border border-gray-100">
            <span className="text-sm text-gray-600 font-medium flex items-center gap-1"><Calendar size={16} /> Date:</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="form-input py-1.5 px-2 text-sm w-[130px]" />
            <span className="text-gray-400">-</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="form-input py-1.5 px-2 text-sm w-[130px]" />
            <button
              onClick={handleApplyFilter}
              className="px-4 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 transition-colors shadow-sm"
            >
              Filter
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full 2xl:w-auto justify-start 2xl:justify-end">
          {Object.keys(selectedProducts).length > 0 && (
            <button onClick={handlePrintBarcodes} className="px-3 py-1.5 text-sm bg-purple-500 text-white font-semibold rounded-lg hover:bg-purple-600 flex items-center gap-2">
              <Printer size={20} /> Print Selected Barcodes
            </button>
          )}
          {isAdmin && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="px-3 py-1.5 text-sm bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 flex items-center gap-1.5 whitespace-nowrap shadow-sm transition-all">
                    <Download size={17} /> Template <ChevronDown size={14} className="opacity-80 ml-0.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-white shadow-xl border border-gray-200 z-50 p-1 rounded-lg">
                  <DropdownMenuItem asChild>
                    <a
                      href="/products_upload_template.xlsx"
                      download="products_upload_template.xlsx"
                      className="flex items-center gap-2.5 cursor-pointer py-2 px-2.5 rounded-md hover:bg-emerald-50 text-gray-800 transition-colors w-full no-underline"
                      onClick={() => toast.success("Excel Template downloaded!")}
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div className="flex flex-col">
                        <span className="font-semibold text-xs text-gray-900">Excel Template (.xlsx)</span>
                        <span className="text-[10px] text-gray-500">Opens directly in Microsoft Excel</span>
                      </div>
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a
                      href="/products_upload_template.csv"
                      download="products_upload_template.csv"
                      className="flex items-center gap-2.5 cursor-pointer py-2 px-2.5 rounded-md hover:bg-blue-50 text-gray-800 transition-colors w-full no-underline"
                      onClick={() => toast.success("CSV Template downloaded!")}
                    >
                      <Download className="w-4 h-4 text-blue-600 shrink-0" />
                      <div className="flex flex-col">
                        <span className="font-semibold text-xs text-gray-900">CSV Template (.csv)</span>
                        <span className="text-[10px] text-gray-500">Plain comma-separated file</span>
                      </div>
                    </a>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <button onClick={handleUploadClick} className="px-3 py-1.5 text-sm bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 flex items-center gap-2 whitespace-nowrap shadow-sm transition-all">
                <Upload size={18} /> Upload (Excel / CSV)
              </button>
              <button onClick={() => setCategoryModalOpen(true)} className="px-3 py-1.5 text-sm bg-gray-500 text-white font-semibold rounded-lg hover:bg-gray-600 flex items-center gap-2 whitespace-nowrap">
                <Layers size={18} /> Categories
              </button>
              <button onClick={() => handleOpenModal(null)} className="px-3 py-1.5 text-sm bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 flex items-center gap-2 whitespace-nowrap">
                <PlusCircle size={18} /> Add Product
              </button>
              <button onClick={() => setIsMultiAddModalOpen(true)} className="px-3 py-1.5 text-sm bg-teal-500 text-white font-semibold rounded-lg hover:bg-teal-600 flex items-center gap-2 whitespace-nowrap">
                <ListPlus size={18} /> Add Products
              </button>
            </>
          )}
        </div>
      </div>

      <input type="file" ref={fileInputRef} className="hidden" accept=".csv, .xlsx, .xls" onChange={handleFileUpload} />

      <div className="bg-white rounded-lg shadow-sm flex flex-col h-[calc(100vh-220px)]">
        {isLoading ? (
          <div className="flex-grow flex items-center justify-center text-gray-400">Loading page data...</div>
        ) : (
          <>
            <div className="overflow-auto flex-grow">
              <table className="w-full text-left relative">
                <thead className="bg-gray-50 border-b sticky top-0 z-10">
                  <tr>
                    <th className="p-4"><input type="checkbox" checked={isAllSelected} onChange={handleSelectAll} className="form-checkbox" /></th>
                    <th className="p-4">S.NO</th>
                    <th className="p-4">Image</th>
                    <th className="p-4">Product Name</th>
                    <th className="p-4">Category</th>
                    <th className="p-4">Buy Rate</th>
                    <th className="p-4">GST %</th>
                    <th className="p-4">P.Disc %</th>
                    <th className="p-4">Sell Price</th>
                    <th className="p-4">Qty</th>
                    {isAdmin && <th className="p-4 sticky right-0 bg-gray-50 border-l z-20">Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {displayedProducts.map((product, index) => {
                    const isSelected = !!selectedProducts[product.id];
                    const isEditing = editingId === product.id;

                    if (isEditing) {
                      return (
                        <tr key={product.id} className="border-t bg-blue-50/50">
                          <td className="p-4"><input type="checkbox" disabled className="form-checkbox opacity-50" /></td>
                          <td className="p-4">{((currentPage - 1) * itemsPerPage) + index + 1}</td>
                          
                          {/* Image */}
                          <td className="p-4">
                             <span className="text-gray-400 text-xs">Disabled</span>
                          </td>

                          {/* Product Name & Barcode */}
                          <td className="p-4">
                            <input
                              type="text"
                              value={editForm.name}
                              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                              className="border rounded p-1 w-32 text-sm mb-1 block"
                              placeholder="Name"
                            />
                            <input
                              type="text"
                              value={editForm.barcode}
                              onChange={(e) => setEditForm({ ...editForm, barcode: e.target.value })}
                              className="border rounded p-1 w-32 text-xs font-mono"
                              placeholder="Barcode"
                            />
                          </td>

                          {/* Category */}
                          <td className="p-4">
                            <select
                              value={editForm.category}
                              onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                              className="border rounded p-1 w-24 text-sm"
                            >
                              {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </td>

                          {/* Buy Rate */}
                          <td className="p-4">
                            <input
                              type="number"
                              value={editForm.purchaseRate}
                              onChange={(e) => setEditForm({ ...editForm, purchaseRate: e.target.value })}
                              className="border rounded p-1 w-20 text-sm"
                            />
                          </td>

                          {/* GST % */}
                          <td className="p-4">
                            <input
                              type="number"
                              value={editForm.purchaseGst}
                              onChange={(e) => setEditForm({ ...editForm, purchaseGst: e.target.value })}
                              className="border rounded p-1 w-16 text-center text-sm"
                            />
                          </td>

                          {/* P.Disc % */}
                          <td className="p-4">
                            <input
                              type="number"
                              value={editForm.purchaseDisc}
                              onChange={(e) => setEditForm({ ...editForm, purchaseDisc: e.target.value })}
                              className="border rounded p-1 w-16 text-sm"
                            />
                          </td>

                          {/* Sell Price */}
                          <td className="p-4">
                            <input
                              type="number"
                              value={editForm.price}
                              onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                              className="border rounded p-1 w-20 text-sm"
                            />
                          </td>

                          <td className="p-4 relative">
                            {product.inventoryTracking === 'NOT_TRACKED' ? (
                              <span className="text-gray-500 font-medium whitespace-nowrap">Unlimited</span>
                            ) : (
                              <>
                                <input
                                  type="number"
                                  value={editForm.stockQuantity}
                                  onChange={(e) => setEditForm({ ...editForm, stockQuantity: e.target.value })}
                                  className="border rounded p-1 w-20 text-center text-sm font-bold"
                                />
                              </>
                            )}
                          </td>

                          <td className="p-4">
                            <div className="flex gap-2">
                              <button onClick={handleSaveInline} disabled={isSaving} className="text-green-600 hover:text-green-800 p-1 disabled:opacity-30"><CheckCircle size={20} /></button>
                              <button onClick={handleCancelEdit} disabled={isSaving} className="text-red-500 hover:text-red-700 p-1"><X size={20} /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    const isHighlighted = highlightId && (product.id === highlightId || product.barcode === highlightId);
                    let highlightClass = "";
                    if (isHighlighted) {
                      switch (highlightStatus) {
                        case 'OVERDUE': highlightClass = "bg-red-50 ring-1 ring-red-200"; break;
                        case 'WARNING': highlightClass = "bg-orange-50 ring-1 ring-orange-200"; break;
                        default: highlightClass = "bg-green-50 ring-1 ring-green-200";
                      }
                    }

                    return (
                      <tr key={product.id} className={`border-t transition-colors ${isHighlighted ? highlightClass : (isSelected ? 'bg-blue-50' : 'hover:bg-gray-50')}`}>
                        <td className="p-4"><input type="checkbox" checked={isSelected} onChange={() => handleSelectProduct(product.id, product)} className="form-checkbox" /></td>
                        <td className="p-4">{((currentPage - 1) * itemsPerPage) + index + 1}</td>
                        <td className="p-4">
                          <div className="flex flex-col items-center gap-2">
                            {product.imageUrl ? (
                              <>
                                <img
                                  src={product.imageUrl}
                                  alt={product.name}
                                  className="w-12 h-12 object-cover rounded border cursor-pointer hover:opacity-80 transition-opacity"
                                  onClick={() => setLightboxImage(product.imageUrl!)}
                                />
                                <label className="text-[10px] text-blue-500 hover:text-blue-700 cursor-pointer text-center">
                                  {uploadingImageId === product.id ? 'Uploading...' : 'Change'}
                                  <input 
                                    type="file" 
                                    accept="image/*" 
                                    className="hidden" 
                                    onChange={(e) => {
                                      if (e.target.files && e.target.files[0]) {
                                        handleImageUpload(product.id, e.target.files[0]);
                                      }
                                    }}
                                  />
                                </label>
                              </>
                            ) : (
                              <label className="flex flex-col items-center justify-center w-12 h-12 bg-gray-100 border border-dashed rounded cursor-pointer hover:bg-gray-200 transition-colors">
                                {uploadingImageId === product.id ? (
                                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                  <>
                                    <ImageIcon size={16} className="text-gray-400" />
                                    <span className="text-[9px] text-gray-500 mt-1">Upload</span>
                                  </>
                                )}
                                <input 
                                  type="file" 
                                  accept="image/*" 
                                  className="hidden" 
                                  onChange={(e) => {
                                    if (e.target.files && e.target.files[0]) {
                                      handleImageUpload(product.id, e.target.files[0]);
                                    }
                                  }}
                                />
                              </label>
                            )}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="font-medium">{product.name}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-gray-500 font-mono">{product.barcode}</span>
                            {isSelected && (
                              <input
                                type="number"
                                value={selectedProducts[product.id].quantity}
                                onChange={(e) => handleBarcodeQuantityChange(product.id, parseInt(e.target.value, 10))}
                                className="border rounded p-1 w-16 text-xs text-center"
                                min="1"
                                title="Quantity for barcode printing"
                              />
                            )}
                          </div>
                        </td>
                        <td className="p-4">{product.category}</td>
                        <td className="p-4">₹{parseFloat((product.purchaseRate || 0).toFixed(2))}</td>
                        <td className="p-4">{parseFloat((Number(product.purchaseGst) || 0).toFixed(2))}%</td>
                        <td className="p-4">{(product.purchaseDisc || 0)}%</td>
                        <td className="p-4 font-bold">₹{parseFloat((product.price || 0).toFixed(2))}</td>
                        <td className="p-4 font-bold">
                          {product.inventoryTracking === 'NOT_TRACKED' ? (
                            <span className="text-green-600 font-normal whitespace-nowrap">{product.availabilityStatus === 'AVAILABLE' ? 'Unlimited' : 'Unavailable'}</span>
                          ) : (
                            product.stockQuantity
                          )}
                        </td>
                        {isAdmin && (
                          <td className="p-4 sticky right-0 bg-white border-l z-10 group-hover:bg-gray-50 transition-colors">
                            <div className="flex gap-3">
                              <button onClick={() => handleEditClick(product)} className="text-blue-600 hover:text-blue-800"><Pencil size={18} /></button>
                              <button onClick={() => handleDeleteProduct(product.id)} className="text-red-600 hover:text-red-800"><Trash2 size={18} /></button>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
            />
          </>
        )}
      </div>

      {isModalOpen && (<ProductFormModal product={editingProduct} categories={categories} vendors={globalVendors} onSave={handleSaveProduct} onClose={handleCloseModal} defaultGst={defaultGst} isSaving={isSaving} />)}

      {isCategoryModalOpen && (<CategoryModal categories={categories} onAddOrUpdate={handleAddOrUpdateCategory} onDeleteSuccess={fetchCategories} onClose={() => setCategoryModalOpen(false)} />)}
      
      {/* Lightbox Modal */}
      {lightboxImage && (
        <div 
          className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full h-full flex items-center justify-center">
            <button 
              className="absolute top-4 right-4 text-white hover:text-gray-300 p-2 bg-black/50 rounded-full"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxImage(null);
              }}
            >
              <X size={24} />
            </button>
            <img 
              src={lightboxImage} 
              alt="Preview" 
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {isMultiAddModalOpen && (<MultiProductFormModal vendors={globalVendors} categories={categories} onSave={handleSaveMultipleProducts} onClose={() => setIsMultiAddModalOpen(false)} defaultGst={defaultGst} shopName={shopName} isSaving={isLoading} />)}

      {isSaving && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white p-8 rounded-xl shadow-2xl flex flex-col items-center animate-in fade-in zoom-in duration-300">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mb-4"></div>
            <p className="text-base font-semibold text-gray-800">Processing Update...</p>
          </div>
        </div>
      )}

      {/* Upload Results Modal */}
      {uploadResults && uploadResults.isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 text-white flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <CheckCircle2 size={24} /> Upload Completion Summary
                </h2>
                <p className="text-blue-100 text-sm mt-1">ERP-Level Sync Results</p>
              </div>
              <button onClick={() => setUploadResults(null)} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>

            <div className="p-8">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mb-8">
                <ResultCard icon={<RefreshCw className="text-blue-500" />} label="Total Rows" value={uploadResults.total} />
                <ResultCard icon={<CheckCircle2 className="text-green-500" />} label="Success" value={uploadResults.success} />
                <ResultCard icon={<AlertCircle className="text-red-500" />} label="Failed" value={uploadResults.failed} color="text-red-600" />
                <ResultCard icon={<UserPlus className="text-purple-500" />} label="New Suppliers" value={uploadResults.newSuppliers} />
                <ResultCard icon={<UserCheck className="text-teal-500" />} label="Mapped Suppliers" value={uploadResults.mappedSuppliers} />
                <ResultCard icon={<DollarSign className="text-orange-500" />} label="Total Credit Added" value={`₹${uploadResults.totalCredit.toLocaleString()}`} />
              </div>

              {uploadResults.errors.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                    <AlertCircle size={16} className="text-red-500" /> Improvement Areas / Errors ({uploadResults.errors.length})
                  </h3>
                  <div className="bg-red-50 border border-red-100 rounded-xl p-4 max-h-48 overflow-y-auto">
                    <ul className="space-y-2">
                      {uploadResults.errors.slice(0, 10).map((err, i) => (
                        <li key={i} className="text-xs text-red-700 flex gap-2">
                          <span className="shrink-0">•</span> {err}
                        </li>
                      ))}
                      {uploadResults.errors.length > 10 && (
                        <li className="text-xs text-red-500 font-medium italic">
                          ... and {uploadResults.errors.length - 10} more errors.
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              )}

              <div className="mt-8 flex justify-end">
                <button
                  onClick={() => setUploadResults(null)}
                  className="px-5 py-2 text-sm bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg hover:shadow-xl active:scale-95"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};



const ProductFormModal = ({ product, categories, vendors, onSave, onClose, defaultGst, isSaving }: { product: Product | null; categories: string[]; vendors: Vendor[]; onSave: (p: any, file?: File | null) => void; onClose: () => void; defaultGst: number; isSaving?: boolean; }) => {
  const [formData, setFormData] = useState({
    id: product?.id || null, name: product?.name || '', category: product?.category || categories[0] || '',
    brand: product?.brand || '',
    sku: product?.sku || '',
    series: product?.series || '',
    purchaseRate: product?.purchaseRate || 0, purchaseGst: product?.purchaseGst ?? defaultGst,
    purchaseDisc: product?.purchaseDisc || 0,
    price: product?.price || 0,
    mrp: product?.mrp || 0,
    discount: product?.discount || 0, stockQuantity: product?.stockQuantity || 0,
    vendorId: product?.vendorId || (vendors[0]?.id || ''), vendorName: product?.vendorName || (vendors[0]?.name || ''),
    vendorNickname: product?.vendorNickname || (vendors[0]?.nickname || vendors[0]?.name || ''),
    barcode: product?.barcode || '',
    batchNumber: product?.batchNumber || '',
    expiryDate: product?.expiryDate || '',
    unit: product?.unit || '',
    createdAt: product?.createdAt || new Date().toISOString().split('T')[0],
    availabilityStatus: product?.availabilityStatus || 'AVAILABLE',
    inventoryTracking: product?.inventoryTracking || 'NOT_TRACKED'
  });
  
  const [imageFile, setImageFile] = useState<File | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const supplierRef = useRef<HTMLSelectElement>(null);
  const purchaseRateRef = useRef<HTMLInputElement>(null);
  const sellingPriceRef = useRef<HTMLInputElement>(null);
  const stockRef = useRef<HTMLInputElement>(null);
  const gstRef = useRef<HTMLInputElement>(null);
  const purchaseDiscRef = useRef<HTMLInputElement>(null);
  const discountRef = useRef<HTMLInputElement>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);

  const handleEnter = (e: React.KeyboardEvent, nextRef: React.RefObject<any>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      nextRef.current?.focus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const purchaseRate = parseFloat(formData.purchaseRate as any);
    const price = parseFloat(formData.price as any);
    const stockQuantity = parseInt(formData.stockQuantity as any, 10);

    if (price < purchaseRate) {
      toast.error("Selling Price cannot be less than the Purchase Rate.");
      return;
    }

    if (purchaseRate <= 0) { toast.error("Purchase Rate must be greater than 0."); return; }
    if (price <= 0) { toast.error("Selling Price must be greater than 0."); return; }
    if (formData.inventoryTracking === 'TRACKED' && stockQuantity <= 0) { toast.error("Stock Quantity must be greater than 0 when tracking inventory."); return; }

    // Auto-detect systemType by prefix if missing
    let resolvedSystemType = 'Retail';

    onSave({ ...formData, systemType: resolvedSystemType }, imageFile);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleVendorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedVendor = vendors.find((v) => v.id === e.target.value);
    if (selectedVendor) { setFormData((prev) => ({ ...prev, vendorId: selectedVendor.id, vendorName: selectedVendor.name, vendorNickname: selectedVendor.nickname || selectedVendor.name })); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6"><h2 className="text-2xl font-bold text-gray-800">{product ? 'Edit Product' : 'Add New Product'}</h2><button onClick={onClose}><X size={24} /></button></div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label>Product Name</label><input ref={nameRef} name="name" type="text" value={formData.name} onChange={handleChange} onKeyDown={(e) => handleEnter(e, categoryRef)} className="form-input mt-1" required /></div>
            <div><label>Brand</label><input name="brand" type="text" value={formData.brand || ''} onChange={handleChange} className="form-input mt-1" placeholder="e.g. L'Oreal" /></div>
            <div><label>SKU</label><input name="sku" type="text" value={formData.sku || ''} onChange={handleChange} className="form-input mt-1" /></div>
            <div><label>Category</label><select ref={categoryRef} name="category" value={formData.category} onChange={handleChange} onKeyDown={(e) => handleEnter(e, supplierRef)} className="form-input mt-1" required>{categories.map((c) => (<option key={c} value={c}>{c}</option>))}</select></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label>Supplier Name</label><select ref={supplierRef} name="vendorId" value={formData.vendorId} onChange={handleVendorChange} onKeyDown={(e) => handleEnter(e, purchaseRateRef)} className="form-input mt-1" required><option value="" disabled>-- Select a Supplier --</option>{vendors.map((v) => (<option key={v.id} value={v.id}>{v.name}</option>))}</select></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="flex items-center gap-1">
                Purchase Rate (₹)
              </label>
              <input ref={purchaseRateRef} name="purchaseRate" type="number" value={formData.purchaseRate} onChange={handleChange} onKeyDown={(e) => handleEnter(e, sellingPriceRef)} className="form-input mt-1" />
            </div>
            <div><label>Selling Price (₹)</label><input ref={sellingPriceRef} name="price" type="number" value={formData.price} onChange={handleChange} onKeyDown={(e) => handleEnter(e, stockRef)} className="form-input mt-1" /></div>
            <div className="flex flex-col gap-2">
              <label className="font-semibold text-gray-700">Availability & Inventory</label>
              <select name="availabilityStatus" value={formData.availabilityStatus} onChange={handleChange} className="form-input mt-1">
                <option value="AVAILABLE">Available</option>
                <option value="UNAVAILABLE">Unavailable</option>
                <option value="DISCONTINUED">Discontinued</option>
              </select>
              <select name="inventoryTracking" value={formData.inventoryTracking} onChange={handleChange} className="form-input mt-1">
                <option value="NOT_TRACKED">Unlimited (Don't track quantity)</option>
                <option value="TRACKED">Track quantity</option>
              </select>
            </div>
            
            {formData.inventoryTracking === 'TRACKED' && (
              <div>
                <label>Stock Quantity</label>
                <input ref={stockRef} name="stockQuantity" type="number" value={formData.stockQuantity} onChange={handleChange} onKeyDown={(e) => handleEnter(e, gstRef)} className="form-input mt-1" />
              </div>
            )}
            <div>
              <label>Product Image</label>
              <input 
                type="file" 
                accept="image/*" 
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setImageFile(e.target.files[0]);
                  }
                }}
                className="form-input mt-1" 
              />
              {imageFile && <p className="text-xs text-gray-500 mt-1">Selected: {imageFile.name}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label>Purchase GST (%)</label><input ref={gstRef} name="purchaseGst" type="number" value={formData.purchaseGst} onChange={handleChange} onKeyDown={(e) => handleEnter(e, purchaseDiscRef)} className="form-input mt-1" /></div>
            <div><label>Purchase Disc (%)</label><input ref={purchaseDiscRef} name="purchaseDisc" type="number" value={formData.purchaseDisc} onChange={handleChange} onKeyDown={(e) => handleEnter(e, discountRef)} className="form-input mt-1" /></div>
            <div><label>Discount (%)</label><input ref={discountRef} name="discount" type="number" value={formData.discount} onChange={handleChange} onKeyDown={(e) => handleEnter(e, barcodeRef)} className="form-input mt-1" /></div>
            {/* HSN Removed */}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label>Date</label><input name="createdAt" type="date" value={formData.createdAt?.split('T')[0]} onChange={handleChange} className="form-input mt-1" /></div>
            <div><label>Barcode</label><input ref={barcodeRef} name="barcode" type="text" value={formData.barcode} onChange={handleChange} className="form-input mt-1" /></div>
            <div><label>Batch No.</label><input name="batchNumber" type="text" value={formData.batchNumber || ''} onChange={handleChange} className="form-input mt-1" /></div>
            <div><label>Expiry Date</label><input name="expiryDate" type="date" value={formData.expiryDate || ''} onChange={handleChange} className="form-input mt-1" /></div>
            <div><label>Unit (ml/g/pcs)</label><input name="unit" type="text" value={formData.unit || ''} onChange={handleChange} className="form-input mt-1" /></div>
          </div>
          {formData.barcode && (
            <div className="p-4 bg-gray-50 rounded-md flex justify-center">
              <Barcode value={formData.barcode} height={50} />
            </div>
          )}
          <div className="flex justify-end gap-4 pt-4">
            <button type="button" onClick={onClose} disabled={isSaving} className="px-5 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={isSaving} className="px-5 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
              {isSaving ? "Saving..." : "Save Product"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

function CategoryModal({ categories, onAddOrUpdate, onDeleteSuccess, onClose }: { categories: string[]; onAddOrUpdate: (oldCat: string | null, newCat: string) => Promise<void>; onDeleteSuccess: () => Promise<void>; onClose: () => void; }) {
  const [newCategory, setNewCategory] = useState('');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [updatedCategory, setUpdatedCategory] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus input immediately when modal opens
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategory.trim()) return;
    setIsSaving(true);
    try {
      await onAddOrUpdate(null, newCategory.trim());
      setNewCategory('');
      setTimeout(() => inputRef.current?.focus(), 0);
    } catch (e) {
      // Handled by parent
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!updatedCategory.trim() || !editingCategory) return;
    setIsSaving(true);
    try {
      await onAddOrUpdate(editingCategory, updatedCategory.trim());
      setEditingCategory(null);
      setUpdatedCategory('');
    } catch (e) {
      // Handled by parent
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (categoryName: string) => {
    // Removed window.confirm as per user request
    setIsSaving(true);
    try {
      const res = await productApi.getCategories();
      const categoryObj = res.data.find((c: any) => (c.name === categoryName || c === categoryName));

      if (categoryObj && categoryObj.id) {
        await productApi.deleteCategory(categoryObj.id);
        toast.success("Category deleted");
        await onDeleteSuccess(); // Refresh categories in parent instead of reload
      } else {
        toast.error("Category ID not found.");
      }
    } catch (err: any) {
      toast.error("Failed to delete category");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-bold text-gray-800">Manage Categories</h2><button onClick={onClose}><X size={24} /></button></div>

        <form onSubmit={handleAdd} className="flex gap-2 mb-6">
          <input ref={inputRef} type="text" placeholder="New Category Name" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="form-input flex-grow" disabled={isSaving} />
          <button type="submit" disabled={isSaving || !newCategory.trim()} className="bg-green-600 text-white px-3 py-1.5 text-sm rounded-lg hover:bg-green-700 disabled:opacity-50">
            {isSaving ? "..." : <PlusCircle size={20} />}
          </button>
        </form>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {categories.map((cat) => (
            <div key={cat} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg group">
              {editingCategory === cat ? (
                <form onSubmit={handleUpdate} className="flex gap-2 flex-grow">
                  <input type="text" value={updatedCategory} onChange={(e) => setUpdatedCategory(e.target.value)} className="form-input flex-grow py-1" autoFocus disabled={isSaving} />
                  <button type="submit" disabled={isSaving} className="text-green-600 hover:text-green-800 p-1"><CheckCircle size={18} /></button>
                  <button type="button" onClick={() => setEditingCategory(null)} disabled={isSaving} className="text-red-500 hover:text-red-700 p-1"><X size={18} /></button>
                </form>
              ) : (
                <>
                  <span className="font-medium text-gray-700">{cat}</span>
                  <div className="flex gap-2 text-gray-400 transition-opacity">
                    <button onClick={() => { setEditingCategory(cat); setUpdatedCategory(cat); }} disabled={isSaving} className="text-blue-600 hover:text-blue-800 p-1 bg-blue-50 rounded"><Pencil size={16} /></button>
                    <button onClick={() => handleDelete(cat)} disabled={isSaving} className="text-red-600 hover:text-red-800 p-1 bg-red-50 rounded"><Trash2 size={16} /></button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Products;
