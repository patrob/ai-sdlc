.PHONY: build test lint clean publish publish-dry

build:
	npm run build

test:
	npm test

lint:
	npm run lint

clean:
	rm -rf dist

publish: clean
	npm publish --tag alpha --access public

publish-dry: clean
	npm publish --tag alpha --access public --dry-run
