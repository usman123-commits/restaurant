import { useState, useEffect } from 'react';
import { Save, Loader2, MessageSquare } from 'lucide-react';

function Spinner({ size = 16, className = '' }) {
  return <Loader2 size={size} className={`animate-spin-slow ${className}`} />;
}

export default function Settings() {
  const [settings, setSettings] = useState({
    systemPrompt: '',
    maxContextMessages: 50,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/settings', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) {
          setSettings({
            systemPrompt: data.systemPrompt || '',
            maxContextMessages: data.maxContextMessages || 50,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(settings),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { /* silent */ }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size={32} className="text-brand-500" />
      </div>
    );
  }

  const contextMarks = [10, 25, 50, 75, 100];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Settings</h2>

      {/* System Prompt */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <div className="mb-4">
          <h3 className="font-semibold text-gray-900">System Prompt</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            The instruction sent to Claude for every conversation
          </p>
        </div>

        <textarea
          value={settings.systemPrompt}
          onChange={(e) => setSettings({ ...settings, systemPrompt: e.target.value })}
          rows={10}
          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
          placeholder="Enter the system prompt for the bot..."
        />

        <p className="text-xs text-gray-400 mt-2">{settings.systemPrompt.length} characters</p>
      </div>

      {/* Context Messages */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
            <MessageSquare size={20} className="text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Message Context</h3>
            <p className="text-xs text-gray-500">
              How many previous messages the AI receives for context
            </p>
          </div>
        </div>

        <div className="px-2">
          <input
            type="range"
            min="10"
            max="100"
            step="5"
            value={settings.maxContextMessages}
            onChange={(e) => setSettings({ ...settings, maxContextMessages: parseInt(e.target.value, 10) })}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-500"
          />
          <div className="flex justify-between mt-2">
            {contextMarks.map((m) => (
              <button
                key={m}
                onClick={() => setSettings({ ...settings, maxContextMessages: m })}
                className={`text-xs px-2 py-1 rounded-md transition-colors ${
                  settings.maxContextMessages === m
                    ? 'bg-brand-500 text-white font-medium'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 p-3 bg-gray-50 rounded-lg flex items-center justify-between">
          <span className="text-sm text-gray-600">Current:</span>
          <span className="text-sm font-semibold text-gray-900">{settings.maxContextMessages} messages</span>
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={saveSettings}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          {saving ? (
            <>
              <Spinner size={14} className="text-white" />
              Saving...
            </>
          ) : saved ? (
            <>
              <Save size={14} />
              Saved!
            </>
          ) : (
            <>
              <Save size={14} />
              Save Settings
            </>
          )}
        </button>
      </div>
    </div>
  );
}
