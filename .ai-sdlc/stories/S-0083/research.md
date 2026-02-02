---
*Generated: 2026-02-02*

Excellent! Now I have all the context I need. Let me compile comprehensive research findings.

# Research Findings

## Problem Summary

The core goal is to create a centralized `AgentFactory` class that provides type-safe instantiation of all agent types with proper dependency injection. This factory will replace direct agent instantiation (via function calls) with a unified creation mechanism that:

1. **Ensures consistent initialization** - All agents receive provider dependency via factory
2. **Enables dependency injection** - Allows provider override for testing
3. **Supports extensibility** - Allows custom agent registration at runtime
4. **Provides type safety** - Uses TypeScript discriminated unions to map agent types to implementations

The factory follows the **Factory Pattern** (Gang of Four) and implements the **Open/Closed Principle** by being open for extension (via `registerAgent()`) but closed for modification.

## Codebase Context

### Current Agent Architecture

The codebase has **two agent implementation patterns** coexisting:

#### Pattern 1: BaseAgent Class (New, Preferred)
- **Abstract class**: `src/agents/base-agent.ts` (lines 67-340)
- **Interface**: `IAgent` in `src/agents/types.ts` (lines 90-131)
- **Constructor signature**: `constructor(provider: IProvider)`
- **Capabilities validation**: Automatic in BaseAgent constructor
- **Test example**: `src/agents/base-agent.test.ts` shows `new TestAgent(provider)`

**Key insight**: The `BaseAgent` class exists but **NO production agents extend it yet**. All current agents are function-based.

#### Pattern 2: Function-Based Agents (Current, Legacy)
- **Export pattern**: `export async function runXxxAgent(storyPath, sdlcRoot, options?)`
- **Examples**:
  - `runResearchAgent` - `src/agents/research.ts:195`
  - `runPlanningAgent` - `src/agents/planning.ts:152`
  - `runImplementationAgent` - `src/agents/implementation.ts:1112`
  - `runReviewAgent` - `src/agents/review.ts:1113`
  - `runSingleTaskAgent` - `src/agents/single-task.ts:383`
  - `runReworkAgent` - `src/agents/rework.ts:21`
  - `runRefinementAgent` - `src/agents/refinement.ts:29`

**Critical gap**: The story assumes agents are class-based (`ResearchAgent`, `PlanningAgent`), but they're actually function-based. The factory must either:
1. Wrap functions in adapter classes that implement `IAgent`, OR
2. Create new class-based agents extending `BaseAgent` (larger scope)

### Provider System

The `ProviderRegistry` provides a perfect template for the factory pattern:

- **File**: `src/providers/registry.ts`
- **Pattern**: Static class with private Maps
- **Key methods**:
  - `register(name, factory)` - Register factory function
  - `get(name)` - Lazy instantiation with caching
  - `getDefault()` - Uses env var with fallback
  - `listProviders()` - List all registered providers
  - `hasProvider(name)` - Check if provider exists
  - `clearInstances()` - Clear cache (testing)
  - `reset()` - Full reset (testing)

**Testing pattern**: `src/providers/registry.test.ts` (430 lines) shows comprehensive testing including:
- Lazy instantiation verification
- Factory call counting
- Error handling
- Edge cases
- Integration scenarios

### Agent Context Pattern

Agents use `AgentContext` for execution context:

\`\`\`typescript
interface AgentContext {
  storyPath: string;
  sdlcRoot: string;
  provider: IProvider;
  options?: AgentOptions;
}
\`\`\`

This is defined in `src/agents/types.ts:43-52`.

### Type Definitions

**Current AgentOptions**: `src/agents/research.ts:182-187`
\`\`\`typescript
export interface AgentOptions {
  reworkContext?: string;
  onProgress?: AgentProgressCallback;
}
\`\`\`

**AgentResult**: Re-exported from `src/types/index.ts` via `src/agents/types.ts:15,19`

## Files Requiring Changes

### 1. `src/agents/factory.ts`
- **Change Type**: Create New
- **Reason**: Core factory implementation
- **Specific Changes**:
  - Define `AgentType` union with 9 agent types: `'research' | 'planning' | 'implementation' | 'review' | 'single-task' | 'orchestrator' | 'rework' | 'state-assessor' | 'refinement'`
  - Define `AgentFactoryFn = (provider: IProvider) => IAgent`
  - Implement `AgentFactory` class with static methods
  - Private static `Map<string, AgentFactoryFn>` for custom agents
  - Methods: `create()`, `createWithProvider()`, `registerAgent()`, `listAgentTypes()`
  - **Critical decision**: Wrap existing function-based agents in adapter classes OR create new class-based agents
  - Import all 9 agent functions (research, planning, etc.)
  - Create adapter classes for each function-based agent
- **Dependencies**: None (foundational file)

### 2. `src/agents/types.ts`
- **Change Type**: Modify Existing
- **Reason**: May need to export factory types if not placed in factory.ts
- **Specific Changes**:
  - No changes needed if types are exported from `factory.ts` directly
  - Review after implementing factory to ensure clean exports
- **Dependencies**: After factory.ts creation

### 3. `src/agents/index.ts`
- **Change Type**: Modify Existing
- **Reason**: Export factory and types for public API
- **Specific Changes**:
  - Add: `export { AgentFactory, AgentType, AgentFactoryFn } from './factory.js';`
  - Maintain all existing exports (function-based agents still usable)
- **Dependencies**: After factory.ts creation

### 4. `src/agents/factory.test.ts`
- **Change Type**: Create New
- **Reason**: Comprehensive unit tests for factory
- **Specific Changes**:
  - Test all 9 built-in agent types instantiate correctly
  - Test `createWithProvider()` uses provided provider
  - Test `registerAgent()` for custom agents
  - Test custom agent precedence over built-in
  - Test `listAgentTypes()` returns all types
  - Test error handling for unknown types
  - Test provider injection works (agent can execute queries)
  - Follow `registry.test.ts` pattern (430 lines)
  - Use mock provider from `base-agent.test.ts:21-44`
- **Dependencies**: After factory.ts creation

### 5. `tests/integration/agent-factory.test.ts` (optional but recommended)
- **Change Type**: Create New
- **Reason**: Integration test verifying created agents can execute
- **Specific Changes**:
  - Create real provider (or mock with full capabilities)
  - Use factory to create each agent type
  - Verify agents can execute basic queries successfully
  - Test that dependency injection is working end-to-end
- **Dependencies**: After factory.ts and unit tests complete

## Testing Strategy

### Test Files to Create

1. **`src/agents/factory.test.ts`** (Unit tests - 400-500 lines)
   - Factory instantiation tests
   - Type mapping verification
   - Custom agent registration
   - Error handling

2. **`tests/integration/agent-factory.test.ts`** (Integration test - 100-150 lines)
   - End-to-end agent creation and execution
   - Provider integration verification

### Test Scenarios

#### Unit Tests (factory.test.ts)

**Happy Path:**
- ✅ `create('research')` returns agent with correct name
- ✅ `createWithProvider(type, mockProvider)` uses provided provider
- ✅ `registerAgent('custom', factory)` allows custom agents
- ✅ `listAgentTypes()` returns all 9 + custom types sorted
- ✅ Custom agent overrides built-in when registered with same name

**Edge Cases:**
- ✅ Unknown agent type throws: `Error("Unknown agent type: invalid")`
- ✅ `ProviderRegistry.getDefault()` returns undefined → handled gracefully
- ✅ Empty string as agent type (should error)
- ✅ Case sensitivity verified ('Research' !== 'research')
- ✅ Duplicate registration (last wins)
- ✅ Factory returns agent with correct `requiredCapabilities`

**Error Handling:**
- ✅ Custom factory throws error → propagates to caller
- ✅ Provider doesn't support required capabilities → error message includes capability name
- ✅ Error messages include agent type for debugging

#### Integration Tests (agent-factory.test.ts)

**Execution Flow:**
- ✅ Create agent via factory → call `execute(context)` → verify success
- ✅ Provider query called with correct arguments
- ✅ Multiple agents from same factory share provider instance
- ✅ Created agents can handle real-world context objects

### Test Utilities

**Reuse from existing tests:**
- Mock provider factory: `src/agents/base-agent.test.ts:21-44`
- Mock context factory: `src/agents/base-agent.test.ts:49-56`
- Mock story factory: `src/agents/base-agent.test.ts:61-81`

**Test isolation:**
- Clear custom agents between tests (add `reset()` method like ProviderRegistry)
- No need to clear instances (stateless factory)

## Additional Context

### Relevant Patterns

#### 1. ProviderRegistry Pattern (Template)
**File**: `src/providers/registry.ts`
- Static class (no instantiation)
- Private static Maps for state
- Lazy instantiation with caching
- Descriptive error messages with available options
- Test-friendly with `reset()` and `clearInstances()`

**Apply to AgentFactory:**
- Use static class pattern
- Private static `Map<string, AgentFactoryFn>` for custom agents
- **Key difference**: Agents are NOT cached (new instance per `create()` call)
- Include helper `reset()` for testing

#### 2. BaseAgent Template Method Pattern
**File**: `src/agents/base-agent.ts`
- Abstract base class with lifecycle hooks
- Constructor-based dependency injection
- Capability validation on first execution
- Never throws - returns `AgentResult` with error

**Apply to AgentFactory:**
- Factory creates agents by calling `new XxxAgent(provider)`
- Provider validation happens in agent constructor (defer to BaseAgent)
- Factory doesn't need to validate capabilities (agent handles it)

#### 3. Function-Based Agent Pattern (Current)
**Files**: All agent files (research.ts, planning.ts, etc.)
- Export: `export async function runXxxAgent(storyPath, sdlcRoot, options?)`
- Provider obtained via `ProviderRegistry.getDefault()` internally
- Direct imports from dependencies

**Migration strategy for factory:**
- Create adapter classes wrapping function calls
- Adapter implements `IAgent` interface
- Adapter converts `execu