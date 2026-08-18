from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any, cast

import jwt
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey
from cryptography.hazmat.primitives.serialization import load_pem_private_key
from jwt.algorithms import RSAAlgorithm

from .domain import Installation

TOKEN_LIFETIME = timedelta(days=365 * 20)


class InstallationTokenIssuer:
    def __init__(
        self,
        private_key_pem: str,
        key_id: str,
        issuer: str,
        audience: str,
    ):
        private_key = load_pem_private_key(private_key_pem.encode(), password=None)
        if not isinstance(private_key, RSAPrivateKey):
            raise ValueError("installation signing key must be an RSA private key")
        self._private_key = private_key
        self._key_id = key_id
        self._issuer = issuer.rstrip("/")
        self._audience = audience

    @property
    def issuer(self) -> str:
        return self._issuer

    @property
    def audience(self) -> str:
        return self._audience

    def discovery_document(self) -> dict[str, object]:
        return {
            "issuer": self._issuer,
            "jwks_uri": f"{self._issuer}/.well-known/jwks.json",
            "response_types_supported": ["none"],
            "subject_types_supported": ["public"],
            "id_token_signing_alg_values_supported": ["RS256"],
        }

    def jwks(self) -> dict[str, object]:
        public_jwk = cast(
            dict[str, Any],
            RSAAlgorithm.to_jwk(self._private_key.public_key(), as_dict=True),
        )
        public_jwk.update({"alg": "RS256", "kid": self._key_id, "use": "sig"})
        return {"keys": [public_jwk]}

    def issue(self, installation: Installation, now: datetime | None = None) -> str:
        issued_at = now or datetime.now(UTC)
        return jwt.encode(
            {
                "iss": self._issuer,
                "sub": str(installation.id),
                "aud": self._audience,
                "organization_id": str(installation.organization_id),
                "tool": installation.tool,
                "iat": issued_at,
                "exp": issued_at + TOKEN_LIFETIME,
            },
            self._private_key,
            algorithm="RS256",
            headers={"kid": self._key_id, "typ": "JWT"},
        )
