import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Set up server-side GoogleGenAI client using system API key
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    }
  }
});

async function startServer() {
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API router / endpoint for Ingestion Handler
  app.post("/api/gemini/ingest", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ error: "Text content is required" });
      }

      console.log(`Ingesting content on server side... length: ${text.length}`);

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `You are an expert tutor and study data clean-up parser.
The user uploaded raw notes, study materials, or structured data scraped from another platform.
Process, clean, and organize the text into a clean array of high-quality learning flashcards with absolute structural integrity.

Tasks:
1. Strip out unnecessary, messy HTML tags (like <b>, <i>, <br>, <a>, iframe, div, span, etc.).
2. Correct any broken formatting, column alignments, or layout noise from scrapers.
3. Keep the extracted term name in 'term', full definition in 'definition', and brief helper hint in 'hint'.
4. Do NOT leave fields empty. Invent brief, logical context hints if they are omitted.

Here is the raw text materials or scraped content:
"""
${text}
"""`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                term: { type: Type.STRING, description: "Key concept name, term, or phrase" },
                definition: { type: Type.STRING, description: "Detailed definition or explanation of the term" },
                hint: { type: Type.STRING, description: "A helpful contextual clue or example for studying" }
              },
              required: ["term", "definition", "hint"]
            }
          }
        }
      });

      const responseText = response.text ? response.text.trim() : "";
      const parsed = JSON.parse(responseText);

      if (!Array.isArray(parsed)) {
        throw new Error("Gemini did not return an array.");
      }

      // Format clean structural flashcards with default SRS fields
      const enrichedParsed = parsed.map((item: any, i: number) => ({
        id: `gemini-extracted-${Date.now()}-${i}`,
        term: String(item.term || `Concept ${i + 1}`).trim(),
        definition: String(item.definition || "No definition extracted.").trim(),
        hint: String(item.hint || "Extracted context hint.").trim(),
        interval: 1,
        ease_factor: 2.5,
        next_review_date: new Date().toISOString()
      }));

      res.json({ cards: enrichedParsed });
    } catch (err: any) {
      console.error("Gemini server-side extraction error:", err);
      res.status(500).json({ error: err.message || "Failed to process text via Gemini" });
    }
  });

  // API Route for topic-based generation
  app.post("/api/gemini/generate", async (req, res) => {
    try {
      const { topic } = req.body;
      if (!topic) {
        return res.status(400).json({ error: "Topic is required" });
      }

      console.log(`Generating cards for topic: "${topic}"`);

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Create exactly 5 comprehensive educational flashcards studying the topic: "${topic}".
Each flashcard must contain an explanation term, definition, and brief context hint.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                term: { type: Type.STRING, description: "Key concept name or term" },
                definition: { type: Type.STRING, description: "Detailed definition or explanation" },
                hint: { type: Type.STRING, description: "Brief helper/context hint" }
              },
              required: ["term", "definition", "hint"]
            }
          }
        }
      });

      const responseText = response.text ? response.text.trim() : "";
      const parsed = JSON.parse(responseText);

      if (!Array.isArray(parsed)) {
        throw new Error("Gemini did not return an array.");
      }

      const enrichedParsed = parsed.map((item: any, i: number) => ({
        id: `gemini-topic-${Date.now()}-${i}`,
        term: String(item.term || `Topic Term ${i + 1}`).trim(),
        definition: String(item.definition || "No definition.").trim(),
        hint: String(item.hint || "Topic Context clue.").trim(),
        interval: 1,
        ease_factor: 2.5,
        next_review_date: new Date().toISOString()
      }));

      res.json({ cards: enrichedParsed });
    } catch (err: any) {
      console.error("Gemini server-side topic generation error:", err);
      res.status(500).json({ error: err.message || "Failed to generate topic cards" });
    }
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
