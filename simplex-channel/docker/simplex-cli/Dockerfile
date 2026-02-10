FROM ubuntu:24.04

ARG SIMPLEX_VERSION=v6.4.1

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates iproute2 \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash simplex

# Download simplex-chat CLI
RUN ARCH=$(case "$(dpkg --print-architecture)" in \
      "amd64") echo "x86-64" ;; \
      "arm64") echo "aarch64" ;; \
      *) echo "x86-64" ;; \
    esac) && \
    curl -fsSL "https://github.com/simplex-chat/simplex-chat/releases/download/${SIMPLEX_VERSION}/simplex-chat-ubuntu-24_04-${ARCH}" \
      -o /usr/local/bin/simplex-chat && \
    chmod +x /usr/local/bin/simplex-chat

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER simplex
WORKDIR /home/simplex

ENV SIMPLEX_DISPLAY_NAME=openclaw
ENV SIMPLEX_WS_PORT=5225

EXPOSE ${SIMPLEX_WS_PORT}

ENTRYPOINT ["/entrypoint.sh"]
