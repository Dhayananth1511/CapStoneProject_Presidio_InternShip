// Weather MCP Server — wraps OpenMeteo (100% free, no API key needed!)
// Agents call getWeatherForecast(), they never know it's OpenMeteo underneath.
// This abstraction means: if we switch from OpenMeteo to another provider,
// ZERO agent code changes.

import { withRetry } from '../utils/retry';

interface WeatherForecast {
  date: string;
  condition: string;
  temp_high_c: number;
  temp_low_c: number;
  rain_mm: number;
}

// Convert OpenMeteo WMO weather codes to human-readable strings
const interpretWeatherCode = (code: number): string => {
  if (code === 0) return 'Clear Sky';
  if (code <= 2) return 'Partly Cloudy';
  if (code <= 45) return 'Foggy';
  if (code <= 55) return 'Drizzle';
  if (code <= 65) return 'Rainy';
  if (code <= 77) return 'Snowy';
  if (code <= 82) return 'Showers';
  return 'Thunderstorm';
};

export async function getWeatherForecast(
  destination: string,
  start_date: string,
  end_date: string
): Promise<{ forecast: WeatherForecast[] }> {
  return withRetry(async () => {
    // Step 1: Geocode the destination name to lat/lng
    // OpenMeteo geocoding is also free!
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(destination)}&count=1`;
    const geoRes = await fetch(geoUrl);
    const geoData: any = await geoRes.json();

    if (!geoData.results?.length) {
      throw new Error(`Destination '${destination}' not found in geocoding`);
    }

    const { latitude, longitude } = geoData.results[0];

    // Step 2: Fetch weather forecast for those coordinates
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&start_date=${start_date}&end_date=${end_date}&timezone=auto`;
    
    const weatherRes = await fetch(weatherUrl);
    const weatherData: any = await weatherRes.json();

    // Map the raw API arrays into our clean TripContext format
    const forecast: WeatherForecast[] = weatherData.daily.time.map(
      (date: string, i: number) => ({
        date,
        condition: interpretWeatherCode(weatherData.daily.weathercode[i]),
        temp_high_c: weatherData.daily.temperature_2m_max[i],
        temp_low_c: weatherData.daily.temperature_2m_min[i],
        rain_mm: weatherData.daily.precipitation_sum[i],
      })
    );

    return { forecast };
  });
}
