import modal

from collector import register_collector

SECRET_ENV_KEYS = [
    "SLOWPOKE_INSTALLATION_ISSUER",
    "SLOWPOKE_COLLECTOR_AUDIENCE",
    "SLOWPOKE_INGEST_URL",
    "SLOWPOKE_INGEST_TOKEN",
]

app = modal.App("slowpoke-collector-e2e")

if modal.is_local():
    collector_secret = modal.Secret.from_local_environ(SECRET_ENV_KEYS)
else:
    collector_secret = modal.Secret.from_dict({})

Collector = register_collector(app, collector_secret)
