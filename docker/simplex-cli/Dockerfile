FROM ubuntu:24.04

ARG SIMPLEX_VERSION=v6.3.3
ARG TARGETARCH

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates iproute2 \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash simplex

# Download simplex-chat CLI
RUN ARCH=$(case "${TARGETARCH}" in \
      "amd64") echo "x86_64" ;; \
      "arm64") echo "aarch64" ;; \
      *) echo "x86_64" ;; \
    esac) && \
    curl -fsSL "https://github.com/simplex-chat/simplex-chat/releases/download/${SIMPLEX_VERSION}/simplex-chat-ubuntu-24.04-${ARCH}" \
      -o /usr/local/bin/simplex-chat && \
    chmod +x /usr/local/bin/simplex-chat

RUN mkdir -p /home/simplex/.simplex /home/simplex/files && \
    chown -R simplex:simplex /home/simplex

USER simplex
WORKDIR /home/simplex

CMD simplex-chat -d /home/simplex/.simplex -p ${SIMPLEX_WS_PORT:-5225} --files-folder /home/simplex/files
