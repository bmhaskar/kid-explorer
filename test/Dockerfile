# syntax=docker/dockerfile
#
# Test image for the kid-explorer skill.
#
#   docker build -f test/Dockerfile -t kid-explorer:test .
#   docker run --rm --network none kid-explorer:test
#
# The suite is fully offline: build with network, run with --network none.
# The `live` stage additionally installs pi so the optional live-load smoke
# test can run (that one is still opt-in via PI_TEST_LIVE=1).

ARG NODE_IMAGE=node:26-bookworm-slim

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS base

ARG NODE_IMAGE
ENV DEBIAN_FRONTEND=noninteractive \
    DEBIAN_PRIORITY=low \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

RUN apt-get update \
 && apt-get install -y --no-install-recommends --no-install-suggests \
      ca-certificates \
      git \
      grep \
      procps \
      coreutils \
 && rm -rf /var/lib/apt/lists/* /var/cache/apt/* /tmp/* \
 && apt-get clean all

# Run the suite unprivileged: the installer has to work for a child account,
# not only for root. The node base image already ships a `node` user at uid 1000.
RUN mkdir -p /home/node/.pi/agent && chown -R node:node /home/node

WORKDIR /app
COPY --chown=node:node . /app

RUN chmod +x /app/install.sh /app/test/*.sh \
 && node --version && bash --version | head -1

USER node
ENV HOME=/home/node
ENV PI_HOME=/home/node/.pi/agent
ENV NO_COLOR=1
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

LABEL org.opencontainers.image.title="kid-explorer test image" \
      org.opencontainers.image.description="Offline test harness for the kid-explorer pi skill" \
      org.opencontainers.image.license="MIT"

CMD ["/app/test/run-all.sh"]

# ---------------------------------------------------------------------------
# Optional: pi itself, for the live-load smoke test.
#
#   docker build -f test/Dockerfile --target live -t kid-explorer:live .
#   docker run --rm -e PI_TEST_LIVE=1 kid-explorer:live
# ---------------------------------------------------------------------------
FROM base AS live

USER root
RUN npm install --global --omit=dev @earendil-works/pi-coding-agent \
 && pi --version || true
USER node
ENV PI_TEST_LIVE=1
