import { Router } from 'express';
const router = Router();

async function fetchAnthropicUsage() {
  const adminKey = process.env.ANTHROPIC_ADMIN_KEY;
  if (!adminKey) throw new Error('ANTHROPIC_ADMIN_KEY not set');

  const headers = {
    'x-api-key': adminKey,
    'anthropic-version': '2023-06-01',
  };

  // Get organization
  const orgRes = await fetch('https://api.anthropic.com/v1/organizations', { headers });
  if (!orgRes.ok) throw new Error(`Org API ${orgRes.status}: ${await orgRes.text()}`);
  const orgData = await orgRes.json();
  const org = orgData.data?.[0];
  if (!org) throw new Error('No organization found');

  // Get API keys (includes cost per key)
  const keysRes = await fetch(
    `https://api.anthropic.com/v1/organizations/${org.id}/api_keys`,
    { headers }
  );
  if (!keysRes.ok) throw new Error(`Keys API ${keysRes.status}: ${await keysRes.text()}`);
  const keysData = await keysRes.json();

  let totalSpent = 0;
  for (const key of keysData.data || []) {
    totalSpent += parseFloat(key.cost || key.total_cost || key.usage_usd || 0);
  }

  return { spent: totalSpent, total: 5.0 };
}

async function fetchOpenAIUsage() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const now = new Date();
  const startDate = `${now.getFullYear()}-01-01`;
  const endDate = now.toISOString().slice(0, 10);

  const res = await fetch(
    `https://api.openai.com/v1/dashboard/billing/usage?start_date=${startDate}&end_date=${endDate}`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );
  if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const spent = (data.total_usage || 0) / 100;

  return { spent, total: 5.0 };
}

router.get('/', async (req, res) => {
  const [claude, whisper] = await Promise.allSettled([
    fetchAnthropicUsage(),
    fetchOpenAIUsage(),
  ]);

  res.json({
    claude:
      claude.status === 'fulfilled'
        ? claude.value
        : { spent: 0, total: 5, error: claude.reason?.message },
    whisper:
      whisper.status === 'fulfilled'
        ? whisper.value
        : { spent: 0, total: 5, error: whisper.reason?.message },
  });
});

export default router;
