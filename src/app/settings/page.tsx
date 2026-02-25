'use client';

import { useEffect, useState } from 'react';
import AppShell from '@/components/ui/AppShell';

interface Settings {
  market_commentary_iht: string;
  market_commentary_non_iht: string;
  firm_name: string;
  signatory_name: string;
  signatory_title_iht: string;
  signatory_title_other: string;
  firm_rics_number: string;
  firm_email: string;
  firm_phone: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then(setSettings)
      .catch(() => setError('Failed to load settings'));
  }, []);

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setError('');
    setSaved(false);

    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });

    if (!res.ok) {
      setError('Failed to save settings');
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  }

  if (!settings) {
    return (
      <AppShell>
        <div className="text-center py-12 text-gray-500">Loading settings...</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
            <p className="text-gray-500 mt-1">Manage your market commentary and firm details</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-[#c49a6c] hover:bg-[#b3895d] text-white font-semibold rounded-lg transition disabled:opacity-50"
          >
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-lg">{error}</div>
        )}

        {/* Market Commentary */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
          <h2 className="text-lg font-semibold text-gray-900">Market Commentary</h2>
          <p className="text-sm text-gray-500">
            This text appears in Section 17 of every report. IHT reports exclude the Commercial Property paragraph.
            Update these when market conditions change.
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              IHT Reports (without Commercial Property paragraph)
            </label>
            <textarea
              value={settings.market_commentary_iht}
              onChange={(e) => setSettings({ ...settings, market_commentary_iht: e.target.value })}
              rows={16}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c49a6c] focus:border-transparent outline-none text-sm text-gray-900 leading-relaxed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Non-IHT Reports (with Commercial Property paragraph)
            </label>
            <textarea
              value={settings.market_commentary_non_iht}
              onChange={(e) => setSettings({ ...settings, market_commentary_non_iht: e.target.value })}
              rows={20}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c49a6c] focus:border-transparent outline-none text-sm text-gray-900 leading-relaxed"
            />
          </div>
        </div>

        {/* Firm Details */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Firm Details</h2>
          <p className="text-sm text-gray-500">These appear in the signature block and Appendix 1.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Firm Name</label>
              <input
                value={settings.firm_name}
                onChange={(e) => setSettings({ ...settings, firm_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c49a6c] focus:border-transparent outline-none text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Signatory Name</label>
              <input
                value={settings.signatory_name}
                onChange={(e) => setSettings({ ...settings, signatory_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c49a6c] focus:border-transparent outline-none text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title (IHT reports)</label>
              <input
                value={settings.signatory_title_iht}
                onChange={(e) => setSettings({ ...settings, signatory_title_iht: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c49a6c] focus:border-transparent outline-none text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title (other reports)</label>
              <textarea
                value={settings.signatory_title_other}
                onChange={(e) => setSettings({ ...settings, signatory_title_other: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c49a6c] focus:border-transparent outline-none text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">RICS Number</label>
              <input
                value={settings.firm_rics_number}
                onChange={(e) => setSettings({ ...settings, firm_rics_number: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c49a6c] focus:border-transparent outline-none text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                value={settings.firm_email}
                onChange={(e) => setSettings({ ...settings, firm_email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c49a6c] focus:border-transparent outline-none text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                value={settings.firm_phone}
                onChange={(e) => setSettings({ ...settings, firm_phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c49a6c] focus:border-transparent outline-none text-sm text-gray-900"
              />
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
