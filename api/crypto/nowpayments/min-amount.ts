import { mapToNowPaymentsCurrency, getMinDepositAmount } from '../../../src/utils/nowpaymentsServer';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { symbol, network } = req.query || {};
    const currency = mapToNowPaymentsCurrency(String(symbol || 'usdt'), String(network || ''));
    const minAmount = await getMinDepositAmount(currency);
    
    let minAmountUsd = minAmount;
    if (currency.startsWith('usdt') || currency.startsWith('usdc')) {
      minAmountUsd = minAmount;
    }

    return res.status(200).json({ currency, minAmount, minAmountUsd });
  } catch (err: any) {
    console.error('Error fetching min amount:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch min amount.' });
  }
}
