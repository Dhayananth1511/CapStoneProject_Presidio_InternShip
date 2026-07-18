import { createHash } from 'crypto';
import HotelbedsDestination from '../models/HotelbedsDestination';
import { getHotelbedsConfig, buildHotelbedsSignature } from '../mcp-servers/hotelbedsClient';
import backupDestinations from '../constants/hotelbedsDestinationsBackup.json';
import logger from './logger';

/**
 * Seeds the HotelbedsDestination collection from the live API or fallback JSON
 */
export async function seedHotelbedsDestinations(): Promise<void> {
  try {
    const existingCount = await HotelbedsDestination.countDocuments();
    if (existingCount > 0) {
      logger.info(`[HotelbedsSeeder] Database already contains ${existingCount} destinations. Skipping seed.`);
      return;
    }

    logger.info(`[HotelbedsSeeder] No destinations found in database. Starting seeding process...`);

    let destinationsToSeed: Array<{ code: string; city: string; country: string }> = [];

    // Retrieve Hotelbeds config
    const config = getHotelbedsConfig('hotels');
    const isConfigured = !!(config.apiKey && config.apiSecret);

    if (isConfigured) {
      try {
        let allDestinations: any[] = [];
        let from = 1;
        const pageSize = 100;
        let total = 376; 
        
        while (from <= total) {
          const to = from + pageSize - 1;
          const timestampSeconds = Math.floor(Date.now() / 1000).toString();
          const signature = buildHotelbedsSignature(config.apiKey!, config.apiSecret!, timestampSeconds);
          
          const headers = {
            'Api-key': config.apiKey!,
            'X-Signature': signature,
            'Accept': 'application/json',
          };
          
          // Request Indian destinations
          const url = `${config.baseUrl}/hotel-content-api/1.0/locations/destinations?fields=all&countryCodes=IN&from=${from}&to=${to}&language=ENG`;
          const res = await fetch(url, { headers });
          if (!res.ok) {
            throw new Error(`API returned status ${res.status}: ${res.statusText}`);
          }
          
          const data: any = await res.json();
          const list = data?.destinations || [];
          allDestinations.push(...list);
          
          total = data?.total || total;
          from = to + 1;
          
          // Small rate-limit delay
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        if (allDestinations.length > 0) {
          destinationsToSeed = allDestinations.map(d => ({
            code: d.code,
            city: d.name?.content || d.name || '',
            country: d.countryCode
          }));
          logger.info(`[HotelbedsSeeder] Successfully fetched ${destinationsToSeed.length} live destinations from Hotelbeds Content API.`);
        }
      } catch (err: any) {
        logger.warn(`[HotelbedsSeeder] Live API seeding failed (${err.message}). Falling back to local backup JSON.`);
      }
    } else {
      logger.info(`[HotelbedsSeeder] Hotelbeds credentials not configured. Using local backup JSON.`);
    }

    // Use fallback local backup if live fetch failed or wasn't configured
    if (destinationsToSeed.length === 0) {
      destinationsToSeed = backupDestinations;
      logger.info(`[HotelbedsSeeder] Loaded ${destinationsToSeed.length} backup destinations from JSON cache.`);
    }

    // Insert all documents
    if (destinationsToSeed.length > 0) {
      // Prevent duplicate errors by doing a bulk insert
      await HotelbedsDestination.insertMany(destinationsToSeed, { ordered: false });
      logger.info(`[HotelbedsSeeder] Seeding complete. Successfully stored ${destinationsToSeed.length} destinations in MongoDB.`);
    } else {
      logger.warn(`[HotelbedsSeeder] No destinations available to seed.`);
    }
  } catch (error: any) {
    logger.error(`[HotelbedsSeeder] Error during seeding process: ${error.message}`);
  }
}
