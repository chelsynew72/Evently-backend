import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { NearbyQueryDto } from './dto/nearby-query.dto';
import { SearchQueryDto } from './dto/search-query.dto';
import { boundingBox, haversineDistanceKm } from '../common/utils/distance.util';

// Discovery reads (nearby/search) are the hottest, most repeated queries
// in the app and tolerate slight staleness well — a 60s cache means a
// newly published event can take up to a minute to appear in results,
// which is an acceptable tradeoff for the load it takes off Postgres.
const DISCOVERY_CACHE_TTL_SECONDS = 60;

@Injectable()
export class EventsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  create(creatorId: string, dto: CreateEventDto) {
    return this.prisma.event.create({
      data: {
        ...dto,
        startDateTime: new Date(dto.startDateTime),
        endDateTime: new Date(dto.endDateTime),
        creatorId,
        status: EventStatus.DRAFT,
      },
    });
  }

  async findById(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: { ticketTiers: true, creator: { select: { id: true, fullName: true } } },
    });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  async update(id: string, creatorId: string, dto: UpdateEventDto) {
    const event = await this.assertOwnership(id, creatorId);
    return this.prisma.event.update({
      where: { id: event.id },
      data: {
        ...dto,
        startDateTime: dto.startDateTime ? new Date(dto.startDateTime) : undefined,
        endDateTime: dto.endDateTime ? new Date(dto.endDateTime) : undefined,
      },
    });
  }

  async publish(id: string, creatorId: string) {
    const event = await this.assertOwnership(id, creatorId);
    const updated = await this.prisma.event.update({
      where: { id: event.id },
      data: { status: EventStatus.PUBLISHED },
    });
    // Invalidate so the newly published event shows up immediately
    // instead of waiting out the discovery cache's TTL.
    await this.invalidateDiscoveryCache();
    return updated;
  }

  async cancel(id: string, creatorId: string) {
    const event = await this.assertOwnership(id, creatorId);
    const updated = await this.prisma.event.update({
      where: { id: event.id },
      data: { status: EventStatus.CANCELLED },
    });
    await this.invalidateDiscoveryCache();
    return updated;
  }

  async findByCreator(creatorId: string) {
    return this.prisma.event.findMany({
      where: { creatorId },
      orderBy: { startDateTime: 'asc' },
    });
  }

  /**
   * Two-pass geo search: a cheap indexed bounding-box filter in SQL narrows
   * the candidate set, then exact haversine distance is computed and used
   * to filter/sort in application code. Good enough without PostGIS; swap
   * for a proper geo index if the events table gets very large.
   */
  async findNearby({ lat, lng, radiusKm = 25 }: NearbyQueryDto) {
    // Round coordinates to ~1km precision for the cache key so nearby
    // requests (e.g. the user's GPS jitters slightly between calls) hit
    // the same cache entry instead of each being a unique miss.
    const cacheKey = `events:nearby:${lat.toFixed(2)}:${lng.toFixed(2)}:${radiusKm}`;
    const cached = await this.redis.get<unknown[]>(cacheKey);
    if (cached) return cached;

    const box = boundingBox(lat, lng, radiusKm);
    const candidates = await this.prisma.event.findMany({
      where: {
        status: EventStatus.PUBLISHED,
        latitude: { gte: box.minLat, lte: box.maxLat },
        longitude: { gte: box.minLon, lte: box.maxLon },
        startDateTime: { gte: new Date() },
      },
      include: { ticketTiers: true },
    });

    const results = candidates
      .map((event: (typeof candidates)[number]) => ({
        ...event,
        distanceKm: haversineDistanceKm(lat, lng, event.latitude, event.longitude),
      }))
      .filter((event: { distanceKm: number }) => event.distanceKm <= radiusKm)
      .sort((a: { distanceKm: number }, b: { distanceKm: number }) => a.distanceKm - b.distanceKm);

    await this.redis.set(cacheKey, results, DISCOVERY_CACHE_TTL_SECONDS);
    return results;
  }

  async search(query: SearchQueryDto) {
    const { keyword, category, minPrice, maxPrice, fromDate, toDate, page = 1, pageSize = 20 } = query;

    // Cache key covers every filter combo so distinct searches never
    // collide — order of construction matches the DTO field order for
    // readability when debugging cached keys in Redis.
    const cacheKey = `events:search:${JSON.stringify({
      keyword, category, minPrice, maxPrice, fromDate, toDate, page, pageSize,
    })}`;
    const cached = await this.redis.get<{
      items: unknown[]; total: number; page: number; pageSize: number; totalPages: number;
    }>(cacheKey);
    if (cached) return cached;

    const where: Prisma.EventWhereInput = {
      status: EventStatus.PUBLISHED,
      ...(category && { category }),
      ...(keyword && {
        OR: [
          { title: { contains: keyword, mode: 'insensitive' } },
          { description: { contains: keyword, mode: 'insensitive' } },
        ],
      }),
      ...(fromDate && { startDateTime: { gte: new Date(fromDate) } }),
      ...(toDate && { endDateTime: { lte: new Date(toDate) } }),
      ...((minPrice !== undefined || maxPrice !== undefined) && {
        ticketTiers: {
          some: {
            ...(minPrice !== undefined && { price: { gte: minPrice } }),
            ...(maxPrice !== undefined && { price: { lte: maxPrice } }),
          },
        },
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        include: { ticketTiers: true },
        orderBy: { startDateTime: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.event.count({ where }),
    ]);

    const result = { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
    await this.redis.set(cacheKey, result, DISCOVERY_CACHE_TTL_SECONDS);
    return result;
  }

  /** Clears every cached discovery result. Wildcard DEL is fine at this
   * traffic level — revisit with a smarter tagging scheme if the key
   * count ever gets large enough for KEYS to become slow. */
  private invalidateDiscoveryCache() {
    return Promise.all([
      this.redis.del('events:nearby:*'),
      this.redis.del('events:search:*'),
    ]);
  }

  private async assertOwnership(eventId: string, creatorId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');
    if (event.creatorId !== creatorId) {
      throw new ForbiddenException('You do not own this event');
    }
    return event;
  }
}
