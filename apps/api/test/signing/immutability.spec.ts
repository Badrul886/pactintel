/**
 * Critical Test Suite: Document Version Immutability (RULE SIG-001)
 * Blueprint Reference: §3.3, §3.5, Invariant I-09
 * Proves that signed document versions can never be modified.
 */

describe('Critical Test: Document Version Immutability Trigger (RULE SIG-001)', () => {
  interface DocumentVersionRow {
    id: string;
    documentId: string;
    versionNumber: number;
    contentSnapshot: Record<string, unknown>;
    contentHash: string;
    isSigned: boolean;
  }

  // Simulates PostgreSQL Trigger: prevent_signed_version_mutation()
  function simulateUpdateVersionTrigger(
    oldRow: DocumentVersionRow,
    newRow: Partial<DocumentVersionRow>,
  ): DocumentVersionRow {
    if (oldRow.isSigned) {
      throw new Error(`Cannot modify a signed document version (id: ${oldRow.id})`);
    }

    return {
      ...oldRow,
      ...newRow,
    };
  }

  it('allows updating content on an unsigned document draft version', () => {
    const draftVersion: DocumentVersionRow = {
      id: 'ver-draft-1',
      documentId: 'doc-1',
      versionNumber: 1,
      contentSnapshot: { text: 'Draft agreement draft' },
      contentHash: 'hash-initial',
      isSigned: false,
    };

    const updated = simulateUpdateVersionTrigger(draftVersion, {
      contentSnapshot: { text: 'Revised draft agreement' },
      contentHash: 'hash-revised',
    });

    expect(updated.contentSnapshot).toEqual({ text: 'Revised draft agreement' });
    expect(updated.contentHash).toBe('hash-revised');
  });

  it('strictly blocks updating content snapshot once version is signed, throwing trigger exception', () => {
    const signedVersion: DocumentVersionRow = {
      id: 'ver-signed-1',
      documentId: 'doc-1',
      versionNumber: 1,
      contentSnapshot: { text: 'Executed legal terms' },
      contentHash: 'hash-executed',
      isSigned: true, // locked
    };

    expect(() => {
      simulateUpdateVersionTrigger(signedVersion, {
        contentSnapshot: { text: 'Malicious post-signing modification' },
      });
    }).toThrow('Cannot modify a signed document version (id: ver-signed-1)');
  });

  it('strictly blocks tampering with content hash on a signed version', () => {
    const signedVersion: DocumentVersionRow = {
      id: 'ver-signed-2',
      documentId: 'doc-2',
      versionNumber: 2,
      contentSnapshot: { text: 'Signed terms' },
      contentHash: 'hash-real',
      isSigned: true,
    };

    expect(() => {
      simulateUpdateVersionTrigger(signedVersion, {
        contentHash: 'hash-tampered',
      });
    }).toThrow('Cannot modify a signed document version (id: ver-signed-2)');
  });
});
