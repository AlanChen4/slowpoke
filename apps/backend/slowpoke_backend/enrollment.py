from __future__ import annotations

import hashlib
import logging
from datetime import datetime
from typing import Protocol, cast

from supabase import Client, create_client

from .database_types import PublicInstallationEnrollments, PublicInstallations
from .domain import Installation, Tool
from .errors import (
    ExpiredEnrollmentCodeError,
    InvalidEnrollmentCodeError,
    RepositoryError,
)

logger = logging.getLogger(__name__)


def enrollment_code_digest(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


class EnrollmentRepository(Protocol):
    def redeem(
        self,
        code_digest: str,
        computer_name: str,
        now: datetime,
    ) -> tuple[Installation, ...]: ...


class SupabaseEnrollmentRepository:
    def __init__(self, url: str, secret_key: str):
        self._client: Client = create_client(url, secret_key)

    def redeem(
        self,
        code_digest: str,
        computer_name: str,
        now: datetime,
    ) -> tuple[Installation, ...]:
        try:
            response = (
                self._client.table("installation_enrollments")
                .select(
                    "id,organization_id,created_by_user_id,code_digest,"
                    "selected_tools,expires_at,redeemed_at,created_at"
                )
                .eq("code_digest", code_digest)
                .limit(1)
                .execute()
            )
            if not response.data:
                raise InvalidEnrollmentCodeError
            enrollment = PublicInstallationEnrollments.model_validate(response.data[0])
            if enrollment.expires_at <= now:
                raise ExpiredEnrollmentCodeError

            rows = [
                {
                    "organization_id": str(enrollment.organization_id),
                    "created_by_user_id": str(enrollment.created_by_user_id),
                    "tool": tool,
                    "computer_name": computer_name,
                    "enrollment_id": str(enrollment.id),
                }
                for tool in enrollment.selected_tools
            ]
            (
                self._client.table("installations")
                .upsert(
                    rows,
                    ignore_duplicates=True,
                    on_conflict="enrollment_id,tool",
                    default_to_null=False,
                )
                .execute()
            )
            timestamp = now.isoformat()
            (
                self._client.table("installation_enrollments")
                .update({"redeemed_at": timestamp})
                .eq("id", str(enrollment.id))
                .is_("redeemed_at", "null")
                .execute()
            )
            installation_response = (
                self._client.table("installations")
                .select(
                    "id,organization_id,created_at,revoked_at,created_by_user_id,"
                    "tool,computer_name,enrollment_id,verified_at,last_seen_at"
                )
                .eq("enrollment_id", str(enrollment.id))
                .execute()
            )
            installations_by_tool = {
                row.tool: Installation(
                    id=row.id,
                    organization_id=row.organization_id,
                    tool=cast(Tool, row.tool),
                )
                for item in installation_response.data
                if (row := PublicInstallations.model_validate(item)).revoked_at is None
            }
            if set(installations_by_tool) != set(enrollment.selected_tools):
                raise RepositoryError("failed to recover every enrolled installation")
            return tuple(
                installations_by_tool[tool] for tool in enrollment.selected_tools
            )
        except (ExpiredEnrollmentCodeError, InvalidEnrollmentCodeError):
            raise
        except RepositoryError:
            raise
        except Exception as error:
            logger.exception("Failed to redeem installation enrollment")
            raise RepositoryError("failed to redeem installation enrollment") from error
