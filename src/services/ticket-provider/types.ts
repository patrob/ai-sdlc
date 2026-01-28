import { StoryStatus } from '../../types/index.js';

/**
 * Represents a ticket from an external ticketing system.
 */
export interface Ticket {
  /** Unique identifier for the ticket (e.g., issue number, ticket ID) */
  id: string;
  /** Full URL to the ticket in the external system */
  url: string;
  /** Title or summary of the ticket */
  title: string;
  /** Full description or body of the ticket */
  description: string;
  /** Current status in the external system */
  status: string;
  /** Priority level (1 = highest, higher numbers = lower priority) */
  priority: number;
  /** Labels or tags associated with the ticket */
  labels: string[];
  /** Optional assignee username or identifier */
  assignee?: string;
}

/**
 * Filter criteria for listing tickets.
 */
export interface TicketFilter {
  /** Filter by status values */
  status?: string[];
  /** Filter by labels (all labels must match) */
  labels?: string[];
  /** Filter by assignee */
  assignee?: string;
  /** Maximum number of results to return */
  limit?: number;
}

/**
 * Data required to create a new ticket.
 */
export interface NewTicket {
  /** Title or summary of the ticket */
  title: string;
  /** Full description or body of the ticket */
  description: string;
  /** Optional labels to apply to the ticket */
  labels?: string[];
  /** Optional assignee username or identifier */
  assignee?: string;
  /** Optional priority level (1 = highest) */
  priority?: number;
}

/**
 * Provider interface for external ticketing systems.
 *
 * Implementations provide integration with systems like GitHub Issues,
 * Jira, Linear, etc. The NullTicketProvider serves as a no-op default
 * when no ticketing system is configured.
 */
export interface TicketProvider {
  /** Name of the provider (e.g., 'github', 'jira', 'none') */
  readonly name: string;

  // Read operations

  /**
   * List tickets matching the given filter criteria.
   * @param filter Optional filter criteria
   * @returns Array of matching tickets
   */
  list(filter?: TicketFilter): Promise<Ticket[]>;

  /**
   * Get a single ticket by its ID.
   * @param id Ticket identifier
   * @returns The ticket details
   * @throws Error if ticket not found or provider not configured
   */
  get(id: string): Promise<Ticket>;

  // Write operations

  /**
   * Create a new ticket.
   * @param ticket Data for the new ticket
   * @returns The created ticket with its assigned ID
   * @throws Error if provider not configured
   */
  create(ticket: NewTicket): Promise<Ticket>;

  /**
   * Update the status of a ticket.
   * @param id Ticket identifier
   * @param status New status value (provider-specific)
   * @throws Error if ticket not found (provider-dependent)
   */
  updateStatus(id: string, status: string): Promise<void>;

  /**
   * Add a comment to a ticket.
   * @param id Ticket identifier
   * @param body Comment text (supports markdown)
   * @throws Error if ticket not found (provider-dependent)
   */
  addComment(id: string, body: string): Promise<void>;

  /**
   * Link a pull request to a ticket.
   * @param id Ticket identifier
   * @param prUrl Pull request URL
   * @throws Error if ticket not found (provider-dependent)
   */
  linkPR(id: string, prUrl: string): Promise<void>;

  // Status mapping

  /**
   * Map internal story status to external ticketing system status.
   * @param status Internal StoryStatus value
   * @returns External status string (provider-specific)
   */
  mapStatusToExternal(status: StoryStatus): string;

  /**
   * Map external ticketing system status to internal story status.
   * @param externalStatus External status string (provider-specific)
   * @returns Internal StoryStatus value
   */
  mapStatusFromExternal(externalStatus: string): StoryStatus;

  // Priority sync (optional)

  /**
   * Sync priority from external ticketing system (e.g., GitHub Projects).
   * Returns the normalized priority value from the project board, or null
   * if the ticket is not in a project or projects are not configured.
   *
   * @param ticketId Ticket identifier
   * @returns Normalized priority value (10, 20, 30, etc.) or null if not in project
   */
  syncPriority?(ticketId: string): Promise<number | null>;
}
