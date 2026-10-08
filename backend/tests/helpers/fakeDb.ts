export interface FakeAdminUser {
  id: string;
  username: string;
  passwordHash: string;
  role: 'SUPER_ADMIN' | 'ADMIN';
  tenantId: string | null;
  isActive: boolean;
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
  tenantId: string;
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

type Where = Record<string, unknown>;

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
      const operator = condition as { contains?: string; mode?: string; not?: unknown };

      if ('contains' in operator) {
        const target = String(value ?? '');
        const needle = operator.contains ?? '';
        const hit =
          operator.mode === 'insensitive'
            ? target.toLowerCase().includes(needle.toLowerCase())
            : target.includes(needle);
        if (!hit) return false;
      } else if ('not' in operator) {
        if (value === operator.not) return false;
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
  orderBy?: Record<string, 'asc' | 'desc'>;
  skip?: number;
  take?: number;
}

function queryRows<T extends Record<string, unknown>>(rows: T[], args: FindManyArgs): T[] {
  let result = rows.filter((row) => matches(row, args.where));

  if (args.orderBy) {
    const [field, direction] = Object.entries(args.orderBy)[0] as [string, 'asc' | 'desc'];
    result = [...result].sort((a, b) => {
      const left = a[field] instanceof Date ? (a[field] as Date).getTime() : a[field];
      const right = b[field] instanceof Date ? (b[field] as Date).getTime() : b[field];
      if (left === right) return 0;
      const cmp = (left ?? 0) < (right ?? 0) ? -1 : 1;
      return direction === 'asc' ? cmp : -cmp;
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

const users = new Map<string, FakeAdminUser>();
const sessions = new Map<string, FakeSession>();
const tenants = new Map<string, FakeTenant>();
const tenantSettings = new Map<string, FakeTenantSettings>();
const auditLogs = new Map<string, FakeAuditLog>();
const categories = new Map<string, FakeTaxonomy>();
const genres = new Map<string, FakeTaxonomy>();
const platforms = new Map<string, FakeTaxonomy>();

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
      data: Partial<FakeTaxonomy> & { id: string; tenantId: string; name: string; slug: string };
    }) => {
      const row = defaults<FakeTaxonomy>(
        { ...args.data, description: args.data.description ?? null },
        { deletedAt: null, createdBy: null, updatedBy: null, deletedBy: null },
      );
      store.set(row.id, row);
      return row;
    },
    update: async (args: { where: { id: string }; data: Partial<FakeTaxonomy> }) => {
      const row = store.get(args.where.id);
      if (!row) throw new Error('taxonomy not found');
      Object.assign(row, args.data, { updatedAt: new Date() });
      return row;
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
        lastLoginAt: null,
      });
      users.set(user.id, user);
      return user;
    },
    update: async (args: { where: { id: string }; data: Partial<FakeAdminUser> }) => {
      const user = users.get(args.where.id);
      if (!user) throw new Error('adminUser not found');
      Object.assign(user, args.data, { updatedAt: new Date() });
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
    findUnique: async (args: { where: { tokenHash: string }; include?: { admin?: boolean } }) => {
      for (const session of sessions.values()) {
        if (session.tokenHash !== args.where.tokenHash) continue;
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
      Object.assign(session, args.data);
      return session;
    },
    updateMany: async (args: { where?: Where; data: Partial<FakeSession> }) => {
      let count = 0;
      for (const session of sessions.values()) {
        if (!matches(session as unknown as Record<string, unknown>, args.where)) continue;
        Object.assign(session, args.data);
        count += 1;
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
      Object.assign(tenant, args.data, { updatedAt: new Date() });
      return tenant;
    },
  },

  tenantSettings: {
    create: async (args: { data: Partial<FakeTenantSettings> & { tenantId: string } }) => {
      const settings: FakeTenantSettings = {
        id: crypto.randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...args.data,
      };
      tenantSettings.set(settings.id, settings);
      return settings;
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
  },

  category: createTaxonomyDelegate(categories),
  genre: createTaxonomyDelegate(genres),
  platform: createTaxonomyDelegate(platforms),

  $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
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
}

export function addFakeUser(
  input: Partial<FakeAdminUser> & { id: string; username: string },
): FakeAdminUser {
  const user = defaults<FakeAdminUser>(input, {
    passwordHash: '',
    role: 'ADMIN',
    tenantId: null,
    isActive: true,
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
  tenantId: string;
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
