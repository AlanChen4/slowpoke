from __future__ import annotations

import datetime
import uuid
from typing import (
    Annotated,
    Any,
    List,
    Literal,
    NotRequired,
    Optional,
    TypeAlias,
    TypedDict,
)

from pydantic import BaseModel, Field, Json

NetRequestStatus: TypeAlias = Literal["PENDING", "SUCCESS", "ERROR"]

RealtimeEqualityOp: TypeAlias = Literal["eq", "neq", "lt", "lte", "gt", "gte", "in", "like", "ilike", "is", "match", "imatch", "isdistinct"]

RealtimeAction: TypeAlias = Literal["INSERT", "UPDATE", "DELETE", "TRUNCATE", "ERROR"]

StorageBuckettype: TypeAlias = Literal["STANDARD", "ANALYTICS", "VECTOR"]

AuthFactorType: TypeAlias = Literal["totp", "webauthn", "phone"]

AuthFactorStatus: TypeAlias = Literal["unverified", "verified"]

AuthAalLevel: TypeAlias = Literal["aal1", "aal2", "aal3"]

AuthCodeChallengeMethod: TypeAlias = Literal["s256", "plain"]

AuthOneTimeTokenType: TypeAlias = Literal["confirmation_token", "reauthentication_token", "recovery_token", "email_change_token_new", "email_change_token_current", "phone_change_token"]

AuthOauthRegistrationType: TypeAlias = Literal["dynamic", "manual"]

AuthOauthAuthorizationStatus: TypeAlias = Literal["pending", "approved", "denied", "expired"]

AuthOauthResponseType: TypeAlias = Literal["code"]

AuthOauthClientType: TypeAlias = Literal["public", "confidential"]

class PublicInstallations(BaseModel):
    collector_id: str = Field(alias="collector_id")
    created_at: datetime.datetime = Field(alias="created_at")
    id: int = Field(alias="id")
    organization_id: int = Field(alias="organization_id")
    revoked_at: Optional[datetime.datetime] = Field(alias="revoked_at")

class PublicInstallationsInsert(TypedDict):
    collector_id: Annotated[str, Field(alias="collector_id")]
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    id: NotRequired[Annotated[int, Field(alias="id")]]
    organization_id: Annotated[int, Field(alias="organization_id")]
    revoked_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="revoked_at")]]

class PublicInstallationsUpdate(TypedDict):
    collector_id: NotRequired[Annotated[str, Field(alias="collector_id")]]
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    id: NotRequired[Annotated[int, Field(alias="id")]]
    organization_id: NotRequired[Annotated[int, Field(alias="organization_id")]]
    revoked_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="revoked_at")]]

class PublicOrganizationMembers(BaseModel):
    created_at: datetime.datetime = Field(alias="created_at")
    organization_id: int = Field(alias="organization_id")
    role: str = Field(alias="role")
    user_id: uuid.UUID = Field(alias="user_id")

class PublicOrganizationMembersInsert(TypedDict):
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    organization_id: Annotated[int, Field(alias="organization_id")]
    role: Annotated[str, Field(alias="role")]
    user_id: Annotated[uuid.UUID, Field(alias="user_id")]

class PublicOrganizationMembersUpdate(TypedDict):
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    organization_id: NotRequired[Annotated[int, Field(alias="organization_id")]]
    role: NotRequired[Annotated[str, Field(alias="role")]]
    user_id: NotRequired[Annotated[uuid.UUID, Field(alias="user_id")]]

class PublicOrganizations(BaseModel):
    created_at: datetime.datetime = Field(alias="created_at")
    id: int = Field(alias="id")
    name: str = Field(alias="name")

class PublicOrganizationsInsert(TypedDict):
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    id: NotRequired[Annotated[int, Field(alias="id")]]
    name: Annotated[str, Field(alias="name")]

class PublicOrganizationsUpdate(TypedDict):
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    id: NotRequired[Annotated[int, Field(alias="id")]]
    name: NotRequired[Annotated[str, Field(alias="name")]]

class PublicPromptEvents(BaseModel):
    actor_account_id: Optional[str] = Field(alias="actor_account_id")
    actor_email: Optional[str] = Field(alias="actor_email")
    attributes: Json[Any] = Field(alias="attributes")
    batch_id: int = Field(alias="batch_id")
    created_at: datetime.datetime = Field(alias="created_at")
    event_name: str = Field(alias="event_name")
    id: int = Field(alias="id")
    installation_id: int = Field(alias="installation_id")
    is_redacted: bool = Field(alias="is_redacted")
    occurred_at: datetime.datetime = Field(alias="occurred_at")
    organization_id: int = Field(alias="organization_id")
    prompt_id: Optional[str] = Field(alias="prompt_id")
    prompt_text: str = Field(alias="prompt_text")
    provider: str = Field(alias="provider")
    record_index: int = Field(alias="record_index")
    resource_attributes: Json[Any] = Field(alias="resource_attributes")
    session_id: Optional[str] = Field(alias="session_id")

class PublicPromptEventsInsert(TypedDict):
    actor_account_id: NotRequired[Annotated[Optional[str], Field(alias="actor_account_id")]]
    actor_email: NotRequired[Annotated[Optional[str], Field(alias="actor_email")]]
    attributes: NotRequired[Annotated[Json[Any], Field(alias="attributes")]]
    batch_id: Annotated[int, Field(alias="batch_id")]
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    event_name: Annotated[str, Field(alias="event_name")]
    id: NotRequired[Annotated[int, Field(alias="id")]]
    installation_id: Annotated[int, Field(alias="installation_id")]
    is_redacted: NotRequired[Annotated[bool, Field(alias="is_redacted")]]
    occurred_at: Annotated[datetime.datetime, Field(alias="occurred_at")]
    organization_id: Annotated[int, Field(alias="organization_id")]
    prompt_id: NotRequired[Annotated[Optional[str], Field(alias="prompt_id")]]
    prompt_text: Annotated[str, Field(alias="prompt_text")]
    provider: Annotated[str, Field(alias="provider")]
    record_index: Annotated[int, Field(alias="record_index")]
    resource_attributes: NotRequired[Annotated[Json[Any], Field(alias="resource_attributes")]]
    session_id: NotRequired[Annotated[Optional[str], Field(alias="session_id")]]

class PublicPromptEventsUpdate(TypedDict):
    actor_account_id: NotRequired[Annotated[Optional[str], Field(alias="actor_account_id")]]
    actor_email: NotRequired[Annotated[Optional[str], Field(alias="actor_email")]]
    attributes: NotRequired[Annotated[Json[Any], Field(alias="attributes")]]
    batch_id: NotRequired[Annotated[int, Field(alias="batch_id")]]
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    event_name: NotRequired[Annotated[str, Field(alias="event_name")]]
    id: NotRequired[Annotated[int, Field(alias="id")]]
    installation_id: NotRequired[Annotated[int, Field(alias="installation_id")]]
    is_redacted: NotRequired[Annotated[bool, Field(alias="is_redacted")]]
    occurred_at: NotRequired[Annotated[datetime.datetime, Field(alias="occurred_at")]]
    organization_id: NotRequired[Annotated[int, Field(alias="organization_id")]]
    prompt_id: NotRequired[Annotated[Optional[str], Field(alias="prompt_id")]]
    prompt_text: NotRequired[Annotated[str, Field(alias="prompt_text")]]
    provider: NotRequired[Annotated[str, Field(alias="provider")]]
    record_index: NotRequired[Annotated[int, Field(alias="record_index")]]
    resource_attributes: NotRequired[Annotated[Json[Any], Field(alias="resource_attributes")]]
    session_id: NotRequired[Annotated[Optional[str], Field(alias="session_id")]]

class PublicTelemetryBatches(BaseModel):
    content_sha256: str = Field(alias="content_sha256")
    id: int = Field(alias="id")
    installation_id: int = Field(alias="installation_id")
    organization_id: int = Field(alias="organization_id")
    raw_payload: Json[Any] = Field(alias="raw_payload")
    received_at: datetime.datetime = Field(alias="received_at")
    signal: str = Field(alias="signal")

class PublicTelemetryBatchesInsert(TypedDict):
    content_sha256: Annotated[str, Field(alias="content_sha256")]
    id: NotRequired[Annotated[int, Field(alias="id")]]
    installation_id: Annotated[int, Field(alias="installation_id")]
    organization_id: Annotated[int, Field(alias="organization_id")]
    raw_payload: Annotated[Json[Any], Field(alias="raw_payload")]
    received_at: NotRequired[Annotated[datetime.datetime, Field(alias="received_at")]]
    signal: Annotated[str, Field(alias="signal")]

class PublicTelemetryBatchesUpdate(TypedDict):
    content_sha256: NotRequired[Annotated[str, Field(alias="content_sha256")]]
    id: NotRequired[Annotated[int, Field(alias="id")]]
    installation_id: NotRequired[Annotated[int, Field(alias="installation_id")]]
    organization_id: NotRequired[Annotated[int, Field(alias="organization_id")]]
    raw_payload: NotRequired[Annotated[Json[Any], Field(alias="raw_payload")]]
    received_at: NotRequired[Annotated[datetime.datetime, Field(alias="received_at")]]
    signal: NotRequired[Annotated[str, Field(alias="signal")]]
