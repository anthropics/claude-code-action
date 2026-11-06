FROM oven/bun:latest

WORKDIR /app

# Copy the mock auth server
COPY anthropic-mock-auth-server.ts .

# Install zod dependency (already available in bun)
RUN bun install zod

# Expose port
EXPOSE 8887

# Health check dependency
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Start the server
CMD ["bun", "run", "anthropic-mock-auth-server.ts"]
