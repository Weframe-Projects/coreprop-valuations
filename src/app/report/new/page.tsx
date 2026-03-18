'use client';

import AppShell from '@/components/ui/AppShell';
import InspectionWizard from '@/components/inspection/InspectionWizard';

export default function NewReportPage() {
  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">New Valuation Report</h1>
        <p className="text-gray-500 text-sm">
          Enter property details and inspection notes to generate a report.
        </p>
      </div>
      <InspectionWizard />
    </AppShell>
  );
}
