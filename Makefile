# kid-explorer — developer shortcuts
#
#   make test          run the whole suite on the host
#   make test-live     also run the optional pi load smoke test
#   make docker        build and run the suite in a container, offline
#   make docker-live   same, plus install pi and run the live load test
#   make docker-shell  a shell inside the test image
#   make lint          quick structural checks only
#   make install       install into $$PI_HOME (default ~/.pi/agent)
#   make dist          write a tarball to dist/
#
.PHONY: test test-live test-strict docker docker-live docker-shell lint install dist help

SHELL := /bin/bash
ROOT  := $(abspath .)
PI_HOME ?= $(HOME)/.pi/agent

test:
	@$(ROOT)/test/run-all.sh

test-live:
	@PI_TEST_LIVE=1 $(ROOT)/test/run-all.sh

test-strict:
	@$(ROOT)/test/run-all.sh --strict

lint:
	@$(ROOT)/test/run-all.sh --only structure
	@$(ROOT)/test/run-all.sh --only frontmatter
	@$(ROOT)/test/run-all.sh --only content-lint
	@$(ROOT)/test/run-all.sh --only safety

docker:
	@$(ROOT)/test/docker-test.sh

docker-live:
	@$(ROOT)/test/docker-test.sh --live

docker-isolated:
	@$(ROOT)/test/docker-test.sh --per-suite --repeat 2

docker-shell:
	@$(ROOT)/test/docker-test.sh --shell

install:
	@PI_HOME="$(PI_HOME)" $(ROOT)/install.sh

dist:
	@mkdir -p $(ROOT)/dist
	@tar --create --gzip \
		--exclude='.git' --exclude='dist' --exclude='node_modules' \
		--transform='s,^\.,kid-explorer,' \
		--file=$(ROOT)/dist/kid-explorer.tar.gz \
		-C $(ROOT) .
	@printf 'wrote %s\n' $(ROOT)/dist/kid-explorer.tar.gz

help:
	@sed -n '2,14p' Makefile
