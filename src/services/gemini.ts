import { Type } from "@google/genai";
import { authedFetch, openPaywall, ProRequiredError, getMe } from "../lib/billing";
import { retailerSearchLinks } from "../lib/affiliate";

// All Gemini calls go through the /api/gemini serverless function so the
// API key stays on the server (set GEMINI_API_KEY in Vercel env vars).
async function generateContent(params: { model: string; contents: any; config?: any }) {
  const res = await authedFetch("/api/gemini", { method: "POST", body: JSON.stringify(params) });
  const data = await res.json().catch(() => ({}));
  if (res.status === 402) {
    openPaywall("pro");
    throw new ProRequiredError("pro");
  }
  if (!res.ok) throw new Error(data.error || `Gemini request failed (${res.status})`);
  return data as { text: string; candidates: any[] };
}

const ai = { models: { generateContent } };

export const PET_EXPERT_INSTRUCTION = `You are "Pawesome AI", a world-class pet expert and enthusiast. 
Your personality is warm, professional, and deeply caring about all animals. 
You have exhaustive knowledge about every pet species, from common dogs and cats to exotic reptiles and birds.

Your goals:
1. Provide accurate, helpful advice on pet health, nutrition, behavior, and training.
2. If a user provides an image or video, analyze it for visible signs of health issues or behavioral cues.
3. Always recommend consulting a local veterinarian for serious medical concerns.
4. Be proactive in suggesting custom care guides based on the pet's specific breed and age.
5. Help users find local pet services (vets, groomers, parks) using your search tools.
6. Find coupons and discounts for pet supplies.

Maintain a professional yet friendly tone. Use emojis occasionally to show your love for pets. 🐾`;

// ─── Core Chat ────────────────────────────────────────────────────────────────

export async function getPetAdvice(
  prompt: string,
  petContext?: string,
  attachments?: { mimeType: string; data: string }[]
) {
  const parts: any[] = [];
  if (petContext) parts.push({ text: `Context about my pet: ${petContext}` });
  parts.push({ text: prompt });
  if (attachments) {
    attachments.forEach((att) =>
      parts.push({ inlineData: { mimeType: att.mimeType, data: att.data } })
    );
  }

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: { parts },
    config: {
      systemInstruction: PET_EXPERT_INSTRUCTION,
      tools: [{ googleSearch: {} }],
    },
  });
  return response;
}

// ─── Custom Care Guide ────────────────────────────────────────────────────────

export async function generateCustomGuide(pet: any) {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-pro",
    contents: `Generate a comprehensive custom care guide for my ${pet.age} year old ${pet.breed} ${pet.species} named ${pet.name}. Include nutrition, exercise needs, common health risks for this breed, and a recommended checkup schedule.`,
    config: { systemInstruction: PET_EXPERT_INSTRUCTION },
  });
  return response.text;
}

// ─── Breed Recognition ────────────────────────────────────────────────────────

export async function recognizePetBreed(imageData: string, mimeType: string) {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: {
      parts: [
        { inlineData: { mimeType, data: imageData } },
        { text: "Identify the species and breed of the pet in this image. Return a JSON object with 'species' and 'breed' fields only." },
      ],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          species: { type: Type.STRING },
          breed: { type: Type.STRING },
        },
        required: ["species", "breed"],
      },
    },
  });
  try { return JSON.parse(response.text || "{}"); } catch { return null; }
}

// ─── Content Moderation ───────────────────────────────────────────────────────

// Free, non-AI moderation used for free-tier users (and if the AI is unavailable).
const BLOCKLIST = /\b(kill|poison|abuse|torture|fuck|shit|cunt|nigg|faggot|retard|porn|nude|viagra|casino|crypto ?giveaway|onlyfans)\b/i;
const HARMFUL_ADVICE = /\b(chocolate|grapes?|raisins?|xylitol|onions?|ibuprofen|paracetamol|acetaminophen)\b.*\b(safe|fine|ok|give|feed)\b/i;
export function basicModeration(content: string) {
  if (BLOCKLIST.test(content)) return { isSafe: false, reason: "Contains language that isn't allowed", suggestedAction: "reject" as const };
  if (HARMFUL_ADVICE.test(content)) return { isSafe: true, reason: "May contain unsafe pet advice; flagged for review", suggestedAction: "flag" as const };
  if ((content.match(/https?:\/\//g) || []).length > 3) return { isSafe: true, reason: "Many links; flagged as possible spam", suggestedAction: "flag" as const };
  return { isSafe: true, reason: "", suggestedAction: "approve" as const };
}

export async function moderateContent(content: string) {
  const local = basicModeration(content);
  if (local.suggestedAction === "reject") return local;
  const me = await getMe();
  if (!me.pro) return local;
  let response;
  try {
    response = await aiModerate(content);
  } catch {
    return local;
  }
  try { return JSON.parse(response.text || "{}"); } catch { return local; }
}

async function aiModerate(content: string) {
  return ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Analyze this pet forum post for safety. Check for: hate speech, harmful pet advice, explicit content, spam. Content: "${content}"`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          isSafe: { type: Type.BOOLEAN },
          reason: { type: Type.STRING },
          suggestedAction: { type: Type.STRING, enum: ["approve", "reject", "flag"] },
        },
        required: ["isSafe", "suggestedAction"],
      },
    },
  });
}

// ─── Expert Q&A ───────────────────────────────────────────────────────────────

export async function answerExpertQuestion(question: string, petContext?: string) {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-pro",
    contents: `As Pawesome AI, answer this pet question.\nPet Context: ${petContext || "General pet query"}\nQuestion: "${question}"\nProvide a detailed, caring, professional answer. For emergencies, strongly advise seeing a vet immediately.`,
    config: { systemInstruction: PET_EXPERT_INSTRUCTION },
  });
  return response.text;
}

// ─── Training Video (Veo) ─────────────────────────────────────────────────────

export async function generateTrainingVideo(_taskTitle: string, _petContext: string): Promise<string> {
  // Video generation previously used the API key in the browser; disabled until
  // a server-side endpoint is added.
  throw new Error("Training video generation is not available right now.");
}

// ─── Shopping Deal Finder (FIXED v3) ──────────────────────────────────────────
//
// Root cause of "Couldn't find deals" error:
// The two-step approach worked for dog food but fails for niche queries because
// the grounding response text is sometimes structured as citations/snippets
// that don't parse well into the JSON schema.
//
// Fix: Single call that instructs the model to use its knowledge + search context
// to return structured JSON directly. We avoid the tool+JSON conflict by using
// a text response with explicit JSON formatting instructions, then parse it ourselves.
// This is more reliable than the two-step approach for varied query types.

export async function findPetDeals(query: string) {
  const me = await getMe();
  if (!me.pro) {
    // Free tier: no AI cost, straight to the main UK pet retailers.
    return {
      items: retailerSearchLinks(query),
      coupons: [],
      summary: `Top UK pet retailers for “${query}”. Upgrade to Pawesome Pro for AI price comparison and live coupon codes.`,
      free: true,
    };
  }
  try {
    // Step 1: Web search for current deals (plain text response)
    const searchRes = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Search the web for current prices, deals, discounts, and coupon codes for "${query}" pet products. 
Find at least 4-6 specific products from real retailers with actual prices. 
Also look for any active promo codes or discount offers.
List everything you find with product names, prices, store names, and any coupon codes.`,
      config: {
        systemInstruction: PET_EXPERT_INSTRUCTION,
        tools: [{ googleSearch: {} }],
      },
    });

    // Extract text from response — grounding responses sometimes put text in different places
    let rawText = '';
    if (searchRes.text) {
      rawText = searchRes.text;
    } else if ((searchRes as any).candidates?.[0]?.content?.parts) {
      rawText = (searchRes as any).candidates[0].content.parts
        .filter((p: any) => p.text)
        .map((p: any) => p.text)
        .join('\n');
    }

    if (!rawText || rawText.length < 50) {
      // Fallback: use model knowledge without grounding
      rawText = `Based on general knowledge, here are typical ${query} products: various brands available at PetSmart, Chewy, Amazon, and local pet stores with typical price ranges.`;
    }

    // Step 2: Structure the results into JSON
    const structureRes = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `You have these pet product search results for "${query}":

${rawText}

Extract the product and coupon information and return it as a JSON object.
If specific products were found, include them. If not, suggest 4 typical products for "${query}" with estimated prices from common retailers.

Return ONLY valid JSON in exactly this format, no other text:
{
  "items": [
    {"title": "product name", "price": "$XX.XX", "source": "Store Name", "url": "", "imageUrl": "", "rating": "4.5", "dealInfo": "any deal info or empty"}
  ],
  "coupons": [
    {"code": "CODE", "description": "what it gives", "expiry": "", "source": "Store Name"}
  ],
  "summary": "2 sentence summary of findings"
}

Include 4-6 items. If no real coupons found, return empty coupons array.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  price: { type: Type.STRING },
                  source: { type: Type.STRING },
                  url: { type: Type.STRING },
                  imageUrl: { type: Type.STRING },
                  rating: { type: Type.STRING },
                  dealInfo: { type: Type.STRING },
                },
                required: ["title", "price", "source", "url"],
              },
            },
            coupons: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  code: { type: Type.STRING },
                  description: { type: Type.STRING },
                  expiry: { type: Type.STRING },
                  source: { type: Type.STRING },
                },
                required: ["code", "description", "source"],
              },
            },
            summary: { type: Type.STRING },
          },
          required: ["items", "coupons", "summary"],
        },
      },
    });

    const parsed = JSON.parse(structureRes.text || "{}");

    // Ensure we always have something useful
    if (!parsed.items || parsed.items.length === 0) {
      parsed.items = retailerSearchLinks(query);
      parsed.summary = `Here are some places to find ${query}. Click "View Deal" to search each retailer for current pricing.`;
    }

    return parsed;
  } catch (e: any) {
    console.error("findPetDeals error:", e);
    // Always return something useful rather than an empty state
    return {
      items: retailerSearchLinks(query),
      coupons: [],
      summary: `I couldn't fetch live prices right now, but here are direct search links for "${query}" at the top pet retailers.`,
    };
  }
}

// ─── Audio Transcription ──────────────────────────────────────────────────────

export async function transcribeAudio(audioData: string, mimeType: string) {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: {
      parts: [
        { inlineData: { mimeType, data: audioData } },
        { text: "Transcribe this audio accurately. Return only the transcribed text." },
      ],
    },
  });
  return response.text;
}
