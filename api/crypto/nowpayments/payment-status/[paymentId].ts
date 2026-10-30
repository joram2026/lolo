import { 
  getNowPaymentStatus, 
  processDepositAutoApproval 
} from '../../../../src/utils/nowpaymentsServer';

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
    const paymentId = req.query?.paymentId || (req.url?.split('/').pop()?.split('?')[0]);
    if (!paymentId || paymentId === '[paymentId]') {
      return res.status(400).json({ error: 'paymentId is required.' });
    }

    const paymentData = await getNowPaymentStatus(String(paymentId));
    const status = (paymentData.payment_status || '').toLowerCase();
    let autoApproved = false;

    if (['finished', 'confirmed', 'sending'].includes(status)) {
      try {
        const approvalResult = await processDepositAutoApproval(paymentData);
        autoApproved = approvalResult.success;
      } catch (approvalErr) {
        console.error('Error during auto-approval on status check:', approvalErr);
      }
    }

    return res.status(200).json({
      success: true,
      ...paymentData,
      payment: paymentData,
      autoApproved
    });
  } catch (err: any) {
    console.error('Error querying payment status:', err);
    return res.status(500).json({ error: err.message || 'Failed to query status.' });
  }
}
