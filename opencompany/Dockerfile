FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create virtual environment at /app/server/.venv
RUN python3 -m venv /app/server/.venv
ENV PATH="/app/server/.venv/bin:$PATH"

# Copy and install python dependencies
COPY server/requirements.txt /app/server/requirements.txt
RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -r /app/server/requirements.txt

# Copy server code and templates
COPY server /app/server
COPY .env.template /app/.env.template
COPY package.json /app/package.json
COPY .opencompany /app/.opencompany

# Copy client dist
COPY client/dist /app/client/dist

# Copy entrypoint
COPY docker/entrypoint.sh /app/docker/entrypoint.sh
RUN chmod +x /app/docker/entrypoint.sh

ENV DATA_DIR=/data \
    HOME=/data/home \
    OPENCOMPANY_ENV_FILE=/data/opencompany.env \
    DEPLOYMENT_MODE=self_hosted \
    PORT=5678 \
    OPENCOMPANY_CLIENT_DIST=/app/client/dist \
    PYTHONUNBUFFERED=1

WORKDIR /app/server

EXPOSE 5678

VOLUME ["/data"]

ENTRYPOINT ["sh", "/app/docker/entrypoint.sh"]
