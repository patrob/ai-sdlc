/**
 * Agent Factory for centralized agent instantiation
 *
 * This module provides a type-safe factory for creating agent instances with
 * proper dependency injection. The factory pattern enables:
 * - Consistent agent initialization with provider injection
 * - Simplified testing through provider override
 * - Runtime extensibility via custom agent registration
 * - Type-safe agent resolution by AgentType
 *
 * The factory uses adapter classes to wrap existing function-based agents,
 * providing a consistent IAgent interface while maintaining backward compatibility.
 *
 * @example
 * ```typescript
 * // Create agent with default provider
 * const researchAgent = AgentFactory.create('research');
 *
 * // Create agent with custom provider (for testing)
 * const mockProvider = new MockProvider();
 * const planningAgent = AgentFactory.createWithProvider('planning', mockProvider);
 *
 * // Register custom agent
 * AgentFactory.registerAgent('custom', (provider) => new CustomAgent(provider));
 *
 * // List all available agent types
 * const types = AgentFactory.listAgentTypes();
 * ```
 */

export { AgentFactory,type AgentFactoryFn, type AgentType } from './factory/factory.js';
