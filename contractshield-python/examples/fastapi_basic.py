"""
Basic FastAPI example with ContractShield middleware.

This example shows how to add ContractShield protection to a FastAPI application.
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from contractshield.fastapi import (
    ContractShieldMiddleware,
    ContractShieldConfig,
    get_request_context,
    set_identity,
)
from contractshield.core import Identity

# Create FastAPI app
app = FastAPI(
    title="ContractShield Demo API",
    description="A simple API protected by ContractShield",
    version="1.0.0",
)

# Add ContractShield middleware
app.add_middleware(
    ContractShieldMiddleware,
    config=ContractShieldConfig(
        # Enable vulnerability scanning
        enable_vulnerability_scan=True,
        vuln_enable_sqli=True,
        vuln_enable_xss=True,
        vuln_enable_ssrf=True,

        # Mode: "enforce" blocks attacks, "monitor" logs only
        mode="enforce",

        # Customize block response
        block_response_code=403,
        block_response_body={
            "error": "Request blocked",
            "message": "Security violation detected",
        },

        # Enable logging
        log_decisions=True,

        # Exclude health check endpoints
        exclude_paths=[r"^/health$", r"^/metrics$"],
    ),
)


# Example authentication middleware
@app.middleware("http")
async def auth_middleware(request, call_next):
    """Extract and set user identity from Authorization header."""
    auth_header = request.headers.get("Authorization", "")

    if auth_header.startswith("Bearer "):
        # In a real app, you would validate the JWT token here
        token = auth_header[7:]

        # Example: Set authenticated identity
        set_identity(Identity(
            authenticated=True,
            subject="user-123",
            tenant="tenant-456",
            roles=["user"],
            scopes=["read", "write"],
        ))

    return await call_next(request)


# Models
class UserCreate(BaseModel):
    name: str
    email: str
    bio: str | None = None


class User(BaseModel):
    id: str
    name: str
    email: str
    bio: str | None = None


# Endpoints
@app.get("/health")
async def health_check():
    """Health check endpoint (excluded from ContractShield)."""
    return {"status": "healthy"}


@app.get("/users")
async def list_users():
    """List all users."""
    return [
        {"id": "1", "name": "Alice", "email": "alice@example.com"},
        {"id": "2", "name": "Bob", "email": "bob@example.com"},
    ]


@app.post("/users", response_model=User)
async def create_user(user: UserCreate):
    """
    Create a new user.

    ContractShield will automatically scan the request body for:
    - SQL injection in any field
    - XSS in any field
    - SSRF in URL-like values
    - Prototype pollution in object keys
    """
    # Get the ContractShield request context
    ctx = get_request_context()
    if ctx:
        print(f"Request ID: {ctx.id}")
        print(f"Authenticated: {ctx.identity.authenticated}")

    # Create user (simplified)
    return User(
        id="new-user-id",
        name=user.name,
        email=user.email,
        bio=user.bio,
    )


@app.get("/users/{user_id}")
async def get_user(user_id: str):
    """Get a specific user by ID."""
    # ContractShield scans path parameters too
    return {"id": user_id, "name": "Test User", "email": "test@example.com"}


@app.post("/search")
async def search(query: dict):
    """
    Search endpoint.

    Example attack payloads that ContractShield will block:
    - {"query": "1 UNION SELECT * FROM users"}
    - {"query": "<script>alert('xss')</script>"}
    - {"url": "http://169.254.169.254/latest/meta-data/"}
    - {"__proto__": {"admin": true}}
    """
    return {"results": [], "query": query}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
