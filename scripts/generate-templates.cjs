const XLSX = require('xlsx');
const path = require('path');

const templateData = [
  {
    'Supplier Name': "L'Oreal Professional India",
    'Date': new Date().toISOString().split('T')[0],
    'Product Name': 'Mythic Oil Nourishing Serum 100ml',
    'Product Type': 'RETAIL',
    'Purchase Price': 650.00,
    'Selling Price': 950.00,
    'Stock Quantity': 24,
    'Unlimited Stock': 'N',
    'Category': 'Hair Care',
    'GST %': 18,
    'Supplier Contact': '9876543210',
    'Supplier Address': 'Mumbai, Maharashtra',
    'Supplier GST': '27AAAAA0000A1Z5',
    'Supplier Nickname': 'LOreal Direct',
    'Product ID': 'PROD-101'
  },
  {
    'Supplier Name': 'Schwarzkopf Professional',
    'Date': new Date().toISOString().split('T')[0],
    'Product Name': 'BC Bonacure Peptide Repair Shampoo 250ml',
    'Product Type': 'RETAIL',
    'Purchase Price': 480.00,
    'Selling Price': 750.00,
    'Stock Quantity': 15,
    'Unlimited Stock': 'N',
    'Category': 'Hair Care',
    'GST %': 18,
    'Supplier Contact': '9876543211',
    'Supplier Address': 'Bengaluru, Karnataka',
    'Supplier GST': '29BBBBB0000B1Z6',
    'Supplier Nickname': 'Schwarzkopf',
    'Product ID': 'PROD-102'
  },
  {
    'Supplier Name': 'Matrix Biolage',
    'Date': new Date().toISOString().split('T')[0],
    'Product Name': 'Biolage Smoothproof Hair Conditioner 196g',
    'Product Type': 'RETAIL',
    'Purchase Price': 340.00,
    'Selling Price': 490.00,
    'Stock Quantity': 30,
    'Unlimited Stock': 'N',
    'Category': 'Hair Care',
    'GST %': 18,
    'Supplier Contact': '9876543212',
    'Supplier Address': 'Chennai, Tamil Nadu',
    'Supplier GST': '33CCCCC0000C1Z7',
    'Supplier Nickname': 'Matrix Dist',
    'Product ID': 'PROD-103'
  }
];

const ws = XLSX.utils.json_to_sheet(templateData);
ws['!cols'] = [
  { wch: 28 },
  { wch: 14 },
  { wch: 44 },
  { wch: 14 },
  { wch: 15 },
  { wch: 15 },
  { wch: 15 },
  { wch: 16 },
  { wch: 18 },
  { wch: 10 },
  { wch: 18 },
  { wch: 25 },
  { wch: 18 },
  { wch: 18 },
  { wch: 14 }
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Product Template');

const projectRoot = path.resolve(__dirname, '..');
const xlsxPath = path.join(projectRoot, 'public', 'products_upload_template.xlsx');
const csvPath = path.join(projectRoot, 'public', 'products_upload_template.csv');

XLSX.writeFile(wb, xlsxPath);
XLSX.writeFile(wb, csvPath, { bookType: 'csv' });
console.log('Generated:', xlsxPath);
console.log('Generated:', csvPath);
