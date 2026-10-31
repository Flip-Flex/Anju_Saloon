import React from "react";
import { A5BillLayout } from "@/components/billing/A5BillLayout";

export const BillRenderer = React.forwardRef(({ data }: any, ref: any) => {
  return (
    <div ref={ref} className="print-container">
      <A5BillLayout data={data} />
    </div>
  );
});
