# Production image for the BackReserve API.
# Build from the repository root:  docker build -f backend/Dockerfile -t backreserve-api .
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Directory.Build.props ./
COPY backend/BackReserve.Domain/BackReserve.Domain.csproj backend/BackReserve.Domain/packages.lock.json backend/BackReserve.Domain/
COPY backend/BackReserve.Application/BackReserve.Application.csproj backend/BackReserve.Application/packages.lock.json backend/BackReserve.Application/
COPY backend/BackReserve.Infrastructure/BackReserve.Infrastructure.csproj backend/BackReserve.Infrastructure/packages.lock.json backend/BackReserve.Infrastructure/
COPY backend/BackReserve.Api/BackReserve.Api.csproj backend/BackReserve.Api/packages.lock.json backend/BackReserve.Api/
RUN dotnet restore backend/BackReserve.Api/BackReserve.Api.csproj --locked-mode
COPY backend/ backend/
RUN dotnet publish backend/BackReserve.Api/BackReserve.Api.csproj -c Release -o /app/publish --no-restore /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
# tzdata: IANA time zones (Europe/Berlin etc.) are required for pickup slot and cutoff calculations.
RUN apt-get update && apt-get install -y --no-install-recommends tzdata && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/publish .
RUN mkdir -p /data/uploads && chown -R app:app /data
# TLS terminates at the edge (Cloudflare / load balancer); with forwarded headers enabled, plain-HTTP requests
# are redirected to https on port 443.
ENV ASPNETCORE_URLS=http://+:8080 \
    ASPNETCORE_HTTPS_PORT=443 \
    ASPNETCORE_ENVIRONMENT=Production \
    DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false \
    Storage__LocalPath=/data/uploads
USER app
EXPOSE 8080
VOLUME ["/data/uploads"]
# Health: configure the host's HTTP probes for GET /health/live (liveness) and GET /health/ready (database).
ENTRYPOINT ["dotnet", "BackReserve.Api.dll"]
