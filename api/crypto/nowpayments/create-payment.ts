import { db } from '../../../src/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { 
  createNowPayment, 
  ensureAdminAuth 
} from '../../../src/utils/nowpaymentsServer';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        // use as is
      }
    }

    const { coinSymbol, network, userId, userEmail } = body || {};
    const rawAmount = body?.amountUSD ?? body?.amountUsd;
    const numAmount = parseFloat(rawAmount);

    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'A valid deposit amount in USD is required.' });
    }
    if (!userId || !userEmail) {
      return res.status(400).json({ error: 'User credentials are required.' });
    }

    const host = req.headers?.['x-forwarded-host'] || req.headers?.host || 'morex.site';
    const proto = req.headers?.['x-forwarded-proto'] || 'https';
    const appBaseUrl = process.env.APP_URL || `${proto}://${host}`;
    const callbackUrl = `${appBaseUrl}/api/webhooks/nowpayments`;

    const payment = await createNowPayment({
      amountUSD: numAmount,
      coinSymbol: String(coinSymbol || 'USDT'),
      network: String(network || ''),
      userId,
      userEmail,
      callbackUrl
    });

    await ensureAdminAuth();

    // Record pending transaction in Firestore
    const txRef = await addDoc(collection(db, 'transactions'), {
      userId,
      userEmail,
      type: 'deposit_crypto',
      amount: numAmount,
      coinSymbol: String(coinSymbol || 'USDT').toUpperCase(),
      coinAmount: payment.payAmount,
      status: 'PENDING APPROVAL',
      createdAt: serverTimestamp(),
      network: payment.network,
      address: payment.payAddress,
      gateway: 'nowpayments',
      gatewayPaymentId: payment.paymentId,
      gatewayStatus: 'waiting',
      payAddress: payment.payAddress,
      paymentMessage: `NOWPayments Gateway: Waiting for ${payment.payAmount} ${payment.payCurrency.toUpperCase()} on ${payment.network}`
    });

    return res.status(200).json({
      success: true,
      transactionId: txRef.id,
      paymentId: payment.paymentId,
      payAddress: payment.payAddress,
      payAmount: payment.payAmount,
      payCurrency: payment.payCurrency,
      priceAmount: payment.priceAmount,
      priceCurrency: payment.priceCurrency,
      network: payment.network,
      gatewayStatus: 'waiting',
      payment
    });
  } catch (err: any) {
    console.error('Error creating NOWPayments session:', err);
    return res.status(500).json({ error: err.message || 'Failed to create gateway payment session.' });
  }
}
