// Exponential backoff retry wrapper.
// We wrap ALL MCP/external API calls in this.
// Why? External APIs fail. This gives them 3 chances with increasing wait times
// before we give up and return a cached or graceful fallback.

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface RetryOptions {
  maxRetries?: number;   // Default: 3 attempts total
  baseDelay?: number;    // Default: 2000ms between attempts
  backoffFactor?: number; // Default: 2x (2s → 4s → 8s)
  timeout?: number;       // Default: 8000ms per attempt
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 2000,
    backoffFactor = 2,
    timeout = 8000,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Wrap the function call in a timeout promise
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), timeout)
        ),
      ]);
      return result;
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries) {
        // Exponential backoff + jitter (prevents all retries hitting server hitting simultaneously)
        const delay = baseDelay * Math.pow(backoffFactor, attempt - 1);
        const jitter = Math.random() * 1000 - 500; // ±500ms randomness
        await sleep(Math.max(0, delay + jitter));
      }
    }
  }

  throw lastError;
}
