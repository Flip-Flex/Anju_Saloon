import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Save } from 'lucide-react';
import { useGlobalData } from '@/context/GlobalDataContext';
import { settingsApi } from '@/lib/api';

const Settings = () => {
  const { settings, refreshSettings, loading } = useGlobalData();

  const [shopName, setShopName] = useState("Anjus Beauty Saloon");
  const [gstNumber, setGstNumber] = useState('33ADFPN7561FL1ZK');
  const [billMessage, setBillMessage] = useState('Thank You For Your Purchasing');
  const [defaultGst, setDefaultGst] = useState('0');
  const [addressLine1, setAddressLine1] = useState("No. 12, Gandhi Road");
  const [addressLine2, setAddressLine2] = useState("Kanchipuram - 631501");
  const [contactNo, setContactNo] = useState("+91 99944 11111");
  const [bankName, setBankName] = useState("Axis Bank");
  const [accountNo, setAccountNo] = useState("921020012345678");
  const [ifscCode, setIfscCode] = useState("UTIB0001234");
  const [branchName, setBranchName] = useState("Kanchipuram Branch");
  
  // Loyalty Settings
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false);
  const [loyaltySpendRatio, setLoyaltySpendRatio] = useState(100);
  const [loyaltyRedeemValue, setLoyaltyRedeemValue] = useState(1);

  useEffect(() => {
    if (settings) {
      setShopName(settings.shopName || "Anjus Beauty Saloon");
      setGstNumber(settings.gstNumber || '33ADFPN7561FL1ZK');
      setBillMessage(settings.billMessage || 'Thank You For Your Purchasing');
      setDefaultGst(settings.defaultGst || '0');
      setAddressLine1(settings.addressLine1 || "No. 12, Gandhi Road");
      setAddressLine2(settings.addressLine2 || "Kanchipuram - 631501");
      setContactNo(settings.contactNo || "+91 99944 11111");
      setBankName(settings.bankName || "Axis Bank");
      setAccountNo(settings.accountNo || "921020012345678");
      setIfscCode(settings.ifscCode || "UTIB0001234");
      setBranchName(settings.branchName || "Kanchipuram Branch");
      setLoyaltyEnabled(settings.loyaltyEnabled || false);
      setLoyaltySpendRatio(settings.loyaltySpendRatio || 100);
      setLoyaltyRedeemValue(settings.loyaltyRedeemValue || 1);
    }
  }, [settings]);

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await settingsApi.update({
        shopName,
        gstNumber,
        billMessage,
        defaultGst,
        addressLine1,
        addressLine2,
        contactNo,
        bankName,
        accountNo,
        ifscCode,
        branchName,
        loyaltyEnabled,
        loyaltySpendRatio,
        loyaltyRedeemValue
      });
      await refreshSettings();
      toast.success("Settings Saved Globally!");
    } catch (e) {
      toast.error("Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) return <div className="p-6">Loading settings...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">Settings</h1>
      <div className="bg-white p-6 rounded-lg shadow-sm">
        <div className="space-y-6 max-w-xl">

          <div>
            <h2 className="text-lg font-bold text-gray-800 mb-3 border-b pb-2">Salon Profile & Invoice Details</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="shopName" className="font-medium text-gray-700 text-sm">Shop / Salon Name</label>
                <input
                  id="shopName"
                  type="text"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  className="form-input mt-1 w-full"
                />
              </div>

              <div>
                <label htmlFor="addressLine1" className="font-medium text-gray-700 text-sm">Address Line 1</label>
                <input
                  id="addressLine1"
                  type="text"
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                  className="form-input mt-1 w-full"
                />
              </div>

              <div>
                <label htmlFor="addressLine2" className="font-medium text-gray-700 text-sm">Address Line 2 (City, State, Pincode)</label>
                <input
                  id="addressLine2"
                  type="text"
                  value={addressLine2}
                  onChange={(e) => setAddressLine2(e.target.value)}
                  className="form-input mt-1 w-full"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="contactNo" className="font-medium text-gray-700 text-sm">Contact Number</label>
                  <input
                    id="contactNo"
                    type="text"
                    value={contactNo}
                    onChange={(e) => setContactNo(e.target.value)}
                    className="form-input mt-1 w-full"
                  />
                </div>

                <div>
                  <label htmlFor="gstNumber" className="font-medium text-gray-700 text-sm">GSTIN</label>
                  <input
                    id="gstNumber"
                    type="text"
                    value={gstNumber}
                    onChange={(e) => setGstNumber(e.target.value)}
                    className="form-input mt-1 w-full"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="billMessage" className="font-medium text-gray-700 text-sm">Invoice Footer Message</label>
                  <input
                    id="billMessage"
                    type="text"
                    value={billMessage}
                    onChange={e => setBillMessage(e.target.value)}
                    className="form-input mt-1 w-full"
                  />
                </div>

                <div>
                  <label htmlFor="defaultGst" className="font-medium text-gray-700 text-sm">Default GST (%)</label>
                  <input
                    id="defaultGst"
                    type="number"
                    value={defaultGst}
                    onChange={e => setDefaultGst(e.target.value)}
                    className="form-input mt-1 w-full"
                  />
                </div>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-bold text-gray-800 mb-3 border-b pb-2">Bank & Payment Details (Printed on Invoice)</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="bankName" className="font-medium text-gray-700 text-sm">Bank Name</label>
                  <input
                    id="bankName"
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="form-input mt-1 w-full"
                  />
                </div>

                <div>
                  <label htmlFor="branchName" className="font-medium text-gray-700 text-sm">Branch</label>
                  <input
                    id="branchName"
                    type="text"
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                    className="form-input mt-1 w-full"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="accountNo" className="font-medium text-gray-700 text-sm">Account Number</label>
                  <input
                    id="accountNo"
                    type="text"
                    value={accountNo}
                    onChange={(e) => setAccountNo(e.target.value)}
                    className="form-input mt-1 w-full"
                  />
                </div>

                <div>
                  <label htmlFor="ifscCode" className="font-medium text-gray-700 text-sm">IFSC Code</label>
                  <input
                    id="ifscCode"
                    type="text"
                    value={ifscCode}
                    onChange={(e) => setIfscCode(e.target.value)}
                    className="form-input mt-1 w-full"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Loyalty Program</h2>
            
            <div className="flex items-center gap-3 mb-4">
              <input 
                type="checkbox" 
                id="loyaltyEnabled"
                checked={loyaltyEnabled}
                onChange={(e) => setLoyaltyEnabled(e.target.checked)}
                className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="loyaltyEnabled" className="font-medium text-gray-700 cursor-pointer">
                Enable Loyalty Program
              </label>
            </div>
            
            {loyaltyEnabled && (
              <div className="space-y-4 ml-8 p-4 bg-gray-50 rounded-lg border">
                <div>
                  <label htmlFor="spendRatio" className="font-medium text-gray-700 block text-sm mb-1">
                    Points Earning Rule
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">Earn 1 point for every ₹</span>
                    <input
                      id="spendRatio"
                      type="number"
                      min="1"
                      value={loyaltySpendRatio}
                      onChange={e => setLoyaltySpendRatio(Number(e.target.value))}
                      className="form-input w-24 py-1"
                    />
                    <span className="text-gray-500">spent</span>
                  </div>
                </div>
                
                <div>
                  <label htmlFor="redeemValue" className="font-medium text-gray-700 block text-sm mb-1">
                    Points Redemption Value
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">1 point = ₹</span>
                    <input
                      id="redeemValue"
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={loyaltyRedeemValue}
                      onChange={e => setLoyaltyRedeemValue(Number(e.target.value))}
                      className="form-input w-24 py-1"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="pt-2">
            <button disabled={isSaving} onClick={handleSave} className="px-6 py-2 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600 flex items-center gap-2 disabled:opacity-50">
              <Save size={18} /> {isSaving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
