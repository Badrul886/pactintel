import { Test, TestingModule } from '@nestjs/testing';
import { DealRoomService } from '../../src/modules/deal-room/deal-room.service';
import { DealRoomMessageService } from '../../src/modules/deal-room/deal-room-message.service';
import { DealRoomMagicLinkService } from '../../src/modules/deal-room/deal-room-magic-link.service';
import { DealRoomMemberService } from '../../src/modules/deal-room/deal-room-member.service';
import { DealRoomDocumentService } from '../../src/modules/deal-room/deal-room-document.service';
import { DealRoomRepository } from '../../src/modules/deal-room/deal-room.repository';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Deal Room End-to-End Orchestration & Boundary Verification
 * Validates:
 * 1. Deal Room creation and automatic seller lead assignment
 * 2. Magic link cryptographic generation and buyer guest authentication
 * 3. Chat visibility partitioning (internal seller notes hidden from buyer)
 * 4. Multi-tenant boundary isolation
 */
describe('DealRoom Orchestration & Boundary Tests', () => {
  let roomService: DealRoomService;
  let messageService: DealRoomMessageService;
  let magicLinkService: DealRoomMagicLinkService;
  let memberService: DealRoomMemberService;

  const orgA = '00000000-0000-7000-8000-000000000001';
  const orgB = '00000000-0000-7000-8000-000000000002';
  const userSeller = '11111111-1111-7111-8111-111111111111';

  // In-memory mock database store to simulate Prisma and Outbox
  const store = {
    dealRooms: new Map<string, any>(),
    members: new Map<string, any>(),
    documents: new Map<string, any>(),
    messages: new Map<string, any>(),
    magicLinks: new Map<string, any>(),
    outbox: [] as any[],
  };

  beforeEach(async () => {
    store.dealRooms.clear();
    store.members.clear();
    store.documents.clear();
    store.messages.clear();
    store.magicLinks.clear();
    store.outbox = [];

    const mockRepo: Partial<DealRoomRepository> = {
      async createDealRoom(orgId, createdBy, creatorName, creatorEmail, data) {
        const id = `room-${Date.now()}-${Math.random()}`;
        const room = {
          id,
          organizationId: orgId,
          workspaceId: data.workspaceId,
          title: data.title,
          slug: data.slug,
          brandKitId: data.brandKitId || null,
          mutualActionPlan: data.mutualActionPlan || [],
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        };
        store.dealRooms.set(id, room);

        const memId = `mem-${Date.now()}`;
        store.members.set(memId, {
          id: memId,
          organizationId: orgId,
          dealRoomId: id,
          userId: createdBy,
          externalEmail: creatorEmail,
          externalName: creatorName,
          role: 'owner',
          createdAt: new Date(),
        });

        store.outbox.push({
          eventType: 'deal_room.created',
          aggregateId: id,
          payload: { dealRoomId: id, title: room.title },
        });

        return room as any;
      },

      async findDealRooms(orgId, _params) {
        const results = [];
        for (const room of store.dealRooms.values()) {
          if (room.organizationId === orgId && !room.deletedAt) {
            results.push(room);
          }
        }
        return { items: results, nextCursor: null, hasMore: false } as any;
      },

      async findDealRoomBySlug(slug, orgId) {
        for (const room of store.dealRooms.values()) {
          if (room.slug === slug && (!orgId || room.organizationId === orgId) && !room.deletedAt) {
            return room;
          }
        }
        return null;
      },

      async findDealRoomById(orgId, id) {
        const room = store.dealRooms.get(id);
        if (room && room.organizationId === orgId && !room.deletedAt) {
          const roomMembers = Array.from(store.members.values()).filter((m) => m.dealRoomId === id);
          const roomDocs = Array.from(store.documents.values()).filter((d) => d.dealRoomId === id);
          return {
            ...room,
            members: roomMembers,
            documents: roomDocs,
          };
        }
        return null;
      },

      async addMember(orgId, dealRoomId, data) {
        const id = `mem-${Date.now()}-${Math.random()}`;
        const mem = {
          id,
          organizationId: orgId,
          dealRoomId,
          userId: data.userId || null,
          externalEmail: data.externalEmail || null,
          externalName: data.externalName || null,
          role: data.role,
          createdAt: new Date(),
        };
        store.members.set(id, mem);
        return mem as any;
      },

      async findMemberByEmail(orgId, dealRoomId, email) {
        for (const m of store.members.values()) {
          if (
            m.dealRoomId === dealRoomId &&
            m.organizationId === orgId &&
            m.externalEmail === email
          ) {
            return m;
          }
        }
        return null;
      },

      async findMemberById(orgId, dealRoomId, memberId) {
        const m = store.members.get(memberId);
        if (m && m.organizationId === orgId && m.dealRoomId === dealRoomId) {
          return m;
        }
        return null;
      },

      async createMagicLink(orgId, dealRoomId, memberId, tokenHash, expiresAt) {
        const id = `link-${Date.now()}`;
        const link = {
          id,
          organizationId: orgId,
          dealRoomId,
          memberId,
          tokenHash,
          expiresAt,
          usedAt: null,
          createdAt: new Date(),
        };
        store.magicLinks.set(id, link);
        return link as any;
      },

      async findMagicLinkByHash(tokenHash) {
        for (const link of store.magicLinks.values()) {
          if (link.tokenHash === tokenHash) {
            const room = store.dealRooms.get(link.dealRoomId);
            const member = store.members.get(link.memberId);
            return {
              ...link,
              dealRoom: room,
              member,
            };
          }
        }
        return null;
      },

      async recordMagicLinkUse(id) {
        const link = store.magicLinks.get(id);
        if (link) {
          link.usedAt = new Date();
          return link;
        }
        return {} as any;
      },

      async createMessage(orgId, dealRoomId, data) {
        const id = `msg-${Date.now()}-${Math.random()}`;
        const msg = {
          id,
          organizationId: orgId,
          dealRoomId,
          authorUserId: data.authorUserId || null,
          authorName: data.authorName || null,
          authorEmail: data.authorEmail || null,
          body: data.body,
          visibility: data.visibility,
          parentId: data.parentId || null,
          createdAt: new Date(),
          deletedAt: null,
        };
        store.messages.set(id, msg);
        return msg as any;
      },

      async findMessages(orgId, dealRoomId, visibilityFilter) {
        const results = [];
        for (const msg of store.messages.values()) {
          if (msg.dealRoomId === dealRoomId && msg.organizationId === orgId && !msg.deletedAt) {
            if (visibilityFilter === 'external' && msg.visibility !== 'external') {
              continue;
            }
            results.push(msg);
          }
        }
        return results as any;
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DealRoomService,
        DealRoomMessageService,
        DealRoomMagicLinkService,
        DealRoomMemberService,
        DealRoomDocumentService,
        {
          provide: DealRoomRepository,
          useValue: mockRepo,
        },
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    roomService = module.get<DealRoomService>(DealRoomService);
    messageService = module.get<DealRoomMessageService>(DealRoomMessageService);
    magicLinkService = module.get<DealRoomMagicLinkService>(DealRoomMagicLinkService);
    memberService = module.get<DealRoomMemberService>(DealRoomMemberService);
  });

  it('Scenario 1: Creates deal room with transactional outbox and default milestones', async () => {
    const room = await roomService.createDealRoom(
      orgA,
      userSeller,
      'Seller Lead',
      'seller@pactintel.com',
      {
        workspaceId: 'ws-1',
        title: 'Q4 Enterprise Expansion',
      },
    );

    expect(room.id).toBeDefined();
    expect(room.slug).toBe('q4-enterprise-expansion');
    expect(room.status).toBe('active');
    expect(room.mutualActionPlan).toHaveLength(5);

    // Verify outbox event written
    expect(store.outbox).toContainEqual(
      expect.objectContaining({
        eventType: 'deal_room.created',
        aggregateId: room.id,
      }),
    );
  });

  it('Scenario 2: Buyer invitation generates magic link and authenticates guest session', async () => {
    const room = await roomService.createDealRoom(
      orgA,
      userSeller,
      'Seller Lead',
      'seller@pactintel.com',
      {
        workspaceId: 'ws-1',
        title: 'Acme SaaS Deal',
      },
    );

    // Invite buyer
    const inviteRes = await memberService.inviteMember(
      orgA,
      room.id,
      {
        externalEmail: 'cfo@acme.com',
        externalName: 'Acme CFO',
        role: 'viewer',
      },
      { baseUrl: 'https://pactintel.com' },
    );

    expect(inviteRes.member.externalEmail).toBe('cfo@acme.com');
    expect(inviteRes.magicLink).toBeDefined();
    expect(inviteRes.magicLink?.rawToken).toHaveLength(64);
    expect(inviteRes.magicLink?.url).toContain(`/r/${room.slug}?token=`);

    // Buyer visits with rawToken
    const guestSession = await magicLinkService.verifyMagicLink(inviteRes.magicLink!.rawToken);
    expect(guestSession.isExternalGuest).toBe(true);
    expect(guestSession.email).toBe('cfo@acme.com');
    expect(guestSession.dealRoomId).toBe(room.id);
  });

  it('Scenario 3: Strict SQL visibility partitioning protects internal seller notes', async () => {
    const room = await roomService.createDealRoom(
      orgA,
      userSeller,
      'Seller Lead',
      'seller@pactintel.com',
      {
        workspaceId: 'ws-1',
        title: 'Confidential Negotiations',
      },
    );

    // 1. Seller posts an internal margin note
    await messageService.postMessage(
      orgA,
      room.id,
      { userId: userSeller, name: 'Seller Lead', isExternalGuest: false },
      { body: 'Internal note: maximum approved discount is 25%', visibility: 'internal' },
    );

    // 2. Seller posts an external greeting to buyer
    await messageService.postMessage(
      orgA,
      room.id,
      { userId: userSeller, name: 'Seller Lead', isExternalGuest: false },
      { body: 'Welcome Acme Team! Excited to partner.', visibility: 'external' },
    );

    // 3. Buyer queries messages
    const buyerMessages = await messageService.getMessages(orgA, room.id, {
      isExternalGuest: true,
      visibilityFilter: 'all', // Attempting to ask for all
    });

    // Buyer sees ONLY 1 message (external greeting) - internal note is completely omitted!
    expect(buyerMessages).toHaveLength(1);
    expect(buyerMessages[0].body).toBe('Welcome Acme Team! Excited to partner.');
    expect(buyerMessages[0].visibility).toBe('external');

    // 4. Seller queries messages
    const sellerMessages = await messageService.getMessages(orgA, room.id, {
      isExternalGuest: false,
      visibilityFilter: 'all',
    });

    // Seller sees BOTH messages
    expect(sellerMessages).toHaveLength(2);
  });

  it('Scenario 4: Multi-tenant boundary prevents Org B from accessing Org A Deal Room', async () => {
    const roomA = await roomService.createDealRoom(
      orgA,
      userSeller,
      'Seller Lead',
      'seller@pactintel.com',
      {
        workspaceId: 'ws-1',
        title: 'Org A Secret Deal',
      },
    );

    // Org B attempts to look up room A by ID
    const crossTenantRoom = await roomService.getDealRooms(orgB, { search: roomA.title });
    expect(crossTenantRoom.items).toHaveLength(0);
  });
});
