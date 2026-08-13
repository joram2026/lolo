import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Initialize Google Gen AI client with telemetry user agent
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase body size limits for base64 image uploads
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // API endpoint for validating payment receipt images
  app.post("/api/verify-receipt", async (req, res) => {
    try {
      const { image, type, expectedAmount, expectedSymbol } = req.body;

      if (!image) {
        return res.status(400).json({ error: "No proof image provided" });
      }

      // Extract raw base64 data and mime type from data URI (e.g. data:image/png;base64,...)
      const matches = image.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
      let mimeType = "image/png";
      let base64Data = image;

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
        model: "gemini-3.7-flash",
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
                description: "The coin symbol or currency symbol (e.g. 'USDT', 'USDC', 'BTC', 'UGX', 'KES') found on the receipt. Return null if none is found."
              },
              extractedTxHash: {
                type: Type.STRING,
                description: "The transaction hash, reference ID, or transaction ID found on the receipt. Return null if none is found."
              },
              extractedNetwork: {
                type: Type.STRING,
                description: "The blockchain network (e.g., TRC20, ERC20, BEP20) or payment operator found. Return null if none."
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

      res.json(result);
    } catch (error: any) {
      console.error("Error in verify-receipt endpoint:", error);
      res.status(500).json({ 
        error: "Failed to audit the proof image.", 
        details: error.message || error 
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
