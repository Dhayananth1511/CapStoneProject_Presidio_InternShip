import { ChatGroq } from '@langchain/groq';
import logger from './logger';

export interface CreateChatModelOptions {
  temperature?: number;
  tools?: any[];
  maxTokens?: number;
}

/**
 * Centrally creates a ChatGroq LLM instance with automatic run-time fallbacks.
 * This cycles through multiple Groq API keys/accounts to bypass rate limit blocks.
 */
export function createChatModel(options: CreateChatModelOptions = {}): any {
  const modelName = 'llama-3.1-8b-instant';
  const { temperature = 0.1, tools = [], ...rest } = options;

  // Load all fallback keys, keeping only configured ones
  const keys = [
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
    process.env.GROQ_API_KEY_4,
    process.env.GROQ_API_KEY_5,
  ].filter(Boolean);

  // Fallback to default key if no extra keys are present in env
  if (keys.length === 0) {
    keys.push(process.env.GROQ_API_KEY || '');
  }

  // Print initialization status
  logger.info(`[LLM Factory] Initializing llama-3.1-8b-instant with ${keys.length} API keys registered.`);

  // Map each key to a tool-bound / configured ChatGroq instance
  const modelInstances = keys.map((apiKey, index) => {
    let modelInstance = new ChatGroq({
      apiKey,
      model: modelName,
      temperature,
      ...rest,
    });
    
    if (tools.length > 0) {
      modelInstance = modelInstance.bindTools(tools) as any;
    }
    
    // Register listener for fallback monitoring
    return modelInstance.withListeners({
      onError: (err: any) => {
        logger.warn(`[LLM Key Rotation] Key index ${index + 1} failed. Error: ${err?.message || err}. Rotating to next fallback...`);
      }
    }) as any;
  });

  const [primary, ...fallbacks] = modelInstances;

  const baseChain = (fallbacks.length > 0 ? primary.withFallbacks(fallbacks) : primary) as any;

  // Pre-filter response to strip '<think>' blocks from reasoning models for consistency
  const pipeline = baseChain.pipe((output: any) => {
    if (output && typeof output === 'object' && 'content' in output) {
      if (typeof output.content === 'string') {
        output.content = output.content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      }
    }
    return output;
  });

  return {
    ...pipeline,
    invoke: async (input: any, config?: any): Promise<any> => {
      return await pipeline.invoke(input, config);
    },
    bindTools: (tools: any[]): any => {
      return pipeline.bindTools(tools);
    }
  } as any;
}
