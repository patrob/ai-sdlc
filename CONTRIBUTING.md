# Contributing to agentic-workflow

Thank you for your interest in contributing to agentic-workflow! We welcome contributions from the community, whether they're bug fixes, new features, documentation improvements, or other enhancements.

## Getting Started

### Prerequisites

- Node.js 20+ and npm 9+
- Git

### Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/your-username/agentic-workflow.git
   cd agentic-workflow
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the project**
   ```bash
   npm run build
   ```

4. **Run the test suite**
   ```bash
   npm test
   ```

All commands should complete without errors. If you encounter any issues, please open a GitHub issue.

## Code Style

This project maintains consistent code quality through TypeScript and automated tooling.

### TypeScript

- All code must be written in TypeScript with strict mode enabled
- Use explicit type annotations for function parameters and return types
- Leverage TypeScript's type system to catch errors at compile time

### Linting

We use ESLint to enforce code quality standards.

- Run `npm run lint` to check for style violations
- Fix automatically fixable issues with `npm run lint -- --fix`

### Formatting

We use Prettier for consistent code formatting.

- All code should be formatted according to the project's Prettier configuration
- Most editors can be configured to format on save

## Making Changes

### Before You Start

1. Check the issue tracker to see if your change is already being worked on
2. For significant changes, open an issue first to discuss your approach
3. Ensure your change aligns with the project's goals and roadmap

### Development Workflow

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Write clear, descriptive commit messages
   - Keep commits focused and atomic
   - Include tests for new functionality

3. **Verify your work**
   ```bash
   npm run lint
   npm run build
   npm test
   ```

   All commands must pass before submitting your PR.

### Testing Requirements

- **Add tests for new features** - Ensure new functionality is covered by tests
- **Don't break existing tests** - All existing tests must continue to pass
- **Run the full test suite** - Execute `npm test` to verify your changes don't introduce regressions

Tests should be comprehensive enough to catch edge cases and ensure reliability.

## Pull Request Process

1. **Create a descriptive PR title and description**
   - Clearly explain what changes you're making and why
   - Include any relevant context or background

2. **Link related issues**
   - Use GitHub's linking syntax: "Closes #123" or "Relates to #456"
   - This helps track changes across the project

3. **Ensure all checks pass**
   - GitHub Actions CI/CD must pass
   - Code coverage should remain healthy
   - No merge conflicts with the main branch

4. **Request review**
   - Tag relevant maintainers for review
   - Respond to feedback promptly and professionally
   - Be open to suggestions for improvement

5. **Merge**
   - Once approved, maintainers will merge your PR
   - Thank you for your contribution!

## Code Review Guidelines

When submitting code for review:

- Keep PRs focused and reasonably sized for review
- Provide context and explanation of your approach
- Be receptive to constructive feedback
- Ask questions if review comments aren't clear

When reviewing others' code:

- Be respectful and constructive
- Explain the reasoning behind suggestions
- Acknowledge good solutions and improvements
- Help maintain code quality and consistency

## Questions or Need Help?

- Open an issue on GitHub for bugs or feature requests
- Reach out to maintainers via GitHub discussions for questions
- Check existing documentation and closed issues for answers

Thank you for contributing to agentic-workflow!
