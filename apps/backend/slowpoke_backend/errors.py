from uuid import UUID


class IngestionError(Exception):
    """Base class for expected ingestion failures."""


class InvalidPayloadError(IngestionError):
    """The request is not valid OTLP/JSON for the requested signal."""


class PayloadTooLargeError(IngestionError):
    """The decompressed request exceeds the configured limit."""


class UnknownInstallationError(IngestionError):
    def __init__(self, installation_ids: set[UUID]):
        self.installation_ids = installation_ids
        super().__init__("unknown or revoked installation")


class RepositoryError(IngestionError):
    """The persistence layer could not complete the request."""
