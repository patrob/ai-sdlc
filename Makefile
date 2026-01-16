.PHONY: build test test-integration lint clean publish publish-dry verify

build:
	npm run build

test:
	npm test

test-integration:
	npm run test:integration

lint:
	npm run lint

clean:
	rm -rf dist

publish: clean
	npm publish --tag alpha --access public

publish-dry: clean
	npm publish --tag alpha --access public --dry-run

verify: lint build test test-integration
	@echo "All checks passed - ready for commit"
