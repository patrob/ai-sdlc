import { StoryStatus } from '../../types/index.js';
import { Ticket, TicketFilter, NewTicket, TicketProvider } from './types.js';

/**
 * No-op ticket provider for local-only mode.
 *
 * This provider is used when no external ticketing system is configured
 * (ticketing.provider = 'none' or ticketing section is absent). It ensures
 * that the system continues to work exactly as it did before ticketing
 * integration was added.
 *
 * Design decisions:
 * - Read operations (list, get, create) throw errors since there's no data
 * - Write operations (updateStatus, addComment, linkPR) are no-ops (silent)
 * - Status mapping returns values unchanged (identity function)
 *
 * The silent no-op behavior for write operations ensures that code can
 * safely call these methods without conditional checks, and local-only
 * workflows continue to function without any changes.
 */
export class NullTicketProvider implements TicketProvider {
  readonly name = 'none';

  /**
   * Returns an empty array since no tickets exist in local-only mode.
   */
  async list(_filter?: TicketFilter): Promise<Ticket[]> {
    return [];
  }

  /**
   * Throws an error since there's no ticket provider to fetch from.
   * @throws Error always
   */
  async get(_id: string): Promise<Ticket> {
    throw new Error('No ticket provider configured');
  }

  /**
   * Throws an error since there's no ticket provider to create in.
   * @throws Error always
   */
  async create(_ticket: NewTicket): Promise<Ticket> {
    throw new Error('No ticket provider configured');
  }

  /**
   * No-op: Status updates are silently ignored in local-only mode.
   */
  async updateStatus(_id: string, _status: string): Promise<void> {
    // No-op: Local-only mode doesn't sync status
  }

  /**
   * No-op: Comments are silently ignored in local-only mode.
   */
  async addComment(_id: string, _body: string): Promise<void> {
    // No-op: Local-only mode doesn't post comments
  }

  /**
   * No-op: PR links are silently ignored in local-only mode.
   */
  async linkPR(_id: string, _prUrl: string): Promise<void> {
    // No-op: Local-only mode doesn't link PRs
  }

  /**
   * Returns the status unchanged (identity mapping).
   */
  mapStatusToExternal(status: StoryStatus): string {
    return status;
  }

  /**
   * Returns the status unchanged (identity mapping).
   * Casts to StoryStatus without validation since local-only mode
   * doesn't enforce external status values.
   */
  mapStatusFromExternal(externalStatus: string): StoryStatus {
    return externalStatus as StoryStatus;
  }

  /**
   * Returns null since there's no external priority to sync in local-only mode.
   */
  async syncPriority(_ticketId: string): Promise<number | null> {
    return null;
  }
}
