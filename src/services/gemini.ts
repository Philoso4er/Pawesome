import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export const PET_EXPERT_INSTRUCTION = `You are "Pawesome AI", a world-class pet expert and enthusiast. 
Your personality is warm, professional, and deeply caring about all animals. 
You have exhaustive knowledge about every pet species, from common dogs and cats to exotic reptiles and birds.

Your goals:
1. Provide accurate, helpful advice on pet health, nutrition, behavior, and training.
2. If a user provides an image or video, analyze it for visible signs of health issues or behavioral cues.
3. Always recommend consulting a local veterinarian for serious medical concerns.
4. Be proactive in suggesting custom care guides based on the pet's specific breed and age.
5. Help users find local pet services (vets, groomers, parks) using your search and maps tools.
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
        { text: "Identify the species and breed of the pet in this image. Return the result as a JSON object with 'species' and 'breed' fields." },
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
  try {
    return JSON.parse(response.text || "{}");
  } catch {
    return null;
  }
}

// ─── Content Moderation ───────────────────────────────────────────────────────

export async function moderateContent(content: string) {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Analyze this pet forum post for safety. Check for hate speech, harmful pet advice, explicit content, or spam. Content: "${content}"`,
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
  try {
    return JSON.parse(response.text || "{}");
  } catch {
    return { isSafe: true, suggestedAction: "approve" };
  }
}

// ─── Expert Q&A ───────────────────────────────────────────────────────────────

export async function answerExpertQuestion(question: string, petContext?: string) {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-pro",
    contents: `As Pawesome AI, answer this pet question.
Pet Context: ${petContext || "General pet query"}
Question: "${question}"
Provide a detailed, caring, professional answer. For emergencies, strongly advise seeing a vet immediately.`,
    config: { systemInstruction: PET_EXPERT_INSTRUCTION },
  });
  return response.text;
}

// ─── Training Video (Veo) ─────────────────────────────────────────────────────

export async function generateTrainingVideo(taskTitle: string, petContext: string) {
  const aiInstance = new GoogleGenAI({
    apiKey: process.env.API_KEY || process.env.GEMINI_API_KEY!,
  });

  let operation = await aiInstance.models.generateVideos({
    model: "veo-2.0-generate-001",
    prompt: `A high-quality educational video showing how to train a pet to ${taskTitle}. Context: ${petContext}. Clear positive reinforcement techniques. Cinematic lighting, professional pet training setting.`,
    config: { numberOfVideos: 1, resolution: "720p", aspectRatio: "16:9" },
  });

  while (!operation.done) {
    await new Promise((r) => setTimeout(r, 10000));
    operation = await aiInstance.operations.getVideosOperation({ operation });
  }

  const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!downloadLink) throw new Error("Video generation failed.");

  const videoResponse = await fetch(downloadLink, {
    headers: { "x-goog-api-key": process.env.API_KEY || process.env.GEMINI_API_KEY! },
  });
  if (!videoResponse.ok) throw new Error("Failed to download video.");

  const blob = await videoResponse.blob();
  return URL.createObjectURL(blob);
}

// ─── Shopping Deal Finder (FIXED) ─────────────────────────────────────────────
// Root cause: googleSearch tool + responseMimeType: application/json cannot be
// used together — Gemini rejects this combination silently causing infinite load.
// Fix: two-step approach — search first (plain text), then structure (JSON only).

export async function findPetDeals(query: string) {
  try {
    // Step 1: search with grounding, get plain text
    const searchResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Search for the best current deals, prices, discount codes, and coupons for "${query}" pet products. List specific products with prices, store names, URLs if available, ratings, and any active promo codes.`,
      config: {
        systemInstruction: PET_EXPERT_INSTRUCTION,
        tools: [{ googleSearch: {} }],
      },
    });

    const rawText = searchResponse.text || '';

    // Step 2: structure into JSON (no tools)
    const structureResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Extract and structure this pet product search data into JSON.

Search results:
${rawText}

Query: "${query}"`,
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

    return JSON.parse(structureResponse.text || "{}");
  } catch (e) {
    console.error("findPetDeals error:", e);
    return {
      items: [],
      coupons: [],
      summary: "Couldn't find deals right now. Try a specific search like 'Royal Canin dog food' or 'Kong dog toy'.",
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