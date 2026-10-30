import crypto from 'crypto';
import { db, auth } from '../firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { 
  collection, doc, getDoc, getDocs, query, where, 
  runTransaction, serverTimestamp, setDoc, addDoc 
} from 'firebase/firestore';
import { ReferralDepositConfig, Transaction } from '../types';

export const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY || "Y2JWQCH-XY44N6E-Q0CD9AG-R214WNN";
export const NOWPAYMENTS_IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET || "sDyZF8qp3NGAdlv5kMv+88mAf5DrtEmH";
export const NOWPAYMENTS_BASE_URL = "https://api.nowpayments.io/v1";

/**
 * Maps app coin symbol & network into NOWPayments supported currency code
 */
export function mapToNowPaymentsCurrency(symbol: string, network?: string): string {
  const s = (symbol || '').toLowerCase().trim();
  const n = (network || '').toUpperCase().trim();

  if (s === 'usdt') {
    if (n.includes('TRC20') || n.includes('TRON') || n === 'TRX') return 'usdttrc20';
    if (n.includes('BEP20') || n.includes('BSC') || n.includes('BINANCE')) return 'usdtbsc';
    if (n.includes('ERC20') || n.includes('ETH') || n.includes('ETHEREUM')) return 'usdterc20';
    if (n.includes('SOL') || n.includes('SOLANA')) return 'usdtsol';
    if (n.includes('POLYGON') || n.includes('MATIC')) return 'usdtmatic';
    if (n.includes('ARBITRUM') || n.includes('ARB')) return 'usdtarb';
    if (n.includes('OPTIMISM') || n.includes('OP')) return 'usdtop';
    if (n.includes('TON')) return 'usdtton';
    return 'usdtbsc'; // Low fee default
  }

  if (s === 'usdc') {
    if (n.includes('BEP20') || n.includes('BSC')) return 'usdcbsc';
    if (n.includes('SOL') || n.includes('SOLANA')) return 'usdcsol';
    if (n.includes('POLYGON') || n.includes('MATIC')) return 'usdcmatic';
    if (n.includes('ARBITRUM') || n.includes('ARB')) return 'usdcarb';
    if (n.includes('OPTIMISM') || n.includes('OP')) return 'usdcop';
    return 'usdc';
  }

  if (s === 'btc') {
    if (n.includes('BEP20') || n.includes('BSC')) return 'btcbsc';
    if (n.includes('LIGHTNING')) return 'btclightning';
    return 'btc';
  }

  if (s === 'eth') {
    if (n.includes('BEP20') || n.includes('BSC')) return 'ethbsc';
    if (n.includes('ARBITRUM') || n.includes('ARB')) return 'etharb';
    if (n.includes('OPTIMISM') || n.includes('OP')) return 'ethop';
    return 'eth';
  }

  if (s === 'bnb') return 'bnbbsc';
  if (s === 'trx') return 'trx';
  if (s === 'sol') return 'sol';
  if (s === 'ltc') return 'ltc';
  if (s === 'ton') return 'ton';
  if (s === 'doge') return 'doge';
  if (s === 'xrp') return 'xrp';

  return s;
}

/**
 * Ensures backend is authenticated as an admin user to execute atomic transactions
 */
let adminAuthPromise: Promise<any> | null = null;
export async function ensureAdminAuth() {
  if (auth.currentUser && (auth.currentUser.email === 'love@gmail.com' || auth.currentUser.email === 'admin@admin.com')) {
    return auth.currentUser;
  }
  if (!adminAuthPromise) {
    const cleanEmail = "love@gmail.com".replace(/[^a-z0-9]/g, "");
    const password = `LoloAuth_${cleanEmail}_Secure123!`;
    adminAuthPromise = signInWithEmailAndPassword(auth, "love@gmail.com", password)
      .then(cred => cred.user)
      .catch(err => {
        console.error("[NOWPayments] Admin authentication failed:", err);
        adminAuthPromise = null;
        throw err;
      });
  }
  return adminAuthPromise;
}

/**
 * Queries NOWPayments for the minimum required deposit for a given currency
 */
export async function getMinDepositAmount(currency: string): Promise<number> {
  try {
    const res = await fetch(`${NOWPAYMENTS_BASE_URL}/min-amount?currency_from=${currency}&currency_to=${currency}`, {
      headers: {
        'x-api-key': NOWPAYMENTS_API_KEY
      }
    });
    if (res.ok) {
      const data = await res.json();
      return typeof data.min_amount === 'number' ? data.min_amount : parseFloat(data.min_amount) || 0;
    }
  } catch (err) {
    console.warn(`[NOWPayments] Failed to fetch min amount for ${currency}:`, err);
  }
  return 0;
}

/**
 * Creates a new deposit payment on NOWPayments
 */
export interface CreatePaymentParams {
  amountUSD: number;
  coinSymbol: string;
  network: string;
  userId: string;
  userEmail: string;
  callbackUrl?: string;
}

export async function createNowPayment(params: CreatePaymentParams) {
  const payCurrency = mapToNowPaymentsCurrency(params.coinSymbol, params.network);
  const orderId = `MOREX-DEP-${params.userId.slice(0, 6)}-${Date.now()}`;

  const payload: any = {
    price_amount: params.amountUSD,
    price_currency: "usd",
    pay_currency: payCurrency,
    order_id: orderId,
    order_description: `Morex Deposit - ${params.userEmail} ($${params.amountUSD.toFixed(2)} USD)`
  };

  if (params.callbackUrl) {
    payload.ipn_callback_url = params.callbackUrl;
  }

  const res = await fetch(`${NOWPAYMENTS_BASE_URL}/payment`, {
    method: 'POST',
    headers: {
      'x-api-key': NOWPAYMENTS_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error(`[NOWPayments] Payment creation failed (${res.status}):`, errorBody);
    let parsedMsg = "Failed to create payment session with gateway.";
    try {
      const parsed = JSON.parse(errorBody);
      if (parsed.message) parsedMsg = parsed.message;
    } catch {}
    throw new Error(parsedMsg);
  }

  const paymentData = await res.json();
  return {
    paymentId: String(paymentData.payment_id),
    payAddress: paymentData.pay_address,
    payAmount: paymentData.pay_amount,
    payCurrency: paymentData.pay_currency,
    priceAmount: paymentData.price_amount,
    priceCurrency: paymentData.price_currency,
    orderId: paymentData.order_id,
    network: paymentData.network || params.network,
    createdAt: paymentData.created_at,
    validUntil: paymentData.valid_until
  };
}

/**
 * Fetches the live status of a payment from NOWPayments
 */
export async function getNowPaymentStatus(paymentId: string) {
  const res = await fetch(`${NOWPAYMENTS_BASE_URL}/payment/${paymentId}`, {
    headers: {
      'x-api-key': NOWPAYMENTS_API_KEY
    }
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to query payment status (${res.status}): ${errText}`);
  }

  return await res.json();
}

/**
 * Verifies NOWPayments IPN signature using HMAC-SHA512
 */
export function verifyNowPaymentsSignature(body: any, receivedSig: string, ipnSecret = NOWPAYMENTS_IPN_SECRET): boolean {
  if (!receivedSig || !ipnSecret) return false;
  try {
    function sortObject(obj: any): any {
      if (typeof obj !== 'object' || obj === null) return obj;
      if (Array.isArray(obj)) return obj.map(sortObject);
      return Object.keys(obj)
        .sort()
        .reduce((result: any, key: string) => {
          result[key] = sortObject(obj[key]);
          return result;
        }, {});
    }

    const sorted = sortObject(body);
    const jsonStr = JSON.stringify(sorted);
    const hmac = crypto.createHmac('sha512', ipnSecret);
    hmac.update(jsonStr);
    const calculated = hmac.digest('hex');

    return calculated.toLowerCase() === receivedSig.toLowerCase();
  } catch (err) {
    console.error("[NOWPayments] Signature verification error:", err);
    return false;
  }
}

/**
 * Processes automated approval and balance crediting for a confirmed payment
 * Idempotent: safe to run multiple times without double-crediting
 */
export async function processDepositAutoApproval(paymentData: any) {
  await ensureAdminAuth();

  const paymentId = String(paymentData.payment_id || paymentData.paymentId || '');
  const orderId = String(paymentData.order_id || paymentData.orderId || '');
  const status = (paymentData.payment_status || paymentData.status || '').toLowerCase();

  // Accept finished, sending, or confirmed
  const isApprovedStatus = ['finished', 'confirmed', 'sending'].includes(status);
  if (!isApprovedStatus) {
    console.log(`[NOWPayments] Payment ${paymentId} status is '${status}', not crediting yet.`);
    return { success: false, reason: `Status '${status}' is not a completed status.` };
  }

  // 1. Locate the transaction document in Firestore
  let targetTxDoc: any = null;
  const txCol = collection(db, 'transactions');

  if (paymentId) {
    const q = query(txCol, where('gatewayPaymentId', '==', paymentId));
    const snap = await getDocs(q);
    if (!snap.empty) {
      targetTxDoc = snap.docs[0];
    }
  }

  if (!targetTxDoc && orderId) {
    const q2 = query(txCol, where('id', '==', orderId));
    const snap2 = await getDocs(q2);
    if (!snap2.empty) {
      targetTxDoc = snap2.docs[0];
    }
  }

  if (!targetTxDoc) {
    console.warn(`[NOWPayments] No transaction record found for payment ${paymentId} / order ${orderId}`);
    return { success: false, reason: 'Transaction document not found.' };
  }

  const existingTx = targetTxDoc.data() as Transaction;
  if (existingTx.status === 'APPROVED') {
    console.log(`[NOWPayments] Transaction ${targetTxDoc.id} is already APPROVED. Skipping.`);
    return { success: true, message: 'Already approved.' };
  }

  const txId = targetTxDoc.id;
  const userId = existingTx.userId;

  // 2. Run atomic transaction to credit balance & referral bonuses
  await runTransaction(db, async (t) => {
    const txRef = doc(db, 'transactions', txId);
    const userRef = doc(db, 'users', userId);

    const userSnap = await t.get(userRef);
    if (!userSnap.exists()) {
      throw new Error(`User account ${userId} not found.`);
    }

    const userData = userSnap.data();
    const isFirstDeposit = !userData.hasMadeFirstDeposit;

    // Read referral deposit configuration
    let config: ReferralDepositConfig | null = null;
    const configDocRef = doc(db, 'settings', 'referral_deposit_config');
    const configSnap = await t.get(configDocRef);
    if (configSnap.exists()) {
      config = configSnap.data() as ReferralDepositConfig;
    }

    // Read referrer data if applicable
    let referrerUid: string | null = null;
    let referrerRef: any = null;
    let referrerData: any = null;

    if (isFirstDeposit && userData.referralSource && userData.referralSource.trim().length > 0) {
      const refCodeStr = userData.referralSource.trim().toUpperCase();
      const refMappingRef = doc(db, 'referralCodes', refCodeStr);
      const refMappingSnap = await t.get(refMappingRef);

      if (refMappingSnap.exists()) {
        const mappedUid = refMappingSnap.data().uid;
        if (mappedUid && mappedUid !== userId) {
          const rRef = doc(db, 'users', mappedUid);
          const rSnap = await t.get(rRef);
          if (rSnap.exists()) {
            referrerUid = mappedUid;
            referrerRef = rRef;
            referrerData = rSnap.data();
          }
        }
      }
    }

    // Computations
    const currentBalance = typeof userData.balance === 'number' ? userData.balance : (typeof userData.usdtBalance === 'number' ? userData.usdtBalance : 0);
    const currentHoldings: Record<string, number> = userData.holdings || {};

    const coinSymbol = existingTx.coinSymbol ? existingTx.coinSymbol.toUpperCase() : 'USDT';
    const depositAmountUSD = existingTx.amount || paymentData.price_amount || 0;
    const coinAmount = existingTx.coinAmount || paymentData.pay_amount || depositAmountUSD;

    let updatedBalance = currentBalance;
    let updatedHoldings: Record<string, number> | null = null;

    if (coinSymbol === 'USDT' || !existingTx.coinSymbol) {
      // Credit USD/USDT balance
      updatedBalance = parseFloat((currentBalance + depositAmountUSD).toFixed(2));
    } else {
      // Specific crypto holdings
      const curCoin = currentHoldings[coinSymbol] || 0;
      const newCoin = parseFloat((curCoin + coinAmount).toFixed(8));
      updatedHoldings = {
        ...currentHoldings,
        [coinSymbol]: newCoin
      };
    }

    // Process Referral Bonus & Commissions for First Deposit
    if (isFirstDeposit && config && config.enabled && depositAmountUSD >= (config.minDepositThresholdUSD || 0)) {
      let referrerPct = 0;
      let refereePct = 0;

      if (config.tiers && config.tiers.length > 0) {
        const matchedTier = config.tiers.find(
          tier => depositAmountUSD >= tier.minAmount && depositAmountUSD <= tier.maxAmount
        );
        if (matchedTier) {
          referrerPct = matchedTier.referrerPercent;
          refereePct = matchedTier.refereePercent;
        }
      }

      // 1. Referee Welcome Bonus
      const welcomeBonusAmount = parseFloat(((depositAmountUSD * refereePct) / 100).toFixed(2));
      if (welcomeBonusAmount > 0) {
        updatedBalance = parseFloat((updatedBalance + welcomeBonusAmount).toFixed(2));

        const welcomeTxRef = doc(collection(db, 'transactions'));
        t.set(welcomeTxRef, {
          id: welcomeTxRef.id,
          userId: existingTx.userId,
          userEmail: existingTx.userEmail,
          type: 'welcome_bonus',
          amount: welcomeBonusAmount,
          status: 'APPROVED',
          createdAt: serverTimestamp(),
          paymentMessage: `First Deposit Welcome Bonus (${refereePct}% of $${depositAmountUSD.toFixed(2)} deposit)`
        });
      }

      // 2. Referrer First Deposit Commission & 24h Extra Signal Pass
      if (referrerUid && referrerRef && referrerData) {
        const commissionAmount = parseFloat(((depositAmountUSD * referrerPct) / 100).toFixed(2));

        const nowMs = Date.now();
        let baseExpiryMs = nowMs;
        if (referrerData.extraSignalPassUntil) {
          const existingPassMs = referrerData.extraSignalPassUntil.seconds
            ? referrerData.extraSignalPassUntil.seconds * 1000
            : referrerData.extraSignalPassUntil.toMillis
            ? referrerData.extraSignalPassUntil.toMillis()
            : new Date(referrerData.extraSignalPassUntil).getTime();
          if (existingPassMs > nowMs) {
            baseExpiryMs = existingPassMs;
          }
        }
        const newExpiryDate = new Date(baseExpiryMs + (24 * 60 * 60 * 1000));
        const referrerUpdates: any = {
          extraSignalPassUntil: newExpiryDate
        };

        if (commissionAmount > 0) {
          const currentRefBal = typeof referrerData.balance === 'number' ? referrerData.balance : (referrerData.usdtBalance || 0);
          const newReferrerBalance = parseFloat((currentRefBal + commissionAmount).toFixed(2));
          referrerUpdates.balance = newReferrerBalance;
          referrerUpdates.usdtBalance = newReferrerBalance;

          const commissionTxRef = doc(collection(db, 'transactions'));
          t.set(commissionTxRef, {
            id: commissionTxRef.id,
            userId: referrerUid,
            userEmail: referrerData.email || 'Referrer',
            type: 'first_deposit_commission',
            amount: commissionAmount,
            status: 'APPROVED',
            createdAt: serverTimestamp(),
            paymentMessage: `Referral First Deposit Bonus (${referrerPct}% of $${depositAmountUSD.toFixed(2)} deposit by ${existingTx.userEmail}) + 24h Extra Signal Pass`
          });
        }

        t.update(referrerRef, referrerUpdates);
      }
    } else if (isFirstDeposit && referrerUid && referrerRef && referrerData) {
      // 24h Signal Pass even if below cash threshold
      const nowMs = Date.now();
      let baseExpiryMs = nowMs;
      if (referrerData.extraSignalPassUntil) {
        const existingPassMs = referrerData.extraSignalPassUntil.seconds
          ? referrerData.extraSignalPassUntil.seconds * 1000
          : referrerData.extraSignalPassUntil.toMillis
          ? referrerData.extraSignalPassUntil.toMillis()
          : new Date(referrerData.extraSignalPassUntil).getTime();
        if (existingPassMs > nowMs) {
          baseExpiryMs = existingPassMs;
        }
      }
      const newExpiryDate = new Date(baseExpiryMs + (24 * 60 * 60 * 1000));
      t.update(referrerRef, {
        extraSignalPassUntil: newExpiryDate
      });
    }

    // User updates payload
    const userUpdatePayload: any = {
      balance: updatedBalance,
      usdtBalance: updatedBalance,
      hasMadeFirstDeposit: true
    };
    if (updatedHoldings) {
      userUpdatePayload.holdings = updatedHoldings;
    }

    t.update(userRef, userUpdatePayload);

    // Update Transaction record to APPROVED
    t.update(txRef, {
      status: 'APPROVED',
      gatewayStatus: status,
      actuallyPaid: paymentData.actually_paid || paymentData.pay_amount || coinAmount,
      onChainTxHash: paymentData.payin_hash || paymentData.payout_hash || null,
      approvedAt: serverTimestamp(),
      paymentMessage: `Auto-Approved via NOWPayments Gateway (${status.toUpperCase()})`
    });
  });

  console.log(`[NOWPayments] Successfully auto-approved and credited deposit ${txId} for ${existingTx.userEmail}`);
  return { success: true, message: `Deposit ${txId} auto-approved successfully.` };
}
