import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '@/lib/logger';

// Primary and secondary Gemini API clients
const primaryGenAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const secondaryGenAI = process.env.GEMINI_API_KEY_SECONDARY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY_SECONDARY)
  : null;

/*
 * Rolling alias by default rather than a pinned version.
 *
 * A pinned model (`gemini-2.5-flash-lite`) was retired mid-flight and returned
 * 404 "no longer available to new users", which took the assistant down
 * completely — both keys failed identically, so failover bought nothing. The
 * `-latest` alias tracks the current generation of the same tier. Pin it via
 * GEMINI_MODEL when reproducibility matters more than availability. See D-17.
 */
export const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';

export interface GenerationOptions {
  /** Defaults to the conversational setting. Analyses use a lower value. */
  temperature?: number;
  maxOutputTokens?: number;
}

/**
 * Generate content, falling back to the secondary key when the primary fails.
 *
 * Shared by the assistant and the insights endpoint so both inherit the same
 * failover behaviour and model selection.
 */
export async function generateWithFallback(
  prompt: string,
  options: GenerationOptions = {}
): Promise<string> {
  const generationConfig = {
    temperature: options.temperature ?? 0.8,
    maxOutputTokens: options.maxOutputTokens ?? 2048,
  };

  try {
    const primaryModel = primaryGenAI.getGenerativeModel({ model: MODEL_NAME });
    const result = await primaryModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig,
    });
    logger.info('Generated response using primary API key', { prefix: 'Gemini' });
    return result.response.text();
  } catch (primaryError) {
    const primaryErrorMsg = primaryError instanceof Error ? primaryError.message : 'Unknown error';
    logger.warn(`Primary API key failed: ${primaryErrorMsg}`, { prefix: 'Gemini' });

    if (secondaryGenAI) {
      try {
        const secondaryModel = secondaryGenAI.getGenerativeModel({ model: MODEL_NAME });
        const result = await secondaryModel.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig,
        });
        logger.info('Generated response using secondary API key', { prefix: 'Gemini' });
        return result.response.text();
      } catch (secondaryError) {
        const secondaryErrorMsg =
          secondaryError instanceof Error ? secondaryError.message : 'Unknown error';
        logger.error(`Secondary API key also failed: ${secondaryErrorMsg}`, { prefix: 'Gemini' });
        throw new Error(
          `Both API keys failed. Primary: ${primaryErrorMsg}, Secondary: ${secondaryErrorMsg}`
        );
      }
    }

    throw primaryError;
  }
}
