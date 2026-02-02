---
*Generated: 2026-02-02*

Perfect! Now I have enough context to create a comprehensive implementation plan. Let me create the plan:

# Implementation Plan: Create AgentFactory for Agent Instantiation

## Phase 1: Setup and Type Definitions

- [ ] **T1**: Create factory module file
  - Files: `src/agents/factory.ts`
  - Dependencies: none
  - Create empty file with module header comment explaining factory pattern purpose

- [ ] **T2**: Define `AgentType` type union
  - Files: `src/agents/factory.ts`
  - Dependencies: T1
  - Define type union with all 9 built-in agent types: 'research', 'planning', 'implementation', 'review', 'single-task', 'orchestrator', 'rework', 'state-assessor', 'refinement'

- [ ] **T3**: Define `AgentFactoryFn` type
  - Files: `src/agents/factory.ts`
  - Dependencies: T1
  - Define type signature: `(provider: IProvider) => IAgent`

- [ ] **T4**: Add necessary imports
  - Files: `src/agents/factory.ts`
  - Dependencies: T2, T3
  - Import `IProvider` from providers, `IAgent` from types, and import statements for all 9 agent classes (note: state-assessor may not extend BaseAgent)

## Phase 2: Core Factory Implementation

- [ ] **T5**: Create `AgentFactory` class skeleton
  - Files: `src/agents/factory.ts`
  - Dependencies: T4
  - Create class with private static `customAgents` Map, private constructor to prevent instantiation

- [ ] **T6**: Implement `create(type: AgentType): IAgent` method
  - Files: `src/agents/factory.ts`
  - Dependencies: T5
  - Get default provider via `ProviderRegistry.getDefault()`, delegate to `createWithProvider()`

- [ ] **T7**: Implement `createWithProvider(type: AgentType, provider: IProvider): IAgent` method
  - Files: `src/agents/factory.ts`
  - Dependencies: T5, T6
  - Check custom agents Map first, fall through to switch statement for built-in agents, instantiate appropriate agent class with provider, throw error for unknown types

- [ ] **T8**: Add all 9 agent type mappings in switch statement
  - Files: `src/agents/factory.ts`
  - Dependencies: T7
  - Map each AgentType to corresponding class instantiation (note: state-assessor may need special handling if it doesn't follow the standard pattern)

- [ ] **T9**: Implement `registerAgent(type: string, factory: AgentFactoryFn): void` method
  - Files: `src/agents/factory.ts`
  - Dependencies: T5
  - Store factory function in `customAgents` Map (allows overwriting)

- [ ] **T10**: Implement `listAgentTypes(): string[]` method
  - Files: `src/agents/factory.ts`
  - Dependencies: T5, T8, T9
  - Combine built-in agent types with custom agent Map keys, sort alphabetically, return array

## Phase 3: Error Handling and Edge Cases

- [ ] **T11**: Add error handling for undefined provider
  - Files: `src/agents/factory.ts`
  - Dependencies: T6
  - Check if `ProviderRegistry.getDefault()` returns undefined, throw descriptive error

- [ ] **T12**: Add error handling for unknown agent types
  - Files: `src/agents/factory.ts`
  - Dependencies: T7
  - Throw error with message format: "Unknown agent type: {type}"

- [ ] **T13**: Handle state-assessor agent special case
  - Files: `src/agents/factory.ts`
  - Dependencies: T8
  - Verify if state-assessor needs different instantiation pattern (it may not extend BaseAgent or take a provider)

## Phase 4: Module Exports

- [ ] **T14**: Export factory class and types from factory module
  - Files: `src/agents/factory.ts`
  - Dependencies: T2, T3, T10
  - Add exports for `AgentFactory`, `AgentType`, `AgentFactoryFn`

- [ ] **T15**: Re-export factory from agents index
  - Files: `src/agents/index.ts`
  - Dependencies: T14
  - Add re-exports for factory class and types to agents barrel export

## Phase 5: Unit Tests - Basic Functionality

- [ ] **T16**: Create test file with setup
  - Files: `src/agents/factory.test.ts`
  - Dependencies: T14
  - Create test file, import dependencies, set up vitest describe blocks, create mock provider for testing

- [ ] **T17**: Test `createWithProvider()` instantiates all built-in agent types
  - Files: `src/agents/factory.test.ts`
  - Dependencies: T16
  - Test each of 9 built-in agent types returns correct agent class, verify agent has injected provider

- [ ] **T18**: Test `create()` uses default provider
  - Files: `src/agents/factory.test.ts`
  - Dependencies: T16
  - Mock `ProviderRegistry.getDefault()`, verify `create()` calls it and passes result to `createWithProvider()`

- [ ] **T19**: Test unknown agent type throws error
  - Files: `src/agents/factory.test.ts`
  - Dependencies: T16
  - Verify calling `createWithProvider()` with invalid type throws descriptive error

## Phase 6: Unit Tests - Custom Agent Registration

- [ ] **T20**: Test `registerAgent()` allows custom agent registration
  - Files: `src/agents/factory.test.ts`
  - Dependencies: T16
  - Register custom agent factory, verify `createWithProvider()` returns custom agent instance

- [ ] **T21**: Test custom agent overrides built-in agent
  - Files: `src/agents/factory.test.ts`
  - Dependencies: T20
  - Register custom factory for built-in agent type (e.g., 'research'), verify custom takes precedence

- [ ] **T22**: Test duplicate registration overwrites previous
  - Files: `src/agents/factory.test.ts`
  - Dependencies: T20
  - Register agent twice with different factories, verify last registration wins

## Phase 7: Unit Tests - Agent Types Listing

- [ ] **T23**: Test `listAgentTypes()` returns all built-in types
  - Files: `src/agents/factory.test.ts`
  - Dependencies: T16
  - Verify all 9 built-in agent types present in returned array

- [ ] **T24**: Test `listAgentTypes()` includes custom agents
  - Files: `src/agents/factory.test.ts`
  - Dependencies: T20, T23
  - Register custom agent, verify it appears in `listAgentTypes()` output

- [ ] **T25**: Test `listAgentTypes()` returns sorted array
  - Files: `src/agents/factory.test.ts`
  - Dependencies: T23
  - Verify returned array is sorted alphabetically

## Phase 8: Unit Tests - Error Conditions

- [ ] **T26**: Test undefined provider error
  - Files: `src/agents/factory.test.ts`
  - Dependencies: T16
  - Mock `ProviderRegistry.getDefault()` to return undefined, verify `create()` throws descriptive error

- [ ] **T27**: Test agent with injected dependencies accessible
  - Files: `src/agents/factory.test.ts`
  - Dependencies: T17
  - Create agent with specific provider, verify agent's methods can access the provider

## Phase 9: Integration Tests

- [ ] **T28**: Create integration test for agent execution
  - Files: `src/agents/factory.test.ts` or `tests/integration/factory.test.ts`
  - Dependencies: T27
  - Create real agent via factory, execute a simple query, verify agent can successfully complete execution (may need to mock provider.query())

- [ ] **T29**: Test factory with ProviderRegistry integration
  - Files: `src/agents/factory.test.ts`
  - Dependencies: T18
  - Register real provider in ProviderRegistry, use factory.create(), verify agent gets correct provider

## Phase 10: Build and Verification

- [ ] **T30**: Run all tests and fix failures
  - Files: all test files
  - Dependencies: T28, T29
  - Execute `npm test`, debug and fix any failing tests

- [ ] **T31**: Run build and fix TypeScript errors
  - Files: all source files
  - Dependencies: T30
  - Execute `npm run build`, resolve any TypeScript compilation errors or warnings

- [ ] **T32**: Verify no circular dependencies
  - Files: `src/agents/factory.ts`, `src/agents/index.ts`
  - Dependencies: T31
  - Check import graph to ensure factory imports agents but agents don't import factory

- [ ] **T33**: Run `make verify` to ensure all checks pass
  - Files: all modified files
  - Dependencies: T32
  - Execute `make verify`, fix any linting errors, format violations, or test failures

## Phase 11: Documentation and Cleanup

- [ ] **T34**: Add JSDoc comments to all factory methods
  - Files: `src/agents/factory.ts`
  - Dependencies: T33
  - Document each public method with @param, @returns, @throws, and @example tags

- [ ] **T35**: Verify type safety and IDE autocomplete
  - Files: `src/agents/factory.ts`
  - Dependencies: T34
  - Test that TypeScript provides proper autocomplete for `AgentType` strings, verify invalid types rejected at compile time

## Definition of Done Checklist

After completing all tasks, verify:

- [ ] `AgentFactory` class exists with all 4 methods (`create`, `createWithProvider`, `registerAgent`, `listAgentTypes`)
- [ ] All 9 built-in agent types supported in switch statement
- [ ] Custom agent registration working and tested
- [ ] `AgentType` and `AgentFactoryFn` types defined and exported
- [ ] Factory and types exported from `src/agents/index.ts`
- [ ] All unit tests written and passing (coverage for each agent type, custom registration, error cases)
- [ ] Integration test confirms created agents can execute successfully
- [ ] `npm test` passes without errors
- [ ] `npm run build` succeeds without warnings
- [ ] `make verify` passes (includes linting, formatting, tests)
- [ ] No TypeScript errors or warnings
- [ ] Code follows SOLID principles (Single Responsibility, Open/Closed via registration)
- [ ] No circular dependencies in import graph
- [ ] JSDoc comments provide clear documentation

---

## Implementation Notes

### State Assessor Special Handling
The `state-assessor` agent exports functions (`runStateAssessor`, `getNextAction`, `hasWork`) rather than a class. You may need to either:
1. Wrap it in a class that implements `IAgent` interface
2. Exclude it from the factory temporarily
3. Verify if there's an unexported class that can be instantiated

Check the actual implementation before Task T13.

### Testing Strategy
- Use mock providers for unit tests (no real AI queries)
- Mock `ProviderRegistry.getDefault()` to control provider injection
- For integration tests, consider using a stub provider that returns predefined responses
- Test isolation: Clear any static state between tests if needed

### Performance Considerations
- Factory methods are simple and should be < 1ms overhead
- No lazy loading needed initially (premature optimization)
- Custom agents Map has O(1) lookup performance