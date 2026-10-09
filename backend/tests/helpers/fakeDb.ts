export interface FakeAdminUser {
  id: string;
  username: string;
  passwordHash: string;
  role: 'SUPER_ADMIN' | 'ADMIN';
  tenantId: string | null;
  isActive: boolean;
  tokenVersion: number;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FakeSession {
  id: string;
  adminId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  userAgent: string | null;
  ipAddress: string | null;
}

export interface FakeTenant {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface FakeTenantSettings {
  id: string;
  tenantId: string;
  publicName: string | null;
  whatsapp: string | null;
  footer: string | null;
  showUnavailable: boolean;
  offerOffline: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface FakeAuditLog {
  id: string;
  actorId: string | null;
  actorRole: 'SUPER_ADMIN' | 'ADMIN' | null;
  tenantId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  timestamp: Date;
}

export interface FakeTaxonomy {
  id: string;
  tenantId: string | null;
  name: string;
  slug: string;
  description: string | null;
  deletedAt: Date | null;
  createdBy: string | null;
  updatedBy: string | null;
  deletedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FakeBaseGame {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  sizeValue: number;
  sizeUnit: 'MB' | 'GB' | 'TB';
  releaseYear: number | null;
  categoryId: string | null;
  minimumRequirements: unknown;
  recommendedRequirements: unknown;
  deletedAt: Date | null;
  createdBy: string | null;
  updatedBy: string | null;
  deletedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FakeTenantGame {
  id: string;
  tenantId: string;
  baseGameId: string | null;
  origin: 'BIBLIOTECA' | 'PERSONALIZADO';
  title: string;
  slug: string;
  description: string | null;
  priceMode: 'RULE' | 'MANUAL';
  price: number | null;
  availability: boolean;
  sizeValue: number;
  sizeUnit: 'MB' | 'GB' | 'TB';
  releaseYear: number | null;
  categoryId: string | null;
  minimumRequirements: unknown;
  recommendedRequirements: unknown;
  createdBy: string | null;
  updatedBy: string | null;
  deletedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface FakeBridge {
  [key: string]: string;
}

export interface FakeGameMedia {
  id: string;
  tenantId: string;
  gameId: string;
  kind: 'COVER' | 'SHOT';
  url: string | null;
  publicId: string | null;
  sortOrder: number;
  status: 'OK' | 'PENDING' | 'ERROR' | 'ORPHAN';
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FakePricingRule {
  id: string;
  tenantId: string;
  minSize: number;
  maxSize: number | null;
  price: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface FakeCatalogMetadata {
  id: string;
  tenantId: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface FakeBackup {
  id: string;
  tenantId: string | null;
  type: string;
  scope: string;
  status: string;
  payload: unknown;
  createdAt: Date;
  updatedAt: Date;
}

type Where = Record<string, unknown>;

function toComparable(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return null;
}

function matches(row: Record<string, unknown>, where: Where | undefined): boolean {
  if (!where) {
    return true;
  }

  for (const [key, condition] of Object.entries(where)) {
    if (condition === undefined) {
      continue;
    }

    if (key === 'AND') {
      if (!(condition as Where[]).every((entry) => matches(row, entry))) return false;
      continue;
    }

    if (key === 'OR') {
      if (!(condition as Where[]).some((entry) => matches(row, entry))) return false;
      continue;
    }

    const value = row[key];

    if (condition !== null && typeof condition === 'object' && !(condition instanceof Date)) {
      const operator = condition as {
        contains?: string;
        mode?: string;
        not?: unknown;
        gte?: unknown;
        gt?: unknown;
        lte?: unknown;
        lt?: unknown;
      };

      if ('contains' in operator) {
        const target = String(value ?? '');
        const needle = operator.contains ?? '';
        const hit =
          operator.mode === 'insensitive'
            ? target.toLowerCase().includes(needle.toLowerCase())
            : target.includes(needle);
        if (!hit) return false;
      } else if ('in' in operator) {
        const list = (operator as { in?: unknown }).in;
        if (!Array.isArray(list) || !list.includes(value)) return false;
      } else if ('not' in operator) {
        if (value === operator.not) return false;
      } else if ('gte' in operator || 'gt' in operator || 'lte' in operator || 'lt' in operator) {
        const left = toComparable(value);
        if (left === null) return false;
        if ('gte' in operator) {
          const right = toComparable(operator.gte);
          if (right === null || left < right) return false;
        }
        if ('gt' in operator) {
          const right = toComparable(operator.gt);
          if (right === null || left <= right) return false;
        }
        if ('lte' in operator) {
          const right = toComparable(operator.lte);
          if (right === null || left > right) return false;
        }
        if ('lt' in operator) {
          const right = toComparable(operator.lt);
          if (right === null || left >= right) return false;
        }
      } else {
        return false;
      }
    } else if (value !== condition) {
      return false;
    }
  }

  return true;
}

interface FindManyArgs {
  where?: Where;
  orderBy?: Record<string, 'asc' | 'desc'> | Record<string, 'asc' | 'desc'>[];
  skip?: number;
  take?: number;
}

function queryRows<T extends Record<string, unknown>>(rows: T[], args: FindManyArgs): T[] {
  let result = rows.filter((row) => matches(row, args.where));

  if (args.orderBy) {
    const orders = Array.isArray(args.orderBy)
      ? args.orderBy.flatMap((entry) => Object.entries(entry))
      : Object.entries(args.orderBy);
    result = [...result].sort((a, b) => {
      for (const [field, direction] of orders) {
        const left = a[field] instanceof Date ? (a[field] as Date).getTime() : a[field];
        const right = b[field] instanceof Date ? (b[field] as Date).getTime() : b[field];
        if (left === right) continue;
        const cmp = (left ?? 0) < (right ?? 0) ? -1 : 1;
        return direction === 'asc' ? cmp : -cmp;
      }
      return 0;
    });
  }

  const start = args.skip ?? 0;
  const end = args.take !== undefined ? start + args.take : undefined;
  return result.slice(start, end);
}

function defaults<T extends object>(data: Partial<T>, extra: Partial<T>): T {
  return {
    createdAt: new Date(),
    updatedAt: new Date(),
    ...extra,
    ...data,
  } as T;
}

function applyData(row: Record<string, unknown>, data: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(data)) {
    if (
      value !== null &&
      typeof value === 'object' &&
      !(value instanceof Date) &&
      !Array.isArray(value)
    ) {
      const op = value as { increment?: number; set?: unknown };

      if ('increment' in op) {
        row[key] = (typeof row[key] === 'number' ? row[key] : 0) + (op.increment ?? 0);
        continue;
      }

      if ('set' in op) {
        row[key] = op.set;
        continue;
      }
    }

    row[key] = value;
  }
}

const users = new Map<string, FakeAdminUser>();
const sessions = new Map<string, FakeSession>();
const tenants = new Map<string, FakeTenant>();
const tenantSettings = new Map<string, FakeTenantSettings>();
const auditLogs = new Map<string, FakeAuditLog>();
const categories = new Map<string, FakeTaxonomy>();
const genres = new Map<string, FakeTaxonomy>();
const platforms = new Map<string, FakeTaxonomy>();
const baseGames = new Map<string, FakeBaseGame>();
const tenantGames = new Map<string, FakeTenantGame>();
const baseGameGenres = new Map<string, FakeBridge>();
const baseGamePlatforms = new Map<string, FakeBridge>();
const tenantGameGenres = new Map<string, FakeBridge>();
const gamePlatforms = new Map<string, FakeBridge>();
const gameMedia = new Map<string, FakeGameMedia>();
const pricingRules = new Map<string, FakePricingRule>();
const catalogMetadata = new Map<string, FakeCatalogMetadata>();
const backups = new Map<string, FakeBackup>();

function createTaxonomyDelegate(store: Map<string, FakeTaxonomy>) {
  return {
    findMany: async (args: FindManyArgs) => {
      const rows = [...store.values()].map((row) => row as unknown as Record<string, unknown>);
      const matched = queryRows(rows, args);
      return matched.map((row) => row as unknown as FakeTaxonomy);
    },
    count: async (args: { where?: Where }) => {
      return [...store.values()].filter((row) =>
        matches(row as unknown as Record<string, unknown>, args.where),
      ).length;
    },
    findFirst: async (args: { where?: Where }) => {
      for (const row of store.values()) {
        if (matches(row as unknown as Record<string, unknown>, args.where)) return row;
      }
      return null;
    },
    create: async (args: {
      data: Partial<FakeTaxonomy> & {
        id: string;
        tenantId: string | null;
        name: string;
        slug: string;
      };
    }) => {
      const row = defaults<FakeTaxonomy>(
        { ...args.data, description: args.data.description ?? null },
        { deletedAt: null, createdBy: null, updatedBy: null, deletedBy: null },
      );
      store.set(row.id, row);
      return row;
    },
    createMany: async (args: {
      data: (Partial<FakeTaxonomy> & {
        id: string;
        tenantId: string | null;
        name: string;
        slug: string;
      })[];
    }) => {
      for (const data of args.data) {
        const row = defaults<FakeTaxonomy>(
          { ...data, description: data.description ?? null },
          { deletedAt: null, createdBy: null, updatedBy: null, deletedBy: null },
        );
        store.set(row.id, row);
      }
      return { count: args.data.length };
    },
    update: async (args: { where: { id: string }; data: Partial<FakeTaxonomy> }) => {
      const row = store.get(args.where.id);
      if (!row) throw new Error('taxonomy not found');
      applyData(row as unknown as Record<string, unknown>, args.data as Record<string, unknown>);
      row.updatedAt = new Date();
      return row;
    },
    deleteMany: async (args: { where?: Where } = {}) => {
      let count = 0;
      for (const [key, row] of [...store.entries()]) {
        if (matches(row as unknown as Record<string, unknown>, args.where)) {
          store.delete(key);
          count += 1;
        }
      }
      return { count };
    },
  };
}

function createRowDelegate<T extends { id: string }>(
  store: Map<string, T>,
  extraDefaults: Partial<T>,
) {
  const asRow = (row: T) => row as unknown as Record<string, unknown>;
  return {
    findMany: async (args: FindManyArgs = {}) => {
      const matched = queryRows([...store.values()].map(asRow), args);
      return matched as unknown as T[];
    },
    findUnique: async (args: { where: Where }) => {
      for (const row of store.values()) {
        if (matches(asRow(row), args.where)) return row;
      }
      return null;
    },
    count: async (args: { where?: Where } = {}) => {
      return [...store.values()].filter((row) => matches(asRow(row), args.where)).length;
    },
    findFirst: async (args: { where?: Where } = {}) => {
      for (const row of store.values()) {
        if (matches(asRow(row), args.where)) return row;
      }
      return null;
    },
    create: async (args: { data: Partial<T> & { id: string } }) => {
      const row = defaults<T>(args.data, extraDefaults);
      store.set(row.id, row);
      return row;
    },
    createMany: async (args: { data: (Partial<T> & { id: string })[] }) => {
      for (const data of args.data) {
        const row = defaults<T>(data, extraDefaults);
        store.set(row.id, row);
      }
      return { count: args.data.length };
    },
    update: async (args: { where: { id: string }; data: Partial<T> }) => {
      const row = store.get(args.where.id);
      if (!row) throw new Error('row not found');
      applyData(row as unknown as Record<string, unknown>, args.data as Record<string, unknown>);
      Object.assign(row, { updatedAt: new Date() });
      return row;
    },
    upsert: async (args: {
      where: Where;
      update: Record<string, unknown>;
      create: Record<string, unknown> & { id: string };
    }) => {
      for (const row of store.values()) {
        if (matches(asRow(row), args.where)) {
          applyData(row as unknown as Record<string, unknown>, args.update);
          Object.assign(row, { updatedAt: new Date() });
          return row;
        }
      }
      const created = defaults<T>(args.create as Partial<T>, extraDefaults);
      store.set(created.id, created);
      return created;
    },
    delete: async (args: { where: { id: string } }) => {
      const row = store.get(args.where.id);
      if (!row) throw new Error('row not found');
      store.delete(args.where.id);
      return row;
    },
    deleteMany: async (args: { where?: Where } = {}) => {
      let count = 0;
      for (const [key, row] of [...store.entries()]) {
        if (matches(asRow(row), args.where)) {
          store.delete(key);
          count += 1;
        }
      }
      return { count };
    },
  };
}

function createBridgeDelegate(store: Map<string, FakeBridge>, key1: string, key2: string) {
  const asRow = (row: FakeBridge) => row as unknown as Record<string, unknown>;
  return {
    findMany: async (args: FindManyArgs = {}) => {
      const matched = queryRows([...store.values()].map(asRow), args);
      return matched as unknown as FakeBridge[];
    },
    count: async (args: { where?: Where } = {}) => {
      return [...store.values()].filter((row) => matches(asRow(row), args.where)).length;
    },
    findFirst: async (args: { where?: Where } = {}) => {
      for (const row of store.values()) {
        if (matches(asRow(row), args.where)) return row;
      }
      return null;
    },
    createMany: async (args: { data: Record<string, string>[] }) => {
      for (const data of args.data) {
        store.set(`${data[key1]}:${data[key2]}`, data);
      }
      return { count: args.data.length };
    },
    deleteMany: async (args: { where?: Where } = {}) => {
      let count = 0;
      for (const [key, row] of [...store.entries()]) {
        if (matches(asRow(row), args.where)) {
          store.delete(key);
          count += 1;
        }
      }
      return { count };
    },
  };
}

export const fakeDb = {
  adminUser: {
    findUnique: async (args: { where: { id?: string; username?: string } }) => {
      if (args.where.username !== undefined) {
        for (const user of users.values()) {
          if (user.username === args.where.username) return user;
        }
        return null;
      }
      if (args.where.id !== undefined) return users.get(args.where.id) ?? null;
      return null;
    },
    findMany: async (args: FindManyArgs) => {
      const rows = [...users.values()].map((row) => row as unknown as Record<string, unknown>);
      const matched = queryRows(rows, args);
      return matched.map((row) => row as unknown as FakeAdminUser);
    },
    count: async (args: { where?: Where }) => {
      return [...users.values()].filter((row) =>
        matches(row as unknown as Record<string, unknown>, args.where),
      ).length;
    },
    create: async (args: { data: Partial<FakeAdminUser> & { id: string; username: string } }) => {
      const user = defaults<FakeAdminUser>(args.data, {
        passwordHash: '',
        role: 'ADMIN',
        tenantId: null,
        isActive: true,
        tokenVersion: 0,
        lastLoginAt: null,
      });
      users.set(user.id, user);
      return user;
    },
    update: async (args: { where: { id: string }; data: Partial<FakeAdminUser> }) => {
      const user = users.get(args.where.id);
      if (!user) throw new Error('adminUser not found');
      applyData(user as unknown as Record<string, unknown>, args.data as Record<string, unknown>);
      user.updatedAt = new Date();
      return user;
    },
  },

  adminSession: {
    create: async (args: { data: Partial<FakeSession> & { id?: string } }) => {
      const session: FakeSession = {
        id: args.data.id ?? crypto.randomUUID(),
        adminId: '',
        tokenHash: '',
        expiresAt: new Date(Date.now() + 86400000),
        revokedAt: null,
        createdAt: new Date(),
        lastUsedAt: null,
        userAgent: null,
        ipAddress: null,
        ...args.data,
      };
      sessions.set(session.id, session);
      return session;
    },
    findMany: async (args: FindManyArgs = {}) => {
      const rows = [...sessions.values()].map((row) => row as unknown as Record<string, unknown>);
      const matched = queryRows(rows, args);
      return matched.map((row) => row as unknown as FakeSession);
    },
    count: async (args: { where?: Where } = {}) => {
      return [...sessions.values()].filter((row) =>
        matches(row as unknown as Record<string, unknown>, args.where),
      ).length;
    },
    findFirst: async (args: { where?: Where; orderBy?: FindManyArgs['orderBy'] } = {}) => {
      const rows = [...sessions.values()].filter((row) =>
        matches(row as unknown as Record<string, unknown>, args.where),
      );
      if (rows.length === 0) return null;
      const ordered = queryRows(
        rows.map((row) => row as unknown as Record<string, unknown>),
        { orderBy: args.orderBy },
      );
      return (ordered[0] as unknown as FakeSession) ?? null;
    },
    findUnique: async (args: {
      where: { tokenHash?: string; id?: string };
      include?: { admin?: boolean };
    }) => {
      for (const session of sessions.values()) {
        if (args.where.id !== undefined && session.id !== args.where.id) continue;
        if (args.where.tokenHash !== undefined && session.tokenHash !== args.where.tokenHash) {
          continue;
        }
        if (args.include?.admin) {
          const admin = users.get(session.adminId);
          return admin ? { ...session, admin } : null;
        }
        return session;
      }
      return null;
    },
    update: async (args: { where: { id: string }; data: Partial<FakeSession> }) => {
      const session = sessions.get(args.where.id);
      if (!session) throw new Error('adminSession not found');
      applyData(
        session as unknown as Record<string, unknown>,
        args.data as Record<string, unknown>,
      );
      return session;
    },
    updateMany: async (args: { where?: Where; data: Partial<FakeSession> }) => {
      let count = 0;
      for (const session of sessions.values()) {
        if (!matches(session as unknown as Record<string, unknown>, args.where)) continue;
        applyData(
          session as unknown as Record<string, unknown>,
          args.data as Record<string, unknown>,
        );
        count += 1;
      }
      return { count };
    },
    deleteMany: async (args: { where?: Where } = {}) => {
      let count = 0;
      for (const [key, session] of [...sessions.entries()]) {
        if (matches(session as unknown as Record<string, unknown>, args.where)) {
          sessions.delete(key);
          count += 1;
        }
      }
      return { count };
    },
  },

  tenant: {
    findUnique: async (args: { where: { id?: string; slug?: string } }) => {
      for (const tenant of tenants.values()) {
        if (args.where.id !== undefined && tenant.id === args.where.id) return tenant;
        if (args.where.slug !== undefined && tenant.slug === args.where.slug) return tenant;
      }
      return null;
    },
    findMany: async (args: FindManyArgs) => {
      const rows = [...tenants.values()].map((row) => row as unknown as Record<string, unknown>);
      const matched = queryRows(rows, args);
      return matched.map((row) => row as unknown as FakeTenant);
    },
    count: async (args: { where?: Where }) => {
      return [...tenants.values()].filter((row) =>
        matches(row as unknown as Record<string, unknown>, args.where),
      ).length;
    },
    create: async (args: { data: Partial<FakeTenant> & { name: string; slug: string } }) => {
      const tenant = defaults<FakeTenant>(
        { ...args.data, id: args.data.id ?? crypto.randomUUID() },
        { isActive: true },
      );
      tenants.set(tenant.id, tenant);
      return tenant;
    },
    update: async (args: { where: { id: string }; data: Partial<FakeTenant> }) => {
      const tenant = tenants.get(args.where.id);
      if (!tenant) throw new Error('tenant not found');
      applyData(tenant as unknown as Record<string, unknown>, args.data as Record<string, unknown>);
      tenant.updatedAt = new Date();
      return tenant;
    },
  },

  tenantSettings: {
    create: async (args: { data: Partial<FakeTenantSettings> & { tenantId: string } }) => {
      const settings: FakeTenantSettings = {
        id: crypto.randomUUID(),
        publicName: null,
        whatsapp: null,
        footer: null,
        showUnavailable: false,
        offerOffline: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...args.data,
      };
      tenantSettings.set(settings.id, settings);
      return settings;
    },
    createMany: async (args: {
      data: (Partial<FakeTenantSettings> & { id: string; tenantId: string })[];
    }) => {
      for (const data of args.data) {
        const settings: FakeTenantSettings = {
          publicName: null,
          whatsapp: null,
          footer: null,
          showUnavailable: false,
          offerOffline: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        tenantSettings.set(settings.id, settings);
      }
      return { count: args.data.length };
    },
    findUnique: async (args: { where: { id?: string; tenantId?: string } }) => {
      for (const row of tenantSettings.values()) {
        if (args.where.id !== undefined && row.id !== args.where.id) continue;
        if (args.where.tenantId !== undefined && row.tenantId !== args.where.tenantId) continue;
        return row;
      }
      return null;
    },
    findMany: async (args: FindManyArgs = {}) => {
      const rows = [...tenantSettings.values()].map(
        (row) => row as unknown as Record<string, unknown>,
      );
      const matched = queryRows(rows, args);
      return matched.map((row) => row as unknown as FakeTenantSettings);
    },
    update: async (args: {
      where: { id: string; tenantId?: string };
      data: Partial<FakeTenantSettings>;
    }) => {
      const row = args.where.id
        ? tenantSettings.get(args.where.id)
        : [...tenantSettings.values()].find((item) => item.tenantId === args.where.tenantId);
      if (!row) throw new Error('tenantSettings not found');
      applyData(row as unknown as Record<string, unknown>, args.data as Record<string, unknown>);
      row.updatedAt = new Date();
      return row;
    },
    deleteMany: async (args: { where?: Where } = {}) => {
      let count = 0;
      for (const [key, row] of [...tenantSettings.entries()]) {
        if (matches(row as unknown as Record<string, unknown>, args.where)) {
          tenantSettings.delete(key);
          count += 1;
        }
      }
      return { count };
    },
  },

  auditLog: {
    create: async (args: { data: Partial<FakeAuditLog> & { action: string; entity: string } }) => {
      const log: FakeAuditLog = {
        id: crypto.randomUUID(),
        actorId: null,
        actorRole: null,
        tenantId: null,
        entityId: null,
        metadata: {},
        ipAddress: null,
        userAgent: null,
        timestamp: new Date(),
        ...args.data,
      };
      auditLogs.set(log.id, log);
      return log;
    },
    findMany: async (args?: FindManyArgs) => {
      const rows = [...auditLogs.values()].map((row) => row as unknown as Record<string, unknown>);
      const matched = queryRows(rows, args ?? {});
      return matched.map((row) => row as unknown as FakeAuditLog);
    },
    count: async (args?: { where?: Where }) => {
      return [...auditLogs.values()].filter((row) =>
        matches(row as unknown as Record<string, unknown>, args?.where),
      ).length;
    },
  },

  category: createTaxonomyDelegate(categories),
  genre: createTaxonomyDelegate(genres),
  platform: createTaxonomyDelegate(platforms),
  baseGame: createRowDelegate<FakeBaseGame>(baseGames, {
    deletedAt: null,
    createdBy: null,
    updatedBy: null,
    deletedBy: null,
  }),
  tenantGame: createRowDelegate<FakeTenantGame>(tenantGames, {
    baseGameId: null,
    origin: 'PERSONALIZADO',
    priceMode: 'RULE',
    price: null,
    availability: true,
    categoryId: null,
    createdBy: null,
    updatedBy: null,
    deletedBy: null,
    deletedAt: null,
  }),
  baseGameGenre: createBridgeDelegate(baseGameGenres, 'baseGameId', 'genreId'),
  baseGamePlatform: createBridgeDelegate(baseGamePlatforms, 'baseGameId', 'platformId'),
  tenantGameGenre: createBridgeDelegate(tenantGameGenres, 'tenantGameId', 'genreId'),
  gamePlatform: createBridgeDelegate(gamePlatforms, 'tenantGameId', 'platformId'),
  gameMedia: createRowDelegate<FakeGameMedia>(gameMedia, {
    url: null,
    publicId: null,
    sortOrder: 0,
    status: 'OK',
    createdBy: null,
  }),
  pricingRule: createRowDelegate<FakePricingRule>(pricingRules, {
    maxSize: null,
    active: true,
  }),
  catalogMetadata: createRowDelegate<FakeCatalogMetadata>(catalogMetadata, {
    version: 1,
  }),
  backup: createRowDelegate<FakeBackup>(backups, {
    status: 'COMPLETED',
  }),

  $queryRaw: async (_strings: TemplateStringsArray, ..._values: unknown[]) => [{ ok: 1 }],

  $transaction: async (
    arg: Promise<unknown>[] | ((tx: unknown) => Promise<unknown>),
    _options?: unknown,
  ): Promise<unknown> => (typeof arg === 'function' ? arg(fakeDb) : Promise.all(arg)),
};

export const state = {
  users,
  sessions,
  tenants,
  tenantSettings,
  auditLogs,
  categories,
  genres,
  platforms,
  baseGames,
  tenantGames,
  baseGameGenres,
  baseGamePlatforms,
  tenantGameGenres,
  gamePlatforms,
  gameMedia,
  pricingRules,
  catalogMetadata,
  backups,
};

export function resetFakeDb(): void {
  users.clear();
  sessions.clear();
  tenants.clear();
  tenantSettings.clear();
  auditLogs.clear();
  categories.clear();
  genres.clear();
  platforms.clear();
  baseGames.clear();
  tenantGames.clear();
  baseGameGenres.clear();
  baseGamePlatforms.clear();
  tenantGameGenres.clear();
  gamePlatforms.clear();
  gameMedia.clear();
  pricingRules.clear();
  catalogMetadata.clear();
  backups.clear();
}

export function addFakeUser(
  input: Partial<FakeAdminUser> & { id: string; username: string },
): FakeAdminUser {
  const user = defaults<FakeAdminUser>(input, {
    passwordHash: '',
    role: 'ADMIN',
    tenantId: null,
    isActive: true,
    tokenVersion: 0,
    lastLoginAt: null,
  });
  users.set(user.id, user);
  return user;
}

export function addFakeTenant(
  input: Partial<FakeTenant> & { id: string; name: string; slug: string },
): FakeTenant {
  const tenant = defaults<FakeTenant>(input, { isActive: true });
  tenants.set(tenant.id, tenant);
  return tenant;
}

export function addFakeTenantSettings(
  input: Partial<FakeTenantSettings> & { id?: string; tenantId: string },
): FakeTenantSettings {
  const settings: FakeTenantSettings = {
    id: input.id ?? crypto.randomUUID(),
    publicName: null,
    whatsapp: null,
    footer: null,
    showUnavailable: false,
    offerOffline: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...input,
  };
  tenantSettings.set(settings.id, settings);
  return settings;
}

export function addFakeSession(
  input: Partial<FakeSession> & { id: string; adminId: string; tokenHash: string },
): FakeSession {
  const session: FakeSession = {
    expiresAt: new Date(Date.now() + 86400000),
    revokedAt: null,
    createdAt: new Date(),
    lastUsedAt: null,
    userAgent: null,
    ipAddress: null,
    ...input,
  };
  sessions.set(session.id, session);
  return session;
}

type TaxonomyInput = Partial<FakeTaxonomy> & {
  id: string;
  tenantId: string | null;
  name: string;
  slug: string;
};

export function addFakeCategory(input: TaxonomyInput): FakeTaxonomy {
  const row = defaults<FakeTaxonomy>(input, {
    description: null,
    deletedAt: null,
    createdBy: null,
    updatedBy: null,
    deletedBy: null,
  });
  categories.set(row.id, row);
  return row;
}

export function addFakeGenre(input: TaxonomyInput): FakeTaxonomy {
  const row = defaults<FakeTaxonomy>(input, {
    description: null,
    deletedAt: null,
    createdBy: null,
    updatedBy: null,
    deletedBy: null,
  });
  genres.set(row.id, row);
  return row;
}

export function addFakePlatform(input: TaxonomyInput): FakeTaxonomy {
  const row = defaults<FakeTaxonomy>(input, {
    description: null,
    deletedAt: null,
    createdBy: null,
    updatedBy: null,
    deletedBy: null,
  });
  platforms.set(row.id, row);
  return row;
}

export function addFakeBaseGame(
  input: Partial<FakeBaseGame> & { id: string; title: string; slug: string },
): FakeBaseGame {
  const row = defaults<FakeBaseGame>(input, {
    description: null,
    releaseYear: null,
    categoryId: null,
    minimumRequirements: null,
    recommendedRequirements: null,
    deletedAt: null,
    createdBy: null,
    updatedBy: null,
    deletedBy: null,
  });
  baseGames.set(row.id, row);
  return row;
}

export function addFakeTenantGame(
  input: Partial<FakeTenantGame> & {
    id: string;
    tenantId: string;
    title: string;
    slug: string;
  },
): FakeTenantGame {
  const row = defaults<FakeTenantGame>(input, {
    baseGameId: null,
    origin: 'PERSONALIZADO',
    priceMode: 'RULE',
    price: null,
    availability: true,
    categoryId: null,
    minimumRequirements: null,
    recommendedRequirements: null,
    createdBy: null,
    updatedBy: null,
    deletedBy: null,
    deletedAt: null,
  });
  tenantGames.set(row.id, row);
  return row;
}

export function addFakeBaseGameGenre(baseGameId: string, genreId: string): void {
  baseGameGenres.set(`${baseGameId}:${genreId}`, { baseGameId, genreId });
}

export function addFakeBaseGamePlatform(baseGameId: string, platformId: string): void {
  baseGamePlatforms.set(`${baseGameId}:${platformId}`, { baseGameId, platformId });
}

export function addFakeTenantGameGenre(tenantGameId: string, genreId: string): void {
  tenantGameGenres.set(`${tenantGameId}:${genreId}`, { tenantGameId, genreId });
}

export function addFakeGamePlatform(tenantGameId: string, platformId: string): void {
  gamePlatforms.set(`${tenantGameId}:${platformId}`, { tenantGameId, platformId });
}

export function addFakeGameMedia(
  input: Partial<FakeGameMedia> & {
    id: string;
    tenantId: string;
    gameId: string;
    kind: 'COVER' | 'SHOT';
  },
): FakeGameMedia {
  const row = defaults<FakeGameMedia>(input, {
    url: null,
    publicId: null,
    sortOrder: 0,
    status: 'OK',
    createdBy: null,
  });
  gameMedia.set(row.id, row);
  return row;
}

export function addFakePricingRule(
  input: Partial<FakePricingRule> & { id: string; tenantId: string; minSize: number },
): FakePricingRule {
  const row = defaults<FakePricingRule>(input, {
    maxSize: null,
    active: true,
  });
  pricingRules.set(row.id, row);
  return row;
}

export function addFakeCatalogMetadata(
  input: Partial<FakeCatalogMetadata> & { id: string; tenantId: string },
): FakeCatalogMetadata {
  const row = defaults<FakeCatalogMetadata>(input, { version: 1 });
  catalogMetadata.set(row.id, row);
  return row;
}

export function addFakeAuditLog(
  input: Partial<FakeAuditLog> & { id: string; action: string; entity: string },
): FakeAuditLog {
  const row: FakeAuditLog = {
    actorId: null,
    actorRole: null,
    tenantId: null,
    entityId: null,
    metadata: {},
    ipAddress: null,
    userAgent: null,
    timestamp: new Date(),
    ...input,
  };
  auditLogs.set(row.id, row);
  return row;
}
