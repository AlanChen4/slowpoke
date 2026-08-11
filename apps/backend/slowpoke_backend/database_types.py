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
    created_at: datetime.datetime = Field(alias="created_at")
    id: uuid.UUID = Field(alias="id")
    organization_id: uuid.UUID = Field(alias="organization_id")
    revoked_at: Optional[datetime.datetime] = Field(alias="revoked_at")

class PublicInstallationsInsert(TypedDict):
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    id: NotRequired[Annotated[uuid.UUID, Field(alias="id")]]
    organization_id: Annotated[uuid.UUID, Field(alias="organization_id")]
    revoked_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="revoked_at")]]

class PublicInstallationsUpdate(TypedDict):
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    id: NotRequired[Annotated[uuid.UUID, Field(alias="id")]]
    organization_id: NotRequired[Annotated[uuid.UUID, Field(alias="organization_id")]]
    revoked_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="revoked_at")]]

class PublicOrganizationMembers(BaseModel):
    created_at: datetime.datetime = Field(alias="created_at")
    organization_id: uuid.UUID = Field(alias="organization_id")
    role: str = Field(alias="role")
    user_id: uuid.UUID = Field(alias="user_id")

class PublicOrganizationMembersInsert(TypedDict):
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    organization_id: Annotated[uuid.UUID, Field(alias="organization_id")]
    role: Annotated[str, Field(alias="role")]
    user_id: Annotated[uuid.UUID, Field(alias="user_id")]

class PublicOrganizationMembersUpdate(TypedDict):
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    organization_id: NotRequired[Annotated[uuid.UUID, Field(alias="organization_id")]]
    role: NotRequired[Annotated[str, Field(alias="role")]]
    user_id: NotRequired[Annotated[uuid.UUID, Field(alias="user_id")]]

class PublicOrganizations(BaseModel):
    created_at: datetime.datetime = Field(alias="created_at")
    id: uuid.UUID = Field(alias="id")
    logo_url: Optional[str] = Field(alias="logo_url")
    name: str = Field(alias="name")

class PublicOrganizationsInsert(TypedDict):
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    id: NotRequired[Annotated[uuid.UUID, Field(alias="id")]]
    logo_url: NotRequired[Annotated[Optional[str], Field(alias="logo_url")]]
    name: Annotated[str, Field(alias="name")]

class PublicOrganizationsUpdate(TypedDict):
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    id: NotRequired[Annotated[uuid.UUID, Field(alias="id")]]
    logo_url: NotRequired[Annotated[Optional[str], Field(alias="logo_url")]]
    name: NotRequired[Annotated[str, Field(alias="name")]]

class PublicPromptEvents(BaseModel):
    actor_account_id: Optional[str] = Field(alias="actor_account_id")
    actor_email: Optional[str] = Field(alias="actor_email")
    batch_id: uuid.UUID = Field(alias="batch_id")
    created_at: datetime.datetime = Field(alias="created_at")
    event_name: str = Field(alias="event_name")
    id: uuid.UUID = Field(alias="id")
    installation_id: uuid.UUID = Field(alias="installation_id")
    is_redacted: bool = Field(alias="is_redacted")
    model: Optional[str] = Field(alias="model")
    occurred_at: datetime.datetime = Field(alias="occurred_at")
    organization_id: uuid.UUID = Field(alias="organization_id")
    originator: Optional[str] = Field(alias="originator")
    prompt_id: Optional[str] = Field(alias="prompt_id")
    prompt_text: str = Field(alias="prompt_text")
    provider: str = Field(alias="provider")
    record_index: int = Field(alias="record_index")
    session_id: Optional[str] = Field(alias="session_id")
    slug: Optional[str] = Field(alias="slug")

class PublicPromptEventsInsert(TypedDict):
    actor_account_id: NotRequired[Annotated[Optional[str], Field(alias="actor_account_id")]]
    actor_email: NotRequired[Annotated[Optional[str], Field(alias="actor_email")]]
    batch_id: Annotated[uuid.UUID, Field(alias="batch_id")]
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    event_name: Annotated[str, Field(alias="event_name")]
    id: NotRequired[Annotated[uuid.UUID, Field(alias="id")]]
    installation_id: Annotated[uuid.UUID, Field(alias="installation_id")]
    is_redacted: NotRequired[Annotated[bool, Field(alias="is_redacted")]]
    model: NotRequired[Annotated[Optional[str], Field(alias="model")]]
    occurred_at: Annotated[datetime.datetime, Field(alias="occurred_at")]
    organization_id: Annotated[uuid.UUID, Field(alias="organization_id")]
    originator: NotRequired[Annotated[Optional[str], Field(alias="originator")]]
    prompt_id: NotRequired[Annotated[Optional[str], Field(alias="prompt_id")]]
    prompt_text: Annotated[str, Field(alias="prompt_text")]
    provider: Annotated[str, Field(alias="provider")]
    record_index: Annotated[int, Field(alias="record_index")]
    session_id: NotRequired[Annotated[Optional[str], Field(alias="session_id")]]
    slug: NotRequired[Annotated[Optional[str], Field(alias="slug")]]

class PublicPromptEventsUpdate(TypedDict):
    actor_account_id: NotRequired[Annotated[Optional[str], Field(alias="actor_account_id")]]
    actor_email: NotRequired[Annotated[Optional[str], Field(alias="actor_email")]]
    batch_id: NotRequired[Annotated[uuid.UUID, Field(alias="batch_id")]]
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    event_name: NotRequired[Annotated[str, Field(alias="event_name")]]
    id: NotRequired[Annotated[uuid.UUID, Field(alias="id")]]
    installation_id: NotRequired[Annotated[uuid.UUID, Field(alias="installation_id")]]
    is_redacted: NotRequired[Annotated[bool, Field(alias="is_redacted")]]
    model: NotRequired[Annotated[Optional[str], Field(alias="model")]]
    occurred_at: NotRequired[Annotated[datetime.datetime, Field(alias="occurred_at")]]
    organization_id: NotRequired[Annotated[uuid.UUID, Field(alias="organization_id")]]
    originator: NotRequired[Annotated[Optional[str], Field(alias="originator")]]
    prompt_id: NotRequired[Annotated[Optional[str], Field(alias="prompt_id")]]
    prompt_text: NotRequired[Annotated[str, Field(alias="prompt_text")]]
    provider: NotRequired[Annotated[str, Field(alias="provider")]]
    record_index: NotRequired[Annotated[int, Field(alias="record_index")]]
    session_id: NotRequired[Annotated[Optional[str], Field(alias="session_id")]]
    slug: NotRequired[Annotated[Optional[str], Field(alias="slug")]]

class PublicTelemetryBatches(BaseModel):
    content_sha256: str = Field(alias="content_sha256")
    id: uuid.UUID = Field(alias="id")
    installation_id: uuid.UUID = Field(alias="installation_id")
    organization_id: uuid.UUID = Field(alias="organization_id")
    raw_payload: Json[Any] = Field(alias="raw_payload")
    received_at: datetime.datetime = Field(alias="received_at")
    signal: str = Field(alias="signal")

class PublicTelemetryBatchesInsert(TypedDict):
    content_sha256: Annotated[str, Field(alias="content_sha256")]
    id: NotRequired[Annotated[uuid.UUID, Field(alias="id")]]
    installation_id: Annotated[uuid.UUID, Field(alias="installation_id")]
    organization_id: Annotated[uuid.UUID, Field(alias="organization_id")]
    raw_payload: Annotated[Json[Any], Field(alias="raw_payload")]
    received_at: NotRequired[Annotated[datetime.datetime, Field(alias="received_at")]]
    signal: Annotated[str, Field(alias="signal")]

class PublicTelemetryBatchesUpdate(TypedDict):
    content_sha256: NotRequired[Annotated[str, Field(alias="content_sha256")]]
    id: NotRequired[Annotated[uuid.UUID, Field(alias="id")]]
    installation_id: NotRequired[Annotated[uuid.UUID, Field(alias="installation_id")]]
    organization_id: NotRequired[Annotated[uuid.UUID, Field(alias="organization_id")]]
    raw_payload: NotRequired[Annotated[Json[Any], Field(alias="raw_payload")]]
    received_at: NotRequired[Annotated[datetime.datetime, Field(alias="received_at")]]
    signal: NotRequired[Annotated[str, Field(alias="signal")]]

class PublicHumanPromptEvents(BaseModel):
    actor_account_id: Optional[str] = Field(alias="actor_account_id")
    actor_email: Optional[str] = Field(alias="actor_email")
    batch_id: Optional[uuid.UUID] = Field(alias="batch_id")
    created_at: Optional[datetime.datetime] = Field(alias="created_at")
    event_name: Optional[str] = Field(alias="event_name")
    id: Optional[uuid.UUID] = Field(alias="id")
    installation_id: Optional[uuid.UUID] = Field(alias="installation_id")
    is_redacted: Optional[bool] = Field(alias="is_redacted")
    model: Optional[str] = Field(alias="model")
    occurred_at: Optional[datetime.datetime] = Field(alias="occurred_at")
    organization_id: Optional[uuid.UUID] = Field(alias="organization_id")
    originator: Optional[str] = Field(alias="originator")
    prompt_id: Optional[str] = Field(alias="prompt_id")
    prompt_text: Optional[str] = Field(alias="prompt_text")
    provider: Optional[str] = Field(alias="provider")
    record_index: Optional[int] = Field(alias="record_index")
    session_id: Optional[str] = Field(alias="session_id")
    slug: Optional[str] = Field(alias="slug")
