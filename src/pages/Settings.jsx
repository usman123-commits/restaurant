import BotSettings from '../components/BotSettings';

// WhatsApp bot settings (payment message, delivery areas). The old n8n bot's system prompt and
// context size (botconfigs SYSTEM_PROMPT / MAX_CONTEXT_MESSAGES, still served by /api/settings)
// are not used by the current bot, so they are no longer shown.
export default function Settings() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
        <p className="text-sm text-gray-500 mt-1">What the WhatsApp bot tells customers about payment and delivery.</p>
      </div>
      <BotSettings />
    </div>
  );
}
