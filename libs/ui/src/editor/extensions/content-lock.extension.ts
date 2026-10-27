import { Extension } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface ContentLockItem {
  blockId: string;
  lockedById: string;
  lockedByName?: string;
  lockedAt?: string;
}

export interface ContentLockOptions {
  locks: ContentLockItem[];
  currentUserId: string;
}

export const ContentLockPluginKey = new PluginKey('contentLock');

export const ContentLockExtension = Extension.create<ContentLockOptions>({
  name: 'contentLock',

  addOptions() {
    return {
      locks: [],
      currentUserId: '',
    };
  },

  addProseMirrorPlugins() {
    const extension = this;

    return [
      new Plugin({
        key: ContentLockPluginKey,
        props: {
          decorations(state) {
            const { locks, currentUserId } = extension.options;
            if (!locks || locks.length === 0) {
              return DecorationSet.empty;
            }

            const lockMap = new Map<string, ContentLockItem>();
            locks.forEach((l) => lockMap.set(l.blockId, l));

            const decorations: Decoration[] = [];
            let blockIndex = 0;

            state.doc.descendants((node, pos) => {
              if (node.isBlock) {
                // Read blockId attribute, id attribute, or index fallback
                const blockId = (node.attrs.blockId ||
                  node.attrs.id ||
                  `section-${blockIndex}`) as string;
                blockIndex++;

                const lock = lockMap.get(blockId);
                if (lock) {
                  const isLockedByOther = lock.lockedById !== currentUserId;
                  const className = isLockedByOther
                    ? 'content-block-locked border-l-4 border-amber-500 bg-amber-50/30'
                    : 'content-block-locked-by-me border-l-4 border-blue-500 bg-blue-50/20';

                  decorations.push(
                    Decoration.node(pos, pos + node.nodeSize, {
                      class: className,
                      'data-locked-by': lock.lockedById,
                      'data-block-id': blockId,
                      'data-locked-by-name': lock.lockedByName || 'Another collaborator',
                      ...(isLockedByOther ? { contenteditable: 'false' } : {}),
                    }),
                  );
                }
              }
            });

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
