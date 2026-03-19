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

export async function getPetAdvice(prompt: string, petContext?: string, attachments?: { mimeType: string, data: string }[]) {
  // Use gemini-2.5-flash for maps grounding and multimodal compatibility
  const parts: any[] = [];
  
  if (petContext) {
    parts.push({ text: `Context about my pet: ${petContext}` });
  }
  
  parts.push({ text: prompt });
  
  if (attachments) {
    attachments.forEach(att => {
      parts.push({
        inlineData: {
          mimeType: att.mimeType,
          data: att.data
        }
      });
    });
  }

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: { parts },
    config: {
      systemInstruction: PET_EXPERT_INSTRUCTION,
      tools: [{ googleSearch: {} }, { googleMaps: {} }],
    },
  });
  return response;
}

export async function generateCustomGuide(pet: any) {
  const prompt = `Generate a comprehensive custom care guide for my ${pet.age} year old ${pet.breed} ${pet.species} named ${pet.name}. 
  Include nutrition, exercise needs, common health risks for this breed, and a recommended checkup schedule.`;
  
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
    config: {
      systemInstruction: PET_EXPERT_INSTRUCTION,
    },
  });
  return response.text;
}

export async function recognizePetBreed(imageData: string, mimeType: string) {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: mimeType,
            data: imageData,
          },
        },
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
    return JSON.parse(response.text || '{}');
  } catch (e) {
    console.error("Failed to parse breed recognition response", e);
    return null;
  }
}

export async function moderateContent(content: string) {
  const prompt = `Analyze the following pet forum post for safety and appropriateness. 
  Check for:
  1. Hate speech or harassment.
  2. Harmful advice for pets (e.g., toxic foods recommended as safe).
  3. Explicit or inappropriate content.
  4. Spam.
  
  Content: "${content}"
  
  Return a JSON object with:
  - "isSafe": boolean
  - "reason": string (if not safe)
  - "suggestedAction": "approve" | "reject" | "flag"`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
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
    return JSON.parse(response.text || '{}');
  } catch (e) {
    console.error("Failed to parse moderation response", e);
    return { isSafe: true, suggestedAction: "approve" };
  }
}

export async function answerExpertQuestion(question: string, petContext?: string) {
  const prompt = `As Pawesome AI, provide an expert answer to the following pet-related question.
  
  Pet Context: ${petContext || "General pet query"}
  Question: "${question}"
  
  Provide a detailed, caring, and professional answer. If the question seems to be a medical emergency, strongly advise seeing a vet immediately. 
  If you are unsure or the question is extremely complex, suggest that the user might want to escalate this to a human specialist.`;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
    config: {
      systemInstruction: PET_EXPERT_INSTRUCTION,
    },
  });

  return response.text;
}

export async function generateTrainingVideo(taskTitle: string, petContext: string) {
  const prompt = `A high-quality educational video showing how to train a pet to ${taskTitle}. 
  Context: ${petContext}. 
  The video should be clear, helpful, and show positive reinforcement techniques. 
  Cinematic lighting, professional pet training setting.`;

  const aiInstance = new GoogleGenAI({ apiKey: process.env.API_KEY || process.env.GEMINI_API_KEY! });
  
  let operation = await aiInstance.models.generateVideos({
    model: 'veo-3.1-fast-generate-preview',
    prompt: prompt,
    config: {
      numberOfVideos: 1,
      resolution: '720p',
      aspectRatio: '16:9'
    }
  });

  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 10000));
    operation = await aiInstance.operations.getVideosOperation({ operation: operation });
  }

  const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!downloadLink) throw new Error("Video generation failed - no download link received.");

  // Fetch the video with the API key
  const videoResponse = await fetch(downloadLink, {
    method: 'GET',
    headers: {
      'x-goog-api-key': process.env.API_KEY || process.env.GEMINI_API_KEY!,
    },
  });

  if (!videoResponse.ok) throw new Error("Failed to download generated video.");
  
  const blob = await videoResponse.blob();
  return URL.createObjectURL(blob);
}

export async function findPetDeals(query: string) {
  const prompt = `Find the best deals, discounts, and coupons for "${query}" pet items. 
  Provide a list of products with their prices, sources, and URLs. 
  Also, find any active coupon codes or special offers.
  
  Return a JSON object with:
  - "items": array of objects with "title", "price", "source", "url", "imageUrl", "rating", "dealInfo"
  - "coupons": array of objects with "code", "description", "expiry", "source"
  - "summary": a brief AI summary of the best deals found.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      systemInstruction: PET_EXPERT_INSTRUCTION,
      tools: [{ googleSearch: {} }],
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

  try {
    return JSON.parse(response.text || '{}');
  } catch (e) {
    console.error("Failed to parse deals response", e);
    return { items: [], coupons: [], summary: "I couldn't find any specific deals right now. Try a different search!" };
  }
}

export async function transcribeAudio(audioData: string, mimeType: string) {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: mimeType,
            data: audioData,
          },
        },
        { text: "Transcribe this audio accurately. Return only the transcribed text." },
      ],
    },
  });
  return response.text;
}
