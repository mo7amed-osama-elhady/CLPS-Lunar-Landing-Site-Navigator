FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=3000 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    SPICE_KERNELS_DIR=/app/kernels \
    SPICE_PYTHON_BIN=python3

WORKDIR /app

# Install Python 3 + pip for SpiceyPy / CSPICE runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 \
      python3-pip \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Python SPICE dependencies cleanly into container image
COPY requirements.txt ./
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

# Install Node.js dependencies
COPY package.json bun.lock* package-lock.json* ./
RUN npm install --no-audit --no-fund

# Copy application source and bundled official NASA/JPL NAIF SPICE kernels
COPY . .

# Verify SPICE kernels & SpiceyPy load cleanly in image, then build frontend bundle
RUN python3 src/server/spice_engine.py --health && npm run build

EXPOSE 3000

CMD ["npm", "start"]
