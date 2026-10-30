import { 
  verifyNowPaymentsSignature, 
  processDepositAutoApproval 
} from '../../src/utils/nowpaymentsServer';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
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

    const sig = (req.headers?.['x-nowpayments-sig'] || '') as string;
    const isVerified = verifyNowPaymentsSignature(body, sig);

    if (!isVerified) {
      console.warn('[NOWPayments Webhook] Signature verification failed for header:', sig);
      return res.status(401).send('Invalid signature');
    }

    console.log(`[NOWPayments Webhook] Received valid IPN for payment ${body?.payment_id}, status: ${body?.payment_status}`);
    await processDepositAutoApproval(body);

    return res.status(200).send('OK');
  } catch (err: any) {
    console.error('[NOWPayments Webhook] Processing error:', err);
    return res.status(500).send('Webhook handler error');
  }
}
