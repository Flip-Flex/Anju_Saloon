import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { billingApi, Bill } from '@/lib/api';
import { Loader2, Download, Printer } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { toast } from 'react-hot-toast';
import { useReactToPrint } from 'react-to-print';
import { BillRenderer } from '@/components/BillRenderer';

const BillView = () => {
    const { id } = useParams<{ id: string }>();
    const [bill, setBill] = useState<Bill | null>(null);
    const [loading, setLoading] = useState(true);
    const printRef = useRef<HTMLDivElement>(null);

    const handlePrint = useReactToPrint({
        contentRef: printRef,
    });

    useEffect(() => {
        const fetchBill = async () => {
            try {
                if (!id) return;
                const res = await billingApi.getById(id.trim());
                if (res.data) {
                    setBill(res.data);
                } else {
                    toast.error("Bill not found");
                }
            } catch (error) {
                console.error("Error fetching bill", error);
                toast.error("Failed to load bill details");
            } finally {
                setLoading(false);
            }
        };
        fetchBill();
    }, [id]);

    const handleDownloadPdf = async () => {
        if (!printRef.current || !bill) return;
        try {
            const canvas = await html2canvas(printRef.current, {
                scale: 3,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a5'
            });

            const a5Width = 148;
            const imgHeight = (canvas.height * a5Width) / canvas.width;
            pdf.addImage(imgData, 'PNG', 0, 0, a5Width, Math.min(imgHeight, 210));
            pdf.save(`Bill_${bill.invoiceId || bill.id || 'A5'}.pdf`);
            toast.success("A5 Invoice downloaded!");
        } catch (error) {
            console.error("PDF generation failed", error);
            toast.error("Failed to generate PDF");
        }
    };

    if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin w-10 h-10 text-blue-600" /></div>;
    if (!bill) return <div className="h-screen flex items-center justify-center text-red-500 text-xl">Bill Not Found</div>;

    return (
        <div className="min-h-screen bg-gray-100 p-4 flex flex-col items-center">
            {/* Action Buttons */}
            <div className="mb-6 flex gap-4 no-print sticky top-4 z-10">
                <button onClick={handleDownloadPdf} className="bg-blue-600 text-white px-3 py-1.5 text-sm rounded-lg flex items-center gap-2 hover:bg-blue-700 shadow-lg font-semibold transition-all">
                    <Download size={20} /> Download A5 PDF
                </button>
                <button onClick={() => handlePrint()} className="bg-gray-800 text-white px-3 py-1.5 text-sm rounded-lg flex items-center gap-2 hover:bg-gray-900 shadow-lg font-semibold transition-all">
                    <Printer size={20} /> Print A5 Bill
                </button>
            </div>

            {/* Render the Shared Bill Component */}
            <BillRenderer ref={printRef} data={bill} />
            
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                }
            `}</style>
        </div>
    );
};

export default BillView;
