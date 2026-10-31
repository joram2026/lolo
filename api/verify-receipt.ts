import { GoogleGenAI, Type } from "@google/genai";

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

    const { image, type, expectedAmount, expectedSymbol } = body || {};

    if (!image) {
      return res.status(400).json({ error: "Image data is required" });
    }

    const ai = new GoogleGenAI({});

    let mimeType = "image/jpeg";
    let base64Data = image;

    const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      mimeType = matches[1];
      base64Data = matches[2];
    }

    const prompt = `You are an automated risk compliance auditor. Your job is to analyze this uploaded receipt screenshot and verify if it represents a valid, legitimate transaction confirmation.
    
    Auditing Task details:
    - Transaction Category: ${type === "crypto" ? "Cryptocurrency Transfer Proof (Blockchain confirmation, TxHash, wallet success screen)" : "Fiat/P2P Mobile Money Receipt"}
    - Expected Amount to verify: ${expectedAmount || "Any"} ${expectedSymbol || ""}
    
    Look for:
    1. Legitimate platform elements (M-Pesa, MTN, standard bank notification, Binance, TrustWallet, MetaMask, TronScan, etc.).
    2. Status indicating success (e.g., "COMPLETED", "SUCCESS", "APPROVED", "DELIVERED", "TxHash verified", "Transfer Successful").
    3. Signs of fake, empty, placeholder, black, or completely unrelated screenshots (e.g., a photo of a person, animal, random meme, desktop background).
    4. Extracted transaction details (TxHash/RefID, Amount, Currency, and Network).
    
    Analyze the receipt image carefully. Be reasonably forgiving of simple compression, but strict against totally unrelated or empty images.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          inlineData: {
            mimeType,
            data: base64Data
          }
        },
        {
          text: prompt
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isValid: {
              type: Type.BOOLEAN,
              description: "True if this is a genuine transaction confirmation/receipt screenshot, even if there are details missing. False if it is a completely unrelated, blank, black, fake, or corrupted image."
            },
            confidence: {
              type: Type.INTEGER,
              description: "Confidence rating of the analysis from 0 to 100."
            },
            extractedAmount: {
              type: Type.NUMBER,
              description: "The amount found on the receipt. Return null if none is found."
            },
            extractedSymbol: {
              type: Type.STRING,
              description: "The coin symbol or currency symbol found on the receipt. Return null if none is found."
            },
            extractedTxHash: {
              type: Type.STRING,
              description: "The transaction hash, reference ID, or transaction ID found on the receipt. Return null if none is found."
            },
            extractedNetwork: {
              type: Type.STRING,
              description: "The blockchain network or payment operator found. Return null if none."
            },
            reasons: {
              type: Type.STRING,
              description: "A short, professional single-sentence explanation of what was found or why it is marked valid/invalid."
            }
          },
          required: ["isValid", "confidence", "reasons"]
        }
      }
    });

    const responseText = response.text || "{}";
    const result = JSON.parse(responseText.trim());

    return res.status(200).json(result);
  } catch (error: any) {
    console.error("Error in verify-receipt endpoint:", error);
    return res.status(500).json({ 
      error: "Failed to audit the proof image.", 
      details: error.message || error 
    });
  }
}
