This project exposes Prometheus-format metrics at `/metrics` (default app port `5000`).

Quick start (single-host, Docker or local):

- Run Prometheus (bind local config):

```bash
# from repository root
docker run -d --name prometheus -p 9090:9090 \
  -v "$PWD/prometheus.yml:/etc/prometheus/prometheus.yml:ro" \
  prom/prometheus:latest
```

- Visit Prometheus UI: http://localhost:9090 and query `app_requests_total`.

Docker-compose snippet (add to your existing `docker-compose.yml` or create a new file):

```yaml
services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
    restart: unless-stopped
```

Notes:
- On Docker for Windows, use `host.docker.internal:5000` as the target (already in `prometheus.yml`).
- If running Prometheus in the same Docker network as the app, replace targets with the app service name and port (e.g. `app:5000`).
- The included `prometheus.yml` uses a 15s scrape interval; adjust for your needs.
