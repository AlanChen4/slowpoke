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
        super().__init__("unknown installation")


class RevokedInstallationError(IngestionError):
    """Telemetry from a revoked installation must be discarded."""


class InvalidEnrollmentCodeError(Exception):
    """The enrollment code is unknown."""


class ExpiredEnrollmentCodeError(Exception):
    """The enrollment code has expired."""


class DuplicateTeamInstallationError(Exception):
    """The organization already has a non-revoked team installation."""


class RepositoryError(IngestionError):
    """The persistence layer could not complete the request."""
