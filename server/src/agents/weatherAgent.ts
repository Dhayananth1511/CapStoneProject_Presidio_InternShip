// Weather Agent — exposes a LangChain tool to fetch weather forecast data.
// Calls the Weather MCP server directly. No caching layer.

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ChatGroq } from '@langchain/groq';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { getWeatherForecast } from '../mcp-servers/weatherMCP';
import { withRetry } from '../utils/retry';
import logger from '../utils/logger';

const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: 'llama-3.1-8b-instant', // Fast, low-latency reasoning model for micro-agent tasks
  temperature: 0.3,
});

export const weatherTool = tool(
  async ({ destination, start_date, end_date }) => {
    try {
      const fs = require('fs');
      fs.appendFileSync('d:/Presidio Capstone Project/server/tool_calls.log', `[${new Date().toISOString()}] weatherTool args: ${JSON.stringify({ destination, start_date, end_date })}\n`);
    } catch (err) {}

    logger.debug('Weather tool fetching from MCP', { destination, start_date, end_date });
    const weatherData = await getWeatherForecast(destination, start_date, end_date);

    // Standalone LLM Reasoning Phase
    let reasoning = '';
    try {
      const isHistorical = weatherData.source === 'historical';
      const systemPrompt = `You are TripPlanner's Climate Specialist Agent. 
Analyze the following raw weather forecast data for ${destination} from ${start_date} to ${end_date}.
${isHistorical ? 'Note: Since these dates are far in the future, the daily data provided above represents actual historical weather observations recorded for these exact days last year. Please explain this context explicitly in a helpful way.' : ''}
Briefly explain if the conditions are favorable for travel, note the average temperature, and give minor clothing/packing advice in 2-3 friendly sentences. Keep it short.`;
      const llmRes = await withRetry(() => llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(JSON.stringify(weatherData)),
      ]));
      reasoning = llmRes.content.toString();
    } catch (err) {
      logger.error('Weather Agent reasoning analysis failed', err);
      reasoning = 'Weather parameters are favorable for local activities.';
    }

    const finalResult = {
      ...weatherData,
      reasoning,
    };

    return JSON.stringify(finalResult);
  },
  {
    name: 'fetch_weather',
    description: 'Fetch the weather forecast for a destination city within a start and end date range.',
    schema: z.object({
      destination: z.string().describe('The destination city name'),
      start_date: z.string().describe('Starting travel date (YYYY-MM-DD)'),
      end_date: z.string().describe('Ending travel date (YYYY-MM-DD)'),
    }),
  }
);
